// ============================================
// Game Engine — Core game loop & physics
// ============================================

import {
  type GameState,
  type PlayerData,
  type Obstacle,
  type Coin,
  type Pickup,
  type Lane,
  type ObstacleType,
  type ObstacleSpawn,
  type CoinSpawn,
  type PickupSpawn,
  type Difficulty,
  type RunStats,
  DIFFICULTY_CONFIG,
  LANE_COUNT,
  LANE_WIDTH,
  CANVAS_WIDTH,
  GROUND_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  JUMP_FORCE,
  GRAVITY,
  OBSTACLE_DEFS,
} from './types';

// Re-exported so serverless store / UI share one source of truth
export { DIFFICULTY_CONFIG };
export type { Difficulty };

let obstacleIdCounter = 0;
let coinIdCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function getLaneX(lane: Lane): number {
  const roadCenterX = CANVAS_WIDTH / 2;
  const laneOffset = (lane - 1) * LANE_WIDTH;
  return roadCenterX + laneOffset;
}

export function createPlayer(id: string, name: string, color: string): PlayerData {
  return {
    id,
    name,
    lane: 1 as Lane,
    y: GROUND_Y - PLAYER_HEIGHT,
    velocityY: 0,
    state: 'running',
    score: 0,
    distance: 0,
    coins: 0,
    scoreBonus: 0,
    magnetTimer: 0,
    color,
    slideTimer: 0,
    isAlive: true,
    invincibleTimer: 0,
  };
}

export function createGameState(player: PlayerData, difficulty: Difficulty = 'medium'): GameState {
  return {
    player,
    obstacles: [],
    coins: [],
    pickups: [],
    speed: DIFFICULTY_CONFIG[difficulty].baseSpeed,
    distance: 0,
    magnet: 0,
    isRunning: false,
    isPaused: false,
    gameOver: false,
  };
}

// ============================================
// Deterministic obstacle/coin generation
// ============================================

export function generateObstacleSequence(seed: number, difficulty: Difficulty = 'medium', count: number = 500): ObstacleSpawn[] {
  const spawns: ObstacleSpawn[] = [];
  const cfg = DIFFICULTY_CONFIG[difficulty];
  let rng = seed;
  const types: ObstacleType[] = ['train', 'barrier', 'cone', 'tall_barrier'];

  function nextRandom(): number {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 700;
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(nextRandom() * types.length)];
    // Some trains roll toward the player (Subway-Surfers style).
    // RNG order must stay identical to server.js!
    const moving = type === 'train' && nextRandom() < 0.35;
    const lane = Math.floor(nextRandom() * LANE_COUNT) as Lane;
    // Generous spacing so obstacles arrive gradually, never suddenly
    const gap = cfg.gapMin + nextRandom() * (cfg.gapMax - cfg.gapMin);

    // Sometimes spawn obstacles in multiple lanes
    spawns.push({
      id: `obs_${i}`,
      type,
      lane,
      distance,
      moving,
    });

    // Second obstacle in a different lane, staggered
    // (never same instant, never all 3 lanes — one lane always free)
    if (nextRandom() < cfg.doubleChance && i > 15) {
      const otherLane = ((lane + 1 + Math.floor(nextRandom() * 2)) % 3) as Lane;
      spawns.push({
        id: `obs_${i}b`,
        type: types[Math.floor(nextRandom() * types.length)],
        lane: otherLane,
        distance: distance + 80 + nextRandom() * 80,
      });
    }

    distance += gap;
  }

  return spawns;
}

export function generateCoinSequence(seed: number, count: number = 1000): CoinSpawn[] {
  const spawns: CoinSpawn[] = [];
  let rng = seed + 9999;

  function nextRandom(): number {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 300;
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(nextRandom() * LANE_COUNT) as Lane;
    // Coins come in groups of 3-6
    const groupSize = 3 + Math.floor(nextRandom() * 4);
    for (let j = 0; j < groupSize; j++) {
      spawns.push({
        id: `coin_${i}_${j}`,
        lane,
        distance: distance + j * 40,
      });
    }
    distance += 200 + nextRandom() * 400;
  }

  return spawns;
}

