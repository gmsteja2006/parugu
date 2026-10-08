// ============================================
// Game Renderer — Canvas 2D pseudo-3D rendering
// ============================================

import {
  type GameState,
  type PlayerData,
  type Obstacle,
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
  OBSTACLE_DEFS,
} from './types';
import { getLaneX } from './engine';

const ROAD_COLOR = '#2d2d3d';
const ROAD_LINE_COLOR = '#4a4a5e';
const SKY_GRADIENT_TOP = '#0a0a1a';
const SKY_GRADIENT_BOTTOM = '#1a1a3e';
const GROUND_COLOR = '#1e1e2e';
const BUILDING_COLORS = ['#15152a', '#1a1a35', '#121225', '#1d1d3a'];

interface BuildingDef {
  x: number;
  width: number;
  height: number;
  color: string;
  windowColor: string;
}

let buildings: BuildingDef[] = [];
let buildingsGenerated = false;

function generateBuildings() {
  if (buildingsGenerated) return;
  buildings = [];
  // Left side buildings
  for (let i = 0; i < 8; i++) {
    buildings.push({
      x: 20 + i * 55,
      width: 45 + Math.random() * 20,
      height: 100 + Math.random() * 200,
      color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
      windowColor: `hsl(${200 + Math.random() * 60}, 60%, ${50 + Math.random() * 30}%)`,
    });
  }
  // Right side buildings
  for (let i = 0; i < 8; i++) {
    buildings.push({
      x: CANVAS_WIDTH - 60 - i * 55,
      width: 45 + Math.random() * 20,
      height: 100 + Math.random() * 200,
      color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
      windowColor: `hsl(${200 + Math.random() * 60}, 60%, ${50 + Math.random() * 30}%)`,
    });
  }
  buildingsGenerated = true;
}

