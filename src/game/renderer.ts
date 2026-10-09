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
  train: { icon: '🚆', color: '#ff5147', hint: 'DODGE!' },
  barrier: { icon: '🚧', color: '#ffb300', hint: 'JUMP!' },
  cone: { icon: '🔻', color: '#ff7a1a', hint: 'JUMP!' },
  tall_barrier: { icon: '⬇', color: '#76ff03', hint: 'SLIDE!' },
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
  const palette = ['#141430', '#181838', '#101024', '#1d1040'];
  const signs = ['#00e5ff', '#ff2d78', '#ffb300', '#7c4dff', '#76ff03'];
  for (let i = 0; i < 9; i++) {
    buildings.push({
      x: 8 + i * 52,
      width: 42 + Math.random() * 22,
      height: 120 + Math.random() * 210,
      color: palette[Math.floor(Math.random() * palette.length)],
      windowColor: `hsl(${190 + Math.random() * 80}, 70%, ${55 + Math.random() * 25}%)`,
      signColor: signs[Math.floor(Math.random() * signs.length)],
      signY: 20 + Math.random() * 60,
    });
  }
  for (let i = 0; i < 9; i++) {
    buildings.push({
      x: CANVAS_WIDTH - 60 - i * 52,
      width: 42 + Math.random() * 22,
      height: 120 + Math.random() * 210,
      color: palette[Math.floor(Math.random() * palette.length)],
      windowColor: `hsl(${190 + Math.random() * 80}, 70%, ${55 + Math.random() * 25}%)`,
      signColor: signs[Math.floor(Math.random() * signs.length)],
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

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private frameCount: number = 0;
  private particles: Particle[] = [];
  private starField: Star[] = [];
  private clouds: CloudDef[] = [];
  private skyline: SkylineBlock[] = [];
  private smoothX: number = VANISH_X;
  private ghostX: Map<string, number> = new Map();
  private lastCoins: number = 0;
  private wasAlive: boolean = true;
  private trauma: number = 0;
  private flash: number = 0;
  private flashColor: string = '255,255,255';

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.initStarField();
    this.initClouds();
    this.initSkyline();
    generateBuildings();
    this.smoothX = getLaneX(1);
  }

  private initStarField() {
    for (let i = 0; i < 70; i++) {
      this.starField.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * 150,
        size: Math.random() * 1.8 + 0.4,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.04,
      });
    }
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

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Camera: micro shake grows with speed + trauma shake on crash
    this.trauma = Math.max(0, this.trauma - 0.03);
    const shakeBase = speedNorm * 1.6;
    const shakeTrauma = this.trauma * this.trauma * 14;
    const shX = (Math.random() - 0.5) * (shakeBase + shakeTrauma);
    const shY = (Math.random() - 0.5) * (shakeBase * 0.7 + shakeTrauma);

    ctx.save();
    ctx.translate(shX, shY);

    // Slight speed zoom (FOV kick)
    const zoom = 1 + speedNorm * 0.025;
    ctx.translate(VANISH_X, CANVAS_HEIGHT * 0.55);
    ctx.scale(zoom, zoom);
    ctx.translate(-VANISH_X, -CANVAS_HEIGHT * 0.55);

    this.drawSky(state.distance);
    this.drawStars();
    this.drawSun();
    this.drawClouds(state.distance, speedNorm);
    this.drawSkyline(state.distance);
    this.drawSideBuildings(state.distance, speedNorm);
    this.drawRoad(state.distance, state.speed, speedNorm);
    this.drawStreetLamps(state.distance);
    this.drawWarnings(state.obstacles);

    // Coins far -> near
    const sortedCoins = [...state.coins].sort((a, b) => b.z - a.z);
    for (const coin of sortedCoins) {
      if (!coin.collected) this.drawCoin(coin, state.speed);
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
  }

  // ================= SKY / CITY =================

  private drawSky(distance: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 60);
    g.addColorStop(0, '#030310');
    g.addColorStop(0.45, '#150a33');
    g.addColorStop(0.72, '#3a1157');
    g.addColorStop(0.86, '#7a1c5e');
    g.addColorStop(1, '#1a1030');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, CANVAS_WIDTH + 40, GROUND_Y + 80);

    // Horizon neon glow band
    const pulse = 0.55 + Math.sin(this.frameCount * 0.02) * 0.08;
    const hg = ctx.createRadialGradient(
      VANISH_X, VANISH_Y, 10,
      VANISH_X, VANISH_Y, 320
    );
    hg.addColorStop(0, `rgba(255,45,120,${0.35 * pulse + 0.2})`);
    hg.addColorStop(0.4, `rgba(124,77,255,${0.18 * pulse})`);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y + 20);

    // Lower ground base
    const gg = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
    gg.addColorStop(0, '#171722');
    gg.addColorStop(1, '#080810');
    ctx.fillStyle = gg;
    ctx.fillRect(-20, GROUND_Y, CANVAS_WIDTH + 40, CANVAS_HEIGHT - GROUND_Y + 20);
  }

  private drawStars() {
    const ctx = this.ctx;
    for (const s of this.starField) {
      s.twinkle += s.speed;
      const a = 0.25 + Math.abs(Math.sin(s.twinkle)) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  private drawSun() {
    const ctx = this.ctx;
    const cx = VANISH_X;
    const cy = 168;
    const r = 78;
    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.2);
    glow.addColorStop(0, 'rgba(255,80,140,0.35)');
    glow.addColorStop(1, 'rgba(255,80,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Sun disc
    const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, '#ffe95a');
    sg.addColorStop(0.55, '#ff9a3c');
    sg.addColorStop(1, '#ff2d78');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Synthwave slits
    ctx.fillStyle = 'rgba(10,5,25,0.9)';
    let y = cy + 6;
    let h = 2;
    while (y < cy + r) {
      ctx.fillRect(cx - r, y, r * 2, h);
      y += h + 9;
      h += 1.6;
    }
    ctx.restore();
  }

  private drawClouds(distance: number, speedNorm: number) {
    const ctx = this.ctx;
    for (const c of this.clouds) {
      c.x -= c.speed + speedNorm * 0.6;
      if (c.x + c.w < -20) {
        c.x = CANVAS_WIDTH + 20;
        c.y = 30 + Math.random() * 120;
      }
      ctx.fillStyle = 'rgba(40,20,70,0.55)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w / 2, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,60,130,0.14)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 8, c.w / 2.4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSkyline(distance: number) {
    const ctx = this.ctx;
    const totalW = this.skyline.reduce((a, b) => a + b.w + b.gap, 0);
    let offset = (distance * 0.06) % totalW;
    const baseY = VANISH_Y + 2;
    ctx.fillStyle = '#0c0a26';
    // Draw two wraps to cover width
    for (let wrap = -1; wrap < 2; wrap++) {
      let x = -offset + wrap * totalW;
      for (const b of this.skyline) {
        const top = baseY - b.h * 0.55;
        ctx.fillRect(x, top, b.w, b.h * 0.55 + 4);
        // Antenna
        if (b.h > 70) {
          ctx.fillRect(x + b.w / 2 - 1, top - 10, 2, 10);
          const blink = Math.sin(this.frameCount * 0.08 + x) > 0.6;
          ctx.fillStyle = blink ? '#ff3355' : '#550f1e';
          ctx.beginPath();
          ctx.arc(x + b.w / 2, top - 11, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0c0a26';
        }
        // Sparse lit windows
        ctx.fillStyle = 'rgba(0,229,255,0.20)';
        for (let wy = top + 6; wy < baseY - 4; wy += 9) {
          for (let wx = x + 4; wx < x + b.w - 4; wx += 8) {
            if ((wx * 7 + wy * 13) % 11 < 2) ctx.fillRect(wx, wy, 2, 3);
          }
        }
        ctx.fillStyle = '#0c0a26';
        x += b.w + b.gap;
      }
    }
  }

  private drawSideBuildings(distance: number, speedNorm: number) {
    const ctx = this.ctx;
    const sway = Math.sin(distance * 0.004) * 2;
    for (const b of buildings) {
      const bx = b.x + sway * (b.x < VANISH_X ? -1 : 1) * 0.4;
      const by = GROUND_Y - b.height;
      // Body with vertical gradient (lit from horizon)
      const bg = ctx.createLinearGradient(0, by, 0, GROUND_Y);
      bg.addColorStop(0, '#0a0a20');
      bg.addColorStop(1, b.color);
      ctx.fillStyle = bg;
      ctx.fillRect(bx - b.width / 2, by, b.width, b.height);
      // Rooftop edge light
      ctx.fillStyle = b.signColor + '55';
      ctx.fillRect(bx - b.width / 2, by, b.width, 2);
      // Windows — staggered, some lit
      const rows = Math.floor(b.height / 22);
      const cols = Math.floor(b.width / 14);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = Math.sin(r * 1.7 + c * 2.3 + distance * 0.002) > -0.1;
          ctx.fillStyle = lit ? b.windowColor : 'rgba(5,5,15,0.9)';
          ctx.globalAlpha = lit ? 0.85 : 1;
          const wx = bx - b.width / 2 + 5 + c * 13;
          const wy = by + 10 + r * 21;
          ctx.fillRect(wx, wy, 7, 11);
        }
      }
      ctx.globalAlpha = 1;
      // Vertical neon sign strip
      ctx.save();
      ctx.shadowColor = b.signColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = b.signColor;
      ctx.globalAlpha = 0.75 + Math.sin(this.frameCount * 0.06 + b.x) * 0.2;
      ctx.fillRect(bx + b.width / 2 - 4, by + b.signY, 3, 46);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Dark side aprons outside road for contrast
    const apronGradL = ctx.createLinearGradient(0, 0, 150, 0);
    apronGradL.addColorStop(0, 'rgba(0,0,0,0.55)');
    apronGradL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = apronGradL;
    ctx.fillRect(0, VANISH_Y, 150, GROUND_Y - VANISH_Y);
    const apronGradR = ctx.createLinearGradient(CANVAS_WIDTH, 0, CANVAS_WIDTH - 150, 0);
    apronGradR.addColorStop(0, 'rgba(0,0,0,0.55)');
    apronGradR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = apronGradR;
    ctx.fillRect(CANVAS_WIDTH - 150, VANISH_Y, 150, GROUND_Y - VANISH_Y);
  }

  // ================= ROAD =================

  private drawRoad(distance: number, speed: number, speedNorm: number) {
    const ctx = this.ctx;
    const roadLeftBottom = VANISH_X - LANE_WIDTH * 1.9;
    const roadRightBottom = VANISH_X + LANE_WIDTH * 1.9;
    const roadHalfTop = 22;

    // Asphalt body
    const rg = ctx.createLinearGradient(0, VANISH_Y, 0, GROUND_Y);
    rg.addColorStop(0, '#1c1c2e');
    rg.addColorStop(0.5, '#232333');
    rg.addColorStop(1, '#2b2b3d');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(VANISH_X - roadHalfTop, VANISH_Y);
    ctx.lineTo(roadLeftBottom, GROUND_Y);
    ctx.lineTo(roadRightBottom, GROUND_Y);
    ctx.lineTo(VANISH_X + roadHalfTop, VANISH_Y);
    ctx.closePath();
    ctx.fill();

    // Wet center sheen (magenta/cyan reflection)
    const sheen = ctx.createLinearGradient(VANISH_X - 60, 0, VANISH_X + 60, 0);
    sheen.addColorStop(0, 'rgba(0,229,255,0)');
    sheen.addColorStop(0.5, `rgba(255,45,120,${0.05 + speedNorm * 0.05})`);
    sheen.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.moveTo(VANISH_X - 10, VANISH_Y);
    ctx.lineTo(VANISH_X - 70, GROUND_Y);
    ctx.lineTo(VANISH_X + 70, GROUND_Y);
    ctx.lineTo(VANISH_X + 10, VANISH_Y);
    ctx.closePath();
    ctx.fill();

    // Neon edge rails — glow + core
    const edges: Array<[number, number, number, number, string]> = [
      [VANISH_X - roadHalfTop, VANISH_Y, roadLeftBottom, GROUND_Y, '#00e5ff'],
      [VANISH_X + roadHalfTop, VANISH_Y, roadRightBottom, GROUND_Y, '#ff2d78'],
    ];
    for (const [x1, y1, x2, y2, col] of edges) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // Lane dividers — fast moving neon dashes
    for (let i = 0; i < 2; i++) {
      const t = (i + 1) / 3;
      const xTop = VANISH_X - roadHalfTop + roadHalfTop * 2 * t;
      const xBot = roadLeftBottom + (roadRightBottom - roadLeftBottom) * t;
      ctx.save();
      ctx.strokeStyle = i === 0 ? 'rgba(0,229,255,0.75)' : 'rgba(255,45,120,0.75)';
      ctx.shadowColor = i === 0 ? '#00e5ff' : '#ff2d78';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([18, 22]);
      ctx.lineDashOffset = -((distance * 3.2) % 40);
      ctx.beginPath();
      ctx.moveTo(xTop, VANISH_Y + 4);
      ctx.lineTo(xBot, GROUND_Y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);

    // Asphalt speed streaks rushing toward camera
    const streaks = 16;
    const flow = (distance * 0.004) % 1;
    for (let i = 0; i < streaks; i++) {
      const tt = ((i / streaks) + flow) % 1;
      const y = VANISH_Y + (GROUND_Y - VANISH_Y) * tt * tt;
      const halfW = ((roadRightBottom - roadLeftBottom) / 2) * tt;
      const alpha = 0.04 + tt * (0.10 + speedNorm * 0.12);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      const wob = ((i * 137) % 90) / 90 - 0.5; // pseudo-random lateral
      const cx = VANISH_X + wob * halfW * 1.2;
      ctx.fillRect(cx - halfW * 0.5, y, halfW, Math.max(1, 2.5 * tt));
    }
  }

  private drawStreetLamps(distance: number) {
    const ctx = this.ctx;
    const spacing = 240;
    const count = 9;
    const baseIndex = Math.floor(distance / spacing);
    for (let k = 0; k < count; k++) {
      const worldD = (baseIndex + k) * spacing;
      const z = worldD - distance + 60;
      if (z < 0 || z > MAX_Z) continue;
      for (const side of [-1, 1] as const) {
        const groundX = VANISH_X + side * (LANE_WIDTH * 2.6);
        const proj = project3D(groundX, z);
        const s = proj.scale;
        if (s < 0.08) continue;
        const poleH = 130 * s;
        const poleX = proj.x;
        const baseY = proj.y;
        // Pole
        ctx.strokeStyle = '#2a2a3d';
        ctx.lineWidth = Math.max(1, 5 * s);
        ctx.beginPath();
        ctx.moveTo(poleX, baseY);
        ctx.lineTo(poleX, baseY - poleH);
        ctx.stroke();
        // Arm toward road
        ctx.strokeStyle = '#2a2a3d';
        ctx.lineWidth = Math.max(1, 3 * s);
        ctx.beginPath();
        ctx.moveTo(poleX, baseY - poleH);
        ctx.lineTo(poleX - side * 26 * s, baseY - poleH);
        ctx.stroke();
        // Lamp head glow
        const lampX = poleX - side * 26 * s;
        const lampY = baseY - poleH;
        const col = side < 0 ? '#00e5ff' : '#ff9a3c';
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 18 * s;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(lampX, lampY, Math.max(1, 4.5 * s), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Light cone onto road
        const coneGrad = ctx.createLinearGradient(0, lampY, 0, baseY);
        coneGrad.addColorStop(0, side < 0 ? 'rgba(0,229,255,0.16)' : 'rgba(255,154,60,0.16)');
        coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(lampX - 4 * s, lampY);
        ctx.lineTo(lampX + 4 * s, lampY);
        ctx.lineTo(lampX + side * 30 * s + 22 * s, baseY);
        ctx.lineTo(lampX + side * 30 * s - 22 * s, baseY);
        ctx.closePath();
        ctx.fill();
        // Ground light pool
        ctx.fillStyle = side < 0 ? 'rgba(0,229,255,0.10)' : 'rgba(255,154,60,0.10)';
        ctx.beginPath();
        ctx.ellipse(lampX + side * 30 * s, baseY, 26 * s, 5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

    // Shadow (shrinks when jumping)
    const airH = Math.max(0, GROUND_Y - PLAYER_HEIGHT - player.y);
    const shScale = Math.max(0.4, 1 - airH / 260);
    ctx.fillStyle = `rgba(0,0,0,${(0.5 * shScale).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(this.smoothX, GROUND_Y + 6, width * 0.62 * shScale, 7 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    // Neon ground glow
    ctx.fillStyle = player.color + '33';
    ctx.beginPath();
    ctx.ellipse(this.smoothX, GROUND_Y + 4, width * 0.9, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Speed afterimage trail
    if (speedNorm > 0.15 && player.state === 'running') {
      ctx.save();
      ctx.globalAlpha = 0.14 + speedNorm * 0.12;
      ctx.fillStyle = player.color;
      this.roundRect(drawX - 8 * speedNorm, drawY + bob + 6, width, height, 6);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 22;
    this.drawRunner(drawX, drawY + bob, width, height, player.color, lean, player.state);
    ctx.restore();

    // Run dust / slide sparks
    if (player.state === 'running' && this.frameCount % 2 === 0) {
      this.addParticle(this.smoothX + (Math.random() - 0.5) * 18, GROUND_Y - 2, 'rgba(160,160,180,0.8)', 'dust');
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
    // Eye (determined, facing forward-right)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(hx + 3.4, hy - 0.5, 2.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101018';
    ctx.beginPath();
    ctx.arc(hx + 4.2, hy - 0.3, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Brow
    ctx.strokeStyle = 'rgba(20,10,10,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, hy - 4.4);
    ctx.lineTo(hx + 6, hy - 3.6);
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
    ctx.shadowBlur = 14;
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

    // Ground shadow + neon pool
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y + 3 * s, w * 0.55, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = obstacle.color;
    ctx.shadowBlur = 10 * s;

    switch (obstacle.type) {
      case 'train':
        this.drawTrain(drawX, drawY, w, h, s);
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
      ctx.fillStyle = `rgba(20,8,40,${fog.toFixed(2)})`;
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
      ctx.shadowBlur = urgent ? 16 : 9;
      ctx.fillStyle = 'rgba(6,6,18,0.85)';
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

  private drawTrain(x: number, y: number, w: number, h: number, s: number) {
    const ctx = this.ctx;
    // Far away: clean silhouette so it reads instantly, no noise
    if (s < 0.3) {
      ctx.fillStyle = '#8f1a14';
      this.roundRect(x, y, w, h, Math.max(1, 4 * s));
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

    // Body — metallic crimson with dark outline
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    this.roundRect(x - 1, y - 1, w + 2, h + 2, Math.max(1, 6 * s));
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#7a1210');
    g.addColorStop(0.22, '#d63a2f');
    g.addColorStop(0.5, '#ff6a5a');
    g.addColorStop(0.78, '#b02318');
    g.addColorStop(1, '#5d0d0b');
    ctx.fillStyle = g;
    this.roundRect(x, y, w, h, Math.max(1, 5 * s));

    // Roof + pantograph
    ctx.fillStyle = '#23232e';
    this.roundRect(x + w * 0.04, y - Math.max(2, 7 * s), w * 0.92, Math.max(2, 8 * s), 2);
    ctx.strokeStyle = '#3d3d4d';
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y - Math.max(2, 7 * s));
    ctx.lineTo(x + w * 0.5, y - Math.max(4, 13 * s));
    ctx.lineTo(x + w * 0.7, y - Math.max(2, 7 * s));
    ctx.stroke();
    if (Math.random() < 0.1) {
      this.addParticle(x + w / 2, y - 12 * s, '#9be8ff', 'spark');
    }
    // Roof marker lights
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(x + w * 0.12, y + 1.5 * s, Math.max(1, 2 * s), 0, Math.PI * 2);
    ctx.arc(x + w * 0.88, y + 1.5 * s, Math.max(1, 2 * s), 0, Math.PI * 2);
    ctx.fill();

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

    // Fleet number plate
    if (s > 0.45) {
      ctx.fillStyle = 'rgba(10,10,16,0.85)';
      this.roundRect(x + w * 0.42, y + h * 0.42, w * 0.16, h * 0.07, 2 * s);
      ctx.fillStyle = '#ffd957';
      ctx.font = `800 ${Math.max(6, 10 * s)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('07', x + w * 0.5, y + h * 0.458);
    }

    // Nose stripes
    ctx.fillStyle = 'rgba(255,221,87,0.9)';
    ctx.fillRect(x, y + h * 0.52, w, Math.max(1, h * 0.055));
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y + h * 0.575, w, Math.max(1, h * 0.028));

    // Headlights + beams
    for (const fx of [0.28, 0.72]) {
      const lx = x + w * fx;
      const ly = y + h * 0.74;
      const beam = ctx.createLinearGradient(0, ly, 0, ly + 64 * s);
      beam.addColorStop(0, 'rgba(255,250,200,0.22)');
      beam.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx - 4 * s, ly);
      ctx.lineTo(lx + 4 * s, ly);
      ctx.lineTo(lx + 15 * s, ly + 64 * s);
      ctx.lineTo(lx - 15 * s, ly + 64 * s);
      ctx.closePath();
      ctx.fill();
      // Housing + lamp
      ctx.fillStyle = '#15151f';
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1.5, 5.2 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#fff7ae';
      ctx.shadowBlur = 16 * s;
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1, 3.6 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Grill + bumper
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + w * 0.15 + i * w * 0.18, y + h * 0.84, w * 0.12, Math.max(1, h * 0.05));
    }
    ctx.fillStyle = '#43434f';
    this.roundRect(x - 2 * s, y + h - Math.max(2, 7 * s), w + 4 * s, Math.max(2, 7 * s), 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - 2 * s, y + h - Math.max(2, 7 * s), w + 4 * s, 1);
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

    // A-frame legs with crossbar
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    const legW = Math.max(2, 6 * s);
    ctx.fillRect(x + 1 * s, y + h * 0.22, legW + 2, h * 0.78 + 5 * s);
    ctx.fillRect(x + w - legW - 3 * s, y + h * 0.22, legW + 2, h * 0.78 + 5 * s);
    ctx.fillStyle = '#4a4a5c';
    ctx.fillRect(x + 2 * s, y + h * 0.25, legW, h * 0.75 + 4 * s);
    ctx.fillRect(x + w - legW - 2 * s, y + h * 0.25, legW, h * 0.75 + 4 * s);
    // Crossbar between legs
    ctx.fillStyle = '#33333f';
    ctx.fillRect(x + 2 * s, y + h * 0.62, w - 4 * s, Math.max(1.5, 4 * s));
    // Rubber feet
    ctx.fillStyle = '#1c1c24';
    this.roundRect(x - 5 * s, y + h + 1, 18 * s, 4.5 * s, 2);
    this.roundRect(x + w - 13 * s, y + h + 1, 18 * s, 4.5 * s, 2);

    // Chevron board: orange with white chevrons pointing UP (jump over)
    const boardY = y + h * 0.1;
    const boardH = h * 0.34;
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    this.roundRect(x - 1.5, boardY - 1.5, w + 3, boardH + 3, 3 * s);
    ctx.fillStyle = '#ff9d0a';
    this.roundRect(x, boardY, w, boardH, 2.5 * s);
    // White chevrons ^
    ctx.fillStyle = '#f6f6fb';
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

    // Alternating blinking beacons
    const phaseA = Math.sin(this.frameCount * 0.25) > 0;
    const beacons = [
      { bx: x + w * 0.18, on: phaseA },
      { bx: x + w * 0.82, on: !phaseA },
    ];
    for (const b of beacons) {
      ctx.fillStyle = '#1c1c24';
      ctx.fillRect(b.bx - 2 * s, y, 4 * s, 7 * s); // stem
      ctx.save();
      ctx.shadowColor = b.on ? '#ffb300' : '#442200';
      ctx.shadowBlur = b.on ? 15 * s : 0;
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
      ctx.fillStyle = '#3a2a55';
      ctx.fillRect(x, y, Math.max(1.5, 5 * s), h);
      ctx.fillRect(x + w - Math.max(1.5, 5 * s), y, Math.max(1.5, 5 * s), h);
      ctx.fillStyle = '#5b3fa8';
      ctx.fillRect(x - 3 * s, y, w + 6 * s, h * 0.2);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ff2d78' : '#1a1a2e';
        ctx.fillRect(x + (i * w) / 5, y + h * 0.2, w / 5 + 1, h * 0.28);
      }
      return;
    }

    // Steel side poles with bolt plates + neon trim
    const poleW = Math.max(2.5, 8 * s);
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    ctx.fillRect(x - 3 * s, y - 1, poleW + 2, h + 2);
    ctx.fillRect(x + w - poleW - 1 * s, y - 1, poleW + 2, h + 2);
    const pg = ctx.createLinearGradient(x, 0, x + poleW, 0);
    pg.addColorStop(0, '#241a3d');
    pg.addColorStop(0.5, '#4b3670');
    pg.addColorStop(1, '#1c1430');
    ctx.fillStyle = pg;
    ctx.fillRect(x - 2 * s, y, poleW, h);
    const pg2 = ctx.createLinearGradient(0, 0, poleW, 0);
    pg2.addColorStop(0, '#1c1430');
    pg2.addColorStop(0.5, '#4b3670');
    pg2.addColorStop(1, '#241a3d');
    ctx.fillStyle = pg2;
    ctx.fillRect(x + w - poleW + 2 * s, y, poleW, h);
    // Neon trim lines
    ctx.fillStyle = '#b388ff';
    ctx.fillRect(x - 2 * s, y, Math.max(1, 2 * s), h);
    ctx.fillRect(x + w - poleW + 2 * s, y, Math.max(1, 2 * s), h);
    // Bolt plates
    ctx.fillStyle = '#171226';
    for (const py of [0.3, 0.6, 0.9]) {
      ctx.fillRect(x - 2 * s, y + h * py, poleW, Math.max(1.5, 4 * s));
      ctx.fillRect(x + w - poleW + 2 * s, y + h * py, poleW, Math.max(1.5, 4 * s));
    }

    // Truss beam with hazard edge
    const beamH = h * 0.24;
    ctx.fillStyle = 'rgba(8,5,10,0.9)';
    this.roundRect(x - 5 * s - 1, y - 1, w + 10 * s + 2, beamH + 2, 4 * s);
    const bg = ctx.createLinearGradient(0, y, 0, y + beamH);
    bg.addColorStop(0, '#6a4fc0');
    bg.addColorStop(0.5, '#4a3486');
    bg.addColorStop(1, '#2b1e52');
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

    // Hanging rubber flaps with gaps (slide under!)
    const curY = y + beamH;
    const curH = h * 0.3;
    const flaps = 5;
    for (let i = 0; i < flaps; i++) {
      const fx = x + (i * w) / flaps;
      const fw = w / flaps;
      ctx.fillStyle = 'rgba(8,5,10,0.9)';
      ctx.fillRect(fx - 1, curY - 1, fw + 2, curH + 3);
      const fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
      fg.addColorStop(0, i % 2 === 0 ? '#a31247' : '#121222');
      fg.addColorStop(0.5, i % 2 === 0 ? '#ff2d78' : '#26263a');
      fg.addColorStop(1, i % 2 === 0 ? '#7a0c34' : '#0c0c16');
      ctx.fillStyle = fg;
      ctx.fillRect(fx, curY, fw - Math.max(1, 2.5 * s), curH);
      // Flap bottom notch
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(fx, curY + curH - Math.max(1.5, 3 * s), fw - Math.max(1, 2.5 * s), Math.max(1.5, 3 * s));
    }

    // Sign with down arrow
    const pulse = 0.7 + Math.sin(this.frameCount * 0.15) * 0.3;
    ctx.save();
    ctx.shadowColor = '#76ff03';
    ctx.shadowBlur = 11 * s;
    ctx.fillStyle = 'rgba(8,28,8,0.92)';
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
      grad.addColorStop(0, 'rgba(0,229,255,0)');
      grad.addColorStop(0.5, `rgba(160,220,255,${(0.10 + speedNorm * 0.22).toFixed(3)})`);
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
    // Subtle top cool / bottom warm grade + speed warmth
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, 'rgba(0,180,255,0.04)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(255,45,120,${(0.03 + speedNorm * 0.05).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private drawVignette() {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(
      VANISH_X, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.32,
      VANISH_X, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.78
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(2, 2, 10, 0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // ================= PARTICLES =================

  addParticle(x: number, y: number, color: string, type: 'dust' | 'spark' | 'coin' | 'crash' | 'smoke' = 'dust') {
    const count = type === 'coin' ? 5 : type === 'crash' ? 8 : type === 'smoke' ? 4 : 2;
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

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  speed: number;
}
