import { CONFIG } from '../game/config';

export type ParticleKind = 'debris' | 'spark' | 'smoke';

/** One short-lived visual particle; positions in tiles, velocities in tiles/s. */
export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Downward acceleration, tiles/s². Negative rises (smoke). */
  gravity: number;
  /** Fractional slow-down per second. */
  drag: number;
  size: number;
  /** Size growth per second (smoke spreads). */
  grow: number;
  color: string;
  ageMs: number;
  lifeMs: number;
}

export const MAX_PARTICLES = CONFIG.effects.maxParticles;

/** Adds particles, dropping the oldest when the cap is reached. */
export function addParticles(list: Particle[], added: Particle[], cap: number = MAX_PARTICLES): void {
  list.push(...added);
  if (list.length > cap) list.splice(0, list.length - cap);
}

/** Advances and expires particles in place. */
export function updateParticles(list: Particle[], dtMs: number): void {
  const dt = dtMs / 1000;
  let w = 0;
  for (const p of list) {
    p.ageMs += dtMs;
    if (p.ageMs >= p.lifeMs) continue;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k;
    p.vy = p.vy * k + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size += p.grow * dt;
    list[w++] = p;
  }
  list.length = w;
}

/** Opacity of a particle: full at first, fading out over the last 60 % of its life. */
export function particleAlpha(p: Particle): number {
  const t = p.ageMs / p.lifeMs;
  return t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.6);
}
