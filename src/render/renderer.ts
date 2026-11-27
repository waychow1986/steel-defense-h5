import { CONFIG } from '../game/config';
import type { Dir, GameState, Tank } from '../game/types';
import { PALETTE } from './palette';
import { TerrainLayer } from './terrain-layer';

const ANGLE: Record<Dir, number> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

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
    if (state.player) this.drawTank(ctx, state.player, PALETTE.player, PALETTE.playerLight, PALETTE.playerDark);
    ctx.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      const h = CONFIG.bulletSize / 2;
      ctx.fillRect(b.x - h * 0.6, b.y - h * 0.6, h * 1.2, h * 1.2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    ctx.fillStyle = body;
    ctx.fillRect(-h + s * 0.2, -h + s * 0.12, s * 0.6, s * 0.76);
    ctx.fillStyle = light;
    ctx.fillRect(-h + s * 0.2, -h + s * 0.12, s * 0.6, s * 0.12);
    ctx.strokeRect(-h + s * 0.2, -h + s * 0.12, s * 0.6, s * 0.76);
    // Turret and barrel.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0.04, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.fillRect(-0.05, -h - 0.02, 0.1, h);
    ctx.strokeRect(-0.05, -h - 0.02, 0.1, h);
    ctx.restore();
  }
}
