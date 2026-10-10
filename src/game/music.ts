// ============================================
// Music — tiny procedural boom-bap loop (Web Audio)
// Kick + snare + hats + bass + blips, ~100 BPM
// ============================================

let musicTimer: number | null = null;
let musicCtx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let step = 0;
let nextTime = 0;
let pendingVolume = 0.8;

const STEP_DUR = 0.15; // 16th notes @100bpm
const LOOP_STEPS = 32;

const KICK = new Set([0, 7, 10, 16, 23, 26]);
const SNARE = new Set([4, 12, 20, 28]);
// C minor-ish groovy bassline, one note per 8 steps
const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
const BLIP_STEPS: Record<number, number> = { 3: 523.25, 11: 587.33, 19: 440, 27: 659.25 };

function ensureCtx(): AudioContext | null {
  try {
    if (!musicCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      musicCtx = new AC();
      musicGain = musicCtx.createGain();
      musicGain.gain.value = 0.32 * pendingVolume;
      musicGain.connect(musicCtx.destination);
    }
    if (musicCtx.state === 'suspended') {
      void musicCtx.resume();
    }
    return musicCtx;
  } catch {
    return null;
  }
}

function kickAt(ctx: AudioContext, t: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(musicGain!);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.start(t);
  osc.stop(t + 0.18);
}

function snareAt(ctx: AudioContext, t: number) {
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(f);
  f.connect(g);
  g.connect(musicGain!);
  src.start(t);
}

function hatAt(ctx: AudioContext, t: number, open: boolean) {
  const dur = open ? 0.09 : 0.04;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.16 : 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(musicGain!);
  src.start(t);
}

function bassAt(ctx: AudioContext, t: number, freq: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(musicGain!);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + STEP_DUR * 7);
  osc.start(t);
  osc.stop(t + STEP_DUR * 7.5);
}

function blipAt(ctx: AudioContext, t: number, freq: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(musicGain!);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.start(t);
  osc.stop(t + 0.2);
}

function scheduleStep(ctx: AudioContext, s: number, t: number) {
  if (KICK.has(s)) kickAt(ctx, t);
  if (SNARE.has(s)) snareAt(ctx, t);
  if (s % 2 === 0) hatAt(ctx, t, s % 8 === 6);
  if (s % 8 === 0) bassAt(ctx, t, BASS[Math.floor(s / 8) % BASS.length]);
  const blip = BLIP_STEPS[s];
  if (blip) blipAt(ctx, t, blip);
}

export function startMusic() {
  const ctx = ensureCtx();
  if (!ctx || musicTimer !== null) return;
  step = 0;
  nextTime = ctx.currentTime + 0.06;
  musicTimer = window.setInterval(() => {
    if (!musicCtx) return;
    while (nextTime < musicCtx.currentTime + 0.3) {
      scheduleStep(musicCtx, step % LOOP_STEPS, nextTime);
      nextTime += STEP_DUR;
      step++;
    }
  }, 90);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function isMusicPlaying(): boolean {
  return musicTimer !== null;
}

export function setMusicVolume(v: number) {
  pendingVolume = Math.max(0, Math.min(1, v));
  if (musicGain && musicCtx) {
    musicGain.gain.setTargetAtTime(0.32 * pendingVolume, musicCtx.currentTime, 0.05);
  }
}
