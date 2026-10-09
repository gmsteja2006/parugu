// ============================================
// Game Types & Interfaces
// ============================================

export const LANE_COUNT = 3;
export const LANE_WIDTH = 80;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const GROUND_Y = 480;
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 60;
export const PLAYER_SLIDE_HEIGHT = 25;
export const JUMP_FORCE = -14;
export const GRAVITY = 0.6;
// Gauge bounds for HUD speed bars (min easy base → max hard top)
export const BASE_SPEED = 4;
export const MAX_SPEED = 15;
export const SPEED_INCREMENT = 0.0008;

// ============================================
// Difficulty Levels
// ============================================

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyConfig {
  baseSpeed: number;
  maxSpeed: number;
  speedIncrement: number;
  gapMin: number;
  gapMax: number;
  doubleChance: number;
  label: string;
  tagline: string;
  color: string;
}

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    baseSpeed: 4,
    maxSpeed: 9,
    speedIncrement: 0.0004,
    gapMin: 560,
    gapMax: 980,
    doubleChance: 0.1,
    label: 'Easy',
    tagline: 'Chill cruise',
    color: '#76ff03',
  },
  medium: {
    baseSpeed: 5,
    maxSpeed: 14,
    speedIncrement: 0.0008,
    gapMin: 430,
    gapMax: 810,
    doubleChance: 0.22,
    label: 'Medium',
    tagline: 'Classic rush',
    color: '#ffea00',
  },
  hard: {
    baseSpeed: 6,
    maxSpeed: 15,
    speedIncrement: 0.001,
    gapMin: 350,
    gapMax: 650,
    doubleChance: 0.3,
    label: 'Hard',
    tagline: 'Insane traffic',
    color: '#ff5147',
  },
};

export function parseDifficulty(value: unknown): Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : 'medium';
}

export type Lane = 0 | 1 | 2;

export type PlayerState = 'running' | 'jumping' | 'sliding' | 'dead';

export interface Position {
  x: number;
  y: number;
}

export interface PlayerData {
  id: string;
  name: string;
  lane: Lane;
  y: number;
  velocityY: number;
  state: PlayerState;
  score: number;
  distance: number;
  coins: number;
  scoreBonus: number;
  color: string;
  slideTimer: number;
  isAlive: boolean;
  invincibleTimer: number;
}

export type ObstacleType = 'train' | 'barrier' | 'cone' | 'tall_barrier';

export interface Obstacle {
  id: string;
  type: ObstacleType;
  lane: Lane;
  z: number; // distance ahead
  width: number;
  height: number;
  color: string;
  passed: boolean;
  moving?: boolean; // trains rolling toward the player
  approach?: number; // extra closing speed for moving trains
}

export interface Coin {
  id: string;
  lane: Lane;
  z: number;
  collected: boolean;
  floatOffset: number;
}

export interface GameState {
  player: PlayerData;
  obstacles: Obstacle[];
  coins: Coin[];
  speed: number;
  distance: number;
  isRunning: boolean;
  isPaused: boolean;
  gameOver: boolean;
}

// ============================================
// Multiplayer Types
// ============================================

export interface RoomPlayer {
  id: string;
  socketId: string;
  name: string;
  color: string;
  isReady: boolean;
  score: number;
  distance: number;
  coins: number;
  lane: Lane;
  y: number;
  state: PlayerState;
  isAlive: boolean;
}

export interface Room {
  id: string;
  code: string;
  players: RoomPlayer[];
  maxPlayers: number;
  isStarted: boolean;
  createdAt: number;
  hostId: string;
  difficulty: Difficulty;
  // Shared obstacle/coin seed for deterministic generation
  seed: number;
  obstacleSequence: ObstacleSpawn[];
  coinSequence: CoinSpawn[];
}

export interface ObstacleSpawn {
  id: string;
  type: ObstacleType;
  lane: Lane;
  distance: number;
  moving?: boolean;
}

export interface CoinSpawn {
  id: string;
  lane: Lane;
  distance: number;
}

// ============================================
// Socket Events
// ============================================

export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:joined': (room: Room, playerId: string) => void;
  'room:player-joined': (player: RoomPlayer) => void;
  'room:player-left': (playerId: string) => void;
  'room:player-ready': (playerId: string) => void;
  'room:error': (message: string) => void;
  'game:start': (room: Room) => void;
  'game:player-update': (player: RoomPlayer) => void;
  'game:player-died': (playerId: string, finalScore: number) => void;
  'game:over': (rankings: RoomPlayer[]) => void;
  'game:countdown': (seconds: number) => void;
}

export interface ClientToServerEvents {
  'room:create': (playerName: string, difficulty?: Difficulty) => void;
  'room:join': (roomCode: string, playerName: string) => void;
  'room:ready': () => void;
  'game:update': (data: PlayerUpdateData) => void;
  'game:died': (finalScore: number) => void;
}

export interface PlayerUpdateData {
  lane: Lane;
  y: number;
  state: PlayerState;
  score: number;
  distance: number;
  coins: number;
  isAlive: boolean;
}

// ============================================
// Obstacle Definitions
// ============================================

export const OBSTACLE_DEFS: Record<ObstacleType, { width: number; height: number; color: string; canSlideUnder: boolean }> = {
  train: { width: 62, height: 118, color: '#e74c3c', canSlideUnder: false },
  barrier: { width: 70, height: 40, color: '#f39c12', canSlideUnder: false },
  cone: { width: 30, height: 35, color: '#e67e22', canSlideUnder: false },
  tall_barrier: { width: 70, height: 90, color: '#c9a227', canSlideUnder: true },
};

export const PLAYER_COLORS = ['#00e5ff', '#ff4081', '#76ff03', '#ffea00'];
