// ============================================
// Game Renderer — Canvas 2D pseudo-3D rendering
// Neon dusk city chase: synthwave sun, parallax skyline,
// rushing street lamps, wet asphalt, motion speed feel
// ============================================

import {
  type GameState,
  type PlayerData,
  type Obstacle,
  type ObstacleType,
  type Coin,
  type Pickup,
  type Lane,
  type RoomPlayer,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GROUND_Y,
  LANE_WIDTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  MAX_SPEED,
  BASE_SPEED,
} from './types';
import { getLaneX } from './engine';

const VANISH_Y = 208;
const VANISH_X = CANVAS_WIDTH / 2;
const MAX_Z = 800;

// Warning marker meta per obstacle type
const OBSTACLE_META: Record<ObstacleType, { icon: string; color: string; hint: string }> = {
  train: { icon: '🚆', color: '#d63a2f', hint: 'DODGE!' },
  barrier: { icon: '🚧', color: '#b87a00', hint: 'JUMP!' },
  cone: { icon: '🔻', color: '#d35400', hint: 'JUMP!' },
  tall_barrier: { icon: '⬇', color: '#2f9e00', hint: 'SLIDE!' },
};

interface BuildingDef {
  x: number;
  width: number;
  height: number;
  color: string;
  windowColor: string;
  signColor: string;
  signY: number;
}

interface CloudDef {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface BirdDef {
  x: number;
  y: number;
  speed: number;
  phase: number;
  scale: number;
}

interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

interface SkylineBlock {
  w: number;
  h: number;
  gap: number;
}

let buildings: BuildingDef[] = [];
let buildingsGenerated = false;

function generateBuildings() {
  if (buildingsGenerated) return;
  buildings = [];
  const palette = ['#c9bfae', '#a9b7c6', '#d9d0bd', '#b3c2cf', '#c4ad8f'];
  const trims = ['#8a7a63', '#6e8296', '#93876f', '#7d90a3', '#7a6248'];
  for (let i = 0; i < 9; i++) {
    buildings.push({
      x: 8 + i * 52,
      width: 42 + Math.random() * 22,
      height: 120 + Math.random() * 210,
      color: palette[Math.floor(Math.random() * palette.length)],
      windowColor: 'day',
      signColor: trims[Math.floor(Math.random() * trims.length)],
      signY: 20 + Math.random() * 60,
    });
  }
  for (let i = 0; i < 9; i++) {
    buildings.push({
      x: CANVAS_WIDTH - 60 - i * 52,
      width: 42 + Math.random() * 22,
      height: 120 + Math.random() * 210,
      color: palette[Math.floor(Math.random() * palette.length)],
      windowColor: 'day',
      signColor: trims[Math.floor(Math.random() * trims.length)],
      signY: 20 + Math.random() * 60,
    });
  }
  buildingsGenerated = true;
}

// True perspective projection: scale falls as 1/z, so obstacles glide in
// smoothly from the horizon instead of crawling then rushing suddenly.
const CAM_DEPTH = 320;
function project3D(laneX: number, z: number): { x: number; y: number; scale: number } {
  const depth = Math.max(0, z);
  const s = CAM_DEPTH / (CAM_DEPTH + depth);
  const x = VANISH_X + (laneX - VANISH_X) * s;
  const y = VANISH_Y + (GROUND_Y - VANISH_Y) * s;
  return { x, y, scale: Math.max(0.02, s) };
}

// Constant-TIME fade-in: the fade covers ~0.5s of travel at any speed,
// so fast runs don't get a sudden pop-in either.
function emergenceFade(z: number, speed: number): number {
  const zone = Math.max(60, speed * 30);
  return Math.max(0, Math.min(1, (MAX_Z - z) / zone));
}

// Pre-rendered film grain tile for a subtle cinematic finish
let grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement | null {
  try {
    if (grainTile) return grainTile;
    grainTile = document.createElement('canvas');
    grainTile.width = 128;
    grainTile.height = 128;
    const g = grainTile.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    return grainTile;
  } catch {
    return null;
  }
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private frameCount: number = 0;
  private particles: Particle[] = [];
  private clouds: CloudDef[] = [];
  private birds: BirdDef[] = [];
  private floaters: Floater[] = [];
  private skyline: SkylineBlock[] = [];
  private smoothX: number = VANISH_X;
  private camX: number = 0;
  private dip: number = 0;
  private squash: number = 0;
  private lowPower: boolean = false;
  private shakeOn: boolean = true;
  private ghostX: Map<string, number> = new Map();
  private lastCoins: number = 0;
  private wasAlive: boolean = true;
  private trauma: number = 0;
  private flash: number = 0;
  private flashColor: string = '255,255,255';

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.initClouds();
    this.initBirds();
    this.initSkyline();
    generateBuildings();
    this.smoothX = getLaneX(1);
  }