export function generatePickupSequence(seed: number, count: number = 150): PickupSpawn[] {
  const spawns: PickupSpawn[] = [];
  let rng = seed + 5555;

  function nextRandom(): number {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 900;
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(nextRandom() * LANE_COUNT) as Lane;
    const kind = nextRandom() < 0.55 ? 'spray' : 'magnet';
    spawns.push({ id: `pickup_${i}`, kind, lane, distance });
    distance += 700 + nextRandom() * 900;
  }

  return spawns;
}

// ============================================
// Game update logic
// ============================================

export class GameEngine {
  state: GameState;
  obstacleSequence: ObstacleSpawn[];
  coinSequence: CoinSpawn[];
  pickupSequence: PickupSpawn[];
  nextObstacleIndex: number = 0;
  nextCoinIndex: number = 0;
  nextPickupIndex: number = 0;
  readonly difficulty: Difficulty;
  combo: number = 0;
  comboTimer: number = 0;
  stats: RunStats = { distance: 0, coins: 0, sprays: 0, magnets: 0, nearMisses: 0, topCombo: 0, cause: '' };
  onScoreChange?: (score: number, distance: number, coins: number, speed: number, magnet: number, combo: number, comboFrac: number) => void;
  onGameOver?: () => void;
  onCollectCoin?: () => void;
  onCollectSpray?: () => void;
  onMagnet?: () => void;
  onNearMiss?: (points: number, combo: number) => void;
  onLand?: () => void;

  constructor(player: PlayerData, obstacleSequence: ObstacleSpawn[], coinSequence: CoinSpawn[], difficulty: Difficulty = 'medium', pickupSequence: PickupSpawn[] = []) {
    this.state = createGameState(player, difficulty);
    this.obstacleSequence = obstacleSequence;
    this.coinSequence = coinSequence;
    this.pickupSequence = pickupSequence;
    this.difficulty = difficulty;
  }

  start() {
    this.state.isRunning = true;
    this.state.gameOver = false;
    this.state.player.isAlive = true;
  }

  moveLeft() {
    if (!this.state.isRunning || this.state.isPaused || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.lane > 0) {
      this.state.player.lane = (this.state.player.lane - 1) as Lane;
    }
  }

  moveRight() {
    if (!this.state.isRunning || this.state.isPaused || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.lane < 2) {
      this.state.player.lane = (this.state.player.lane + 1) as Lane;
    }
  }

  jump() {
    if (!this.state.isRunning || this.state.isPaused || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.state === 'running' || this.state.player.state === 'sliding') {
      this.state.player.velocityY = JUMP_FORCE;
      this.state.player.state = 'jumping';
      this.state.player.slideTimer = 0;
    }
  }

  slide() {
    if (!this.state.isRunning || this.state.isPaused || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.state === 'running') {
      this.state.player.state = 'sliding';
      this.state.player.slideTimer = 30; // frames
    }
  }

