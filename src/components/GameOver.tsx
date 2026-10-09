'use client';

// ============================================
// Game Over Overlay Component
// ============================================

import React from 'react';
import type { RoomPlayer } from '@/game/types';

interface GameOverProps {
  rankings: RoomPlayer[];
  currentPlayerId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function GameOver({ rankings, currentPlayerId, onPlayAgain, onLeave }: GameOverProps) {
  const currentPlayer = rankings.find(p => p.id === currentPlayerId);
  const currentRank = rankings.findIndex(p => p.id === currentPlayerId) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md mx-4">
        <div className="bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-purple-900/30">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="font-playful text-4xl font-black mb-2 drop-shadow-[0_3px_0_rgba(0,0,0,0.45)]">
              <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                GAME OVER
              </span>
            </h2>
            {currentRank === 1 && rankings.length > 1 && (
              <p className="text-yellow-400 text-sm font-medium animate-pulse">🏆 You Won!</p>
            )}
          </div>

          {/* Player Score */}
          {currentPlayer && (
            <div className="text-center mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Your Score</p>
              <p className="text-4xl font-bold text-white tabular-nums">
                {currentPlayer.score.toLocaleString()}
              </p>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-white/40">
                <span>📏 {Math.floor(currentPlayer.distance)}m</span>
                <span>💰 {currentPlayer.coins} coins</span>
              </div>
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
