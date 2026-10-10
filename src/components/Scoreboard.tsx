'use client';

// ============================================
// Scoreboard Component — Racing HUD overlay
// ============================================

import React from 'react';
import type { RoomPlayer } from '@/game/types';
import { BASE_SPEED, MAX_SPEED, DIFFICULTY_CONFIG, parseDifficulty, type Difficulty } from '@/game/types';

interface ScoreboardProps {
  currentPlayerId: string;
  players: RoomPlayer[];
  currentScore: number;
  currentDistance: number;
  currentCoins: number;
  currentSpeed?: number;
  magnet?: number;
  combo?: number;
  comboFrac?: number;
  difficulty?: Difficulty;
}

export default function Scoreboard({
  currentPlayerId,
  players,
  currentScore,
  currentDistance,
  currentCoins,
  currentSpeed = BASE_SPEED,
  magnet = 0,
  combo = 0,
  comboFrac = 0,
  difficulty = 'medium',
}: ScoreboardProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = a.id === currentPlayerId ? currentScore : a.score;
    const scoreB = b.id === currentPlayerId ? currentScore : b.score;
    return scoreB - scoreA;
  });

  const speedNorm = Math.max(0, Math.min(1, (currentSpeed - BASE_SPEED) / Math.max(1, MAX_SPEED - BASE_SPEED)));
  const kmh = Math.round(68 + speedNorm * 132 + (currentDistance % 7));
  const nitro = speedNorm > 0.65;
  const diffCfg = DIFFICULTY_CONFIG[parseDifficulty(difficulty)];
  // Speedometer dial geometry
  const DIAL_R = 30;
  const DIAL_LEN = Math.PI * DIAL_R;
  const needleAng = Math.PI * (1 - speedNorm);
  const needleX = 40 + (DIAL_R - 7) * Math.cos(needleAng);
  const needleY = 40 - (DIAL_R - 7) * Math.sin(needleAng);

  return (
    <div className="absolute top-0 left-0 right-0 p-3 pointer-events-none z-20">
      <div className="flex items-start justify-between gap-3 max-w-[820px] mx-auto">
        {/* Left: speed + score cluster */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-stretch gap-2">
            {/* Speedometer dial module */}
            <div className={`relative overflow-hidden rounded-2xl border-[3px] px-3 pt-1.5 pb-2 backdrop-blur-md shadow-lg w-[118px] ${nitro ? 'border-orange-300 bg-orange-950/60' : 'border-white/90 bg-black/60'}`}>
              <p className={`text-[9px] uppercase tracking-[0.22em] font-black ${nitro ? 'text-orange-300' : 'text-cyan-200/80'}`}>
                {nitro ? '⚡ nitro' : 'speed'}
              </p>
              <svg viewBox="0 0 80 48" className="w-full -mb-1">
                <path d="M10,40 A30,30 0 0 1 70,40" stroke="rgba(255,255,255,0.15)" strokeWidth="7" fill="none" strokeLinecap="round" />
                <path
                  d="M10,40 A30,30 0 0 1 70,40"
                  stroke={nitro ? '#fb923c' : '#22d3ee'}
                  strokeWidth="7"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(DIAL_LEN * speedNorm).toFixed(1)} ${DIAL_LEN.toFixed(1)}`}
                  style={{ filter: `drop-shadow(0 0 4px ${nitro ? '#fb923c' : '#22d3ee'})`, transition: 'stroke-dasharray 0.2s' }}
                />
                <line x1="40" y1="40" x2={needleX.toFixed(1)} y2={needleY.toFixed(1)} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="40" cy="40" r="3.5" fill="#fff" />
              </svg>
              <p className="font-playful text-[22px] leading-none font-black text-white tabular-nums text-center -mt-1">
                {kmh}
                <span className="ml-1 text-[10px] font-bold text-white/50">km/h</span>
              </p>
            </div>
            {/* Score module — big playful counter */}
            <div className="rounded-2xl border-[3px] border-white/90 bg-black/60 backdrop-blur-md px-3.5 py-2 shadow-[0_4px_0_rgba(0,0,0,0.45)] min-w-[118px]">
              <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/45">score</p>
              <p className="font-playful text-[30px] leading-none font-black text-white tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
                {currentScore.toLocaleString()}
              </p>
            </div>
            {/* Combo badge */}
            {combo >= 2 && (
              <div key={combo} className="relative overflow-hidden rounded-xl border-[3px] border-fuchsia-300 bg-fuchsia-950/60 backdrop-blur-md px-3 py-1.5 shadow-[0_0_16px_rgba(255,45,120,0.5)] animate-countdownPop">
                <p className="font-playful text-[18px] leading-none font-black text-white">
                  🔥 x{combo}
                </p>
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                  <div className="h-full bg-gradient-to-r from-fuchsia-400 to-amber-300" style={{ width: `${Math.round(comboFrac * 100)}%` }} />
                </div>
              </div>
            )}
            {/* Magnet power-up slot */}
            {magnet > 0 && (
              <div className="relative overflow-hidden rounded-2xl border-[3px] border-pink-400 bg-pink-950/60 backdrop-blur-md px-3 py-2 shadow-[0_0_18px_rgba(255,45,120,0.55)] min-w-[86px] animate-pulse-glow">
                <p className="text-[9px] uppercase tracking-[0.22em] font-black text-pink-200">🧲 magnet</p>
                <p className="font-playful text-[22px] leading-none font-black text-white tabular-nums">
                  {Math.ceil(magnet)}s
                </p>
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                  <div className="h-full bg-gradient-to-r from-pink-400 to-amber-300" style={{ width: `${Math.min(100, (magnet / 8) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 backdrop-blur-md px-2.5 py-1.5 shadow">
              <span className="text-[11px]">📏</span>
              <span className="text-[13px] font-bold text-white tabular-nums">{Math.floor(currentDistance)}m</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-950/40 backdrop-blur-md px-2.5 py-1.5 shadow">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-500 text-[10px] font-black text-amber-950 shadow-[0_0_10px_rgba(255,200,0,0.7)]">$</span>
              <span className="text-[13px] font-bold text-amber-200 tabular-nums">{currentCoins}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 backdrop-blur-md px-2.5 py-1.5 shadow text-[10px] font-mono uppercase tracking-widest text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              live
            </div>
            <div
              className="flex items-center rounded-lg border px-2.5 py-1.5 shadow text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ borderColor: diffCfg.color + '55', backgroundColor: diffCfg.color + '14', color: diffCfg.color }}
            >
              {diffCfg.label}
            </div>
          </div>
        </div>

        {/* Right: leaderboard */}
        {players.length > 1 && (
          <div className="rounded-xl border border-white/12 bg-black/60 backdrop-blur-md p-2.5 shadow-lg pointer-events-auto min-w-[172px]">
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1.5 px-1">
              leaderboard
            </p>
            <div className="space-y-1">
              {sortedPlayers.map((player, index) => {
                const score = player.id === currentPlayerId ? currentScore : player.score;
                const isYou = player.id === currentPlayerId;
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs border ${
                      isYou
                        ? 'bg-cyan-300/10 border-cyan-300/30 text-white'
                        : 'bg-white/[0.03] border-transparent text-white/55'
                    }`}
                  >
                    <span
                      className="w-4 text-center font-black text-[11px]"
                      style={{ color: index === 0 ? '#ffd700' : index === 1 ? '#c9d4e3' : index === 2 ? '#e09a5a' : '#5b5b6e' }}
                    >
                      {index + 1}
                    </span>
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow"
                      style={{ backgroundColor: player.color, boxShadow: `0 0 8px ${player.color}` }}
                    />
                    <span className={`truncate flex-1 font-semibold ${!player.isAlive ? 'line-through opacity-40' : ''}`}>
                      {player.name}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-white/70">
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
