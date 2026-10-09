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
export const BASE_SPEED = 5;
export const MAX_SPEED = 14;
export const SPEED_INCREMENT = 0.0008;

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
  'room:create': (playerName: string) => void;
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
  train: { width: 60, height: 120, color: '#e74c3c', canSlideUnder: false },
  barrier: { width: 70, height: 40, color: '#f39c12', canSlideUnder: false },
  cone: { width: 30, height: 35, color: '#e67e22', canSlideUnder: false },
  tall_barrier: { width: 70, height: 90, color: '#9b59b6', canSlideUnder: true },
};

export const PLAYER_COLORS = ['#00e5ff', '#ff4081', '#76ff03', '#ffea00'];
