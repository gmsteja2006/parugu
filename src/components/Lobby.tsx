'use client';

// ============================================
// Lobby Component — Room lobby before game starts
// ============================================

import React, { useState } from 'react';
import type { Room, RoomPlayer } from '@/game/types';
import { DIFFICULTY_CONFIG, parseDifficulty } from '@/game/types';

interface LobbyProps {
  room: Room;
  playerId: string;
  onReady: () => void;
  onLeave: () => void;
}

export default function Lobby({ room, playerId, onReady, onLeave }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const currentPlayer = room.players.find(p => p.id === playerId);
  const isReady = currentPlayer?.isReady || false;
  const isHost = room.hostId === playerId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = room.code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-lg">
        {/* Room Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Game Lobby</h2>
          <p className="text-white/40 text-sm">Waiting for players to join and ready up</p>
          {(() => {
            const cfg = DIFFICULTY_CONFIG[parseDifficulty((room as Room).difficulty)];
            return (
              <span
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em]"
                style={{ borderColor: cfg.color + '66', backgroundColor: cfg.color + '14', color: cfg.color }}
              >
                {cfg.label} • {cfg.tagline}
              </span>
            );
          })()}
        </div>

        {/* Room Code Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="text-center">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-3 font-medium">Room Code</p>
            <div className="flex items-center justify-center gap-4">
              <span className="text-4xl font-mono font-bold tracking-[0.4em] bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                {room.code}
              </span>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-300 group"
                title="Copy room code"
              >
                {copied ? (
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white/40 group-hover:text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-white/20 text-xs mt-2">
              {copied ? '✓ Copied!' : 'Share this code with friends'}
            </p>
          </div>
        </div>

        {/* Players List */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white/70 text-sm font-medium uppercase tracking-wider">
              Players
            </h3>
            <span className="text-white/30 text-xs">
              {room.players.length}/{room.maxPlayers}
            </span>
          </div>

          <div className="space-y-3">
            {room.players.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                  player.id === playerId
                    ? 'bg-white/10 border border-white/15'
                    : 'bg-white/3 border border-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Player Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg"
                    style={{
                      backgroundColor: player.color + '30',
                      border: `2px solid ${player.color}`,
                      color: player.color,
                      boxShadow: `0 0 15px ${player.color}30`,
                    }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      {player.name}
                      {player.id === playerId && (
                        <span className="ml-2 text-xs text-white/30">(You)</span>
                      )}
                    </p>
                    <p className="text-white/30 text-xs">
                      {player.id === room.hostId ? '👑 Host' : `Player ${index + 1}`}
                    </p>
                  </div>
                </div>

                {/* Ready Status */}
                <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
                  player.isReady
                    ? 'bg-green-400/10 text-green-400 border border-green-400/30'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}>
                  {player.isReady ? '✓ Ready' : 'Waiting'}
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center justify-center p-3 rounded-xl border border-dashed border-white/10 text-white/15 text-sm"
              >
                Waiting for player...
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onReady}
            disabled={isReady}
            className={`w-full group relative overflow-hidden rounded-xl px-6 py-4 font-semibold text-white transition-all duration-300 ${
              isReady ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div className={`absolute inset-0 ${
              isReady
                ? 'bg-green-600'
                : 'bg-gradient-to-r from-green-500 to-emerald-600'
            }`} />
            <span className="relative flex items-center justify-center gap-2">
              {isReady ? (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Ready!
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ready Up
                </>
              )}
            </span>
          </button>

          <button
            onClick={onLeave}
            className="w-full px-6 py-3 text-white/30 hover:text-red-400 transition-colors text-sm border border-transparent hover:border-red-400/20 rounded-xl"
          >
            Leave Room
          </button>
        </div>

        {/* Game info */}
        <div className="mt-8 p-4 rounded-xl bg-white/3 border border-white/5">
          <h4 className="text-white/50 text-xs uppercase tracking-wider mb-3 font-medium">Controls</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/30">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-white/10 text-white/50 font-mono">←</kbd>
              <span>Move Left</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-white/10 text-white/50 font-mono">→</kbd>
              <span>Move Right</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-white/10 text-white/50 font-mono">↑</kbd>
              <span>Jump</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-white/10 text-white/50 font-mono">↓</kbd>
              <span>Slide</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