  update(deltaTime: number = 1) {
    if (!this.state.isRunning || this.state.isPaused || this.state.gameOver || !this.state.player.isAlive) return;

    const player = this.state.player;

    // Increase speed over time (per-difficulty curve)
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    this.state.speed = Math.min(cfg.maxSpeed, cfg.baseSpeed + this.state.distance * cfg.speedIncrement);

    // Magnet timer ticks down in real seconds
    if (player.magnetTimer > 0) {
      player.magnetTimer = Math.max(0, player.magnetTimer - deltaTime / 60);
    }
    this.state.magnet = player.magnetTimer;

    // Stunt combo window ticks down
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - deltaTime / 60);
      if (this.comboTimer === 0) this.combo = 0;
    }

    // Update distance
    this.state.distance += this.state.speed * deltaTime;
    player.distance = this.state.distance;

    // Update score (distance-based + coins + stunt bonuses)
    player.score = Math.floor(this.state.distance / 10) + player.coins * 10 + player.scoreBonus;

    // Gravity & jumping
    if (player.state === 'jumping') {
      player.velocityY += GRAVITY * deltaTime;
      player.y += player.velocityY * deltaTime;

      if (player.y >= GROUND_Y - PLAYER_HEIGHT) {
        player.y = GROUND_Y - PLAYER_HEIGHT;
        player.velocityY = 0;
        player.state = 'running';
        this.onLand?.();
      }
    }

    // Sliding timer
    if (player.state === 'sliding') {
      player.slideTimer -= deltaTime;
      if (player.slideTimer <= 0) {
        player.state = 'running';
        player.slideTimer = 0;
      }
    }

    // Invincibility timer
    if (player.invincibleTimer > 0) {
      player.invincibleTimer -= deltaTime;
    }

    // Spawn obstacles from sequence
    this.spawnObstacles();

    // Spawn coins from sequence
    this.spawnCoins();

    // Spawn pickups from sequence
    this.spawnPickups();

    // Update obstacles
    this.updateObstacles(deltaTime);

    // Update coins
    this.updateCoins(deltaTime);

    // Update pickups
    this.updatePickups(deltaTime);

    // Check collisions
    this.checkCollisions();

    // Notify score change
    this.onScoreChange?.(player.score, player.distance, player.coins, this.state.speed, player.magnetTimer, this.combo, this.comboTimer / 4);
  }

  /** Chained stunt dodge: combo multiplier grows while the window holds */
  private awardDodge() {
    const player = this.state.player;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 4;
    this.stats.topCombo = Math.max(this.stats.topCombo, this.combo);
    this.stats.nearMisses += 1;
    const points = 25 * this.combo;
    player.scoreBonus += points;
    this.onNearMiss?.(points, this.combo);
  }

  private spawnObstacles() {
    while (
      this.nextObstacleIndex < this.obstacleSequence.length &&
      this.obstacleSequence[this.nextObstacleIndex].distance < this.state.distance + 1500
    ) {
      const spawn = this.obstacleSequence[this.nextObstacleIndex];
      const def = OBSTACLE_DEFS[spawn.type];
      const obstacle: Obstacle = {
        id: spawn.id,
        type: spawn.type,
        lane: spawn.lane,
        z: spawn.distance - this.state.distance + 800,
        width: def.width,
        height: def.height,
        color: def.color,
        passed: false,
        moving: spawn.moving,
        // Moving trains close in faster than the world scroll
        approach: spawn.moving ? DIFFICULTY_CONFIG[this.difficulty].baseSpeed * 0.5 : 0,
      };
      this.state.obstacles.push(obstacle);
      this.nextObstacleIndex++;
    }
  }

  private spawnCoins() {
    while (
      this.nextCoinIndex < this.coinSequence.length &&
      this.coinSequence[this.nextCoinIndex].distance < this.state.distance + 1500
    ) {
      const spawn = this.coinSequence[this.nextCoinIndex];
      // Never drop coins inside an obstacle — feels unfair. Skip coins that
      // would spawn within a danger window of an obstacle in the same lane.
      const blocked = this.obstacleSequence.some(
        (o) => o.lane === spawn.lane && Math.abs(o.distance - spawn.distance) < 75
      );
      if (!blocked) {
        const coin: Coin = {
          id: spawn.id,
          lane: spawn.lane,
          z: spawn.distance - this.state.distance + 800,
          collected: false,
          floatOffset: Math.random() * Math.PI * 2,
        };
        this.state.coins.push(coin);
      }
      this.nextCoinIndex++;
    }
  }

  private updateObstacles(deltaTime: number) {
    const player = this.state.player;
    for (const obstacle of this.state.obstacles) {
      obstacle.z -= (this.state.speed + (obstacle.approach ?? 0)) * deltaTime;
      // Slipped past in the player's own lane = near miss stunt bonus
      if (!obstacle.passed && obstacle.z < -20) {
        obstacle.passed = true;
        if (obstacle.lane === player.lane && player.isAlive) {
          this.awardDodge();
        }
      }
    }
    // Remove obstacles that are behind the player
    this.state.obstacles = this.state.obstacles.filter(o => o.z > -200);
  }

  private updateCoins(deltaTime: number) {
    for (const coin of this.state.coins) {
      coin.z -= this.state.speed * deltaTime;
    }
    // Remove coins that are behind or collected
    this.state.coins = this.state.coins.filter(c => c.z > -100 && !c.collected);
  }

  private spawnPickups() {
    while (
      this.nextPickupIndex < this.pickupSequence.length &&
      this.pickupSequence[this.nextPickupIndex].distance < this.state.distance + 1500
    ) {
      const spawn = this.pickupSequence[this.nextPickupIndex];
      // Keep pickups out of obstacles so they always feel earnable
      const blocked = this.obstacleSequence.some(
        (o) => o.lane === spawn.lane && Math.abs(o.distance - spawn.distance) < 90
      );
      if (!blocked) {
        const pickup: Pickup = {
          id: spawn.id,
          kind: spawn.kind,
          lane: spawn.lane,
          z: spawn.distance - this.state.distance + 800,
          collected: false,
          floatOffset: Math.random() * Math.PI * 2,
        };
        this.state.pickups.push(pickup);
      }
      this.nextPickupIndex++;
    }
  }

  private updatePickups(deltaTime: number) {
    for (const pickup of this.state.pickups) {
      pickup.z -= this.state.speed * deltaTime;
    }
    this.state.pickups = this.state.pickups.filter(p => p.z > -100 && !p.collected);
  }

  private checkCollisions() {
    const player = this.state.player;
    if (player.invincibleTimer > 0) return;

    const playerLaneX = getLaneX(player.lane);
    const playerHeight = player.state === 'sliding' ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT;
    const playerTop = player.state === 'sliding' 
      ? GROUND_Y - PLAYER_SLIDE_HEIGHT 
      : player.y;

    // Check obstacle collisions
    for (const obstacle of this.state.obstacles) {
      if (obstacle.passed) continue;

      // Z-axis collision (depth)
      if (obstacle.z > -20 && obstacle.z < 40) {
        // Same lane check
        if (obstacle.lane === player.lane) {
          const obstacleDef = OBSTACLE_DEFS[obstacle.type];
          const obstacleTop = GROUND_Y - obstacle.height;

          // If sliding under tall_barrier, skip collision
          if (obstacleDef.canSlideUnder && player.state === 'sliding') {
            obstacle.passed = true;
            this.awardDodge();
            continue;
          }

          // If jumping over low obstacles
          if (player.state === 'jumping' && (obstacle.type === 'barrier' || obstacle.type === 'cone')) {
            const playerBottom = playerTop + playerHeight;
            if (playerBottom < obstacleTop + 15) {
              obstacle.passed = true;
              this.awardDodge();
              continue;
            }
          }

          // Vertical overlap check
          if (playerTop < GROUND_Y && playerTop + playerHeight > obstacleTop) {
            this.handleDeath(obstacle.type);
            return;
          }
        }
      }

      if (obstacle.z < -20) {
        obstacle.passed = true;
      }
    }

    // Check coin collisions (magnet widens the grab window + pulls nearby lanes)
    const magnetOn = player.magnetTimer > 0;
    for (const coin of this.state.coins) {
      if (coin.collected) continue;
      const sameLane = coin.lane === player.lane;
      if (sameLane && coin.z > -30 && coin.z < (magnetOn ? 60 : 40)) {
        coin.collected = true;
        player.coins++;
        this.stats.coins = player.coins;
        this.onCollectCoin?.();
      } else if (magnetOn && !sameLane && Math.abs(coin.lane - player.lane) <= 1 && coin.z > -30 && coin.z < 140) {
        coin.collected = true;
        player.coins++;
        this.stats.coins = player.coins;
        this.onCollectCoin?.();
      }
    }

    // Check pickup collisions
    for (const pickup of this.state.pickups) {
      if (pickup.collected) continue;
      if (pickup.z > -30 && pickup.z < (magnetOn ? 60 : 40) && pickup.lane === player.lane) {
        pickup.collected = true;
        if (pickup.kind === 'spray') {
          player.scoreBonus += 50;
          this.stats.sprays += 1;
          this.onCollectSpray?.();
        } else {
          player.magnetTimer = 8;
          this.state.magnet = 8;
          this.stats.magnets += 1;
          this.onMagnet?.();
        }
      }
    }
  }

  private handleDeath(cause: string = '') {
    this.state.player.isAlive = false;
    this.state.player.state = 'dead';
    this.state.gameOver = true;
    this.state.isRunning = false;
    this.stats.distance = Math.floor(this.state.player.distance);
    this.stats.coins = this.state.player.coins;
    this.stats.cause = cause;
    this.onGameOver?.();
  }

  getPlayerData(): PlayerData {
    return { ...this.state.player };
  }
}
