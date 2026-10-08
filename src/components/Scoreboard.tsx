'use client';

// ============================================
// Scoreboard Component — In-game HUD overlay
// ============================================

import React from 'react';
import type { RoomPlayer } from '@/game/types';

interface ScoreboardProps {
  currentPlayerId: string;
  players: RoomPlayer[];
  currentScore: number;
  currentDistance: number;
  currentCoins: number;
}

export default function Scoreboard({
  currentPlayerId,
  players,
  currentScore,
  currentDistance,
  currentCoins,
}: ScoreboardProps) {
  // Sort players by score descending
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = a.id === currentPlayerId ? currentScore : a.score;
    const scoreB = b.id === currentPlayerId ? currentScore : b.score;
    return scoreB - scoreA;
  });

  return (
    <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none z-20">
      <div className="flex items-start justify-between max-w-[800px] mx-auto">
        {/* Left: Current player stats */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Score */}
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 shadow-lg">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Score</p>
            <p className="text-2xl font-bold text-white tabular-nums">
              {currentScore.toLocaleString()}
            </p>
          </div>

          {/* Distance & Coins */}
          <div className="flex gap-2">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5 shadow-lg">
              <p className="text-white/40 text-[9px] uppercase tracking-wider">Distance</p>
              <p className="text-sm font-semibold text-white tabular-nums">
                {Math.floor(currentDistance)}m
              </p>
            </div>
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5 shadow-lg">
              <p className="text-white/40 text-[9px] uppercase tracking-wider">Coins</p>
              <p className="text-sm font-semibold text-yellow-400 tabular-nums flex items-center gap-1">
                <span className="text-xs">💰</span> {currentCoins}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Player rankings */}
        {players.length > 1 && (
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg pointer-events-auto min-w-[160px]">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium mb-2">
              Leaderboard
            </p>
            <div className="space-y-1.5">
              {sortedPlayers.map((player, index) => {
                const score = player.id === currentPlayerId ? currentScore : player.score;
                const isCurrentPlayer = player.id === currentPlayerId;
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 text-xs ${
                      isCurrentPlayer ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    <span className="w-4 text-center font-bold" style={{ color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#666' }}>
                      {index + 1}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className={`truncate flex-1 ${!player.isAlive ? 'line-through opacity-40' : ''}`}>
                      {player.name}
                      {isCurrentPlayer && <span className="text-white/20"> •</span>}
                    </span>
                    <span className="font-mono tabular-nums text-[10px]">
                      {score.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