// Perspective projection helpers
function project3D(laneX: number, z: number): { x: number; y: number; scale: number } {
  const vanishY = 200; // vanishing point Y
  const vanishX = CANVAS_WIDTH / 2;
  const maxZ = 800;
  const t = Math.max(0, Math.min(1, z / maxZ));

  const x = vanishX + (laneX - vanishX) * (1 - t * 0.85);
  const y = vanishY + (GROUND_Y - vanishY) * (1 - t * 0.85);
  const scale = 1 - t * 0.85;

  return { x, y, scale };
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private frameCount: number = 0;
  private particles: Particle[] = [];
  private starField: Star[] = [];

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.initStarField();
    generateBuildings();
  }

  private initStarField() {
    for (let i = 0; i < 60; i++) {
      this.starField.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * 200,
        size: Math.random() * 2 + 0.5,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03,
      });
    }
  }

  render(state: GameState, otherPlayers: RoomPlayer[] = []) {
    this.frameCount++;
    const ctx = this.ctx;

    // Clear
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw sky
    this.drawSky();

    // Draw stars
    this.drawStars();

    // Draw buildings (background)
    this.drawBuildings(state.distance);

    // Draw road
    this.drawRoad(state.distance);

    // Draw coins (sorted by z, far to near)
    const sortedCoins = [...state.coins].sort((a, b) => b.z - a.z);
    for (const coin of sortedCoins) {
      if (!coin.collected) {
        this.drawCoin(coin);
      }
    }

    // Draw obstacles (sorted by z, far to near)
    const sortedObstacles = [...state.obstacles].sort((a, b) => b.z - a.z);
    for (const obstacle of sortedObstacles) {
      this.drawObstacle(obstacle);
    }

    // Draw other players (ghosts)
    for (const other of otherPlayers) {
      if (other.isAlive) {
        this.drawGhostPlayer(other);
      }
    }

    // Draw player
    if (state.player.isAlive) {
      this.drawPlayer(state.player);
    }

    // Draw particles
    this.updateAndDrawParticles();

    // Draw speed lines
    this.drawSpeedLines(state.speed);

    // Vignette
    this.drawVignette();
  }

  private drawSky() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    gradient.addColorStop(0, SKY_GRADIENT_TOP);
    gradient.addColorStop(1, SKY_GRADIENT_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);

    // Ground below road
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  }

  private drawStars() {
    const ctx = this.ctx;
    for (const star of this.starField) {
      star.twinkle += star.speed;
      const alpha = 0.3 + Math.sin(star.twinkle) * 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBuildings(distance: number) {
    const ctx = this.ctx;
    const scrollOffset = (distance * 0.3) % 60;

    for (const bld of buildings) {
      const bx = bld.x;
      const by = GROUND_Y - bld.height;

      // Building body
      ctx.fillStyle = bld.color;
      ctx.fillRect(bx - bld.width / 2, by, bld.width, bld.height);

      // Windows
      const windowRows = Math.floor(bld.height / 25);
      const windowCols = Math.floor(bld.width / 15);
      for (let r = 0; r < windowRows; r++) {
        for (let c = 0; c < windowCols; c++) {
          const lit = Math.sin((r + c + distance * 0.001) * 2.5) > 0;
          ctx.fillStyle = lit ? bld.windowColor : '#0a0a15';
          const wx = bx - bld.width / 2 + 5 + c * 14;
          const wy = by + 8 + r * 24;
          ctx.fillRect(wx, wy, 8, 12);
        }
      }
    }
  }

  private drawRoad(distance: number) {
    const ctx = this.ctx;
    const vanishX = CANVAS_WIDTH / 2;
    const vanishY = 200;
    const roadLeftBottom = CANVAS_WIDTH / 2 - LANE_WIDTH * 1.8;
    const roadRightBottom = CANVAS_WIDTH / 2 + LANE_WIDTH * 1.8;

    // Road shape (trapezoid going to vanishing point)
    ctx.fillStyle = ROAD_COLOR;
    ctx.beginPath();
    ctx.moveTo(vanishX - 20, vanishY);
    ctx.lineTo(roadLeftBottom, GROUND_Y);
    ctx.lineTo(roadRightBottom, GROUND_Y);
    ctx.lineTo(vanishX + 20, vanishY);
    ctx.closePath();
    ctx.fill();

    // Road edges glow
    ctx.strokeStyle = '#6c63ff44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vanishX - 20, vanishY);
    ctx.lineTo(roadLeftBottom, GROUND_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vanishX + 20, vanishY);
    ctx.lineTo(roadRightBottom, GROUND_Y);
    ctx.stroke();

    // Lane dividers
    for (let i = 0; i < 2; i++) {
      const laneXBottom = roadLeftBottom + (roadRightBottom - roadLeftBottom) * ((i + 1) / 3);
      const laneXTop = vanishX - 20 + (40) * ((i + 1) / 3);

      ctx.strokeStyle = ROAD_LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([15, 20]);
      ctx.lineDashOffset = -(distance * 3) % 35;
      ctx.beginPath();
      ctx.moveTo(laneXTop, vanishY);
      ctx.lineTo(laneXBottom, GROUND_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Scrolling road marks
    const markCount = 15;
    for (let i = 0; i < markCount; i++) {
      const t = ((i / markCount) + (distance * 0.003) % (1 / markCount)) % 1;
      const y = vanishY + (GROUND_Y - vanishY) * t;
      const scale = t;
      const halfW = (roadRightBottom - roadLeftBottom) / 2 * scale;
      const cx = vanishX;

      ctx.fillStyle = `rgba(74, 74, 94, ${0.1 + scale * 0.15})`;
      ctx.fillRect(cx - halfW, y, halfW * 2, 1);
    }
  }

  private drawPlayer(player: PlayerData) {
    const ctx = this.ctx;
    const laneX = getLaneX(player.lane);
    const proj = project3D(laneX, 0);

    const isSliding = player.state === 'sliding';
    const height = isSliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT;
    const width = PLAYER_WIDTH;

    const drawX = proj.x - width / 2;
    const drawY = isSliding ? GROUND_Y - PLAYER_SLIDE_HEIGHT : player.y;

    // Player glow
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 20;

    // Player body
    const gradient = ctx.createLinearGradient(drawX, drawY, drawX, drawY + height);
    gradient.addColorStop(0, player.color);
    gradient.addColorStop(1, this.darkenColor(player.color, 0.5));

    ctx.fillStyle = gradient;

    if (isSliding) {
      // Sliding: draw as a flat rectangle
      this.roundRect(drawX - 5, drawY, width + 10, height, 5);
    } else {
      // Running/jumping: draw character shape
      this.drawCharacter(drawX, drawY, width, height, player.color);
    }

    ctx.shadowBlur = 0;

    // Running animation particles
    if (player.state === 'running' && this.frameCount % 3 === 0) {
      this.addParticle(proj.x, GROUND_Y, player.color, 'dust');
    }
  }

  private drawCharacter(x: number, y: number, w: number, h: number, color: string) {
    const ctx = this.ctx;
    const cx = x + w / 2;
    const runCycle = Math.sin(this.frameCount * 0.3);

    // Head
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, y + 10, 10, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyGrad = ctx.createLinearGradient(x, y + 15, x, y + h - 15);
    bodyGrad.addColorStop(0, color);
    bodyGrad.addColorStop(1, this.darkenColor(color, 0.6));
    ctx.fillStyle = bodyGrad;
    this.roundRect(x + 5, y + 18, w - 10, h - 35, 4);

    // Legs (animated)
    ctx.fillStyle = this.darkenColor(color, 0.4);
    ctx.fillRect(cx - 8, y + h - 20, 6, 18 + runCycle * 4);
    ctx.fillRect(cx + 2, y + h - 20, 6, 18 - runCycle * 4);

    // Arms
    ctx.fillRect(x, y + 22 + runCycle * 3, 6, 15);
    ctx.fillRect(x + w - 6, y + 22 - runCycle * 3, 6, 15);

    // Visor / eye shine
    ctx.fillStyle = '#ffffff88';
    ctx.fillRect(cx - 5, y + 6, 10, 4);
  }

  private drawGhostPlayer(player: RoomPlayer) {
    const ctx = this.ctx;
    const laneX = getLaneX(player.lane);
    const proj = project3D(laneX, 0);

    const isSliding = player.state === 'sliding';
    const height = isSliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT;
    const width = PLAYER_WIDTH;

    const drawX = proj.x - width / 2;
    const drawY = isSliding ? GROUND_Y - PLAYER_SLIDE_HEIGHT : player.y;

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = player.color;

    if (isSliding) {
      this.roundRect(drawX - 5, drawY, width + 10, height, 5);
    } else {
      this.drawCharacter(drawX, drawY, width, height, player.color);
    }

    // Name tag
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, proj.x, drawY - 8);

    ctx.globalAlpha = 1;
  }

  private drawObstacle(obstacle: Obstacle) {
    if (obstacle.z < -50 || obstacle.z > 800) return;

    const ctx = this.ctx;
    const laneX = getLaneX(obstacle.lane);
    const proj = project3D(laneX, obstacle.z);

    if (proj.scale <= 0.05) return;

    const w = obstacle.width * proj.scale;
    const h = obstacle.height * proj.scale;
    const drawX = proj.x - w / 2;
    const drawY = proj.y - h;

    ctx.shadowColor = obstacle.color;
    ctx.shadowBlur = 8 * proj.scale;

    switch (obstacle.type) {
      case 'train':
        this.drawTrain(drawX, drawY, w, h, proj.scale);
        break;
      case 'barrier':
        this.drawBarrier(drawX, drawY, w, h, obstacle.color, proj.scale);
        break;
      case 'cone':
        this.drawCone(drawX, drawY, w, h, proj.scale);
        break;
      case 'tall_barrier':
        this.drawTallBarrier(drawX, drawY, w, h, proj.scale);
        break;
    }

    ctx.shadowBlur = 0;
  }

  private drawTrain(x: number, y: number, w: number, h: number, scale: number) {
    const ctx = this.ctx;

    // Train body
    const trainGrad = ctx.createLinearGradient(x, y, x, y + h);
    trainGrad.addColorStop(0, '#ff3b30');
    trainGrad.addColorStop(0.5, '#cc2f26');
    trainGrad.addColorStop(1, '#991f1a');
    ctx.fillStyle = trainGrad;
    this.roundRect(x, y, w, h, 4 * scale);

    // Windows
    ctx.fillStyle = '#87ceeb55';
    const windowH = h * 0.2;
    const windowY = y + h * 0.15;
    ctx.fillRect(x + w * 0.1, windowY, w * 0.35, windowH);
    ctx.fillRect(x + w * 0.55, windowY, w * 0.35, windowH);

    // Stripe
    ctx.fillStyle = '#ffdd5766';
    ctx.fillRect(x, y + h * 0.5, w, h * 0.08);

    // Light
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.75, Math.max(0.5, 3 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBarrier(x: number, y: number, w: number, h: number, color: string, scale: number) {
    const ctx = this.ctx;

    // Barrier stripes
    const stripeCount = 4;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#f39c12' : '#2c3e50';
      ctx.fillRect(x + (i * w) / stripeCount, y, w / stripeCount, h);
    }

    // Posts
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(x, y, 3 * scale, h + 5 * scale);
    ctx.fillRect(x + w - 3 * scale, y, 3 * scale, h + 5 * scale);
  }

  private drawCone(x: number, y: number, w: number, h: number, scale: number) {
    const ctx = this.ctx;

    // Cone body
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.lineTo(x + w * 0.2, y + h);
    ctx.closePath();
    ctx.fill();

    // White stripe
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(x + w * 0.3, y + h * 0.4, w * 0.4, h * 0.15);

    // Base
    ctx.fillStyle = '#d35400';
    ctx.fillRect(x + w * 0.1, y + h - 3 * scale, w * 0.8, 3 * scale);
  }

  private drawTallBarrier(x: number, y: number, w: number, h: number, scale: number) {
    const ctx = this.ctx;

    // Tall barrier (can slide under)
    const barGrad = ctx.createLinearGradient(x, y, x, y + h);
    barGrad.addColorStop(0, '#9b59b6');
    barGrad.addColorStop(1, '#6c3483');
    ctx.fillStyle = barGrad;
    this.roundRect(x, y, w, h * 0.4, 3 * scale);

    // Support poles
    ctx.fillStyle = '#7d3c98';
    ctx.fillRect(x + 2 * scale, y + h * 0.4, 4 * scale, h * 0.6);
    ctx.fillRect(x + w - 6 * scale, y + h * 0.4, 4 * scale, h * 0.6);

    // Gap indicator (slide under)
    ctx.fillStyle = '#00ff8833';
    ctx.fillRect(x, y + h * 0.7, w, h * 0.05);
  }

  private drawCoin(coin: Coin) {
    if (coin.z < -50 || coin.z > 800) return;

    const ctx = this.ctx;
    const laneX = getLaneX(coin.lane);
    const proj = project3D(laneX, coin.z);

    if (proj.scale <= 0.05) return;

    const radius = Math.max(1, 8 * proj.scale);
    const floatY = Math.sin(this.frameCount * 0.08 + coin.floatOffset) * 5 * proj.scale;
    const cx = proj.x;
    const cy = proj.y - 25 * proj.scale + floatY;

    // Outer glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12 * proj.scale;

    // Coin body
    const coinGrad = ctx.createRadialGradient(cx - 2 * proj.scale, cy - 2 * proj.scale, 0, cx, cy, radius);
    coinGrad.addColorStop(0, '#fff176');
    coinGrad.addColorStop(0.6, '#ffd700');
    coinGrad.addColorStop(1, '#ff8f00');
    ctx.fillStyle = coinGrad;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle
    ctx.strokeStyle = '#ff8f0088';
    ctx.lineWidth = 1 * proj.scale;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // $ symbol
    if (proj.scale > 0.3) {
      ctx.fillStyle = '#ff8f00';
      ctx.font = `${Math.max(6, 10 * proj.scale)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', cx, cy + 1);
    }

    ctx.shadowBlur = 0;
  }

  private drawSpeedLines(speed: number) {
    if (speed < 5) return;
    const ctx = this.ctx;
    const intensity = (speed - 5) / (12 - 5);
    const count = Math.floor(intensity * 8);

    for (let i = 0; i < count; i++) {
      const x = Math.random() * CANVAS_WIDTH;
      const y = 250 + Math.random() * (GROUND_Y - 250);
      const len = 20 + Math.random() * 40;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + intensity * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }
  }

  private drawVignette() {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.8
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // ============================================
  // Particle System
  // ============================================

  addParticle(x: number, y: number, color: string, type: 'dust' | 'spark' | 'coin') {
    const count = type === 'coin' ? 5 : 2;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 5,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3 - 1,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: type === 'coin' ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
        color,
      });
    }
  }

  private updateAndDrawParticles() {
    const ctx = this.ctx;
    this.particles = this.particles.filter(p => p.life > 0);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= p.decay;

      const radius = p.size * p.life;
      if (radius <= 0 || p.life <= 0) continue;

      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============================================
  // Helpers
  // ============================================

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  private darkenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
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
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  speed: number;
}
