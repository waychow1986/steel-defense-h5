import { CONFIG } from '../game/config';
import { tankCenter } from '../game/tanks';
import type { Dir, GameState, Tank } from '../game/types';
import type { Effects } from './effects';
import { PALETTE } from './palette';
import { particleAlpha } from './particles';
import type { QualitySettings } from './quality';
import { SpriteCache, type Sprite } from './sprites/cache';
import { TerrainLayer } from './terrain-layer';

const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Draws the battlefield on a square canvas (TD-005): terrain layer, base, tanks, bullets. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly terrain: TerrainLayer;
  private readonly sprites: SpriteCache;
  private cssSize = 0;
  private dpr = 1;
  private deviceDpr = 1;
  private dprCap: number = CONFIG.maxDpr;
  private shadowBlur = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.terrain = new TerrainLayer(canvas.ownerDocument);
    this.sprites = new SpriteCache(canvas.ownerDocument);
  }

  /** TD-005 adaptive quality: lower the DPR cap and drop soft shadows; sprites are rebuilt. */
  setQuality(q: QualitySettings): void {
    this.dprCap = q.dprCap;
    this.shadowBlur = q.shadowBlur;
    this.resize(this.cssSize, this.deviceDpr);
  }

  /** Sets the CSS side length and backing store size (CSS × min(DPR, quality cap ≤ 2)). */
  resize(cssSize: number, devicePixelRatio: number): void {
    const size = Math.max(0, Math.floor(cssSize));
    this.deviceDpr = devicePixelRatio || 1;
    const dpr = Math.min(Math.max(1, this.deviceDpr), CONFIG.maxDpr, this.dprCap);
    this.sprites.configure((size * dpr) / CONFIG.cols, this.shadowBlur);
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

  /** `curtain` is the fraction (0..1) of the map hidden behind the level-intro curtains. */
  render(state: GameState | null, curtain = 0, effects: Effects | null = null): void {
    const ctx = this.ctx;
    const px = this.canvas.width;
    if (!ctx || px === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, px, px);
    if (!state) return;
    this.drawWorld(ctx, state, px, effects);
    if (curtain > 0) this.drawCurtain(ctx, px, curtain);
  }

  /** Top and bottom curtains meeting in the middle, with a bright edge on each. */
  private drawCurtain(ctx: CanvasRenderingContext2D, px: number, cover: number): void {
    const h = Math.min(1, cover) * (px / 2);
    const edge = Math.max(2, Math.round(px / 160));
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, px, h);
    ctx.fillRect(0, px - h, px, h);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(0, Math.max(0, h - edge), px, Math.min(edge, h));
    ctx.fillRect(0, px - h, px, Math.min(edge, h));
  }

  private drawWorld(ctx: CanvasRenderingContext2D, state: GameState, px: number, effects: Effects | null): void {
    const t = px / CONFIG.cols;
    this.sprites.configure(t, this.shadowBlur);
    const shake = effects?.shakeOffset() ?? { x: 0, y: 0 };
    ctx.drawImage(this.terrain.ensure(state.map, px), shake.x * t, shake.y * t);
    ctx.setTransform(t, 0, 0, t, shake.x * t, shake.y * t);
    this.blit(ctx, this.sprites.base(state.base.destroyed), state.base.x, state.base.y);
    for (const u of state.powerUps) this.blit(ctx, this.sprites.powerUp(u.type), u.x, u.y);
    if (state.player) {
      this.drawTank(ctx, state.player, effects);
      if (state.player.shieldMs > 0) this.drawShield(ctx, state.player);
    }
    for (const e of state.enemies) {
      this.drawTank(ctx, e, effects);
      if (e.carrier) this.drawCarrierRing(ctx, e, state.timeMs);
    }
    if (effects) this.drawTrails(ctx, effects);
    const bullet = this.sprites.bullet();
    for (const b of state.bullets) this.blit(ctx, bullet, b.x, b.y);
    if (effects) {
      for (const m of effects.muzzles) this.blit(ctx, this.sprites.muzzle(m.frame(), m.dir), m.x, m.y);
      this.drawEffects(ctx, effects);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Draws a cached sprite with its anchor at (x, y), tiles. */
  private blit(ctx: CanvasRenderingContext2D, sprite: Sprite | undefined, x: number, y: number, scale = 1): void {
    if (!sprite) return;
    const o = sprite.origin * scale;
    const size = sprite.size * scale;
    ctx.drawImage(sprite.canvas, x - o, y - o, size, size);
  }

  /**
   * Layered tank (FR-033/034): hull with treads at the current phase, barrel pushed back while
   * recoiling, turret on top. A tank that was hit uses its light hit variant for a moment (R7).
   */
  private drawTank(ctx: CanvasRenderingContext2D, tank: Tank, effects: Effects | null): void {
    const { x, y } = tankCenter(tank);
    const hit = (effects?.tankFlash(tank.id) ?? 0) > 0;
    this.blit(ctx, this.sprites.hull(tank.type, tank.dir, tank.treadPhase, hit), x, y);
    const k = Math.min(1, Math.max(0, tank.recoilMs / CONFIG.recoilMs));
    const [dx, dy] = STEP[tank.dir];
    const back = CONFIG.effects.recoil * k;
    this.blit(ctx, this.sprites.barrel(tank.type, tank.dir, hit), x - dx * back, y - dy * back);
    this.blit(ctx, this.sprites.turret(tank.type, tank.dir, hit), x, y);
  }

  /** Fading streak through each bullet's recent positions (FR-034). */
  private drawTrails(ctx: CanvasRenderingContext2D, fx: Effects): void {
    ctx.save();
    ctx.strokeStyle = PALETTE.bulletTrail;
    ctx.lineCap = 'round';
    for (const pts of fx.trails.values()) {
      for (let i = 1; i < pts.length; i++) {
        const k = i / (pts.length - 1);
        ctx.globalAlpha = 0.55 * k;
        ctx.lineWidth = 0.04 + 0.08 * k;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Explosion fire, particles, impact flashes, shield ripples and pickup animations (AC-17). */
  private drawEffects(ctx: CanvasRenderingContext2D, fx: Effects): void {
    ctx.save();
    for (const p of fx.particles) {
      ctx.globalAlpha = particleAlpha(p) * (p.kind === 'smoke' ? 0.55 : 1);
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    // The fire goes over the smoke that spawns at the same point, otherwise the smoke buries it.
    for (const e of fx.explosions) {
      const a = e.fireAlpha();
      if (a <= 0) continue;
      const r = e.fireRadius();
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, PALETTE.fireCore);
      g.addColorStop(0.45, PALETTE.fireMid);
      g.addColorStop(1, PALETTE.fireEdge);
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of fx.bursts) {
      const k = b.ageMs / b.lifeMs;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = PALETTE.impactFlash;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 0.12 + 0.25 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 0.06;
    for (const r of fx.ripples) {
      const k = r.ageMs / r.lifeMs;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = PALETTE.shield;
      ctx.beginPath();
      ctx.arc(r.x, r.y, CONFIG.tankSize * (0.68 + 0.4 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const u of fx.pickups) {
      ctx.globalAlpha = u.alpha();
      ctx.strokeStyle = PALETTE.pickupRing;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.ringRadius(), 0, Math.PI * 2);
      ctx.stroke();
      const sc = u.scale();
      this.blit(ctx, this.sprites.powerUp(u.type), u.x - 0.5 * sc, u.y - 0.5 * sc, sc);
    }
    ctx.restore();
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
}
