'use client';

// ============================================
// GameView Component — Orchestrates all game phases
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import type { Room, RoomPlayer, PlayerUpdateData } from '@/game/types';
import StartScreen from './StartScreen';
import Lobby from './Lobby';
import GameCanvas from './GameCanvas';
import Scoreboard from './Scoreboard';
import GameOver from './GameOver';
import CountdownOverlay from './CountdownOverlay';
import { playCountdownBeep } from '@/game/sounds';

type GamePhase = 'start' | 'lobby' | 'countdown' | 'playing' | 'gameover';

export default function GameView() {
  const [phase, setPhase] = useState<GamePhase>('start');
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  const [otherPlayers, setOtherPlayers] = useState<RoomPlayer[]>([]);
  const [rankings, setRankings] = useState<RoomPlayer[]>([]);
  const [currentScore, setCurrentScore] = useState(0);
  const [currentDistance, setCurrentDistance] = useState(0);
  const [currentCoins, setCurrentCoins] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  const roomRef = useRef<Room | null>(null);

  // Keep room ref in sync
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Setup socket listeners
  useEffect(() => {
    const socket = getSocket();

    socket.on('room:created', (newRoom: Room) => {
      console.log('[Client] Room created:', newRoom.code);
    });

    socket.on('room:joined', (joinedRoom: Room, pid: string) => {
      console.log('[Client] Joined room:', joinedRoom.code, 'as', pid);
      setRoom(joinedRoom);
      setPlayerId(pid);
      setPhase('lobby');
      setIsConnecting(false);
      setError(null);
    });

    socket.on('room:player-joined', (player: RoomPlayer) => {
      console.log('[Client] Player joined:', player.name);
      setRoom(prev => {
        if (!prev) return prev;
        const exists = prev.players.find(p => p.id === player.id);
        if (exists) return prev;
        return { ...prev, players: [...prev.players, player] };
      });
    });

    socket.on('room:player-left', (pid: string) => {
      console.log('[Client] Player left:', pid);
      setRoom(prev => {
        if (!prev) return prev;
        return { ...prev, players: prev.players.filter(p => p.id !== pid) };
      });
      setOtherPlayers(prev => prev.filter(p => p.id !== pid));
    });

    socket.on('room:player-ready', (pid: string) => {
      console.log('[Client] Player ready:', pid);
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.id === pid ? { ...p, isReady: true } : p
          ),
        };
      });
    });

    socket.on('room:error', (message: string) => {
      console.error('[Client] Room error:', message);
      setError(message);
      setIsConnecting(false);
    });

    socket.on('game:countdown', (seconds: number) => {
      console.log('[Client] Countdown:', seconds);
      setCountdown(seconds);
      setPhase('countdown');
      playCountdownBeep(seconds === 0);
    });

    socket.on('game:start', (startRoom: Room) => {
      console.log('[Client] Game started!');
      setRoom(startRoom);
      setPhase('playing');
      setGameStarted(true);
      setCurrentScore(0);
      setCurrentDistance(0);
      setCurrentCoins(0);
    });

    socket.on('game:player-update', (player: RoomPlayer) => {
      setOtherPlayers(prev => {
        const index = prev.findIndex(p => p.id === player.id);
        if (index === -1) return [...prev, player];
        const updated = [...prev];
        updated[index] = player;
        return updated;
      });

      // Also update room players for scoreboard
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.id === player.id ? { ...p, ...player } : p
          ),
        };
      });
    });

    socket.on('game:player-died', (pid: string, finalScore: number) => {
      console.log('[Client] Player died:', pid, 'Score:', finalScore);
      setOtherPlayers(prev =>
        prev.map(p => p.id === pid ? { ...p, isAlive: false, score: finalScore } : p)
      );
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.id === pid ? { ...p, isAlive: false, score: finalScore } : p
          ),
        };
      });
    });

    socket.on('game:over', (finalRankings: RoomPlayer[]) => {
      console.log('[Client] Game over!', finalRankings);
      setRankings(finalRankings);
      setPhase('gameover');
    });

    return () => {
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('room:player-ready');
      socket.off('room:error');
      socket.off('game:countdown');
      socket.off('game:start');
      socket.off('game:player-update');
      socket.off('game:player-died');
      socket.off('game:over');
    };
  }, []);

  const handleCreateRoom = useCallback((playerName: string) => {
    setIsConnecting(true);
    setError(null);
    const socket = getSocket();
    socket.emit('room:create', playerName);
  }, []);

  const handleJoinRoom = useCallback((roomCode: string, playerName: string) => {
    setIsConnecting(true);
    setError(null);
    const socket = getSocket();
    socket.emit('room:join', roomCode, playerName);
  }, []);

  const handleReady = useCallback(() => {
    const socket = getSocket();
    socket.emit('room:ready');
  }, []);

  const handleLeave = useCallback(() => {
    disconnectSocket();
    setPhase('start');
    setRoom(null);
    setPlayerId('');
    setOtherPlayers([]);
    setGameStarted(false);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
  }, []);

  const handleGameUpdate = useCallback((data: PlayerUpdateData) => {
    const socket = getSocket();
    socket.emit('game:update', data);
  }, []);

  const handleGameDied = useCallback((finalScore: number) => {
    const socket = getSocket();
    socket.emit('game:died', finalScore);
  }, []);

  const handleScoreChange = useCallback((score: number, distance: number, coins: number) => {
    setCurrentScore(score);
    setCurrentDistance(distance);
    setCurrentCoins(coins);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setPhase('lobby');
    setGameStarted(false);
    setOtherPlayers([]);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
    // Reset ready states in room
    setRoom(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isStarted: false,
        players: prev.players.map(p => ({ ...p, isReady: false, isAlive: true, score: 0 })),
      };
    });
  }, []);

  const currentPlayer = room?.players.find(p => p.id === playerId);

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white font-sans">
      {phase === 'start' && (
        <StartScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          isConnecting={isConnecting}
          error={error}
        />
      )}

      {phase === 'lobby' && room && (
        <Lobby
          room={room}
          playerId={playerId}
          onReady={handleReady}
          onLeave={handleLeave}
        />
      )}

      {(phase === 'countdown' || phase === 'playing') && room && currentPlayer && (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 relative">
          {/* Game Canvas */}
          <div className="relative">
            <Scoreboard
              currentPlayerId={playerId}
              players={room.players}
              currentScore={currentScore}
              currentDistance={currentDistance}
              currentCoins={currentCoins}
            />
            <GameCanvas
              playerId={playerId}
              playerName={currentPlayer.name}
              playerColor={currentPlayer.color}
              seed={room.seed}
              otherPlayers={otherPlayers}
              onUpdate={handleGameUpdate}
              onDied={handleGameDied}
              onScoreChange={handleScoreChange}
              isStarted={gameStarted}
            />
          </div>

          {/* Countdown Overlay */}
          {phase === 'countdown' && (
            <CountdownOverlay count={countdown} />
          )}
        </div>
      )}

      {phase === 'gameover' && (
        <GameOver
          rankings={rankings}
          currentPlayerId={playerId}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}
