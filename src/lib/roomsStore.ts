// ============================================
// Serverless Rooms Store (shared in memory)
// ============================================

import type { Room, RoomPlayer, Difficulty } from '@/game/types';
import { PLAYER_COLORS, parseDifficulty } from '@/game/types';
import { generateObstacleSequence, generateCoinSequence } from '@/game/engine';

interface GlobalWithStore {
  __ROOMS_STORE__?: Map<string, Room>;
}

const globalStore = globalThis as unknown as GlobalWithStore;
if (!globalStore.__ROOMS_STORE__) {
  globalStore.__ROOMS_STORE__ = new Map<string, Room>();
}

export const roomsStore: Map<string, Room> = globalStore.__ROOMS_STORE__;

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createNewRoom(playerName: string, difficulty: Difficulty = 'medium'): { room: Room; playerId: string } {
  const code = generateRoomCode();
  const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const seed = Math.floor(Math.random() * 1000000);
  const roomDifficulty = parseDifficulty(difficulty);

  const room: Room = {
    id: `room_${Date.now()}`,
    code,
    players: [
      {
        id: playerId,
        socketId: playerId,
        name: playerName || 'Player 1',
        color: PLAYER_COLORS[0],
        isReady: false,
        score: 0,
        distance: 0,
        coins: 0,
        lane: 1,
        y: 420,
        state: 'running',
        isAlive: true,
      },
    ],
    maxPlayers: 4,
    isStarted: false,
    createdAt: Date.now(),
    hostId: playerId,
    seed,
    difficulty: roomDifficulty,
    obstacleSequence: generateObstacleSequence(seed, roomDifficulty),
    coinSequence: generateCoinSequence(seed),
  };

  roomsStore.set(code, room);
  return { room, playerId };
}
