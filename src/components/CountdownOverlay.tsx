'use client';

// ============================================
// Countdown Overlay Component
// ============================================

import React from 'react';

interface CountdownOverlayProps {
  count: number;
}

export default function CountdownOverlay({ count }: CountdownOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="text-center animate-countdownPop">
        <div
          className="text-[120px] font-black leading-none"
          style={{
            background: count === 0
              ? 'linear-gradient(135deg, #76ff03, #00e5ff)'
              : 'linear-gradient(135deg, #ff4081, #ffea00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 40px rgba(255, 64, 129, 0.5))',
          }}
        >
          {count === 0 ? 'GO!' : count}
        </div>
        {count > 0 && (
          <p className="text-white/40 text-sm mt-4 uppercase tracking-wider">Get Ready...</p>
        )}
      </div>
    </div>
  );
}
