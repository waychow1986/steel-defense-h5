import { CONFIG } from '../game/config';
import { tankCenter } from '../game/tanks';
import type { Dir, EnemyType, GameState, PowerUp, Tank } from '../game/types';
import { PALETTE } from './palette';
import { TerrainLayer } from './terrain-layer';

const ANGLE: Record<Dir, number> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

const ENEMY_COLORS: Record<EnemyType, [string, string, string]> = {
  normal: [PALETTE.enemyNormal, PALETTE.enemyNormalLight, PALETTE.enemyNormalDark],
  fast: [PALETTE.enemyFast, PALETTE.enemyFastLight, PALETTE.enemyFastDark],
  heavy: [PALETTE.enemyHeavy, PALETTE.enemyHeavyLight, PALETTE.enemyHeavyDark],
};

/** Hull width, turret radius and barrel width per tank type (fractions of the tank side / tiles). */
const SHAPE: Record<Tank['type'], { hull: number; turret: number; barrel: number }> = {
  player: { hull: 0.6, turret: 0.2, barrel: 0.1 },
  normal: { hull: 0.6, turret: 0.2, barrel: 0.1 },
  fast: { hull: 0.44, turret: 0.15, barrel: 0.07 },
  heavy: { hull: 0.7, turret: 0.25, barrel: 0.15 },
};

