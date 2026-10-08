// ============================================
// Socket.IO client singleton
// ============================================

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/game/types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    socket = io(url, {
      path: '/api/socketio',
      addTrailingSlash: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      timeout: 4000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
