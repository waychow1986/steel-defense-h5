import { CONFIG } from '../game/config';
import { mulberry32 } from '../game/rng';
import type { Bullet, Dir, GameEvent, PowerUpType } from '../game/types';
import { PALETTE } from './palette';
import { addParticles, MAX_PARTICLES, updateParticles, type Particle } from './particles';

const FX = CONFIG.effects;

const BACK: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};

/** Short-lived circle at an impact point (steel or tank hit). */
export interface Burst {
  x: number;
  y: number;
  ageMs: number;
  lifeMs: number;
}

export interface Explosion {
  x: number;
  y: number;
  base: boolean;
  ageMs: number;
  /** 0..1 glow strength; 0 once the 400 ms fire is over. */
  fireAlpha(): number;
  /** Fire radius in tiles. */
  fireRadius(): number;
}

export interface PickupAnim {
  type: PowerUpType;
  x: number;
  y: number;
  ageMs: number;
  scale(): number;
  alpha(): number;
  ringRadius(): number;
}

/** A muzzle flash: 3 frames over about 80 ms at the point a bullet left the barrel (FR-034). */
export interface MuzzleFlash {
  x: number;
  y: number;
  dir: Dir;
  ageMs: number;
  /** 0, 1 or 2 — brightest first. */
  frame(): number;
}

export interface TrailPoint {
  x: number;
  y: number;
}

export interface EffectCounts {
  particles: number;
  shakeMs: number;
  muzzleFlashes: number;
  hitSparks: number;
  explosions: number;
  pickupAnims: number;
  trails: number;
}

/**
 * Visual effects driven by game events (design “事件 → 音效 → 特效映射”). Pure state with no DOM,
 * advanced by game time so it follows the paused test clock and keeps playing in post-event delays.
 * Uses its own PRNG so effects never disturb the simulation's seeded randomness.
 */
export class Effects {
  readonly particles: Particle[] = [];
  readonly bursts: Burst[] = [];
  readonly ripples: Burst[] = [];
  readonly explosions: Explosion[] = [];
  readonly pickups: PickupAnim[] = [];
  readonly muzzles: MuzzleFlash[] = [];
  /** Recent positions per flying bullet id, oldest first (render-side, never in the simulation). */
  readonly trails = new Map<number, TrailPoint[]>();
  private particleCap: number = MAX_PARTICLES;
  private readonly flashes = new Map<number, number>();
  private shake = { ms: 0, total: 0, amp: 0, angle: 0 };
  private rng: number;

  constructor(seed = 1) {
    this.rng = seed >>> 0;
  }

  private rand(min = 0, max = 1): number {
    const [v, next] = mulberry32(this.rng);
    this.rng = next;
    return min + v * (max - min);
  }

  private int(range: readonly [number, number]): number {
    return Math.floor(this.rand(range[0], range[1] + 1));
  }

