'use client';

// ============================================
// GameView Component — Orchestrates all game phases
// Supports both Socket.IO (custom server) and Serverless API fallback (Vercel)
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { generateObstacleSequence, generateCoinSequence, generatePickupSequence } from '@/game/engine';
import { type Room, type RoomPlayer, type PlayerUpdateData, type Difficulty, type RunStats, DIFFICULTY_CONFIG, PLAYER_COLORS } from '@/game/types';
import StartScreen from './StartScreen';
import Lobby from './Lobby';
import GameCanvas from './GameCanvas';
import Scoreboard from './Scoreboard';
import GameOver from './GameOver';
import CountdownOverlay from './CountdownOverlay';
import SettingsModal, { type GameSettings, DEFAULT_SETTINGS, loadSettings } from './SettingsModal';
import { playCountdownBeep } from '@/game/sounds';
import { startMusic, stopMusic, setMusicVolume } from '@/game/music';

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
  const [currentMagnet, setCurrentMagnet] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboFrac, setComboFrac] = useState(0);
  const [lastStats, setLastStats] = useState<RunStats | null>(null);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('nr_best') || 0);
    } catch {
      return 0;
    }
  });
  const [isBest, setIsBest] = useState(false);
  const [paused, setPaused] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [gameStarted, setGameStarted] = useState(false);
  const [isServerlessMode, setIsServerlessMode] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const playerIdRef = useRef<string>('');

  useEffect(() => {
    roomRef.current = room;
    playerIdRef.current = playerId;
  }, [room, playerId]);

  // Music: on during countdown + playing, off everywhere else / muted
  useEffect(() => {
    setMusicVolume(settings.muted ? 0 : settings.volume);
    if (!settings.muted && (phase === 'countdown' || phase === 'playing')) {
      startMusic();
    } else {
      stopMusic();
    }
  }, [settings.muted, settings.volume, phase]);

  useEffect(() => () => stopMusic(), []);

  // ESC / P pauses while playing
  useEffect(() => {
    if (phase !== 'playing') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        setPaused((p) => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // Spectate safety net: if nobody else is left alive (all dead or
  // disconnected), end the race locally instead of hanging forever.
  const progressRef = useRef<{ dist: number; at: number }>({ dist: -1, at: 0 });
  useEffect(() => {
    if (!spectating || phase !== 'playing') return;
    progressRef.current = { dist: -1, at: Date.now() };
    const id = setInterval(() => {
      const r = roomRef.current;
      if (!r || r.code === 'SOLO') return;
      const me = playerIdRef.current;
      const alive = r.players.filter((p) => p.id !== me && p.isAlive);
      const finalize = () => {
        const finalRanks = [...r.players].sort((a, b) => b.score - a.score);
        setRankings(finalRanks);
        setSpectating(false);
        setPhase('gameover');
      };
      if (alive.length === 0) {
        finalize();
        return;
      }
      // If the leader's distance stalls for 20s, they're gone — end it
      const leader = [...alive].sort((a, b) => b.distance - a.distance)[0];
      const now = Date.now();
      const prev = progressRef.current;
      if (leader.distance !== prev.dist) {
        progressRef.current = { dist: leader.distance, at: now };
      } else if (now - prev.at > 20000) {
        finalize();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [spectating, phase]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem('nr_settings', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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
      setSpectating(false);
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
      setSpectating(false);
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
        setSpectating(false);
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
      pickupSequence: generatePickupSequence(seed),
    };

    setRoom(soloRoom);
    setPlayerId(pid);
    setIsServerlessMode(false);
    setCurrentSpeed(DIFFICULTY_CONFIG[difficulty].baseSpeed);
    setCurrentMagnet(0);
    setCombo(0);
    setComboFrac(0);
    setLastStats(null);
    setIsBest(false);
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
    setPaused(false);
    setSpectating(false);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
    setCurrentSpeed(5);
    setCurrentMagnet(0);
    setCombo(0);
    setComboFrac(0);
    setLastStats(null);
    setIsBest(false);
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
  const handleGameDied = useCallback(async (finalScore: number, stats?: RunStats) => {
    if (stats) {
      setLastStats(stats);
      setBest((prev) => {
        if (finalScore > prev) {
          try {
            localStorage.setItem('nr_best', String(finalScore));
          } catch {
            // ignore
          }
          setIsBest(true);
          return finalScore;
        }
        setIsBest(false);
        return prev;
      });
    }
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
          setSpectating(false);
          setPhase('gameover');
        } else {
          // Others still running — watch them until the race ends
          setSpectating(true);
        }
      } catch {
        setRankings(room.players);
        setSpectating(false);
        setPhase('gameover');
      }
      return;
    }

    const socket = getSocket();
    socket.emit('game:died', finalScore);
    // Watch the survivors until the server calls the race
    setSpectating(true);
  }, [isServerlessMode, room, playerId]);

  // Score HUD change
  const handleScoreChange = useCallback((score: number, distance: number, coins: number, speed: number, magnet: number, comboVal: number, comboFracVal: number) => {
    setCurrentScore(score);
    setCurrentDistance(distance);
    setCurrentCoins(coins);
    setCurrentSpeed(speed);
    setCurrentMagnet(magnet);
    setCombo(comboVal);
    setComboFrac(comboFracVal);
  }, []);

  // Play Again
  const handlePlayAgain = useCallback(() => {
    if (room?.code === 'SOLO') {
      handlePlaySolo(room.players[0]?.name || 'Runner');
      return;
    }

    setPhase('lobby');
    setGameStarted(false);
    setPaused(false);
    setSpectating(false);
    setOtherPlayers([]);
    setCurrentScore(0);
    setCurrentDistance(0);
    setCurrentCoins(0);
    setCurrentSpeed(5);
    setCurrentMagnet(0);
    setCombo(0);
    setComboFrac(0);
    setLastStats(null);
    setIsBest(false);

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
  const spectateTarget = spectating
    ? [...(room?.players ?? [])].filter((p) => p.id !== playerId && p.isAlive).sort((a, b) => b.distance - a.distance)[0] ?? null
    : null;

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
          onOpenSettings={() => setSettingsOpen(true)}
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
              <span className="font-playful text-base font-black italic tracking-tight">
                <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 bg-clip-text text-transparent">PARUGU</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 tracking-[0.25em] text-cyan-200">{room.code}</span>
              {phase === 'playing' && (
                <button
                  onClick={() => setPaused((p) => !p)}
                  title={paused ? 'Resume (ESC)' : 'Pause (ESC)'}
                  className="btn-chunky-sm"
                >
                  {paused ? '▶' : '⏸'}
                </button>
              )}
              <button
                onClick={() => updateSettings({ muted: !settings.muted })}
                title={settings.muted ? 'Unmute music' : 'Mute music'}
                className="btn-chunky-sm"
              >
                {settings.muted ? '🔇' : '🎵'}
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                className="btn-chunky-sm"
              >
                ⚙️
              </button>
              <button onClick={handleLeave} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-white/50 hover:text-red-300 hover:border-red-400/30 transition text-[11px] font-sans font-semibold">
                ✕ quit
              </button>
            </div>
          </div>

          <div className="relative z-10">
            {spectating && phase === 'playing' && (
              <div className="mx-auto mb-2 flex w-fit max-w-[820px] items-center gap-2 rounded-full border-2 border-white/80 bg-black/65 px-4 py-1.5 backdrop-blur-md shadow-[0_4px_0_rgba(0,0,0,0.45)] animate-fadeIn">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-playful text-sm font-black tracking-wide text-white">
                  {spectateTarget ? `👁 SPECTATING ${spectateTarget.name.toUpperCase()}` : '👁 SPECTATING THE RACE'}
                </span>
                <span className="text-[11px] text-white/50">you crashed — enjoy the show</span>
              </div>
            )}
            <Scoreboard
              currentPlayerId={playerId}
              players={room.players}
              currentScore={currentScore}
              currentDistance={currentDistance}
              currentCoins={currentCoins}
              currentSpeed={currentSpeed}
              magnet={currentMagnet}
              combo={combo}
              comboFrac={comboFrac}
              difficulty={room.difficulty ?? difficulty}
            />
            <div className="pt-[104px]">
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
                paused={paused}
                spectating={spectating}
                quality={settings.quality}
                shakeOn={settings.shake}
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

          {paused && phase === 'playing' && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-[3px] animate-fadeIn">
              <div className="text-center">
                <p className="font-playful text-7xl font-black italic text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.45)]">
                  PAUSED
                </p>
                <p className="mt-2 text-white/50 text-sm">Take a breath, runner</p>
                <button onClick={() => setPaused(false)} className="btn-chunky-green mt-5">
                  ▶ RESUME
                </button>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-white/30">or press ESC</p>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'gameover' && (
        <GameOver
          rankings={rankings}
          currentPlayerId={playerId}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeave}
          stats={lastStats}
          isBest={isBest}
          best={best}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
