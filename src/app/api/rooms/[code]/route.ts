import { NextResponse } from 'next/server';
import { roomsStore } from '@/lib/roomsStore';
import { PLAYER_COLORS, type RoomPlayer } from '@/game/types';

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  const { code } = await context.params;
  const room = roomsStore.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  return NextResponse.json({ room });
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const room = roomsStore.get(roomCode);

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, playerId } = body;

  switch (action) {
    case 'join': {
      if (room.isStarted) {
        return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
      }
      if (room.players.length >= room.maxPlayers) {
        return NextResponse.json({ error: 'Room is full' }, { status: 400 });
      }

      const playerName = (body.playerName || `Player ${room.players.length + 1}`)
        .toString()
        .trim()
        .slice(0, 16);
      const newPlayerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const playerIndex = room.players.length;

      const player: RoomPlayer = {
        id: newPlayerId,
        socketId: newPlayerId,
        name: playerName,
        color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
        isReady: false,
        score: 0,
        distance: 0,
        coins: 0,
        lane: 1,
        y: 420,
        state: 'running',
        isAlive: true,
      };

      room.players.push(player);
      return NextResponse.json({ success: true, room, playerId: newPlayerId });
    }

    case 'ready': {
      const player = room.players.find(p => p.id === playerId);
      if (!player) {
        return NextResponse.json({ error: 'Player not in room' }, { status: 404 });
      }

      player.isReady = true;
      const allReady = room.players.every(p => p.isReady);
      if (allReady && room.players.length >= 1) {
        room.isStarted = true;
        for (const p of room.players) {
          p.score = 0;
          p.distance = 0;
          p.coins = 0;
          p.lane = 1;
          p.isAlive = true;
          p.state = 'running';
        }
      }

      return NextResponse.json({ success: true, room });
    }

    case 'update': {
      const player = room.players.find(p => p.id === playerId);
      if (player && body.data) {
        Object.assign(player, body.data);
      }
      return NextResponse.json({ success: true, room });
    }

    case 'died': {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isAlive = false;
        player.score = body.finalScore || player.score;
      }
      const allDead = room.players.every(p => !p.isAlive);
      return NextResponse.json({
        success: true,
        room,
        isGameOver: allDead,
        rankings: [...room.players].sort((a, b) => b.score - a.score),
      });
    }

    case 'leave': {
      const index = room.players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          roomsStore.delete(roomCode);
        }
      }
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}
