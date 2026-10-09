// ============================================
// Game Engine — Core game loop & physics
// ============================================

import {
  type GameState,
  type PlayerData,
  type Obstacle,
  type Coin,
  type Lane,
  type ObstacleType,
  type ObstacleSpawn,
  type CoinSpawn,
  LANE_COUNT,
  LANE_WIDTH,
  CANVAS_WIDTH,
  GROUND_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  JUMP_FORCE,
  GRAVITY,
  BASE_SPEED,
  MAX_SPEED,
  SPEED_INCREMENT,
  OBSTACLE_DEFS,
} from './types';

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
    color,
    slideTimer: 0,
    isAlive: true,
    invincibleTimer: 0,
  };
}

export function createGameState(player: PlayerData): GameState {
  return {
    player,
    obstacles: [],
    coins: [],
    speed: BASE_SPEED,
    distance: 0,
    isRunning: false,
    isPaused: false,
    gameOver: false,
  };
}

// ============================================
// Deterministic obstacle/coin generation
// ============================================

export function generateObstacleSequence(seed: number, count: number = 500): ObstacleSpawn[] {
  const spawns: ObstacleSpawn[] = [];
  let rng = seed;
  const types: ObstacleType[] = ['train', 'barrier', 'cone', 'tall_barrier'];

  function nextRandom(): number {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 700;
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(nextRandom() * types.length)];
    const lane = Math.floor(nextRandom() * LANE_COUNT) as Lane;
    // Generous spacing so obstacles arrive gradually, never suddenly
    const gap = 430 + nextRandom() * 380;

    // Sometimes spawn obstacles in multiple lanes
    spawns.push({
      id: `obs_${i}`,
      type,
      lane,
      distance,
    });

    // 22% chance of a second obstacle in a different lane, staggered
    // (never same instant, never all 3 lanes — one lane always free)
    if (nextRandom() < 0.22 && i > 15) {
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

// ============================================
// Game update logic
// ============================================

export class GameEngine {
  state: GameState;
  obstacleSequence: ObstacleSpawn[];
  coinSequence: CoinSpawn[];
  nextObstacleIndex: number = 0;
  nextCoinIndex: number = 0;
  onScoreChange?: (score: number, distance: number, coins: number, speed: number) => void;
  onGameOver?: () => void;
  onCollectCoin?: () => void;

  constructor(player: PlayerData, obstacleSequence: ObstacleSpawn[], coinSequence: CoinSpawn[]) {
    this.state = createGameState(player);
    this.obstacleSequence = obstacleSequence;
    this.coinSequence = coinSequence;
  }

  start() {
    this.state.isRunning = true;
    this.state.gameOver = false;
    this.state.player.isAlive = true;
  }

  moveLeft() {
    if (!this.state.isRunning || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.lane > 0) {
      this.state.player.lane = (this.state.player.lane - 1) as Lane;
    }
  }

  moveRight() {
    if (!this.state.isRunning || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.lane < 2) {
      this.state.player.lane = (this.state.player.lane + 1) as Lane;
    }
  }

  jump() {
    if (!this.state.isRunning || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.state === 'running' || this.state.player.state === 'sliding') {
      this.state.player.velocityY = JUMP_FORCE;
      this.state.player.state = 'jumping';
      this.state.player.slideTimer = 0;
    }
  }

  slide() {
    if (!this.state.isRunning || this.state.gameOver || !this.state.player.isAlive) return;
    if (this.state.player.state === 'running') {
      this.state.player.state = 'sliding';
      this.state.player.slideTimer = 30; // frames
    }
  }

  update(deltaTime: number = 1) {
    if (!this.state.isRunning || this.state.gameOver || !this.state.player.isAlive) return;

    const player = this.state.player;

    // Increase speed over time
    this.state.speed = Math.min(MAX_SPEED, BASE_SPEED + this.state.distance * SPEED_INCREMENT);

    // Update distance
    this.state.distance += this.state.speed * deltaTime;
    player.distance = this.state.distance;

    // Update score (distance-based + coins)
    player.score = Math.floor(this.state.distance / 10) + player.coins * 10;

    // Gravity & jumping
    if (player.state === 'jumping') {
      player.velocityY += GRAVITY * deltaTime;
      player.y += player.velocityY * deltaTime;

      if (player.y >= GROUND_Y - PLAYER_HEIGHT) {
        player.y = GROUND_Y - PLAYER_HEIGHT;
        player.velocityY = 0;
        player.state = 'running';
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

    // Update obstacles
    this.updateObstacles(deltaTime);

    // Update coins
    this.updateCoins(deltaTime);

    // Check collisions
    this.checkCollisions();

    // Notify score change
    this.onScoreChange?.(player.score, player.distance, player.coins, this.state.speed);
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
    for (const obstacle of this.state.obstacles) {
      obstacle.z -= this.state.speed * deltaTime;
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
            continue;
          }

          // If jumping over low obstacles
          if (player.state === 'jumping' && (obstacle.type === 'barrier' || obstacle.type === 'cone')) {
            const playerBottom = playerTop + playerHeight;
            if (playerBottom < obstacleTop + 15) {
              obstacle.passed = true;
              continue;
            }
          }

          // Vertical overlap check
          if (playerTop < GROUND_Y && playerTop + playerHeight > obstacleTop) {
            this.handleDeath();
            return;
          }
        }
      }

      if (obstacle.z < -20) {
        obstacle.passed = true;
      }
    }

    // Check coin collisions
    for (const coin of this.state.coins) {
      if (coin.collected) continue;
      if (coin.z > -20 && coin.z < 40 && coin.lane === player.lane) {
        coin.collected = true;
        player.coins++;
        this.onCollectCoin?.();
      }
    }
  }

  private handleDeath() {
    this.state.player.isAlive = false;
    this.state.player.state = 'dead';
    this.state.gameOver = true;
    this.state.isRunning = false;
    this.onGameOver?.();
  }

  getPlayerData(): PlayerData {
    return { ...this.state.player };
  }
}
