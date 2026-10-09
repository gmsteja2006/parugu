'use client';

// ============================================
// Countdown Overlay — race-start punch
// ============================================

import React from 'react';

interface CountdownOverlayProps {
  count: number;
}

export default function CountdownOverlay({ count }: CountdownOverlayProps) {
  const isGo = count === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[3px]">
      {/* speed burst backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] ${isGo ? 'bg-emerald-500/25' : 'bg-fuchsia-600/25'}`} />
      </div>
      <div className="relative text-center animate-countdownPop" key={count}>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.4em] text-white/50">
          {isGo ? 'full send' : 'get ready'}
        </p>
        <div
          className="text-[130px] md:text-[170px] font-black italic leading-none tracking-tighter"
          style={{
            background: isGo
              ? 'linear-gradient(135deg, #a7f3d0, #34d399 40%, #00e5ff)'
              : 'linear-gradient(135deg, #fff 10%, #ff2d78 55%, #ffb300)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: isGo
              ? 'drop-shadow(0 0 50px rgba(52,211,153,0.65))'
              : 'drop-shadow(0 0 50px rgba(255,45,120,0.55))',
            transform: 'skewX(-6deg)',
          }}
        >
          {isGo ? 'GO!' : count}
        </div>
        <div className="mx-auto mt-4 h-1 w-56 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${isGo ? 'bg-emerald-400' : 'bg-gradient-to-r from-fuchsia-500 to-amber-300'}`}
            style={{ width: isGo ? '100%' : `${(3 - count + 1) * 28}%` }}
          />
        </div>
        {!isGo && (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            dodge • jump • slide
          </p>
        )}
      </div>
    </div>
  );
}
