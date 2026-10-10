'use client';

// ============================================
// Game Over Overlay Component — stats + best
// ============================================

import React, { useMemo } from 'react';
import type { RoomPlayer, RunStats } from '@/game/types';
import { DEATH_QUIPS } from '@/game/types';

interface GameOverProps {
  rankings: RoomPlayer[];
  currentPlayerId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
  stats?: RunStats | null;
  isBest?: boolean;
  best?: number;
}

export default function GameOver({ rankings, currentPlayerId, onPlayAgain, onLeave, stats, isBest, best }: GameOverProps) {
  const currentPlayer = rankings.find(p => p.id === currentPlayerId);
  const winner = rankings.length > 1 ? rankings[0] : null;
  const iWon = !!winner && winner.id === currentPlayerId;

  const confetti = useMemo(() => {
    if (!isBest) return [];
    const cols = ['#ff2d78', '#00e5ff', '#76ff03', '#ffea00', '#ff7a1a', '#c86bff'];
    return Array.from({ length: 42 }).map((_, i) => ({
      left: (i * 97 + 13) % 100,
      delay: ((i * 37) % 12) / 10,
      dur: 2.2 + ((i * 53) % 14) / 10,
      color: cols[i % cols.length],
      size: 6 + ((i * 29) % 7),
      round: i % 3 === 0,
    }));
  }, [isBest]);

  const quip = stats?.cause ? (DEATH_QUIPS[stats.cause] ?? 'Wipeout!') : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fadeIn overflow-hidden">
      {/* Confetti rain on new best */}
      {isBest && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="absolute top-[-20px] animate-confetti"
              style={{
                left: `${c.left}%`,
                width: `${c.size}px`,
                height: c.round ? `${c.size}px` : `${c.size * 0.5}px`,
                backgroundColor: c.color,
                borderRadius: c.round ? '50%' : '2px',
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.dur}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="w-full max-w-md mx-4 max-h-[92vh] overflow-y-auto">
        <div className="bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-purple-900/30">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="font-playful text-4xl font-black mb-2 drop-shadow-[0_3px_0_rgba(0,0,0,0.45)]">
              <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                GAME OVER
              </span>
            </h2>
            {quip && <p className="text-white/60 text-sm font-playful font-bold">{quip}</p>}
            {/* Winner banner — the whole point of the race */}
            {winner && (
              <div
                className="mt-3 inline-flex items-center gap-2.5 rounded-2xl border-[3px] border-white px-5 py-2.5 shadow-[0_4px_0_rgba(0,0,0,0.45)] animate-countdownPop"
                style={{ backgroundColor: winner.color + '22', boxShadow: `0 0 24px ${winner.color}55, 0 4px 0 rgba(0,0,0,0.45)` }}
              >
                <span className="text-2xl">{iWon ? '🏆' : '👑'}</span>
                <span className="font-playful text-xl font-black tracking-wide" style={{ color: winner.color }}>
                  {iWon ? 'YOU WIN!' : `${winner.name.toUpperCase()} WINS!`}
                </span>
                <span className="font-mono text-xs text-white/60 tabular-nums">
                  {winner.score.toLocaleString()}
                </span>
              </div>
            )}
            {isBest && (
              <p className="mt-2 inline-block rounded-full border-2 border-amber-300 bg-amber-400/15 px-4 py-1 font-playful text-sm font-black text-amber-300 animate-countdownPop">
                🎉 NEW BEST! 🎉
              </p>
            )}
          </div>

          {/* Player Score */}
          {currentPlayer && (
            <div className="text-center mb-6 p-4 rounded-2xl border-[3px] border-white/80 bg-white/5 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Your Score</p>
              <p className="font-playful text-5xl font-black text-white tabular-nums drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]">
                {currentPlayer.score.toLocaleString()}
              </p>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-white/40">
                <span>📏 {Math.floor(currentPlayer.distance)}m</span>
                <span>💰 {currentPlayer.coins} coins</span>
                {typeof best === 'number' && best > 0 && (
                  <span>⭐ {best.toLocaleString()}</span>
                )}
              </div>
            </div>
          )}

          {/* Run stats */}
          {stats && (
            <div className="mb-6 grid grid-cols-3 gap-2">
              {[
                { icon: '🎨', val: stats.sprays, label: 'sprays' },
                { icon: '🧲', val: stats.magnets, label: 'magnets' },
                { icon: '😱', val: stats.nearMisses, label: 'near-miss' },
                { icon: '🔥', val: `x${Math.max(1, stats.topCombo)}`, label: 'best combo' },
                { icon: '💰', val: stats.coins, label: 'coins' },
                { icon: '📏', val: `${stats.distance}m`, label: 'distance' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center">
                  <p className="text-base leading-none">{s.icon}</p>
                  <p className="font-playful text-lg font-black text-white tabular-nums leading-tight">{s.val}</p>
                  <p className="text-[9px] uppercase tracking-widest text-white/35">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Rankings */}
          {rankings.length > 1 && (
            <div className="mb-6">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3 font-medium">
                Final Rankings
              </p>
              <div className="space-y-2">
                {rankings.map((player, index) => {
                  const isCurrentPlayer = player.id === currentPlayerId;
                  const medals = ['🥇', '🥈', '🥉', ''];
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                        isCurrentPlayer
                          ? 'bg-white/10 border border-white/20'
                          : 'bg-white/3 border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-6 text-center">
                          {medals[index] || `#${index + 1}`}
                        </span>
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: player.color }}
                        />
                        <span className={`text-sm font-medium ${isCurrentPlayer ? 'text-white' : 'text-white/60'}`}>
                          {player.name}
                        </span>
                      </div>
                      <span className="text-sm font-mono tabular-nums text-white/70">
                        {player.score.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={onPlayAgain}
              className="btn-chunky w-full"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Play Again
              </span>
            </button>
            <button
              onClick={onLeave}
              className="w-full px-6 py-3 text-white/30 hover:text-white/60 transition-colors text-sm"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
