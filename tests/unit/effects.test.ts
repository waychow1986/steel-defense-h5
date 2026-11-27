import { describe, expect, it } from 'vitest';
import { Effects } from '../../src/render/effects';
import { MAX_PARTICLES } from '../../src/render/particles';
import { PALETTE } from '../../src/render/palette';

const STEP_MS = 1000 / 60;

function run(fx: Effects, ms: number): void {
  for (let t = 0; t < ms; t += STEP_MS) fx.update(STEP_MS);
}

describe('effects driven by game events (AC-17)', () => {
  it('a brick hit throws brick-coloured debris that flies back from the wall and fades out', () => {
    const fx = new Effects(1);
    fx.handle([{ type: 'brickHit', x: 5, y: 5, dir: 'up' }]);
    const debris = fx.particles.filter((p) => p.kind === 'debris');
    expect(debris.length).toBeGreaterThanOrEqual(6);
    expect(debris.length).toBeLessThanOrEqual(10);
    expect(fx.counts().particles).toBe(fx.particles.length);
    for (const p of debris) {
      expect([PALETTE.brick, PALETTE.brickLight, PALETTE.brickMortar]).toContain(p.color);
      // Bullet flew up, debris bounces back down.
      expect(p.vy).toBeGreaterThan(0);
    }
    run(fx, 1500);
    expect(fx.counts().particles).toBe(0);
  });

  it('a steel hit shows a spark burst with an impact flash', () => {
    const fx = new Effects(2);
    fx.handle([{ type: 'steelHit', x: 3, y: 4 }]);
    const c = fx.counts();
    expect(c.hitSparks).toBe(1);
    expect(fx.particles.filter((p) => p.kind === 'spark')).toHaveLength(8);
    run(fx, 600);
    expect(fx.counts().hitSparks).toBe(0);
  });

  it('a tank hit that does not destroy shows sparks and flashes the tank; a shielded hit adds a ripple', () => {
    const fx = new Effects(3);
    fx.handle([{ type: 'tankHit', tankId: 7, x: 6, y: 2, shielded: false }]);
    expect(fx.counts().hitSparks).toBe(1);
    expect(fx.tankFlash(7)).toBeGreaterThan(0);
    expect(fx.tankFlash(8)).toBe(0);
    run(fx, 120);
    expect(fx.tankFlash(7)).toBe(0);

    fx.handle([{ type: 'tankHit', tankId: 1, x: 4, y: 12, shielded: true }]);
    expect(fx.ripples).toHaveLength(1);
    expect(fx.counts().hitSparks).toBeGreaterThan(0);
  });

  it('a tank explosion has fire, rising smoke and a short light shake', () => {
    const fx = new Effects(4);
    fx.handle([{ type: 'explode', target: 'tank', x: 6, y: 6 }]);
    const c = fx.counts();
    expect(c.explosions).toBe(1);
    const smoke = fx.particles.filter((p) => p.kind === 'smoke');
    expect(smoke.length).toBeGreaterThanOrEqual(8);
    expect(smoke.length).toBeLessThanOrEqual(14);
    expect(c.shakeMs).toBe(250);
    const a = fx.shakeOffset();
    expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(0.08 + 1e-9);
    run(fx, 300);
    expect(fx.counts().shakeMs).toBe(0);
    expect(fx.shakeOffset()).toEqual({ x: 0, y: 0 });
    expect(fx.explosions[0].fireAlpha()).toBeGreaterThan(0);
    // Fire is gone after 400 ms, smoke lingers, everything clears by 1.3 s.
    run(fx, 150);
    expect(fx.explosions[0].fireAlpha()).toBe(0);
    expect(fx.particles.some((p) => p.kind === 'smoke')).toBe(true);
    run(fx, 900);
    expect(fx.counts().explosions).toBe(0);
    expect(fx.counts().particles).toBe(0);
  });

  it('a base explosion shakes longer and stronger than a tank explosion', () => {
    const fx = new Effects(5);
    fx.handle([{ type: 'explode', target: 'base', x: 6.5, y: 12.5 }]);
    expect(fx.counts().shakeMs).toBe(500);
    let maxAmp = 0;
    for (let i = 0; i < 10; i++) {
      fx.update(STEP_MS);
      const o = fx.shakeOffset();
      maxAmp = Math.max(maxAmp, Math.hypot(o.x, o.y));
    }
    expect(maxAmp).toBeGreaterThan(0.08);
    expect(maxAmp).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it('picking up a power-up plays a 400 ms grow-and-fade animation of that power-up', () => {
    const fx = new Effects(6);
    fx.handle([{ type: 'pickup', powerUp: 'shield', x: 2.5, y: 9.5 }]);
    expect(fx.counts().pickupAnims).toBe(1);
    expect(fx.pickups[0].type).toBe('shield');
    run(fx, 200);
    expect(fx.pickups[0].scale()).toBeGreaterThan(1);
    run(fx, 250);
    expect(fx.counts().pickupAnims).toBe(0);
  });

  it('never keeps more than the particle cap; reset clears everything', () => {
    const fx = new Effects(7);
    for (let i = 0; i < 100; i++) fx.handle([{ type: 'explode', target: 'tank', x: 6, y: 6 }]);
    expect(fx.counts().particles).toBeLessThanOrEqual(MAX_PARTICLES);
    fx.reset();
    expect(fx.counts()).toMatchObject({ particles: 0, shakeMs: 0, hitSparks: 0, explosions: 0, pickupAnims: 0 });
  });

  it('events without a visual effect leave the counts unchanged', () => {
    const fx = new Effects(8);
    fx.handle([{ type: 'scoreChanged', score: 100 }, { type: 'lifeLost', lives: 2 }, { type: 'enemySpawned', tankId: 3 }]);
    expect(fx.counts()).toMatchObject({ particles: 0, shakeMs: 0, hitSparks: 0, explosions: 0, pickupAnims: 0 });
  });
});
