'use client';

// ============================================
// Settings Modal — quality, shake, music
// ============================================

import React from 'react';

export interface GameSettings {
  quality: 'high' | 'low';
  shake: boolean;
  volume: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'high',
  shake: true,
  volume: 0.8,
  muted: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('nr_settings');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      quality: parsed.quality === 'low' ? 'low' : 'high',
      shake: parsed.shake !== false,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.8,
      muted: parsed.muted === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  onClose: () => void;
}

export default function SettingsModal({ open, settings, onChange, onClose }: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm animate-fadeIn p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl border-[3px] border-white bg-gradient-to-b from-slate-700 to-slate-800 p-6 shadow-[0_8px_0_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-playful text-2xl font-black text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
            ⚙️ SETTINGS
          </h3>
          <button onClick={onClose} className="btn-chunky-sm">✕</button>
        </div>

        {/* Graphics quality */}
        <p className="text-white/60 text-xs uppercase tracking-widest font-bold mb-2">Graphics</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['high', 'low'] as const).map((q) => (
            <button
              key={q}
              onClick={() => onChange({ quality: q })}
              className={`rounded-xl border-[3px] px-3 py-2.5 font-playful font-black uppercase tracking-wide transition-all active:scale-95 ${
                settings.quality === q
                  ? 'border-amber-300 bg-amber-400/20 text-amber-200 shadow-[0_0_14px_rgba(255,200,0,0.35)]'
                  : 'border-white/20 bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {q === 'high' ? '✨ Fancy' : '⚡ Fast'}
            </button>
          ))}
        </div>

        {/* Screen shake */}
        <div className="flex items-center justify-between mb-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="text-sm font-bold text-white/80">📳 Screen shake</span>
          <button
            onClick={() => onChange({ shake: !settings.shake })}
            className={`relative h-7 w-[52px] rounded-full border-2 border-white/70 transition-colors px-1 ${settings.shake ? 'bg-emerald-400' : 'bg-white/10'}`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.shake ? 'translate-x-[22px]' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Music volume */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-white/80">🎵 Music</span>
          <button
            onClick={() => onChange({ muted: !settings.muted })}
            className="btn-chunky-sm"
          >
            {settings.muted ? '🔇 off' : '🔊 on'}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(e) => onChange({ volume: Number(e.target.value) / 100, muted: false })}
          className="chunky-range w-full mb-5"
        />

        <button onClick={onClose} className="btn-chunky w-full">
          DONE
        </button>
      </div>
    </div>
  );
}