/** Draws the battlefield on a square canvas (TD-005): terrain layer, base, tanks, bullets. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly terrain: TerrainLayer;
  private cssSize = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.terrain = new TerrainLayer(canvas.ownerDocument);
  }

  /** Sets the CSS side length and backing store size (CSS × min(DPR, 2)). */
  resize(cssSize: number, devicePixelRatio: number): void {
    const size = Math.max(0, Math.floor(cssSize));
    const dpr = Math.min(Math.max(1, devicePixelRatio || 1), CONFIG.maxDpr);
    if (size === this.cssSize && dpr === this.dpr) return;
    this.cssSize = size;
    this.dpr = dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.terrain.invalidate();
  }

  terrainChanged(): void {
    this.terrain.invalidate();
  }

  render(state: GameState | null): void {
    const ctx = this.ctx;
    const px = this.canvas.width;
    if (!ctx || px === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, px, px);
    if (!state) return;
    ctx.drawImage(this.terrain.ensure(state.map, px), 0, 0);
    const t = px / CONFIG.cols;
    ctx.setTransform(t, 0, 0, t, 0, 0);
    this.drawBase(ctx, state);
    for (const u of state.powerUps) this.drawPowerUp(ctx, u);
    if (state.player) {
      this.drawTank(ctx, state.player, PALETTE.player, PALETTE.playerLight, PALETTE.playerDark);
      if (state.player.shieldMs > 0) this.drawShield(ctx, state.player);
    }
    for (const e of state.enemies) {
      const [body, light, dark] = ENEMY_COLORS[e.type as EnemyType];
      this.drawTank(ctx, e, body, light, dark);
      if (e.carrier) this.drawCarrierRing(ctx, e, state.timeMs);
    }
    ctx.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      const h = CONFIG.bulletSize / 2;
      ctx.fillRect(b.x - h * 0.6, b.y - h * 0.6, h * 1.2, h * 1.2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Shield: star-shaped badge in blue; firepower: badge with a red upward arrow. */
  private drawPowerUp(ctx: CanvasRenderingContext2D, u: PowerUp): void {
    ctx.fillStyle = PALETTE.outline;
    ctx.fillRect(u.x + 0.1, u.y + 0.1, 0.8, 0.8);
    ctx.fillStyle = PALETTE.powerUpCard;
    ctx.fillRect(u.x + 0.14, u.y + 0.14, 0.72, 0.72);
    const cx = u.x + 0.5;
    const cy = u.y + 0.5;
    ctx.beginPath();
    if (u.type === 'shield') {
      ctx.fillStyle = PALETTE.powerUpShield;
      ctx.moveTo(cx, cy - 0.28);
      ctx.lineTo(cx + 0.24, cy - 0.18);
      ctx.lineTo(cx + 0.2, cy + 0.1);
      ctx.lineTo(cx, cy + 0.3);
      ctx.lineTo(cx - 0.2, cy + 0.1);
      ctx.lineTo(cx - 0.24, cy - 0.18);
    } else {
      ctx.fillStyle = PALETTE.powerUpFire;
      ctx.moveTo(cx, cy - 0.3);
      ctx.lineTo(cx + 0.24, cy);
      ctx.lineTo(cx + 0.09, cy);
      ctx.lineTo(cx + 0.09, cy + 0.28);
      ctx.lineTo(cx - 0.09, cy + 0.28);
      ctx.lineTo(cx - 0.09, cy);
      ctx.lineTo(cx - 0.24, cy);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawShield(ctx: CanvasRenderingContext2D, tank: Tank): void {
    const { x, y } = tankCenter(tank);
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.tankSize * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.shieldFill;
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
  }

  /** TD-020: a gold dashed ring rotating around a carrier (continuous rotation, no blinking). */
  private drawCarrierRing(ctx: CanvasRenderingContext2D, tank: Tank, timeMs: number): void {
    const { x, y } = tankCenter(tank);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((timeMs / 1000) * Math.PI);
    ctx.setLineDash([0.18, 0.12]);
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = PALETTE.carrierRing;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.tankSize * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBase(ctx: CanvasRenderingContext2D, state: GameState): void {
    const { x, y, destroyed } = state.base;
    ctx.fillStyle = destroyed ? PALETTE.baseDestroyed : PALETTE.baseDark;
    ctx.fillRect(x + 0.08, y + 0.08, 0.84, 0.84);
    if (destroyed) return;
    ctx.fillStyle = PALETTE.base;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + 0.18);
    ctx.lineTo(x + 0.82, y + 0.5);
    ctx.lineTo(x + 0.5, y + 0.82);
    ctx.lineTo(x + 0.18, y + 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private drawTank(ctx: CanvasRenderingContext2D, tank: Tank, body: string, light: string, dark: string): void {
    const s = CONFIG.tankSize;
    const cx = tank.x + s / 2;
    const cy = tank.y + s / 2;
    ctx.save();
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(tank.x + 0.06, tank.y + 0.06, s, s);
    ctx.translate(cx, cy);
    ctx.rotate(ANGLE[tank.dir]);
    const recoil = tank.recoilMs > 0 ? 0.05 : 0;
    ctx.translate(0, recoil);
    const h = s / 2;
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = PALETTE.outline;
    // Treads with a moving phase.
    ctx.fillStyle = dark;
    ctx.fillRect(-h, -h, s * 0.24, s);
    ctx.fillRect(h - s * 0.24, -h, s * 0.24, s);
    ctx.fillStyle = PALETTE.outline;
    for (let i = 0; i < 4; i++) {
      const ty = -h + ((i + tank.treadPhase / CONFIG.treadPhases) % 4) * (s / 4);
      ctx.fillRect(-h, ty, s * 0.24, 0.03);
      ctx.fillRect(h - s * 0.24, ty, s * 0.24, 0.03);
    }
    ctx.strokeRect(-h, -h, s, s);
    // Hull, lit from the top-left.
    const shape = SHAPE[tank.type];
    const hx = -(s * shape.hull) / 2;
    ctx.fillStyle = body;
    ctx.fillRect(hx, -h + s * 0.12, s * shape.hull, s * 0.76);
    ctx.fillStyle = light;
    ctx.fillRect(hx, -h + s * 0.12, s * shape.hull, s * 0.12);
    ctx.strokeRect(hx, -h + s * 0.12, s * shape.hull, s * 0.76);
    if (tank.type === 'heavy') {
      // Armour plates across the hull.
      ctx.fillStyle = dark;
      ctx.fillRect(hx, h - s * 0.3, s * shape.hull, s * 0.08);
      ctx.fillRect(hx, -h + s * 0.3, s * shape.hull, s * 0.08);
    }
    if (tank.type === 'fast') {
      // Swept fins at the rear.
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(hx, h - s * 0.12);
      ctx.lineTo(0, h - s * 0.32);
      ctx.lineTo(-hx, h - s * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    // Turret and barrel.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0.04, s * shape.turret, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const bw = shape.barrel;
    ctx.fillStyle = dark;
    ctx.fillRect(-bw / 2, -h - 0.02, bw, h);
    ctx.strokeRect(-bw / 2, -h - 0.02, bw, h);
    ctx.restore();
  }
}
