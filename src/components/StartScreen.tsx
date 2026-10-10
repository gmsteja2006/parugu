'use client';

// ============================================
// Start Screen Component
// ============================================

import React, { useState } from 'react';
import { DIFFICULTY_ORDER, DIFFICULTY_CONFIG, type Difficulty } from '@/game/types';

interface StartScreenProps {
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onPlaySolo: (playerName: string) => void;
  isConnecting: boolean;
  error: string | null;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onOpenSettings: () => void;
}

export default function StartScreen({ onCreateRoom, onJoinRoom, onPlaySolo, isConnecting, error, difficulty, onDifficultyChange, onOpenSettings }: StartScreenProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');

  const handleCreate = () => {
    if (!playerName.trim()) return;
    onCreateRoom(playerName.trim());
  };

  const handleJoin = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden">
      <button onClick={onOpenSettings} title="Settings" className="btn-chunky-sm absolute top-4 right-4 z-20">
        ⚙️
      </button>
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => {
          const w = 4 + ((i * 7) % 8);
          const left = (i * 47 + 13) % 100;
          const top = (i * 59 + 27) % 100;
          const delay = ((i * 1.3) % 5).toFixed(1);
          const duration = (3 + ((i * 2.1) % 4)).toFixed(1);
          return (
            <div
              key={i}
              className="absolute rounded-full opacity-20 animate-float"
              style={{
                width: `${w}px`,
                height: `${w}px`,
                left: `${left}%`,
                top: `${top}%`,
                background: ['#00e5ff', '#ff4081', '#76ff03', '#ffea00'][i % 4],
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          );
        })}
      </div>

      {/* Title */}
      <div className="relative z-10 mb-12 text-center">
        <h1 className="font-playful text-6xl md:text-7xl font-black tracking-tight mb-2 drop-shadow-[0_5px_0_rgba(0,0,0,0.45)]">
          <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 bg-clip-text text-transparent">
            PARUGU
          </span>
        </h1>
        <p className="text-white/40 text-sm tracking-[0.3em] uppercase font-medium">
          Multiplayer Endless Runner
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/30">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Online
        </div>
      </div>

      {/* Content Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-purple-900/20">
          
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center animate-shake">
              {error}
            </div>
          )}

          {mode === 'menu' && (
            <div className="space-y-4">
              {/* Player Name Input */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2 font-medium">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  maxLength={16}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all duration-300"
                />
              </div>

              <div className="pt-4 space-y-3">
                {/* Difficulty select */}
                <div>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-2 font-medium">
                    Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTY_ORDER.map((d) => {
                      const cfg = DIFFICULTY_CONFIG[d];
                      const active = difficulty === d;
                      return (
                        <button
                          key={d}
                          onClick={() => onDifficultyChange(d)}
                          className={`rounded-xl border px-2 py-2.5 text-center transition-all duration-200 ${
                            active
                              ? 'bg-white/10 scale-[1.03]'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] opacity-70 hover:opacity-100'
                          }`}
                          style={active ? { borderColor: cfg.color, boxShadow: `0 0 18px ${cfg.color}44` } : undefined}
                        >
                          <p className="text-sm font-black" style={{ color: active ? cfg.color : '#fff' }}>
                            {cfg.label}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5">{cfg.tagline}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => onPlaySolo(playerName.trim() || 'Runner')}
                  className="btn-chunky-green w-full animate-btn-bounce-in"
                >
                  <span className="flex items-center justify-center gap-3 text-base">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Play Solo (Instant Run)
                  </span>
                </button>

                <div className="flex items-center gap-3 my-2">
                  <div className="h-px bg-white/10 flex-1" />
                  <span className="text-[11px] uppercase tracking-wider text-white/30 font-medium">Or Multiplayer</span>
                  <div className="h-px bg-white/10 flex-1" />
                </div>

                <button
                  onClick={() => playerName.trim() ? setMode('create') : null}
                  disabled={!playerName.trim()}
                  className="btn-chunky w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Room
                  </span>
                </button>

                <button
                  onClick={() => playerName.trim() ? setMode('join') : null}
                  disabled={!playerName.trim()}
                  className="btn-chunky-pink w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Join Room
                  </span>
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Create a Room</h2>
                <p className="text-white/40 text-sm">Start a new game session</p>
              </div>

              <div className="p-4 rounded-xl bg-cyan-400/5 border border-cyan-400/20">
                <p className="text-white/60 text-sm text-center">
                  Playing as <span className="text-cyan-400 font-semibold">{playerName}</span>
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleCreate}
                  disabled={isConnecting}
                  className="btn-chunky w-full disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-2">
                    {isConnecting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating...
                      </>
                    ) : (
                      'Create Room'
                    )}
                  </span>
                </button>

                <button
                  onClick={() => setMode('menu')}
                  className="w-full px-6 py-3 text-white/40 hover:text-white/70 transition-colors text-sm"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Join a Room</h2>
                <p className="text-white/40 text-sm">Enter the room code to join</p>
              </div>

              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2 font-medium">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC12"
                  maxLength={5}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] uppercase placeholder-white/20 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/20 transition-all duration-300 font-mono"
                />
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleJoin}
                  disabled={isConnecting || !roomCode.trim()}
                  className="btn-chunky-pink w-full disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-2">
                    {isConnecting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Joining...
                      </>
                    ) : (
                      'Join Room'
                    )}
                  </span>
                </button>

                <button
                  onClick={() => setMode('menu')}
                  className="w-full px-6 py-3 text-white/40 hover:text-white/70 transition-colors text-sm"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div className="mt-8 text-center text-white/20 text-xs space-y-1">
          <p>🎮 Arrow Keys / WASD to move</p>
          <p>📱 Swipe on mobile</p>
        </div>
      </div>
    </div>
  );
}
