import { NextResponse } from 'next/server';
import { roomsStore, createNewRoom } from '@/lib/roomsStore';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    roomsCount: roomsStore.size,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const playerName = (body.playerName || 'Player 1').toString().trim().slice(0, 16);

    const { room, playerId } = createNewRoom(playerName);

    return NextResponse.json({
      success: true,
      room,
      playerId,
    });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
}