  handle(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          this.muzzles.push(muzzleFlash(e.x, e.y, e.dir));
          break;
        case 'brickHit':
          this.debris(e.x, e.y, e.dir);
          break;
        case 'steelHit':
          this.sparks(e.x, e.y);
          break;
        case 'tankHit':
          this.sparks(e.x, e.y);
          this.flashes.set(e.tankId, FX.hitFlashMs);
          if (e.shielded) this.ripples.push({ x: e.x, y: e.y, ageMs: 0, lifeMs: FX.rippleMs });
          break;
        case 'explode':
          this.explode(e.x, e.y, e.target === 'base');
          break;
        case 'pickup':
          this.pickups.push(pickupAnim(e.powerUp, e.x, e.y));
          break;
        default:
          break;
      }
    }
  }

  private debris(x: number, y: number, dir: Dir): void {
    const back = BACK[dir];
    const colors = [PALETTE.brick, PALETTE.brickLight, PALETTE.brickMortar];
    const n = this.int(FX.debris);
    const added: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const speed = this.rand(1.5, 3.5);
      const side = this.rand(-1.6, 1.6);
      added.push({
        kind: 'debris',
        x: x + this.rand(-0.15, 0.15),
        y: y + this.rand(-0.15, 0.15),
        vx: back.x * speed + (back.x === 0 ? side : 0),
        vy: back.y * speed + (back.y === 0 ? side : 0),
        gravity: 5,
        drag: 1.5,
        size: this.rand(0.06, 0.12),
        grow: 0,
        color: colors[i % colors.length],
        ageMs: 0,
        lifeMs: this.rand(FX.debrisMs[0], FX.debrisMs[1]),
      });
    }
    addParticles(this.particles, added, this.particleCap);
  }

  private sparks(x: number, y: number): void {
    const added: Particle[] = [];
    const turn = this.rand(0, Math.PI * 2);
    for (let i = 0; i < FX.sparks; i++) {
      const a = turn + (i / FX.sparks) * Math.PI * 2;
      const speed = this.rand(3, 5);
      added.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        gravity: 0,
        drag: 4,
        size: 0.06,
        grow: 0,
        color: i % 2 ? PALETTE.spark : PALETTE.sparkHot,
        ageMs: 0,
        lifeMs: this.rand(FX.sparkMs[0], FX.sparkMs[1]),
      });
    }
    addParticles(this.particles, added, this.particleCap);
    this.bursts.push({ x, y, ageMs: 0, lifeMs: FX.sparkMs[1] });
  }

  private explode(x: number, y: number, base: boolean): void {
    const n = this.int(FX.smoke);
    const added: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.rand(0, Math.PI * 2);
      const speed = this.rand(0.2, 0.7);
      added.push({
        kind: 'smoke',
        x: x + Math.cos(a) * 0.2,
        y: y + Math.sin(a) * 0.2,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.3,
        gravity: -0.4,
        drag: 0.8,
        size: this.rand(0.15, 0.3),
        grow: 0.45,
        color: i % 2 ? PALETTE.smoke : PALETTE.smokeLight,
        ageMs: 0,
        lifeMs: this.rand(0.8, 1) * FX.smokeMs,
      });
    }
    addParticles(this.particles, added, this.particleCap);
    this.explosions.push(explosion(x, y, base));
    const s = base ? FX.shake.base : FX.shake.tank;
    if (s.amp >= this.shake.amp * (this.shake.ms / Math.max(1, this.shake.total))) {
      this.shake = { ms: s.ms, total: s.ms, amp: s.amp, angle: this.rand(0, Math.PI * 2) };
    }
  }

  update(dtMs: number): void {
    updateParticles(this.particles, dtMs);
    for (const list of [this.bursts, this.ripples]) age(list, dtMs, (b) => b.lifeMs);
    age(this.explosions, dtMs, () => FX.smokeMs);
    age(this.pickups, dtMs, () => FX.pickupMs);
    age(this.muzzles, dtMs, () => FX.muzzleMs);
    for (const [id, ms] of this.flashes) {
      if (ms - dtMs <= 0) this.flashes.delete(id);
      else this.flashes.set(id, ms - dtMs);
    }
    if (this.shake.ms > 0) {
      this.shake.ms = Math.max(0, this.shake.ms - dtMs);
      this.shake.angle += 2.4 + this.rand(0, 1.2);
      if (this.shake.ms === 0) this.shake.amp = 0;
    }
  }

  /** Records each bullet's position once per simulation step; trails of gone bullets are dropped. */
  trackBullets(bullets: readonly Bullet[]): void {
    const alive = new Set<number>();
    for (const b of bullets) {
      alive.add(b.id);
      let pts = this.trails.get(b.id);
      if (!pts) {
        pts = [];
        this.trails.set(b.id, pts);
      }
      pts.push({ x: b.x, y: b.y });
      if (pts.length > FX.trailPoints) pts.splice(0, pts.length - FX.trailPoints);
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
  }

  /** TD-005 adaptive quality halves the particle cap on slow devices. */
  setParticleCap(cap: number): void {
    this.particleCap = cap;
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);
  }

  /** Remaining white-flash strength (0..1) for a tank that was just hit. */
  tankFlash(tankId: number): number {
    return (this.flashes.get(tankId) ?? 0) / FX.hitFlashMs;
  }

  /** Camera offset in tiles; decays linearly to zero. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake.ms <= 0) return { x: 0, y: 0 };
    const m = this.shake.amp * (this.shake.ms / this.shake.total);
    return { x: Math.cos(this.shake.angle) * m, y: Math.sin(this.shake.angle) * m };
  }

  counts(): EffectCounts {
    return {
      particles: this.particles.length,
      shakeMs: Math.round(this.shake.ms),
      muzzleFlashes: this.muzzles.length,
      hitSparks: this.bursts.length,
      explosions: this.explosions.length,
      pickupAnims: this.pickups.length,
      trails: [...this.trails.values()].filter((t) => t.length >= 2).length,
    };
  }

  reset(): void {
    this.particles.length = 0;
    this.bursts.length = 0;
    this.ripples.length = 0;
    this.explosions.length = 0;
    this.pickups.length = 0;
    this.muzzles.length = 0;
    this.trails.clear();
    this.flashes.clear();
    this.shake = { ms: 0, total: 0, amp: 0, angle: 0 };
  }
}

function age<T extends { ageMs: number }>(list: T[], dtMs: number, life: (item: T) => number): void {
  let w = 0;
  for (const item of list) {
    item.ageMs += dtMs;
    if (item.ageMs < life(item)) list[w++] = item;
  }
  list.length = w;
}

function explosion(x: number, y: number, base: boolean): Explosion {
  return {
    x,
    y,
    base,
    ageMs: 0,
    fireAlpha() {
      return this.ageMs >= FX.fireMs ? 0 : 1 - this.ageMs / FX.fireMs;
    },
    fireRadius() {
      const t = Math.min(1, this.ageMs / FX.fireMs);
      return (base ? 0.9 : 0.6) * (0.4 + 0.8 * Math.sqrt(t));
    },
  };
}

function muzzleFlash(x: number, y: number, dir: Dir): MuzzleFlash {
  return {
    x,
    y,
    dir,
    ageMs: 0,
    frame() {
      return Math.min(2, Math.floor((this.ageMs / FX.muzzleMs) * 3));
    },
  };
}

function pickupAnim(type: PowerUpType, x: number, y: number): PickupAnim {
  return {
    type,
    x,
    y,
    ageMs: 0,
    scale() {
      return 1 + 0.6 * Math.min(1, this.ageMs / FX.pickupMs);
    },
    alpha() {
      return Math.max(0, 1 - this.ageMs / FX.pickupMs);
    },
    ringRadius() {
      return 0.4 + 0.8 * Math.min(1, this.ageMs / FX.pickupMs);
    },
  };
}
