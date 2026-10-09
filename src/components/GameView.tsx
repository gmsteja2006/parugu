'use client';

// ============================================
// GameView Component — Orchestrates all game phases
// Supports both Socket.IO (custom server) and Serverless API fallback (Vercel)
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { generateObstacleSequence, generateCoinSequence } from '@/game/engine';
import { type Room, type RoomPlayer, type PlayerUpdateData, type Difficulty, DIFFICULTY_CONFIG, PLAYER_COLORS } from '@/game/types';
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
  const [currentSpeed, setCurrentSpeed] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [gameStarted, setGameStarted] = useState(false);
  const [isServerlessMode, setIsServerlessMode] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const playerIdRef = useRef<string>('');

  useEffect(() => {
    roomRef.current = room;
    playerIdRef.current = playerId;
  }, [room, playerId]);

  // ==========================================
  // Socket.IO Listeners
  // ==========================================
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
      setCurrentSpeed(DIFFICULTY_CONFIG[startRoom.difficulty ?? 'medium'].baseSpeed);
    });

    socket.on('game:player-update', (player: RoomPlayer) => {
      setOtherPlayers(prev => {
        const index = prev.findIndex(p => p.id === player.id);
        if (index === -1) return [...prev, player];
        const updated = [...prev];
        updated[index] = player;
        return updated;
      });

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

  // ==========================================
  // Serverless HTTP Polling Loop (when in serverless mode)
  // ==========================================
  useEffect(() => {
    if (!isServerlessMode || !room || phase === 'gameover' || phase === 'start') return;

    const intervalMs = phase === 'playing' ? 400 : 1000;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${room.code}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.room) {
          const updatedRoom: Room = data.room;
          setRoom(updatedRoom);

          const others = updatedRoom.players.filter(p => p.id !== playerIdRef.current);
          setOtherPlayers(others);

          // If room started and we're in lobby
          if (updatedRoom.isStarted && phase === 'lobby') {
            startCountdownFlow(updatedRoom);
          }

          // Check if all players dead
          const allDead = updatedRoom.players.every(p => !p.isAlive);
          if (allDead && updatedRoom.players.length > 0 && phase === 'playing') {
            const finalRanks = [...updatedRoom.players].sort((a, b) => b.score - a.score);
            setRankings(finalRanks);
            setPhase('gameover');
          }
        }
      } catch {
        // Network error during poll
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isServerlessMode, room?.code, phase]);

  // Helper to run local countdown
  const startCountdownFlow = useCallback((targetRoom: Room) => {
    setCountdown(3);
    setPhase('countdown');
    playCountdownBeep(false);

    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        playCountdownBeep(false);
      } else if (count === 0) {
        setCountdown(0);
        playCountdownBeep(true);
      } else {
        clearInterval(timer);
        setRoom(targetRoom);
        setPhase('playing');
        setGameStarted(true);
        setCurrentScore(0);
        setCurrentDistance(0);
        setCurrentCoins(0);
        setCurrentSpeed(DIFFICULTY_CONFIG[targetRoom.difficulty ?? 'medium'].baseSpeed);
      }
    }, 1000);
  }, []);

  // ==========================================
  // Handlers
  // ==========================================

  // Solo / Practice Run
  const handlePlaySolo = useCallback((name: string) => {
    const pid = `p_${Date.now()}`;
    const seed = Math.floor(Math.random() * 1000000);
    const soloRoom: Room = {
      id: `room_${Date.now()}`,
      code: 'SOLO',
      players: [
        {
          id: pid,
          socketId: pid,
          name: name || 'Runner',
          color: PLAYER_COLORS[0],
          isReady: true,
          score: 0,
          distance: 0,
          coins: 0,
          lane: 1,
          y: 420,
          state: 'running',
          isAlive: true,
        },
      ],
      maxPlayers: 1,
      isStarted: true,
      createdAt: Date.now(),
      hostId: pid,
      seed,
      difficulty,
      obstacleSequence: generateObstacleSequence(seed, difficulty),
      coinSequence: generateCoinSequence(seed),
    };

    setRoom(soloRoom);
    setPlayerId(pid);
    setIsServerlessMode(false);
    setCurrentSpeed(DIFFICULTY_CONFIG[difficulty].baseSpeed);
    startCountdownFlow(soloRoom);
  }, [startCountdownFlow, difficulty]);

  // Create Room
  const handleCreateRoom = useCallback(async (playerName: string) => {
    setIsConnecting(true);
    setError(null);

    const socket = getSocket();
    let socketResponded = false;

    if (socket.connected) {
      socket.emit('room:create', playerName, difficulty);
      return;
    }

    // Try socket emit, with 2s fallback to serverless API
    const fallbackTimer = setTimeout(async () => {
      if (socketResponded) return;
      console.log('[Client] Socket unavailable, falling back to Serverless API...');
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName, difficulty }),
        });
        const data = await res.json();
        if (data.success && data.room) {
          setIsServerlessMode(true);
          setRoom(data.room);
          setPlayerId(data.playerId);
          setPhase('lobby');
          setIsConnecting(false);
        } else {
          setError(data.error || 'Failed to create room');
          setIsConnecting(false);
        }
      } catch (err: unknown) {
        setError('Connection error. Please try Solo Run or check your network.');
        setIsConnecting(false);
      }
    }, 1500);

    socket.emit('room:create', playerName, difficulty);
    socket.once('room:joined', () => {
      socketResponded = true;
      clearTimeout(fallbackTimer);
    });
  }, [difficulty]);

  // Join Room
  const handleJoinRoom = useCallback(async (roomCode: string, playerName: string) => {
    setIsConnecting(true);
    setError(null);

    const code = roomCode.toUpperCase().trim();
    const socket = getSocket();
    let socketResponded = false;

    if (socket.connected) {
      socket.emit('room:join', code, playerName);
      return;
    }

    const fallbackTimer = setTimeout(async () => {
      if (socketResponded) return;
      console.log('[Client] Socket unavailable, attempting Serverless API join...');
      try {
        const res = await fetch(`/api/rooms/${code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', playerName }),
        });
        const data = await res.json();
        if (data.success && data.room) {
          setIsServerlessMode(true);
          setRoom(data.room);
          setPlayerId(data.playerId);
          setPhase('lobby');
          setIsConnecting(false);
        } else {
          setError(data.error || 'Room not found or game already started');
          setIsConnecting(false);
        }
      } catch {
        setError('Could not connect to room. Please verify the code.');
        setIsConnecting(false);
      }
    }, 1500);

    socket.emit('room:join', code, playerName);
    socket.once('room:joined', () => {
      socketResponded = true;
      clearTimeout(fallbackTimer);
    });
  }, []);

  // Ready Up
  const handleReady = useCallback(async () => {
    if (isServerlessMode && room && playerId) {
      try {
        const res = await fetch(`/api/rooms/${room.code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ready', playerId }),
        });
        const data = await res.json();
        if (data.room) {
          setRoom(data.room);
          if (data.room.isStarted) {
            startCountdownFlow(data.room);
          }
        }
      } catch {
        // Fallback
      }
      return;
    }

    const socket = getSocket();
    socket.emit('room:ready');
  }, [isServerlessMode, room, playerId, startCountdownFlow]);

  // Leave Room
  const handleLeave = useCallback(async () => {
    if (isServerlessMode && room && playerId) {
      try {
        await fetch(`/api/rooms/${room.code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'leave', playerId }),
        });
      } catch {
        // ignore
      }
    }

    disconnectSocket();
    setPhase('start');
    setRoom(null);
    setPlayerId('');
    setOtherPlayers([]);
    setGameStarted(false);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
    setCurrentSpeed(5);
  }, [isServerlessMode, room, playerId]);

  // In-Game Update
  const handleGameUpdate = useCallback(async (data: PlayerUpdateData) => {
    if (isServerlessMode && room && playerId) {
      // Periodic serverless update
      try {
        await fetch(`/api/rooms/${room.code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', playerId, data }),
        });
      } catch {
        // ignore
      }
      return;
    }

    const socket = getSocket();
    socket.emit('game:update', data);
  }, [isServerlessMode, room, playerId]);

  // Player Died
  const handleGameDied = useCallback(async (finalScore: number) => {
    if (room?.code === 'SOLO') {
      const currentPlayer = room.players[0];
      const finishedPlayer = { ...currentPlayer, score: finalScore, isAlive: false };
      setRankings([finishedPlayer]);
      setPhase('gameover');
      return;
    }

    if (isServerlessMode && room && playerId) {
      try {
        const res = await fetch(`/api/rooms/${room.code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'died', playerId, finalScore }),
        });
        const data = await res.json();
        if (data.isGameOver || room.players.length === 1) {
          setRankings(data.rankings || room.players);
          setPhase('gameover');
        }
      } catch {
        setRankings(room.players);
        setPhase('gameover');
      }
      return;
    }

    const socket = getSocket();
    socket.emit('game:died', finalScore);
  }, [isServerlessMode, room, playerId]);

  // Score HUD change
  const handleScoreChange = useCallback((score: number, distance: number, coins: number, speed: number) => {
    setCurrentScore(score);
    setCurrentDistance(distance);
    setCurrentCoins(coins);
    setCurrentSpeed(speed);
  }, []);

  // Play Again
  const handlePlayAgain = useCallback(() => {
    if (room?.code === 'SOLO') {
      handlePlaySolo(room.players[0]?.name || 'Runner');
      return;
    }

    setPhase('lobby');
    setGameStarted(false);
    setOtherPlayers([]);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
    setCurrentSpeed(5);

    setRoom(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isStarted: false,
        players: prev.players.map(p => ({ ...p, isReady: false, isAlive: true, score: 0 })),
      };
    });
  }, [room, handlePlaySolo]);

  const currentPlayer = room?.players.find(p => p.id === playerId);

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white font-sans select-none">
      {phase === 'start' && (
        <StartScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onPlaySolo={handlePlaySolo}
          isConnecting={isConnecting}
          error={error}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
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
        <div className="relative flex flex-col items-center justify-center min-h-screen px-3 py-5 overflow-hidden">
          {/* Ambient race backdrop */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[#05050f]" />
            <div className="absolute -top-32 left-1/2 h-72 w-[720px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
            <div className="absolute bottom-0 left-0 h-64 w-96 rounded-full bg-cyan-500/15 blur-[110px]" />
            <div className="absolute bottom-10 right-0 h-64 w-96 rounded-full bg-amber-500/10 blur-[110px]" />
            <div className="absolute inset-0 race-grid opacity-[0.35]" />
          </div>

          {/* Top race bar */}
          <div className="relative z-10 mb-3 flex w-full max-w-[820px] items-center justify-between rounded-xl border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-black italic tracking-tight">
                <span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">NEON</span>
                <span className="text-white/90"> RUNNER</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 tracking-[0.25em] text-cyan-200">{room.code}</span>
              <button onClick={handleLeave} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-white/50 hover:text-red-300 hover:border-red-400/30 transition text-[11px] font-sans font-semibold">
                ✕ quit
              </button>
            </div>
          </div>

          <div className="relative z-10">
            <Scoreboard
              currentPlayerId={playerId}
              players={room.players}
              currentScore={currentScore}
              currentDistance={currentDistance}
              currentCoins={currentCoins}
              currentSpeed={currentSpeed}
              difficulty={room.difficulty ?? difficulty}
            />
            <div className="pt-[92px]">
              <GameCanvas
                playerId={playerId}
                playerName={currentPlayer.name}
                playerColor={currentPlayer.color}
                seed={room.seed}
                difficulty={room.difficulty ?? difficulty}
                otherPlayers={otherPlayers}
                onUpdate={handleGameUpdate}
                onDied={handleGameDied}
                onScoreChange={handleScoreChange}
                isStarted={gameStarted}
              />
            </div>
          </div>

          {/* Controls hint */}
          <div className="relative z-10 mt-3 hidden md:flex items-center gap-2 text-[11px] text-white/40">
            {['◀ move', '▶ move', '▲ jump', '▼ slide'].map((h) => (
              <span key={h} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono">{h}</span>
            ))}
            <span className="ml-1 font-sans">dodge trains • grab coins • don&apos;t blink</span>
          </div>

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