  private initClouds() {
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 40 + Math.random() * 110,
        w: 90 + Math.random() * 160,
        speed: 0.15 + Math.random() * 0.3,
      });
    }
  }

  private initSkyline() {
    for (let i = 0; i < 26; i++) {
      this.skyline.push({
        w: 30 + Math.random() * 50,
        h: 30 + Math.random() * 90,
        gap: 4 + Math.random() * 14,
      });
    }
  }

  private initBirds() {
    for (let i = 0; i < 4; i++) {
      this.birds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 50 + Math.random() * 90,
        speed: 0.4 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        scale: 0.7 + Math.random() * 0.6,
      });
    }
  }

  /** Floating score popup, e.g. coin +10 or near-miss stunt */
  addFloater(text: string, color: string) {
    this.floaters.push({
      x: this.smoothX + (Math.random() - 0.5) * 50,
      y: GROUND_Y - 135,
      vy: -1.1,
      life: 1,
      text,
      color,
    });
    if (this.floaters.length > 12) this.floaters.shift();
  }

  /** Landing thump feedback: dust burst + camera dip + squash */
  notifyLand() {
    this.dip = -5;
    this.squash = 1;
    this.burst(this.smoothX, GROUND_Y - 4, '#c9b696', 7, 'dust');
  }

  /** Quality + shake preferences from the settings panel */
  setQuality(quality: 'high' | 'low', shakeOn: boolean) {
    this.lowPower = quality === 'low';
    this.shakeOn = shakeOn;
  }

  render(state: GameState, otherPlayers: RoomPlayer[] = []) {
    this.frameCount++;
    const ctx = this.ctx;
    const speedNorm = Math.max(
      0,
      Math.min(1, (state.speed - BASE_SPEED) / Math.max(1, MAX_SPEED - BASE_SPEED))
    );

    // Detect coin collect / death for feedback fx
    if (state.player.coins > this.lastCoins) {
      this.flash = Math.min(0.5, this.flash + 0.12);
      this.flashColor = '255,215,0';
      const px = this.smoothX;
      this.burst(px, GROUND_Y - 70, '#ffd700', 6, 'coin');
    }
    this.lastCoins = state.player.coins;
    if (this.wasAlive && !state.player.isAlive) {
      this.trauma = 1;
      this.flash = 0.55;
      this.flashColor = '255,60,60';
      this.burst(this.smoothX, GROUND_Y - 40, '#ff5a3c', 26, 'crash');
      this.burst(this.smoothX, GROUND_Y - 20, '#888888', 12, 'smoke');
    }
    this.wasAlive = state.player.isAlive;

    // Smooth-follow main player lane (fast, snappy, slight lag = speed feel)
    const targetX = getLaneX(state.player.lane);
    this.smoothX += (targetX - this.smoothX) * 0.22;

    // Camera drifts toward the player's lane + landing dip spring
    const camTarget = (this.smoothX - VANISH_X) * 0.3;
    this.camX += (camTarget - this.camX) * 0.08;
    this.dip *= 0.88;
    this.squash = Math.max(0, this.squash - 0.12);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Camera: micro shake grows with speed + trauma shake on crash
    this.trauma = Math.max(0, this.trauma - 0.03);
    const shakeBase = speedNorm * 1.6;
    const shakeTrauma = this.trauma * this.trauma * 14;
    const shakeMul = this.shakeOn ? 1 : 0;
    const shX = (Math.random() - 0.5) * (shakeBase + shakeTrauma) * shakeMul;
    const shY = (Math.random() - 0.5) * (shakeBase * 0.7 + shakeTrauma) * shakeMul;

    ctx.save();
    ctx.translate(shX - this.camX, shY + this.dip);

    // Slight speed zoom (FOV kick)
    const zoom = 1 + speedNorm * 0.025;
    ctx.translate(VANISH_X, CANVAS_HEIGHT * 0.55);
    ctx.scale(zoom, zoom);
    ctx.translate(-VANISH_X, -CANVAS_HEIGHT * 0.55);

    this.drawSky(state.distance);
    this.drawSun();
    this.drawClouds(state.distance, speedNorm);
    this.drawBirds(speedNorm);
    this.drawSkyline(state.distance);
    this.drawSideBuildings(state.distance, speedNorm);
    this.drawTracks(state.distance, state.speed, speedNorm);
    this.drawCloudShadows();
    this.drawGrassTufts(state.distance);
    this.drawCatenary(state.distance);
    this.drawGraffitiWalls(state.distance, state.speed);
    this.drawBillboards(state.distance, state.speed);
    this.drawBridge(state.distance, state.speed);
    const danger = state.obstacles.some((o) => o.z < 350 && o.z > -20);
    this.drawTrackside(state.distance, danger);
    this.drawProps(state.distance, state.speed);
    this.drawWarnings(state.obstacles);

    // Coins far -> near
    const sortedCoins = [...state.coins].sort((a, b) => b.z - a.z);
    for (const coin of sortedCoins) {
      if (!coin.collected) this.drawCoin(coin, state.speed);
    }

    // Pickups far -> near
    const sortedPickups = [...state.pickups].sort((a, b) => b.z - a.z);
    for (const p of sortedPickups) {
      if (!p.collected) this.drawPickup(p, state.speed);
    }

    // Obstacles far -> near
    const sortedObstacles = [...state.obstacles].sort((a, b) => b.z - a.z);
    for (const ob of sortedObstacles) {
      this.drawObstacle(ob, state.distance, state.speed);
    }

    // Ghost players
    for (const other of otherPlayers) {
      if (other.isAlive) this.drawGhostPlayer(other);
    }

    // Main player
    if (state.player.isAlive) {
      this.drawPlayer(state.player, speedNorm);
    } else {
      this.drawWreck(speedNorm);
    }

    this.updateAndDrawParticles();
    this.updateAndDrawFloaters();
    this.drawGroundStreaks(state.speed, speedNorm);
    this.drawSpeedLines(state.speed, speedNorm);

    ctx.restore();

    // Screen-space overlays
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${(this.flash * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      this.flash *= 0.86;
    }
    this.drawColorGrade(speedNorm);
    this.drawVignette();
    if (!this.lowPower) {
      const grain = getGrainTile();
      if (grain) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const ox = Math.random() * 128;
        const oy = Math.random() * 128;
        ctx.drawImage(grain, -ox, -oy, CANVAS_WIDTH + 128, CANVAS_HEIGHT + 128);
        ctx.restore();
      }
    }
  }

  // ================= SKY / CITY (bright subway day) =================

  private drawSky(distance: number) {
    const ctx = this.ctx;
    // Bright blue daytime gradient
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
    g.addColorStop(0, '#2f8fd6');
    g.addColorStop(0.55, '#7cc3ee');
    g.addColorStop(0.85, '#c8e9fa');
    g.addColorStop(1, '#e8f5fd');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, CANVAS_WIDTH + 40, GROUND_Y + 60);

    // Soft sun haze near horizon
    const hg = ctx.createRadialGradient(
      VANISH_X, VANISH_Y, 10,
      VANISH_X, VANISH_Y, 300
    );
    hg.addColorStop(0, 'rgba(255,255,255,0.5)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y + 20);

    // Grass base below horizon (tracks drawn over the middle)
    const gg = ctx.createLinearGradient(0, GROUND_Y - 30, 0, CANVAS_HEIGHT);
    gg.addColorStop(0, '#7fae5a');
    gg.addColorStop(0.4, '#5d9245');
    gg.addColorStop(1, '#3c6b2f');
    ctx.fillStyle = gg;
    ctx.fillRect(-20, GROUND_Y - 30, CANVAS_WIDTH + 40, CANVAS_HEIGHT - GROUND_Y + 50);
  }

  private drawSun() {
    const ctx = this.ctx;
    const cx = VANISH_X + 230;
    const cy = 84;
    const r = 44;
    // Warm glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.6);
    glow.addColorStop(0, 'rgba(255,250,220,0.9)');
    glow.addColorStop(0.4, 'rgba(255,240,190,0.45)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Bright disc
    const sg = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, r);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.6, '#fff6c8');
    sg.addColorStop(1, '#ffdf6b');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Horizontal lens-flare streak
    const flare = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
    flare.addColorStop(0, 'rgba(255,250,220,0)');
    flare.addColorStop(0.5, 'rgba(255,252,235,0.55)');
    flare.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = flare;
    ctx.fillRect(cx - 260, cy - 2, 520, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx + 150, cy + 26, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,0.4)';
    ctx.beginPath();
    ctx.arc(cx - 190, cy - 18, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawClouds(distance: number, speedNorm: number) {
    const ctx = this.ctx;
    for (const c of this.clouds) {
      c.x -= c.speed + speedNorm * 0.6;
      if (c.x + c.w < -20) {
        c.x = CANVAS_WIDTH + 20;
        c.y = 30 + Math.random() * 120;
      }
      // Fluffy white puff: stacked ellipses + soft gray belly
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      const n = 4;
      for (let i = 0; i < n; i++) {
        const px = c.x + (i / (n - 1) - 0.5) * c.w * 0.7;
        const pr = 13 + ((i * 37) % 10);
        ctx.beginPath();
        ctx.ellipse(px, c.y, c.w / (n * 1.15), pr, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(170,200,225,0.5)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 10, c.w / 2.6, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBirds(speedNorm: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(50,70,90,0.8)';
    ctx.lineCap = 'round';
    for (const b of this.birds) {
      b.x -= b.speed + speedNorm * 0.5;
      if (b.x < -30) {
        b.x = CANVAS_WIDTH + 30;
        b.y = 40 + Math.random() * 100;
      }
      const flap = Math.sin(this.frameCount * 0.35 + b.phase) * 4 * b.scale;
      const w = 9 * b.scale;
      ctx.lineWidth = Math.max(1, 2 * b.scale);
      // Classic gull silhouette, wings beating
      ctx.beginPath();
      ctx.moveTo(b.x - w, b.y - flap);
      ctx.quadraticCurveTo(b.x - w * 0.4, b.y + 1.5, b.x, b.y);
      ctx.quadraticCurveTo(b.x + w * 0.4, b.y + 1.5, b.x + w, b.y - flap);
      ctx.stroke();
    }
  }

  // Soft shadows of the clouds drifting across the ground
  private drawCloudShadows() {
    const ctx = this.ctx;
    const n = this.lowPower ? 2 : Math.min(3, this.clouds.length);
    for (let i = 0; i < n; i++) {
      const c = this.clouds[i];
      ctx.fillStyle = 'rgba(45,75,55,0.20)';
      ctx.beginPath();
      ctx.ellipse(c.x, GROUND_Y + 80, c.w * 0.75, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSkyline(distance: number) {
    const ctx = this.ctx;
    const totalW = this.skyline.reduce((a, b) => a + b.w + b.gap, 0);
    let offset = (distance * 0.06) % totalW;
    const baseY = VANISH_Y + 2;
    // Aerial-perspective haze band hugging the horizon
    const haze = ctx.createLinearGradient(0, baseY - 70, 0, baseY + 4);
    haze.addColorStop(0, 'rgba(230,244,252,0)');
    haze.addColorStop(1, 'rgba(230,244,252,0.65)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, baseY - 70, CANVAS_WIDTH, 74);
    // Hazy daytime far city
    for (let wrap = -1; wrap < 2; wrap++) {
      let x = -offset + wrap * totalW;
      for (const b of this.skyline) {
        const top = baseY - b.h * 0.55;
        ctx.fillStyle = '#9db8cc';
        ctx.fillRect(x, top, b.w, b.h * 0.55 + 4);
        ctx.fillStyle = '#8aa5bb';
        ctx.fillRect(x, top, b.w, 3);
        // Faint window grid
        ctx.fillStyle = 'rgba(60,90,120,0.35)';
        for (let wy = top + 7; wy < baseY - 4; wy += 9) {
          for (let wx = x + 4; wx < x + b.w - 4; wx += 8) {
            if ((wx * 7 + wy * 13) % 11 < 3) ctx.fillRect(wx, wy, 2.5, 3.5);
          }
        }
        x += b.w + b.gap;
      }
    }
  }

  private drawSideBuildings(distance: number, speedNorm: number) {
    const ctx = this.ctx;
    for (const b of buildings) {
      const bx = b.x;
      const by = GROUND_Y - b.height;
      // Sun-lit body with shaded side
      const bg = ctx.createLinearGradient(bx - b.width / 2, 0, bx + b.width / 2, 0);
      bg.addColorStop(0, '#a89a83');
      bg.addColorStop(0.35, b.color);
      bg.addColorStop(1, '#8f8271');
      ctx.fillStyle = bg;
      ctx.fillRect(bx - b.width / 2, by, b.width, b.height);
      // Roof slab + water tank on some
      ctx.fillStyle = '#6f6555';
      ctx.fillRect(bx - b.width / 2 - 2, by - 5, b.width + 4, 6);
      if ((b.x | 0) % 3 === 0) {
        ctx.fillStyle = '#8a6f4d';
        ctx.fillRect(bx - 8, by - 20, 16, 15);
        ctx.fillStyle = '#6e5739';
        ctx.beginPath();
        ctx.moveTo(bx - 9, by - 20);
        ctx.lineTo(bx, by - 27);
        ctx.lineTo(bx + 9, by - 20);
        ctx.closePath();
        ctx.fill();
      }
      // Window grid — sky-blue reflective panes
      const rows = Math.floor(b.height / 24);
      const cols = Math.floor(b.width / 15);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const shade = (r * 3 + c * 5) % 4 === 0;
          ctx.fillStyle = shade ? '#3d6a8f' : '#bfe0f2';
          ctx.strokeStyle = '#f4efe2';
          ctx.lineWidth = 1.5;
          const wx = bx - b.width / 2 + 5 + c * 14;
          const wy = by + 10 + r * 23;
          ctx.fillRect(wx, wy, 8, 12);
          ctx.strokeRect(wx, wy, 8, 12);
        }
      }
      // Balcony rails on alternate buildings + AC boxes for lived-in detail
      if (((b.x | 0) % 2 === 0) && b.height > 150) {
        ctx.strokeStyle = 'rgba(70,60,50,0.8)';
        ctx.lineWidth = 1.5;
        for (let r = 1; r < rows - 1; r += 2) {
          const ry = by + 10 + r * 23 + 13;
          ctx.beginPath();
          ctx.moveTo(bx - b.width / 2 + 3, ry);
          ctx.lineTo(bx + b.width / 2 - 3, ry);
          ctx.stroke();
          for (let vx = 0; vx <= 4; vx++) {
            const vxx = bx - b.width / 2 + 3 + ((b.width - 6) * vx) / 4;
            ctx.beginPath();
            ctx.moveTo(vxx, ry);
            ctx.lineTo(vxx, ry - 7);
            ctx.stroke();
          }
        }
      } else if (b.height > 120) {
        ctx.fillStyle = '#d8d4c8';
        const ax = bx + b.width / 2 - 14;
        const ay = by + 30 + ((b.x | 0) % 40);
        ctx.fillRect(ax, ay, 9, 7);
        ctx.fillStyle = '#9a968a';
        for (let v = 0; v < 3; v++) ctx.fillRect(ax + 1.5, ay + 1.5 + v * 2, 6, 1);
      }
      // Colored trim stripe (replaces neon sign)
      ctx.fillStyle = b.signColor;
      ctx.fillRect(bx - b.width / 2, by + b.height * 0.3, b.width, 4);
    }
  }

  // ================= TRACKS =================

  private drawTracks(distance: number, speed: number, speedNorm: number) {
    const ctx = this.ctx;
    const balHalfBottom = LANE_WIDTH * 2.5;
    const balHalfTop = 30;

    // Gravel ballast bed
    const bal = ctx.createLinearGradient(0, VANISH_Y, 0, GROUND_Y);
    bal.addColorStop(0, '#9a8f7c');
    bal.addColorStop(0.5, '#8a7f6c');
    bal.addColorStop(1, '#7a6f5e');
    ctx.fillStyle = bal;
    ctx.beginPath();
    ctx.moveTo(VANISH_X - balHalfTop, VANISH_Y);
    ctx.lineTo(VANISH_X - balHalfBottom, GROUND_Y);
    ctx.lineTo(VANISH_X + balHalfBottom, GROUND_Y);
    ctx.lineTo(VANISH_X + balHalfTop, VANISH_Y);
    ctx.closePath();
    ctx.fill();

    // Scrolling gravel speckles (fewer on low quality)
    const flow = (distance * 0.004) % 1;
    const speckN = this.lowPower ? 28 : 60;
    for (let i = 0; i < speckN; i++) {
      const tt = ((i / speckN) + flow) % 1;
      const t = tt * tt;
      const y = VANISH_Y + (GROUND_Y - VANISH_Y) * t;
      const halfW = balHalfBottom * t + balHalfTop * (1 - t);
      const fx = ((i * 7919) % 100) / 100 - 0.5;
      const gx = VANISH_X + fx * halfW * 1.7;
      const shade = (i * 13) % 3;
      ctx.fillStyle = shade === 0 ? 'rgba(60,50,40,0.35)' : shade === 1 ? 'rgba(255,250,240,0.30)' : 'rgba(90,80,65,0.35)';
      const sz = Math.max(1, 3 * t);
      ctx.fillRect(gx, y, sz, sz);
    }

    // Wooden sleepers scrolling toward the camera (main speed cue,
    // stretched with motion blur as speed rises, grained like cut timber)
    const tieN = this.lowPower ? 10 : 15;
    for (let i = 0; i < tieN; i++) {
      const tt = ((i / tieN) + flow) % 1;
      const t = tt * tt;
      const y = VANISH_Y + (GROUND_Y - VANISH_Y) * t;
      const halfW = (balHalfBottom * t + balHalfTop * (1 - t)) * 0.94;
      const blurH = Math.max(1, 5 * t * (1 + speedNorm * 1.3));
      ctx.fillStyle = '#5d4a33';
      ctx.fillRect(VANISH_X - halfW, y, halfW * 2, blurH);
      ctx.fillStyle = 'rgba(255,240,220,0.18)';
      ctx.fillRect(VANISH_X - halfW, y, halfW * 2, Math.max(1, 1.5 * t));
      // Wood grain grooves
      if (t > 0.12) {
        ctx.fillStyle = 'rgba(40,28,16,0.5)';
        const grooveY = y + blurH * (0.3 + ((i * 37) % 40) / 100);
        ctx.fillRect(VANISH_X - halfW, Math.min(grooveY, y + blurH - 1), halfW * 2, 1);
      }
    }

    // Steel rails: two per lane, converging to the horizon
    for (const lane of [0, 1, 2] as Lane[]) {
      const cx = getLaneX(lane);
      for (const off of [-15, 15]) {
        const xTop = VANISH_X + off * 0.12;
        const xBot = cx + off;
        // Rail body
        ctx.strokeStyle = '#7c848d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(xTop, VANISH_Y);
        ctx.lineTo(xBot, GROUND_Y + 2);
        ctx.stroke();
        // Sun glint on rail head
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xTop, VANISH_Y);
        ctx.lineTo(xBot, GROUND_Y + 2);
        ctx.stroke();
      }
      // Oil/dirt streak worn down each lane center
      const stain = ctx.createLinearGradient(0, VANISH_Y, 0, GROUND_Y);
      stain.addColorStop(0, 'rgba(35,30,25,0)');
      stain.addColorStop(1, 'rgba(35,30,25,0.22)');
      ctx.fillStyle = stain;
      ctx.beginPath();
      ctx.moveTo(VANISH_X + (cx - VANISH_X) * 0.12 - 3, VANISH_Y);
      ctx.lineTo(cx - 11, GROUND_Y);
      ctx.lineTo(cx + 11, GROUND_Y);
      ctx.lineTo(VANISH_X + (cx - VANISH_X) * 0.12 + 3, VANISH_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Grass tufts rushing past on both verges (+ tiny wildflowers)
  private drawGrassTufts(distance: number) {
    const ctx = this.ctx;
    const balHalfBottom = LANE_WIDTH * 2.5;
    const flow = (distance * 0.004) % 1;
    const n = this.lowPower ? 14 : 30;
    ctx.lineCap = 'round';
    const flowerCols = ['#ff8ab8', '#ffffff', '#ffe95a'];
    for (let i = 0; i < n; i++) {
      const tt = ((i / n) + flow * 1.0) % 1;
      const t = tt * tt;
      if (t < 0.04) continue;
      const y = VANISH_Y + (GROUND_Y + 120 - VANISH_Y) * t;
      const halfW = balHalfBottom * t + 30 * (1 - t);
      const side = i % 2 === 0 ? -1 : 1;
      const lat = halfW * (1.15 + ((i * 53) % 40) / 100);
      const x = VANISH_X + side * lat;
      const hgt = Math.max(1.5, 9 * t);
      ctx.strokeStyle = i % 3 === 0 ? '#8cc168' : '#3f7030';
      ctx.lineWidth = Math.max(1, 2.2 * t);
      for (const lean of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean * hgt, y - hgt);
        ctx.stroke();
      }
      // Wildflower dot on every 5th tuft
      if (i % 5 === 0 && t > 0.2) {
        ctx.fillStyle = flowerCols[(i / 5) % 3 | 0];
        ctx.beginPath();
        ctx.arc(x + 2 * t, y - hgt - 1, Math.max(1, 2 * t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Trackside fences + railway signals (red when danger is near)
  private drawTrackside(distance: number, danger: boolean) {
    const ctx = this.ctx;
    const spacing = 220;
    const count = 9;
    const baseIndex = Math.floor(distance / spacing);
    let signalSide: -1 | 1 = 1;
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing;
      const z = worldD - distance + 60;
      if (z < 0 || z > MAX_Z) continue;
      for (const side of [-1, 1] as const) {
        const groundX = VANISH_X + side * (LANE_WIDTH * 2.9);
        const proj = project3D(groundX, z);
        const s = proj.scale;
        if (s < 0.1) continue;
        const poleH = 110 * s;
        const poleX = proj.x;
        const baseY = proj.y;
        // Wooden fence post
        ctx.fillStyle = '#6b543a';
        ctx.fillRect(poleX - 2.5 * s, baseY - poleH * 0.55, 5 * s, poleH * 0.55);
        ctx.fillStyle = '#4e3d29';
        ctx.fillRect(poleX - 2.5 * s, baseY - poleH * 0.55, 5 * s, 2 * s);
        // Signal mast every 3rd post, alternating sides
        if (k % 3 === 0 && side === signalSide) {
          // Tall gray mast
          ctx.fillStyle = '#5b6067';
          ctx.fillRect(poleX - 2.5 * s, baseY - poleH, 5 * s, poleH);
          ctx.fillStyle = '#43474d';
          ctx.fillRect(poleX - 2.5 * s, baseY - poleH, 2 * s, poleH);
          // Signal head box
          const headW = 16 * s;
          const headH = 30 * s;
          const headX = poleX - headW / 2;
          const headY = baseY - poleH - headH;
          ctx.fillStyle = '#22252a';
          this.roundRect(headX, headY, headW, headH, 3 * s);
          ctx.fillStyle = '#3a3e45';
          ctx.fillRect(headX + 1.5 * s, headY + 1.5 * s, headW - 3 * s, headH - 3 * s);
          // Lamps: red on top, green below
          const lampR = Math.max(1.2, 4.5 * s);
          ctx.fillStyle = danger ? '#3a1214' : '#401416';
          ctx.beginPath();
          ctx.arc(poleX, headY + headH * 0.28, lampR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = danger ? '#2a3a1c' : '#1e2a12';
          ctx.beginPath();
          ctx.arc(poleX, headY + headH * 0.72, lampR, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          if (danger) {
            ctx.shadowColor = '#ff3b30';
            ctx.shadowBlur = 14 * s;
            ctx.fillStyle = '#ff5147';
            ctx.beginPath();
            ctx.arc(poleX, headY + headH * 0.28, lampR, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.shadowColor = '#76ff03';
            ctx.shadowBlur = 14 * s;
            ctx.fillStyle = '#8dff3f';
            ctx.beginPath();
            ctx.arc(poleX, headY + headH * 0.72, lampR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          // Small ladder rungs
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          for (let r = 0; r < 3; r++) {
            ctx.fillRect(poleX - 2.5 * s, baseY - poleH + 8 * s + r * 12 * s, 5 * s, 1.5 * s);
          }
        }
      }
      if (k % 3 === 0) signalSide = (signalSide === 1 ? -1 : 1) as -1 | 1;
    }
    // Fence wires converging to horizon
    ctx.strokeStyle = 'rgba(90,75,55,0.8)';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      const gxBot = VANISH_X + side * LANE_WIDTH * 2.9;
      const gxTop = VANISH_X + side * 8;
      for (const hf of [0.3, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(gxTop, VANISH_Y + 10 + 8 * hf);
        ctx.lineTo(gxBot, GROUND_Y - 60 * hf - 4);
        ctx.stroke();
      }
    }
  }

  // Overhead catenary wires + support portals (railway signature)
  private drawCatenary(distance: number) {
    const ctx = this.ctx;
    // Two contact wires running the length of the line
    for (const gx of [VANISH_X - 70, VANISH_X + 70]) {
      const far = project3D(gx, MAX_Z);
      const wireTop = 165;
      ctx.strokeStyle = 'rgba(40,42,48,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(far.x, far.y - wireTop * far.scale);
      ctx.lineTo(gx, GROUND_Y - wireTop);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(far.x, far.y - wireTop * far.scale);
      ctx.lineTo(gx, GROUND_Y - wireTop);
      ctx.stroke();
    }
    // Support portals rushing past
    const spacing = 640;
    const count = 4;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing;
      const z = worldD - distance + 60;
      if (z < 40 || z > MAX_Z) continue;
      const s = project3D(VANISH_X, z).scale;
      if (s < 0.12) continue;
      const mastL = project3D(VANISH_X - LANE_WIDTH * 2.5, z);
      const mastR = project3D(VANISH_X + LANE_WIDTH * 2.5, z);
      const topH = 165 * s;
      ctx.fillStyle = '#4e5257';
      ctx.fillRect(mastL.x - 3 * s, mastL.y - topH, 6 * s, topH);
      ctx.fillRect(mastR.x - 3 * s, mastR.y - topH, 6 * s, topH);
      // Cross beam with slight sag
      ctx.strokeStyle = '#3c4046';
      ctx.lineWidth = Math.max(1.5, 5 * s);
      ctx.beginPath();
      ctx.moveTo(mastL.x, mastL.y - topH);
      ctx.quadraticCurveTo(VANISH_X, mastL.y - topH + 8 * s, mastR.x, mastR.y - topH);
      ctx.stroke();
      // Droppers down to the wires
      ctx.strokeStyle = 'rgba(40,42,48,0.9)';
      ctx.lineWidth = Math.max(1, 1.8 * s);
      for (const gx of [VANISH_X - 70, VANISH_X + 70]) {
        const wx = VANISH_X + (gx - VANISH_X) * s;
        const wy = mastL.y - topH + 8 * s;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx, wy + 22 * s);
        ctx.stroke();
        ctx.fillStyle = '#2c2e33';
        ctx.beginPath();
        ctx.arc(wx, wy + 2 * s, Math.max(1, 2.5 * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Scrolling trackside props: crates, barrels, bushes, signboards
  private drawProps(distance: number, speed: number) {
    const ctx = this.ctx;
    const spacing = 260;
    const count = this.lowPower ? 5 : 8;
    const kinds = ['crate', 'barrel', 'bush', 'sign'] as const;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing + ((k * 137) % 120);
      const z = worldD - distance + 60;
      if (z < 0 || z > MAX_Z) continue;
      const fade = emergenceFade(z, speed);
      if (fade <= 0.05) continue;
      const side = k % 2 === 0 ? -1 : 1;
      const groundX = VANISH_X + side * LANE_WIDTH * 3.6;
      const proj = project3D(groundX, z);
      const s = proj.scale;
      if (s < 0.12) continue;
      ctx.save();
      ctx.globalAlpha = fade;
      const kind = kinds[Math.abs(k) % kinds.length];
      if (kind === 'crate') this.drawCrate(proj.x, proj.y, s, k);
      else if (kind === 'barrel') this.drawBarrel(proj.x, proj.y, s, k);
      else if (kind === 'bush') this.drawBush(proj.x, proj.y, s, k);
      else this.drawSignboard(proj.x, proj.y, s, k);
      ctx.restore();
    }
  }

  private drawCrate(x: number, y: number, s: number, k: number) {
    const ctx = this.ctx;
    const w = 30 * s;
    const h = 26 * s;
    ctx.fillStyle = 'rgba(20,20,25,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * s, w * 0.6, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = '#a37f4f';
    ctx.fillRect(x - w / 2, y - h, w * 0.35, h);
    ctx.strokeStyle = '#5d472a';
    ctx.lineWidth = Math.max(1, 1.8 * s);
    ctx.strokeRect(x - w / 2, y - h, w, h);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x + w / 2, y);
    ctx.moveTo(x + w / 2, y - h);
    ctx.lineTo(x - w / 2, y);
    ctx.stroke();
  }

  private drawBarrel(x: number, y: number, s: number, k: number) {
    const ctx = this.ctx;
    const w = 20 * s;
    const h = 30 * s;
    const cols = ['#b33a2c', '#2c5fa3', '#3d7a3d'];
    const c = cols[Math.abs(k) % cols.length];
    ctx.fillStyle = 'rgba(20,20,25,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * s, w * 0.6, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, this.shade(c, 0.6));
    g.addColorStop(0.5, c);
    g.addColorStop(1, this.shade(c, 0.55));
    ctx.fillStyle = g;
    this.roundRect(x - w / 2, y - h, w, h, 3 * s);
    ctx.fillStyle = 'rgba(240,240,245,0.85)';
    ctx.fillRect(x - w / 2, y - h * 0.62, w, Math.max(1, 3 * s));
    ctx.fillRect(x - w / 2, y - h * 0.3, w, Math.max(1, 3 * s));
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x - w * 0.3, y - h + 2 * s, w * 0.16, h - 4 * s);
  }

  private drawBush(x: number, y: number, s: number, k: number) {
    const ctx = this.ctx;
    const r = 14 * s;
    ctx.fillStyle = 'rgba(20,20,25,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1.5 * s, r * 1.4, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const blobs: Array<[number, number, number, string]> = [
      [0, 0, 1, '#3f7030'],
      [-0.8, -0.25, 0.75, '#4d8540'],
      [0.8, -0.2, 0.7, '#356228'],
      [0.1, -0.6, 0.6, '#5d9a4c'],
    ];
    for (const [ox, oy, rr, col] of blobs) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + ox * r, y - r * 0.7 + oy * r, r * rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSignboard(x: number, y: number, s: number, k: number) {
    const ctx = this.ctx;
    const postH = 46 * s;
    ctx.fillStyle = '#5b6067';
    ctx.fillRect(x - 2 * s, y - postH, 4 * s, postH);
    const bw = 64 * s;
    const bh = 22 * s;
    const bx = x - bw / 2;
    const by = y - postH - bh;
    ctx.fillStyle = '#22252a';
    this.roundRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, 3 * s);
    ctx.fillStyle = k % 3 === 0 ? '#1d4f9e' : '#20603a';
    this.roundRect(bx, by, bw, bh, 2.5 * s);
    if (s > 0.4) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.max(6, 10 * s)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(k % 3 === 0 ? '◀ SUBWAY' : 'CITY ▶', x, by + bh / 2 + 0.5);
    }
  }

  // Graffiti-covered walls lining both sides of the cutting
  private drawGraffitiWalls(distance: number, speed: number) {
    const ctx = this.ctx;
    const tags = ['ZOOM', 'FRESH', 'SK8', 'VOLT', 'DASH', 'URBAN'];
    const tagCols = ['#ff2d78', '#00c2ff', '#b6ff2e', '#ffea00', '#ff7a1a', '#c86bff'];
    const wallCols = ['#e8b4c8', '#a8d8f0', '#c8e8a8', '#f0d8a8', '#d8c8f0'];
    const spacing = 430;
    const count = 6;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing + ((k * 251) % 160);
      const z = worldD - distance + 60;
      if (z < 0 || z > MAX_Z) continue;
      const fade = emergenceFade(z, speed);
      if (fade <= 0.05) continue;
      for (const side of [-1, 1] as const) {
        const groundX = VANISH_X + side * (LANE_WIDTH * 4.4);
        const proj = project3D(groundX, z);
        const s = proj.scale;
        if (s < 0.1) continue;
        const wW = 200 * s;
        const wH = 62 * s;
        const wx = proj.x - wW / 2;
        const wy = proj.y - wH;
        ctx.save();
        ctx.globalAlpha = fade;
        // Wall slab
        ctx.fillStyle = wallCols[Math.abs(k * 2 + (side + 1)) % wallCols.length];
        ctx.fillRect(wx, wy, wW, wH);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(wx, wy, wW, Math.max(1, 3 * s));
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(wx, wy + wH - Math.max(1, 4 * s), wW, Math.max(1, 4 * s));
        // Coping stones on top
        ctx.fillStyle = '#8f8a80';
        ctx.fillRect(wx - 2 * s, wy - Math.max(1.5, 4 * s), wW + 4 * s, Math.max(1.5, 4 * s));
        // Big graffiti tag
        if (s > 0.18) {
          const tag = tags[Math.abs(k * 3 + (side + 1)) % tags.length];
          ctx.save();
          ctx.translate(proj.x, wy + wH * 0.56);
          ctx.rotate(side * 0.04 - 0.03);
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = tagCols[Math.abs(k + (side + 1) * 2) % tagCols.length];
          ctx.font = `italic 900 ${Math.max(7, 26 * s)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = Math.max(1, 3 * s);
          ctx.strokeStyle = 'rgba(20,20,28,0.85)';
          ctx.strokeText(tag, 0, 0);
          ctx.fillText(tag, 0, 0);
          ctx.restore();
          // Spray dots + star burst around the tag
          ctx.fillStyle = tagCols[Math.abs(k * 5) % tagCols.length];
          for (let d = 0; d < 5; d++) {
            const dx = wx + ((k * 37 + d * 61) % Math.max(8, wW - 8));
            const dy = wy + ((k * 53 + d * 29) % Math.max(8, wH - 8));
            ctx.beginPath();
            ctx.arc(dx, dy, Math.max(0.8, 2.2 * s), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
  }

  // Big roadside billboards with playful ads
  private drawBillboards(distance: number, speed: number) {
    const ctx = this.ctx;
    const ads: Array<{ text: string; bg: string; fg: string }> = [
      { text: 'SKATE OR DIE', bg: '#ff2d78', fg: '#fff' },
      { text: '★ FRESH KICKS ★', bg: '#2471c9', fg: '#ffe95a' },
      { text: 'SPRAY DAY!', bg: '#2e9e5b', fg: '#fff' },
    ];
    const spacing = 1500;
    const count = 3;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing + 700;
      const z = worldD - distance + 60;
      if (z < 0 || z > MAX_Z) continue;
      const fade = emergenceFade(z, speed);
      if (fade <= 0.05) continue;
      const side = k % 2 === 0 ? -1 : 1;
      const groundX = VANISH_X + side * LANE_WIDTH * 4.1;
      const proj = project3D(groundX, z);
      const s = proj.scale;
      if (s < 0.12) continue;
      const ad = ads[Math.abs(k) % ads.length];
      const bw = 170 * s;
      const bh = 62 * s;
      const poleH = 90 * s;
      ctx.save();
      ctx.globalAlpha = fade;
      // Support poles
      ctx.fillStyle = '#5b6067';
      ctx.fillRect(proj.x - bw * 0.32, proj.y - poleH, 5 * s, poleH);
      ctx.fillRect(proj.x + bw * 0.32 - 5 * s, proj.y - poleH, 5 * s, poleH);
      // Board with bold outline
      const bx = proj.x - bw / 2;
      const by = proj.y - poleH - bh;
      ctx.fillStyle = '#22252a';
      this.roundRect(bx - 3 * s, by - 3 * s, bw + 6 * s, bh + 6 * s, 5 * s);
      ctx.fillStyle = ad.bg;
      this.roundRect(bx, by, bw, bh, 4 * s);
      // Shine stripe
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx + 3 * s, by + 2 * s, bw - 6 * s, Math.max(1, 4 * s));
      if (s > 0.3) {
        ctx.fillStyle = ad.fg;
        ctx.font = `italic 900 ${Math.max(7, 17 * s)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ad.text, proj.x, by + bh / 2 + 1);
      }
      ctx.restore();
    }
  }

  // Footbridge spanning the tracks with a hanging event banner
  private drawBridge(distance: number, speed: number) {
    const ctx = this.ctx;
    const spacing = 2400;
    const count = 2;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing + 1500;
      const z = worldD - distance + 60;
      if (z < 60 || z > MAX_Z) continue;
      const fade = emergenceFade(z, speed);
      if (fade <= 0.05) continue;
      const s = project3D(VANISH_X, z).scale;
      if (s < 0.14) continue;
      const deckH = 185 * s; // well above trains
      const left = project3D(VANISH_X - LANE_WIDTH * 3.1, z);
      const right = project3D(VANISH_X + LANE_WIDTH * 3.1, z);
      const deckY = left.y - deckH;
      ctx.save();
      ctx.globalAlpha = fade;
      // Support pillars
      ctx.fillStyle = '#7a7f86';
      ctx.fillRect(left.x - 4 * s, deckY, 8 * s, deckH);
      ctx.fillRect(right.x - 4 * s, deckY, 8 * s, deckH);
      ctx.fillStyle = '#565b62';
      ctx.fillRect(left.x - 4 * s, deckY, 3 * s, deckH);
      ctx.fillRect(right.x - 4 * s, deckY, 3 * s, deckH);
      // Deck
      ctx.fillStyle = '#8f959c';
      ctx.fillRect(left.x - 6 * s, deckY - 6 * s, right.x - left.x + 12 * s, 7 * s);
      // Railings
      ctx.strokeStyle = '#4e5257';
      ctx.lineWidth = Math.max(1, 2.5 * s);
      ctx.beginPath();
      ctx.moveTo(left.x - 6 * s, deckY - 6 * s);
      ctx.lineTo(left.x - 6 * s, deckY - 22 * s);
      ctx.lineTo(right.x + 6 * s, deckY - 22 * s);
      ctx.lineTo(right.x + 6 * s, deckY - 6 * s);
      ctx.stroke();
      for (let r = 0; r <= 8; r++) {
        const rx = left.x - 6 * s + ((right.x - left.x + 12 * s) * r) / 8;
        ctx.beginPath();
        ctx.moveTo(rx, deckY - 6 * s);
        ctx.lineTo(rx, deckY - 22 * s);
        ctx.stroke();
      }
      // Hanging banner
      const banW = (right.x - left.x) * 0.5;
      const banH = 20 * s;
      const banX = VANISH_X - banW / 2;
      const banY = deckY + 2 * s;
      const banners = ['CITY JAM ★', 'SKATE PARK →'];
      ctx.fillStyle = k % 2 === 0 ? '#ff2d78' : '#2471c9';
      this.roundRect(banX, banY, banW, banH, 4 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(banX, banY + banH - Math.max(1, 3 * s), banW, Math.max(1, 3 * s));
      if (s > 0.3) {
        ctx.fillStyle = '#fff';
        ctx.font = `italic 900 ${Math.max(6, 11 * s)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(banners[Math.abs(k) % banners.length], VANISH_X, banY + banH / 2 + 0.5);
      }
      ctx.restore();
    }
  }

  // ================= PLAYERS =================

  private drawPlayer(player: PlayerData, speedNorm: number) {
    const ctx = this.ctx;
    const isSliding = player.state === 'sliding';
    const lean = Math.max(-0.35, Math.min(0.35, (getLaneX(player.lane) - this.smoothX) * 0.02));
    const height = isSliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT;
    const width = PLAYER_WIDTH;
    const drawX = this.smoothX - width / 2;
    const drawY = isSliding ? GROUND_Y - PLAYER_SLIDE_HEIGHT : player.y;
    const bob = player.state === 'running' ? Math.sin(this.frameCount * 0.45) * 2 : 0;

    // Shadow (shrinks when jumping) — crisp daylight shadow
    const airH = Math.max(0, GROUND_Y - PLAYER_HEIGHT - player.y);
    const shScale = Math.max(0.4, 1 - airH / 260);
    ctx.fillStyle = `rgba(20,20,25,${(0.55 * shScale).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(this.smoothX, GROUND_Y + 6, width * 0.62 * shScale, 7 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Magnet aura ring while powered
    if (player.magnetTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff2d78';
      ctx.shadowColor = '#ff2d78';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -(this.frameCount * 2.5) % 18;
      ctx.beginPath();
      ctx.ellipse(this.smoothX, GROUND_Y - 32, 36, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Speed afterimage trail
    if (speedNorm > 0.15 && player.state === 'running') {
      ctx.save();
      ctx.globalAlpha = 0.14 + speedNorm * 0.12;
      ctx.fillStyle = player.color;
      this.roundRect(drawX - 8 * speedNorm, drawY + bob + 6, width, height, 6);
      ctx.restore();
    }

    ctx.save();
    // Squash & stretch around the feet: stretch mid-air, squash on landing
    let psx = 1;
    let psy = 1;
    if (player.state === 'jumping') {
      const stretch = Math.min(0.22, Math.abs(player.velocityY) * 0.012);
      psy = 1 + stretch;
      psx = 1 - stretch * 0.55;
    }
    if (this.squash > 0) {
      psy *= 1 - 0.28 * this.squash;
      psx *= 1 + 0.34 * this.squash;
    }
    ctx.translate(this.smoothX, GROUND_Y);
    ctx.scale(psx, psy);
    ctx.translate(-this.smoothX, -GROUND_Y);
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 8;
    this.drawRunner(drawX, drawY + bob, width, height, player.color, lean, player.state);
    ctx.restore();

    // Run dust / slide sparks
    if (player.state === 'running' && this.frameCount % 2 === 0) {
      this.addParticle(this.smoothX + (Math.random() - 0.5) * 18, GROUND_Y - 2, 'rgba(195,180,150,0.85)', 'dust');
    }
    if (isSliding && this.frameCount % 2 === 0) {
      this.addParticle(this.smoothX + 12, GROUND_Y - 4, '#ffd34d', 'spark');
      this.addParticle(this.smoothX - 10, GROUND_Y - 2, player.color, 'spark');
    }
    if (player.state === 'jumping') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(this.smoothX, GROUND_Y - 2, 20, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Neon street-runner character — outlined, denim + hoodie + cap */
  private drawRunner(x: number, y: number, w: number, h: number, color: string, lean: number, state: string) {
    const ctx = this.ctx;
    const cx = x + w / 2;
    const phase = this.frameCount * 0.38;
    const runA = Math.sin(phase);
    const runB = Math.sin(phase + Math.PI);

    ctx.save();
    ctx.translate(cx, y + h);
    ctx.rotate(lean * 0.9 + (state === 'jumping' ? -0.1 : 0));
    ctx.translate(-cx, -(y + h));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dark = this.darkenColor(color, 0.5);
    const darker = this.darkenColor(color, 0.3);
    const outline = 'rgba(6,6,16,0.9)';
    const skin = '#f0bd93';
    const skinShade = '#cf9368';
    const denim = '#33415e';
    const denimDark = '#222b42';

    if (state === 'sliding') {
      // Baseball slide: front leg stretched low, body reclined, head up
      const legY = y + h - 9;
      // Rear tucked leg (outline + fill)
      ctx.strokeStyle = outline;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx + 8, legY - 4);
      ctx.lineTo(cx - 2, legY - 2);
      ctx.stroke();
      ctx.strokeStyle = denimDark;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx + 8, legY - 4);
      ctx.lineTo(cx - 2, legY - 2);
      ctx.stroke();
      // Front extended leg
      ctx.strokeStyle = outline;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx + 2, legY - 8);
      ctx.lineTo(cx - 24, legY - 4);
      ctx.stroke();
      ctx.strokeStyle = denim;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx + 2, legY - 8);
      ctx.lineTo(cx - 24, legY - 4);
      ctx.stroke();
      // Leading shoe (toe up)
      ctx.fillStyle = outline;
      this.roundRect(cx - 34, legY - 12, 12, 7, 3);
      ctx.fillStyle = '#f4f4fa';
      this.roundRect(cx - 33, legY - 11, 10, 5, 2);
      ctx.fillStyle = color;
      ctx.fillRect(cx - 33, legY - 8, 10, 2);
      // Reclined torso
      const tg = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
      tg.addColorStop(0, dark);
      tg.addColorStop(0.5, color);
      tg.addColorStop(1, dark);
      ctx.fillStyle = outline;
      this.roundRect(cx - 11, y + 8, 24, 26, 9);
      ctx.fillStyle = tg;
      this.roundRect(cx - 9, y + 6, 20, 24, 8);
      // Pocket + strings
      ctx.fillStyle = darker;
      this.roundRect(cx - 6, y + 22, 12, 6, 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - 3, y + 10);
      ctx.lineTo(cx - 3, y + 17);
      ctx.moveTo(cx + 3, y + 10);
      ctx.lineTo(cx + 3, y + 17);
      ctx.stroke();
      // Head up with cap
      const hx = cx + 12;
      const hy = y + 6;
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(hx, hy, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(hx, hy - 2.5, 8.4, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(hx - 14, hy - 5, 8, 3); // back brim
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hx + 3.5, hy, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Rim light
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx + 1, hy, 7, -0.9, 0.7);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const jumping = state === 'jumping';
    const hipX = cx;
    const hipY = y + h - 24;
    const shX = cx + lean * 14 + (jumping ? 0 : 2);
    const shY = y + 20;

    // ---- LEGS (outline pass then color pass) ----
    const legSwing = jumping ? 0.35 : 1;
    const fKnee = { x: hipX + 5 + runA * 6 * legSwing, y: hipY + 11 };
    const fFoot = { x: hipX + 4 + runA * 11 * legSwing, y: y + h - (jumping ? 10 : 1) };
    const bKnee = { x: hipX - 5 + runB * 6 * legSwing, y: hipY + 11 };
    const bFoot = { x: hipX - 4 + runB * 11 * legSwing, y: y + h - (jumping ? 15 : 1) };
    if (jumping) {
      // Tucked knees
      fKnee.x = hipX + 10; fKnee.y = hipY + 6;
      fFoot.x = hipX + 8; fFoot.y = hipY + 16;
      bKnee.x = hipX - 8; bKnee.y = hipY + 8;
      bFoot.x = hipX - 10; bFoot.y = hipY + 17;
    }
    const legs: Array<{ knee: { x: number; y: number }; foot: { x: number; y: number }; c1: string; c2: string }> = [
      { knee: bKnee, foot: bFoot, c1: denimDark, c2: '#1a2138' },
      { knee: fKnee, foot: fFoot, c1: denim, c2: denimDark },
    ];
    for (const leg of legs) {
      // Outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(leg.knee.x, leg.knee.y);
      ctx.lineTo(leg.foot.x, leg.foot.y);
      ctx.stroke();
      // Thigh + shin
      ctx.strokeStyle = leg.c1;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(leg.knee.x, leg.knee.y);
      ctx.stroke();
      ctx.strokeStyle = leg.c2;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(leg.knee.x, leg.knee.y);
      ctx.lineTo(leg.foot.x, leg.foot.y);
      ctx.stroke();
    }
    // Sneakers — white with neon swoosh + dark sole
    for (const foot of [bFoot, fFoot]) {
      ctx.fillStyle = outline;
      this.roundRect(foot.x - 7, foot.y - 5, 15, 7, 3);
      ctx.fillStyle = '#f4f4fa';
      this.roundRect(foot.x - 6, foot.y - 4.5, 13, 5.5, 2.5);
      ctx.fillStyle = color;
      ctx.fillRect(foot.x - 6, foot.y - 2.5, 13, 2.2);
      ctx.fillStyle = 'rgba(10,10,20,0.85)';
      this.roundRect(foot.x - 6, foot.y + 0.4, 13, 1.8, 1);
    }

    // ---- BACKPACK (street kid signature) ----
    const packX = shX - 17;
    const packY = shY + 1;
    ctx.fillStyle = outline;
    this.roundRect(packX - 1.5, packY - 1.5, 15, 23, 6);
    const packGrad = ctx.createLinearGradient(packX, 0, packX + 13, 0);
    packGrad.addColorStop(0, '#c25e0e');
    packGrad.addColorStop(0.5, '#ff8c1a');
    packGrad.addColorStop(1, '#a34d08');
    ctx.fillStyle = packGrad;
    this.roundRect(packX, packY, 13, 21, 5);
    // Front pocket + zipper
    ctx.fillStyle = '#8a4206';
    this.roundRect(packX + 2, packY + 11, 9, 8, 3);
    ctx.strokeStyle = '#ffe1b3';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(packX + 6.5, packY + 11);
    ctx.lineTo(packX + 6.5, packY + 15);
    ctx.stroke();
    // Bedroll strapped on top
    ctx.fillStyle = outline;
    this.roundRect(packX - 2, packY - 8, 17, 8, 4);
    ctx.fillStyle = '#2e9e5b';
    this.roundRect(packX - 1, packY - 7, 15, 6, 3);
    ctx.fillStyle = '#237a44';
    ctx.fillRect(packX + 3, packY - 7, 2.5, 6);
    ctx.fillRect(packX + 9, packY - 7, 2.5, 6);

    // ---- TORSO: tapered hoodie ----
    const torsoTop = 24;
    const torsoBot = 12;
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(shX - torsoTop / 2 - 1.5, shY - 2);
    ctx.lineTo(shX + torsoTop / 2 + 1.5, shY - 2);
    ctx.lineTo(shX + torsoBot / 2 + 1.5, hipY + 2);
    ctx.lineTo(shX - torsoBot / 2 - 1.5, hipY + 2);
    ctx.closePath();
    ctx.fill();
    const torsoGrad = ctx.createLinearGradient(shX - 13, 0, shX + 13, 0);
    torsoGrad.addColorStop(0, dark);
    torsoGrad.addColorStop(0.5, color);
    torsoGrad.addColorStop(1, dark);
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.moveTo(shX - torsoTop / 2, shY - 2);
    ctx.lineTo(shX + torsoTop / 2, shY - 2);
    ctx.lineTo(shX + torsoBot / 2, hipY + 1);
    ctx.lineTo(shX - torsoBot / 2, hipY + 1);
    ctx.closePath();
    ctx.fill();
    // Hood hump behind neck
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(shX - 2, shY + 1, 9, 5.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.ellipse(shX - 2, shY + 1.5, 5.5, 3, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Kangaroo pocket
    ctx.fillStyle = darker;
    this.roundRect(shX - 8, hipY - 11, 16, 9, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Drawstrings
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(shX - 4, shY + 5);
    ctx.lineTo(shX - 4, shY + 13);
    ctx.moveTo(shX + 4, shY + 5);
    ctx.lineTo(shX + 4, shY + 13);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(shX - 4, shY + 13.5, 1.4, 0, Math.PI * 2);
    ctx.arc(shX + 4, shY + 13.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Backpack straps over the shoulders
    ctx.strokeStyle = '#7a3c06';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(shX - 10, shY - 1);
    ctx.lineTo(shX - 6, shY + 14);
    ctx.stroke();
    ctx.strokeStyle = '#a5570b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(shX - 10, shY - 1);
    ctx.lineTo(shX - 6, shY + 14);
    ctx.stroke();
    // Rim light on torso edge
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(shX + torsoTop / 2 - 1, shY);
    ctx.lineTo(shX + torsoBot / 2 - 1, hipY - 1);
    ctx.stroke();

    // ---- ARMS (opposite swing, bent elbows) ----
    const armSwing = jumping ? 0 : 1;
    const arms = [
      { sx: shX - 11, ex: shX - 13 + runB * 8 * armSwing, hx2: shX - 11 + runB * 10 * armSwing, up: jumping },
      { sx: shX + 11, ex: shX + 13 + runA * 8 * armSwing, hx2: shX + 11 + runA * 10 * armSwing, up: jumping },
    ];
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i];
      const elbow = jumping
        ? { x: a.sx + (i === 0 ? -9 : 9), y: shY + 2 }
        : { x: a.ex, y: shY + 13 };
      const hand = jumping
        ? { x: a.sx + (i === 0 ? -13 : 13), y: shY - 9 }
        : { x: a.hx2, y: shY + 21 };
      // Sleeve outline + fill
      ctx.strokeStyle = outline;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(a.sx, shY + 2);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.stroke();
      ctx.strokeStyle = i === 0 ? dark : color;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(a.sx, shY + 2);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.stroke();
      // Forearm (skin) + fist
      ctx.strokeStyle = outline;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(elbow.x, elbow.y);
      ctx.lineTo(hand.x, hand.y);
      ctx.stroke();
      ctx.strokeStyle = skin;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(elbow.x, elbow.y);
      ctx.lineTo(hand.x, hand.y);
      ctx.stroke();
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- HEAD: face + backward cap ----
    const hx = shX + lean * 10 + 1;
    const hy = y + 8;
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 8.6, 0, Math.PI * 2);
    ctx.fill();
    // Face shade (jaw)
    ctx.fillStyle = skinShade;
    ctx.beginPath();
    ctx.arc(hx + 1, hy + 3.5, 6.5, 0.15, Math.PI - 0.15);
    ctx.fill();
    // Big cartoon eyes (blink every few seconds) + rosy cheeks
    const blinking = this.frameCount % 190 < 7;
    if (blinking) {
      ctx.strokeStyle = '#5a3a28';
      ctx.lineWidth = 1.8;
      for (const ex of [hx - 0.5, hx + 5.5]) {
        ctx.beginPath();
        ctx.moveTo(ex - 2.6, hy - 0.5);
        ctx.quadraticCurveTo(ex, hy + 0.8, ex + 2.6, hy - 0.5);
        ctx.stroke();
      }
    } else {
      for (const [ex, px] of [[hx - 0.5, hx + 0.3], [hx + 5.5, hx + 6.3]] as const) {
        // Eye white
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex, hy - 0.5, 3.1, 3.7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupil looking forward
        ctx.fillStyle = '#14141c';
        ctx.beginPath();
        ctx.arc(px, hy - 0.2, 1.9, 0, Math.PI * 2);
        ctx.fill();
        // Sparkle
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px + 0.7, hy - 1, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Determined brows
      ctx.strokeStyle = 'rgba(30,18,12,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(hx - 3.5, hy - 5.2);
      ctx.lineTo(hx + 2, hy - 4.2);
      ctx.moveTo(hx + 3, hy - 4.2);
      ctx.lineTo(hx + 8.5, hy - 5.2);
      ctx.stroke();
    }
    // Rosy cheeks
    ctx.fillStyle = 'rgba(255,120,130,0.55)';
    ctx.beginPath();
    ctx.arc(hx - 3.5, hy + 3.2, 2, 0, Math.PI * 2);
    ctx.arc(hx + 7.5, hy + 3.2, 2, 0, Math.PI * 2);
    ctx.fill();
    // Grin
    ctx.strokeStyle = '#7a4030';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx + 2, hy + 3.4, 3.4, 0.25, Math.PI - 0.5);
    ctx.stroke();
    // Backward cap: dome + back brim + neon strap
    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.arc(hx, hy - 2, 9, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(hx, hy - 2.6, 9, Math.PI * 1, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    this.roundRect(hx - 15, hy - 6, 9, 4, 2); // brim pointing back
    ctx.fillStyle = color;
    ctx.fillRect(hx - 15, hy - 3.4, 9, 1.6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(hx, hy - 10.4, 1.6, 0, Math.PI * 2); // cap button
    ctx.fill();
    // Rim light on face edge
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, 8, -0.7, 0.5);
    ctx.stroke();

    ctx.restore();
  }

  private drawGhostPlayer(player: RoomPlayer) {
    const ctx = this.ctx;
    const targetX = getLaneX(player.lane);
    const prev = this.ghostX.get(player.id) ?? targetX;
    const sx = prev + (targetX - prev) * 0.2;
    this.ghostX.set(player.id, sx);
    const isSliding = player.state === 'sliding';
    const height = isSliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT;
    const width = PLAYER_WIDTH;
    const drawX = sx - width / 2;
    const drawY = isSliding ? GROUND_Y - PLAYER_SLIDE_HEIGHT : player.y;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 8;
    this.drawRunner(drawX, drawY, width, height, player.color, 0, player.state);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = player.name.length > 10 ? player.name.slice(0, 10) + '…' : player.name;
    // Pill behind name
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.roundRect(sx - tw / 2, drawY - 24, tw, 15, 7);
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(sx - tw / 2 + 8, drawY - 16.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, sx + 3, drawY - 13);
    ctx.restore();
  }

  private drawWreck(speedNorm: number) {
    // Fading scorch mark where player died
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(this.smoothX, GROUND_Y + 5, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ================= OBSTACLES =================

  private drawObstacle(obstacle: Obstacle, distance: number, speed: number) {
    if (obstacle.z < -60 || obstacle.z > MAX_Z) return;
    const ctx = this.ctx;
    const laneX = getLaneX(obstacle.lane);
    const proj = project3D(laneX, obstacle.z);
    if (proj.scale <= 0.05) return;

    // Smooth emergence: constant-time fade from the horizon, no popping
    const fadeIn = emergenceFade(obstacle.z, speed);
    if (fadeIn <= 0.01) return;

    const w = obstacle.width * proj.scale;
    const h = obstacle.height * proj.scale;
    const drawX = proj.x - w / 2;
    const drawY = proj.y - h;
    const s = proj.scale;

    ctx.save();
    ctx.globalAlpha = fadeIn;

    // Soft contact shadow with blurred edge
    ctx.save();
    ctx.shadowColor = 'rgba(20,20,25,0.55)';
    ctx.shadowBlur = 10 * s;
    ctx.fillStyle = 'rgba(20,20,25,0.4)';
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y + 3 * s, w * 0.55, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Motion smear trailing a moving train
    if (obstacle.moving && s > 0.35) {
      ctx.fillStyle = 'rgba(40,40,55,0.22)';
      this.roundRect(drawX - 3 * s, drawY + 8 * s, w + 6 * s, h, Math.max(1, 5 * s));
    }

    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;

    switch (obstacle.type) {
      case 'train':
        this.drawTrain(drawX, drawY, w, h, s, obstacle);
        break;
      case 'barrier':
        this.drawBarrier(drawX, drawY, w, h, s);
        break;
      case 'cone':
        this.drawCone(drawX, drawY, w, h, s);
        break;
      case 'tall_barrier':
        this.drawTallBarrier(drawX, drawY, w, h, s);
        break;
    }
    ctx.restore();

    // Distance fog (also faded so far objects melt into the haze)
    const fog = Math.max(0, Math.min(0.55, obstacle.z / MAX_Z - 0.35)) * fadeIn;
    if (fog > 0.02) {
      ctx.fillStyle = `rgba(205,232,248,${fog.toFixed(2)})`;
      ctx.fillRect(drawX - 4, drawY - 4, w + 8, h + 8);
    }

    // Proximity warning glow when very close
    if (obstacle.z < 120 && obstacle.z > -10 && obstacle.lane === this.closestLane()) {
      const a = (1 - obstacle.z / 120) * 0.25;
      ctx.fillStyle = `rgba(255,40,60,${a.toFixed(2)})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  // ================= INCOMING WARNINGS =================
  // Lane markers near the horizon show WHAT is coming and WHERE,
  // with JUMP / SLIDE hints when urgent — no more surprises.

  private drawWarnings(obstacles: Obstacle[]) {
    const ctx = this.ctx;
    for (const lane of [0, 1, 2] as Lane[]) {
      let nearest: Obstacle | null = null;
      for (const o of obstacles) {
        if (o.lane !== lane || o.z < 140 || o.z > MAX_Z) continue;
        if (!nearest || o.z < nearest.z) nearest = o;
      }
      if (!nearest) continue;

      const meta = OBSTACLE_META[nearest.type];
      const mx = VANISH_X + (getLaneX(lane) - VANISH_X) * 0.15;
      const my = VANISH_Y + 34;
      const urgency = 1 - Math.max(0, Math.min(1, (nearest.z - 140) / 640)); // 0 far → 1 near
      const urgent = nearest.z < 320;

      // Guide beam from marker down to the actual obstacle
      const op = project3D(getLaneX(lane), Math.min(nearest.z, MAX_Z));
      ctx.save();
      ctx.strokeStyle = meta.color;
      ctx.globalAlpha = 0.10 + urgency * 0.22;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -(this.frameCount * 1.5) % 12;
      ctx.beginPath();
      ctx.moveTo(mx, my + 12);
      ctx.lineTo(op.x, op.y - 4);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      // Pulsing marker pill
      const blink = urgent
        ? 0.65 + Math.sin(this.frameCount * 0.4) * 0.35
        : 0.55 + Math.sin(this.frameCount * 0.12) * 0.2;
      const pw = urgent ? 40 : 32;
      const ph = 22;
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, Math.min(1, 0.35 + urgency * 0.65)) * blink + 0.25;
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = urgent ? 12 : 7;
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      this.roundRect(mx - pw / 2, my, pw, ph, 11);
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = urgent ? 2 : 1.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.font = '12px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.icon, mx, my + ph / 2 + 0.5);
      ctx.restore();

      // Action hint when close
      if (urgent) {
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(this.frameCount * 0.4) * 0.4;
        ctx.fillStyle = meta.color;
        ctx.font = '800 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(meta.hint, mx, my - 6);
        ctx.restore();
      }
    }
  }

  private closestLane(): Lane {
    // lane whose x is nearest smoothed player x
    let best: Lane = 1;
    let bestD = Infinity;
    for (const l of [0, 1, 2] as Lane[]) {
      const d = Math.abs(getLaneX(l) - this.smoothX);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  private drawTrain(x: number, y: number, w: number, h: number, s: number, ob: Obstacle) {
    const ctx = this.ctx;
    const moving = !!ob.moving;
    // Subway livery picked from the obstacle id (red / blue / yellow / green)
    const liveries = ['#d63a2f', '#2471c9', '#e8a90c', '#2e9e5b'] as const;
    let hash = 0;
    for (let i = 0; i < ob.id.length; i++) hash = (hash * 31 + ob.id.charCodeAt(i)) | 0;
    const livery = liveries[Math.abs(hash) % liveries.length];
    const dark = this.shade(livery, 0.55);
    const darker = this.shade(livery, 0.35);

    // Rumble for moving trains
    if (moving && s > 0.4) {
      x += Math.sin(this.frameCount * 0.9) * 1.6 * s;
    }

    // Far away: clean silhouette so it reads instantly, no noise
    if (s < 0.3) {
      ctx.fillStyle = darker;
      this.roundRect(x, y, w, h, Math.max(1, 4 * s));
      ctx.fillStyle = livery;
      this.roundRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, Math.max(1, 3 * s));
      ctx.fillStyle = 'rgba(190,230,255,0.8)';
      ctx.fillRect(x + w * 0.1, y + h * 0.16, w * 0.8, Math.max(1, h * 0.14));
      ctx.save();
      ctx.shadowColor = '#fff7ae';
      ctx.shadowBlur = 10 * s;
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(x + w * 0.3, y + h * 0.72, Math.max(1, 3 * s), 0, Math.PI * 2);
      ctx.arc(x + w * 0.7, y + h * 0.72, Math.max(1, 3 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Body — subway livery with dark outline
    ctx.fillStyle = 'rgba(15,15,20,0.9)';
    this.roundRect(x - 1, y - 1, w + 2, h + 2, Math.max(1, 6 * s));
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, darker);
    g.addColorStop(0.25, livery);
    g.addColorStop(0.5, this.shade(livery, 1.15));
    g.addColorStop(0.75, livery);
    g.addColorStop(1, darker);
    ctx.fillStyle = g;
    this.roundRect(x, y, w, h, Math.max(1, 5 * s));

    // Gray roof + vents + pantograph
    ctx.fillStyle = '#4a4d55';
    this.roundRect(x + w * 0.04, y - Math.max(2, 7 * s), w * 0.92, Math.max(2, 8 * s), 2);
    ctx.fillStyle = '#33363d';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + w * (0.18 + i * 0.25), y - Math.max(1, 4 * s), w * 0.14, Math.max(1, 3 * s));
    }
    ctx.strokeStyle = '#2c2e34';
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y - Math.max(2, 7 * s));
    ctx.lineTo(x + w * 0.5, y - Math.max(4, 13 * s));
    ctx.lineTo(x + w * 0.7, y - Math.max(2, 7 * s));
    ctx.stroke();
    if (moving && Math.random() < 0.15) {
      this.addParticle(x + w / 2, y - 12 * s, '#fff2a8', 'spark');
    } else if (Math.random() < 0.04) {
      this.addParticle(x + w / 2, y - 12 * s, '#cfe8ff', 'spark');
    }

    // Windshield with sky reflection + diagonal shine
    const wy = y + h * 0.13;
    const wh = h * 0.22;
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    ctx.fillRect(x + w * 0.07, wy - 1.5 * s, w * 0.39, wh + 3 * s);
    ctx.fillRect(x + w * 0.54, wy - 1.5 * s, w * 0.39, wh + 3 * s);
    const wg = ctx.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#cdeeff');
    wg.addColorStop(0.45, '#5aa9d6');
    wg.addColorStop(1, '#16324a');
    ctx.fillStyle = wg;
    ctx.fillRect(x + w * 0.09, wy, w * 0.35, wh);
    ctx.fillRect(x + w * 0.56, wy, w * 0.35, wh);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, wy + wh);
    ctx.lineTo(x + w * 0.24, wy);
    ctx.lineTo(x + w * 0.3, wy);
    ctx.lineTo(x + w * 0.2, wy + wh);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.61, wy + wh);
    ctx.lineTo(x + w * 0.71, wy);
    ctx.lineTo(x + w * 0.77, wy);
    ctx.lineTo(x + w * 0.67, wy + wh);
    ctx.closePath();
    ctx.fill();

    // Route-number board on top
    if (s > 0.4) {
      ctx.fillStyle = 'rgba(15,15,20,0.9)';
      this.roundRect(x + w * 0.36, y + h * 0.045, w * 0.28, h * 0.06, 2 * s);
      ctx.fillStyle = '#ffd957';
      ctx.font = `800 ${Math.max(6, 10 * s)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${(Math.abs(hash) % 9) + 1}`, x + w * 0.5, y + h * 0.078);
    }

    // Nose stripes
    ctx.fillStyle = 'rgba(245,245,250,0.9)';
    ctx.fillRect(x, y + h * 0.52, w, Math.max(1, h * 0.055));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + h * 0.575, w, Math.max(1, h * 0.028));

    // Headlights + beams (brighter + longer when moving)
    const beamLen = (moving ? 95 : 64) * s;
    for (const fx of [0.28, 0.72]) {
      const lx = x + w * fx;
      const ly = y + h * 0.74;
      const beam = ctx.createLinearGradient(0, ly, 0, ly + beamLen);
      beam.addColorStop(0, moving ? 'rgba(255,250,200,0.35)' : 'rgba(255,250,200,0.22)');
      beam.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx - 4 * s, ly);
      ctx.lineTo(lx + 4 * s, ly);
      ctx.lineTo(lx + 15 * s, ly + beamLen);
      ctx.lineTo(lx - 15 * s, ly + beamLen);
      ctx.closePath();
      ctx.fill();
      // Housing + lamp
      ctx.fillStyle = '#15151f';
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1.5, 5.2 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#fff7ae';
      ctx.shadowBlur = (moving ? 22 : 14) * s;
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1, 3.6 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Alternating ditch lights on moving trains
    if (moving && s > 0.35) {
      const phase = Math.sin(this.frameCount * 0.5) > 0;
      for (let i = 0; i < 2; i++) {
        const on = (i === 0) === phase;
        const dx = x + w * (i === 0 ? 0.12 : 0.88);
        const dy = y + h * 0.6;
        ctx.save();
        ctx.shadowColor = on ? '#ff9d0a' : '#442200';
        ctx.shadowBlur = on ? 12 * s : 0;
        ctx.fillStyle = on ? '#ffcf4d' : '#6b4a12';
        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(1.2, 3 * s), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Grill + coupler + bumper
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + w * 0.15 + i * w * 0.18, y + h * 0.84, w * 0.12, Math.max(1, h * 0.05));
    }
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(x + w * 0.44, y + h - Math.max(1, 4 * s), w * 0.12, Math.max(2, 6 * s));
    ctx.fillStyle = '#4a4d55';
    this.roundRect(x - 2 * s, y + h - Math.max(2, 7 * s), w + 4 * s, Math.max(2, 7 * s), 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - 2 * s, y + h - Math.max(2, 7 * s), w + 4 * s, 1);

    // Grime kicking up the lower panels
    const grime = ctx.createLinearGradient(0, y + h * 0.7, 0, y + h);
    grime.addColorStop(0, 'rgba(25,20,15,0)');
    grime.addColorStop(1, 'rgba(25,20,15,0.4)');
    ctx.fillStyle = grime;
    ctx.fillRect(x, y + h * 0.7, w, h * 0.3);

    // Graffiti tag scrawled on the nose
    if (s > 0.5) {
      const tags = ['ZOOM', 'RAILZ', 'VOLT', 'DASH'];
      const tagCols = ['#ff2d78', '#00e5ff', '#b6ff2e', '#ffea00'];
      const tag = tags[Math.abs(hash) % tags.length];
      ctx.save();
      ctx.translate(x + w / 2, y + h * 0.66);
      ctx.rotate(-0.07);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = tagCols[Math.abs(hash >> 3) % tagCols.length];
      ctx.font = `italic 900 ${Math.max(7, 12 * s)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, 0, 0);
      ctx.restore();
    }

    // Undercarriage: skirt, bogies, wheels on the rails
    if (s > 0.4) {
      ctx.fillStyle = '#17181d';
      ctx.fillRect(x + w * 0.06, y + h - Math.max(2, 6 * s), w * 0.88, Math.max(2, 6 * s));
      for (const bx of [0.2, 0.68]) {
        const bogX = x + w * bx;
        const bogY = y + h - Math.max(1, 3 * s);
        ctx.fillStyle = '#23252b';
        this.roundRect(bogX, bogY, w * 0.16, Math.max(2, 7 * s), 2 * s);
        ctx.fillStyle = '#0e0f12';
        for (const wx of [0.02, 0.1]) {
          ctx.beginPath();
          ctx.arc(bogX + w * wx, bogY + Math.max(2, 7 * s), Math.max(1.5, 4.5 * s), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#3a3e45';
        for (const wx of [0.02, 0.1]) {
          ctx.beginPath();
          ctx.arc(bogX + w * wx, bogY + Math.max(2, 7 * s), Math.max(0.8, 1.8 * s), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Lighten (>1) or darken (<1) a hex color
  private shade(hex: string, factor: number): string {
    if (!hex.startsWith('#') || hex.length < 7) return hex;
    const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor)));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor)));
    return `rgb(${r}, ${g}, ${b})`;
  }

  private drawBarrier(x: number, y: number, w: number, h: number, s: number) {
    const ctx = this.ctx;
    // Far: bold silhouette + beacon
    if (s < 0.3) {
      ctx.fillStyle = '#c96a00';
      ctx.fillRect(x, y + h * 0.1, w, h * 0.3);
      ctx.fillStyle = '#f4f4f8';
      ctx.fillRect(x + w * 0.2, y + h * 0.1, w * 0.2, h * 0.3);
      ctx.fillRect(x + w * 0.6, y + h * 0.1, w * 0.2, h * 0.3);
      const blink = Math.sin(this.frameCount * 0.25) > 0;
      ctx.fillStyle = blink ? '#ffcf4d' : '#6b4a12';
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y, Math.max(1.5, 4 * s), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // A-frame legs with crossbar (galvanized gray)
    ctx.fillStyle = 'rgba(15,15,20,0.9)';
    const legW = Math.max(2, 6 * s);
    ctx.fillRect(x + 1 * s, y + h * 0.22, legW + 2, h * 0.78 + 5 * s);
    ctx.fillRect(x + w - legW - 3 * s, y + h * 0.22, legW + 2, h * 0.78 + 5 * s);
    ctx.fillStyle = '#8b9096';
    ctx.fillRect(x + 2 * s, y + h * 0.25, legW, h * 0.75 + 4 * s);
    ctx.fillRect(x + w - legW - 2 * s, y + h * 0.25, legW, h * 0.75 + 4 * s);
    // Crossbar between legs
    ctx.fillStyle = '#6e7378';
    ctx.fillRect(x + 2 * s, y + h * 0.62, w - 4 * s, Math.max(1.5, 4 * s));
    // Rubber feet
    ctx.fillStyle = '#33363b';
    this.roundRect(x - 5 * s, y + h + 1, 18 * s, 4.5 * s, 2);
    this.roundRect(x + w - 13 * s, y + h + 1, 18 * s, 4.5 * s, 2);

    // Chevron board: white with RED chevrons pointing UP (jump over!)
    const boardY = y + h * 0.1;
    const boardH = h * 0.34;
    ctx.fillStyle = 'rgba(15,15,20,0.9)';
    this.roundRect(x - 1.5, boardY - 1.5, w + 3, boardH + 3, 3 * s);
    ctx.fillStyle = '#f5f2ea';
    this.roundRect(x, boardY, w, boardH, 2.5 * s);
    // Red chevrons ^
    ctx.fillStyle = '#d63a2f';
    const chevN = 4;
    for (let i = 0; i < chevN; i++) {
      const cxp = x + (w * (i + 0.5)) / chevN;
      const chw = (w / chevN) * 0.34;
      ctx.beginPath();
      ctx.moveTo(cxp - chw, boardY + boardH * 0.72);
      ctx.lineTo(cxp, boardY + boardH * 0.28);
      ctx.lineTo(cxp + chw, boardY + boardH * 0.72);
      ctx.lineTo(cxp + chw * 0.45, boardY + boardH * 0.72);
      ctx.lineTo(cxp, boardY + boardH * 0.42);
      ctx.lineTo(cxp - chw * 0.45, boardY + boardH * 0.72);
      ctx.closePath();
      ctx.fill();
    }
    // Gloss + shade
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(x + 2, boardY + 1, w - 4, Math.max(1, 2 * s));
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x + 2, boardY + boardH - Math.max(1.5, 3 * s), w - 4, Math.max(1.5, 3 * s));

    // Small daylight reflectors (no heavy glow)
    const phaseA = Math.sin(this.frameCount * 0.25) > 0;
    const beacons = [
      { bx: x + w * 0.18, on: phaseA },
      { bx: x + w * 0.82, on: !phaseA },
    ];
    for (const b of beacons) {
      ctx.fillStyle = '#5b6067';
      ctx.fillRect(b.bx - 2 * s, y, 4 * s, 7 * s); // stem
      ctx.save();
      ctx.shadowColor = b.on ? '#ff9d0a' : '#442200';
      ctx.shadowBlur = b.on ? 7 * s : 0;
      // Dome housing
      ctx.fillStyle = '#2c2c36';
      ctx.beginPath();
      ctx.arc(b.bx, y - 3 * s, Math.max(2, 5.5 * s), Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = b.on ? '#ffd34d' : '#6b4a12';
      ctx.beginPath();
      ctx.arc(b.bx, y - 3 * s, Math.max(1.5, 4 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawCone(x: number, y: number, w: number, h: number, s: number) {
    const ctx = this.ctx;
    // Far: crisp triangle + band
    if (s < 0.3) {
      ctx.fillStyle = '#e8640c';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w * 0.85, y + h);
      ctx.lineTo(x + w * 0.15, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2f2f7';
      ctx.fillRect(x + w * 0.3, y + h * 0.42, w * 0.4, Math.max(1, h * 0.14));
      return;
    }

    // Wide rubber base
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    this.roundRect(x + w * 0.02, y + h - Math.max(2, 6 * s), w * 0.96, Math.max(2, 6 * s), 2 * s);
    ctx.fillStyle = '#2b2b36';
    this.roundRect(x + w * 0.05, y + h - Math.max(2, 5 * s), w * 0.9, Math.max(2, 5 * s), 2 * s);
    // Cone body with outline + side shading
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y - 1);
    ctx.lineTo(x + w * 0.85, y + h - 4 * s);
    ctx.lineTo(x + w * 0.15, y + h - 4 * s);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#8a2e00');
    g.addColorStop(0.35, '#ff7a1a');
    g.addColorStop(0.55, '#ffa45e');
    g.addColorStop(1, '#7a2800');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 1);
    ctx.lineTo(x + w * 0.82, y + h - 4 * s);
    ctx.lineTo(x + w * 0.18, y + h - 4 * s);
    ctx.closePath();
    ctx.fill();
    // Left-edge highlight (cylinder sheen)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.44, y + h * 0.08);
    ctx.lineTo(x + w * 0.4, y + h * 0.85);
    ctx.lineTo(x + w * 0.35, y + h * 0.85);
    ctx.lineTo(x + w * 0.4, y + h * 0.08);
    ctx.closePath();
    ctx.fill();
    // Reflective band with outline (glows at dusk)
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    ctx.fillRect(x + w * 0.3, y + h * 0.4, w * 0.4, h * 0.17);
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 9 * s;
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, '#b9bcc9');
    bg.addColorStop(0.5, '#ffffff');
    bg.addColorStop(1, '#b9bcc9');
    ctx.fillStyle = bg;
    ctx.fillRect(x + w * 0.315, y + h * 0.415, w * 0.37, h * 0.14);
    ctx.restore();
    // Rounded tip
    ctx.fillStyle = '#ffb37a';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 2 * s, Math.max(1.2, 3 * s), 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTallBarrier(x: number, y: number, w: number, h: number, s: number) {
    const ctx = this.ctx;
    // Far: poles + beam + curtain blocks
    if (s < 0.3) {
      ctx.fillStyle = '#5b6067';
      ctx.fillRect(x, y, Math.max(1.5, 5 * s), h);
      ctx.fillRect(x + w - Math.max(1.5, 5 * s), y, Math.max(1.5, 5 * s), h);
      ctx.fillStyle = '#e8a90c';
      ctx.fillRect(x - 3 * s, y, w + 6 * s, h * 0.2);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#e8a90c' : '#22252a';
        ctx.fillRect(x + (i * w) / 5, y + h * 0.2, w / 5 + 1, h * 0.28);
      }
      return;
    }

    // Galvanized steel side poles with bolt plates
    const poleW = Math.max(2.5, 8 * s);
    ctx.fillStyle = 'rgba(15,15,20,0.9)';
    ctx.fillRect(x - 3 * s, y - 1, poleW + 2, h + 2);
    ctx.fillRect(x + w - poleW - 1 * s, y - 1, poleW + 2, h + 2);
    const pg = ctx.createLinearGradient(x, 0, x + poleW, 0);
    pg.addColorStop(0, '#43474d');
    pg.addColorStop(0.5, '#7c848d');
    pg.addColorStop(1, '#3a3e45');
    ctx.fillStyle = pg;
    ctx.fillRect(x - 2 * s, y, poleW, h);
    const pg2 = ctx.createLinearGradient(0, 0, poleW, 0);
    pg2.addColorStop(0, '#3a3e45');
    pg2.addColorStop(0.5, '#7c848d');
    pg2.addColorStop(1, '#43474d');
    ctx.fillStyle = pg2;
    ctx.fillRect(x + w - poleW + 2 * s, y, poleW, h);
    // Safety-yellow edge stripes
    ctx.fillStyle = '#e8c90c';
    ctx.fillRect(x - 2 * s, y, Math.max(1, 2 * s), h);
    ctx.fillRect(x + w - poleW + 2 * s, y, Math.max(1, 2 * s), h);
    // Bolt plates
    ctx.fillStyle = '#2f3339';
    for (const py of [0.3, 0.6, 0.9]) {
      ctx.fillRect(x - 2 * s, y + h * py, poleW, Math.max(1.5, 4 * s));
      ctx.fillRect(x + w - poleW + 2 * s, y + h * py, poleW, Math.max(1.5, 4 * s));
    }

    // Industrial yellow beam with hazard edge
    const beamH = h * 0.24;
    ctx.fillStyle = 'rgba(15,15,20,0.9)';
    this.roundRect(x - 5 * s - 1, y - 1, w + 10 * s + 2, beamH + 2, 4 * s);
    const bg = ctx.createLinearGradient(0, y, 0, y + beamH);
    bg.addColorStop(0, '#f2c018');
    bg.addColorStop(0.5, '#dd9d08');
    bg.addColorStop(1, '#a86e04');
    ctx.fillStyle = bg;
    this.roundRect(x - 4 * s, y, w + 8 * s, beamH, 3 * s);
    // Hazard chevrons along beam bottom
    const hzH = Math.max(2, 5 * s);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffd34d' : '#15151f';
      const hx = x - 4 * s + (i * (w + 8 * s)) / 10;
      ctx.beginPath();
      ctx.moveTo(hx, y + beamH - hzH);
      ctx.lineTo(hx + 6 * s, y + beamH - hzH);
      ctx.lineTo(hx + 3 * s, y + beamH);
      ctx.lineTo(hx - 3 * s, y + beamH);
      ctx.closePath();
      ctx.fill();
    }
    // Truss bolts
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + (w * (i + 0.5)) / 6, y + beamH * 0.32, Math.max(0.8, 1.6 * s), 0, Math.PI * 2);
      ctx.fill();
    }

    // Hanging striped rubber flaps (slide under!)
    const curY = y + beamH;
    const curH = h * 0.3;
    const flaps = 5;
    for (let i = 0; i < flaps; i++) {
      const fx = x + (i * w) / flaps;
      const fw = w / flaps;
      ctx.fillStyle = 'rgba(15,15,20,0.9)';
      ctx.fillRect(fx - 1, curY - 1, fw + 2, curH + 3);
      const fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
      fg.addColorStop(0, i % 2 === 0 ? '#8a5f04' : '#1d1f24');
      fg.addColorStop(0.5, i % 2 === 0 ? '#e8a90c' : '#3a3e45');
      fg.addColorStop(1, i % 2 === 0 ? '#6e4a03' : '#14161a');
      ctx.fillStyle = fg;
      ctx.fillRect(fx, curY, fw - Math.max(1, 2.5 * s), curH);
      // Flap bottom notch
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(fx, curY + curH - Math.max(1.5, 3 * s), fw - Math.max(1, 2.5 * s), Math.max(1.5, 3 * s));
    }

    // Sign with down arrow
    const pulse = 0.7 + Math.sin(this.frameCount * 0.15) * 0.3;
    ctx.save();
    ctx.shadowColor = '#2f9e00';
    ctx.shadowBlur = 7 * s;
    ctx.fillStyle = 'rgba(10,30,10,0.92)';
    const signW = w * 0.66;
    const signH = Math.max(9, 14 * s);
    const signX = x + w * 0.17;
    const signY = y + beamH * 0.14;
    this.roundRect(signX, signY, signW, signH, 3 * s);
    ctx.strokeStyle = `rgba(118,255,3,${(pulse * 0.8).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = `rgba(150,255,80,${pulse.toFixed(2)})`;
    ctx.font = `800 ${Math.max(6, 9 * s)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ SLIDE ▼', x + w / 2, signY + signH / 2 + 0.5);
    ctx.restore();

    // Safe-gap glow under the flaps
    const gapPulse = 0.08 + Math.sin(this.frameCount * 0.15) * 0.03;
    ctx.fillStyle = `rgba(0,255,150,${gapPulse.toFixed(3)})`;
    ctx.fillRect(x, y + h * 0.72, w, h * 0.06);
    ctx.fillStyle = 'rgba(0,255,150,0.20)';
    ctx.fillRect(x, y + h * 0.72, w, 1);
  }

  // Spray cans (+50) and magnets (coin power-up) — glowing, bobbing, spinning
  private drawPickup(pickup: Pickup, speed: number) {
    if (pickup.z < -60 || pickup.z > MAX_Z) return;
    const ctx = this.ctx;
    const laneX = getLaneX(pickup.lane);
    const proj = project3D(laneX, pickup.z);
    if (proj.scale <= 0.06) return;
    const fadeIn = emergenceFade(pickup.z, speed);
    if (fadeIn <= 0.01) return;
    const s = proj.scale;
    const floatY = Math.sin(this.frameCount * 0.09 + pickup.floatOffset) * 6 * s;
    const cx = proj.x;
    const cy = proj.y - 34 * s + floatY;

    ctx.save();
    ctx.globalAlpha = fadeIn;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y + 3, 10 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pickup.kind === 'spray') {
      const w = 15 * s;
      const h = 24 * s;
      const x = cx - w / 2;
      const y = cy - h / 2;
      ctx.save();
      ctx.shadowColor = '#ff2d78';
      ctx.shadowBlur = 16 * s;
      // Can body
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#a31247');
      g.addColorStop(0.5, '#ff2d78');
      g.addColorStop(1, '#7a0c34');
      ctx.fillStyle = g;
      this.roundRect(x, y + 4 * s, w, h - 4 * s, 3 * s);
      // Label band with star
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 1 * s, y + h * 0.42, w - 2 * s, h * 0.3);
      ctx.fillStyle = '#ff2d78';
      this.star(cx, y + h * 0.57, 4 * s, 5);
      // Metal cap + nozzle
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#c9ced6';
      this.roundRect(x + w * 0.14, y, w * 0.72, 6 * s, 2 * s);
      ctx.fillStyle = '#7c848d';
      ctx.fillRect(cx - 1.5 * s, y - 2.5 * s, 3 * s, 3 * s);
      // Gloss stripe
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 2 * s, y + 6 * s, 2.5 * s, h - 10 * s);
      ctx.restore();
      // Twinkling spray sparkles
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const a = this.frameCount * 0.1 + pickup.floatOffset + (i * Math.PI * 2) / 3;
        const sx = cx + Math.cos(a) * 16 * s;
        const sy = cy + Math.sin(a) * 14 * s;
        const r = Math.max(0.8, 2 * s * (0.6 + 0.4 * Math.sin(a * 2)));
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Horseshoe magnet power-up
      const r = 11 * s;
      ctx.save();
      ctx.shadowColor = '#ff2d78';
      ctx.shadowBlur = 16 * s;
      ctx.strokeStyle = '#e03028';
      ctx.lineWidth = Math.max(2, 7 * s);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.92, Math.PI * 2.08);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Silver tips
      ctx.fillStyle = '#e8ecf2';
      ctx.fillRect(cx - r - 3.5 * s, cy - 1 * s, 7 * s, 7 * s);
      ctx.fillRect(cx + r - 3.5 * s, cy - 1 * s, 7 * s, 7 * s);
      // Bolts of attraction
      ctx.strokeStyle = '#ffe95a';
      ctx.lineWidth = Math.max(1, 1.8 * s);
      const zig = Math.sin(this.frameCount * 0.2 + pickup.floatOffset) * 3 * s;
      for (const ex of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + ex * r * 0.9, cy + 8 * s + zig);
        ctx.lineTo(cx + ex * r * 0.5, cy + 13 * s + zig);
        ctx.lineTo(cx + ex * r * 0.9, cy + 18 * s + zig);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Little 5-point star helper (tags, labels, bursts)
  private star(cx: number, cy: number, r: number, points: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = (i * Math.PI) / points - Math.PI / 2;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawCoin(coin: Coin, speed: number) {
    if (coin.z < -60 || coin.z > MAX_Z) return;
    const ctx = this.ctx;
    const laneX = getLaneX(coin.lane);
    const proj = project3D(laneX, coin.z);
    if (proj.scale <= 0.06) return;
    const fadeIn = emergenceFade(coin.z, speed);
    if (fadeIn <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = fadeIn;
    const s = proj.scale;
    const baseR = Math.max(1.5, 9 * s);
    const floatY = Math.sin(this.frameCount * 0.09 + coin.floatOffset) * 6 * s;
    const cx = proj.x;
    const cy = proj.y - 30 * s + floatY;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y + 3, baseR, baseR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spin: horizontal squash
    const spin = Math.abs(Math.cos(this.frameCount * 0.12 + coin.floatOffset));
    const rx = Math.max(1.2, baseR * (0.25 + spin * 0.75));

    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 14 * s;
    const g = ctx.createLinearGradient(cx - rx, cy - baseR, cx + rx, cy + baseR);
    g.addColorStop(0, '#fff9c4');
    g.addColorStop(0.45, '#ffd700');
    g.addColorStop(1, '#c77800');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, baseR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Inner ring + glint
    ctx.strokeStyle = 'rgba(180,100,0,0.8)';
    ctx.lineWidth = Math.max(0.6, 1.2 * s);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.62, baseR * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, cy - baseR * 0.35, Math.max(0.6, rx * 0.16), Math.max(0.8, baseR * 0.22), -0.5, 0, Math.PI * 2);
    ctx.fill();

    if (s > 0.35) {
      ctx.fillStyle = '#a85f00';
      ctx.font = `800 ${Math.max(6, 11 * s)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.25, rx / baseR), 1);
      ctx.fillText('$', 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  // ================= SPEED FX =================

  private drawGroundStreaks(speed: number, speedNorm: number) {
    if (speed < 5.5) return;
    const ctx = this.ctx;
    const n = 4 + Math.floor(speedNorm * 8);
    for (let i = 0; i < n; i++) {
      const y = GROUND_Y - 40 + Math.random() * 90;
      const t = (y - VANISH_Y) / (GROUND_Y - VANISH_Y);
      const x = Math.random() * CANVAS_WIDTH;
      const len = (30 + Math.random() * 90) * (0.5 + speedNorm);
      ctx.strokeStyle = `rgba(255,255,255,${(0.04 + speedNorm * 0.10).toFixed(3)})`;
      ctx.lineWidth = 1 + t * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (x - VANISH_X) * 0.08, y + len * 0.25);
      ctx.stroke();
    }
  }

  private drawSpeedLines(speed: number, speedNorm: number) {
    if (speed < 6) return;
    const ctx = this.ctx;
    const count = Math.floor(3 + speedNorm * 10);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const edge = i % 2 === 0 ? 0 : 1;
      const x = edge === 0 ? Math.random() * 90 : CANVAS_WIDTH - Math.random() * 90;
      const y = 240 + Math.random() * 220;
      const len = 40 + Math.random() * 110 * (0.5 + speedNorm);
      const grad = ctx.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${(0.28 + speedNorm * 0.35).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (VANISH_X - x) * 0.03, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawColorGrade(speedNorm: number) {
    const ctx = this.ctx;
    // Warm daylight grade: sunny top, golden ground glow at speed
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, 'rgba(255,250,230,0.06)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(255,190,90,${(0.04 + speedNorm * 0.06).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private drawVignette() {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(
      VANISH_X, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.35,
      VANISH_X, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.8
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(20, 30, 45, 0.26)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // ================= PARTICLES =================

  addParticle(x: number, y: number, color: string, type: 'dust' | 'spark' | 'coin' | 'crash' | 'smoke' = 'dust') {
    let count = type === 'coin' ? 5 : type === 'crash' ? 8 : type === 'smoke' ? 4 : 2;
    if (this.lowPower) count = Math.max(1, Math.floor(count / 2));
    for (let i = 0; i < count; i++) {
      const speedMul = type === 'spark' ? 2 : 1;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 22,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 3.2 * speedMul,
        vy: -Math.random() * 3.4 - 0.6,
        life: 1,
        decay: type === 'smoke' ? 0.015 + Math.random() * 0.015 : 0.025 + Math.random() * 0.035,
        size: type === 'coin' ? 2.5 + Math.random() * 2.5 : type === 'smoke' ? 6 + Math.random() * 8 : 1.6 + Math.random() * 2.4,
        color,
        kind: type,
      });
    }
    if (this.particles.length > 400) {
      this.particles.splice(0, this.particles.length - 400);
    }
  }

  private burst(x: number, y: number, color: string, n: number, kind: Particle['kind']) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 24,
        vx: (Math.random() - 0.5) * 7,
        vy: -Math.random() * 6 - 1,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * (kind === 'crash' ? 5 : 3),
        color: kind === 'crash' && Math.random() < 0.4 ? '#ffd34d' : color,
        kind,
      });
    }
  }

  private updateAndDrawFloaters() {
    const ctx = this.ctx;
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const f of this.floaters) {
      f.y += f.vy;
      f.vy *= 0.97;
      f.life -= 0.022;
      if (f.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = 'italic 900 17px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(15,15,20,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  private updateAndDrawParticles() {
    const ctx = this.ctx;
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.kind === 'smoke' ? -0.02 : 0.09;
      p.vx *= 0.985;
      p.life -= p.decay;
      if (p.life <= 0) continue;
      const r = Math.max(0.1, p.size * p.life);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * (p.kind === 'smoke' ? 0.4 : 1)));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ================= HELPERS =================

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    ctx.fill();
  }

  private darkenColor(hex: string, factor: number): string {
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: string;
  kind: 'dust' | 'spark' | 'coin' | 'crash' | 'smoke';
}
