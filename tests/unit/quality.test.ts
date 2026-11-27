import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../../src/render/quality';
import { MAX_PARTICLES } from '../../src/render/particles';

function frames(q: AdaptiveQuality, start: number, gapMs: number, durationMs: number): number {
  let t = start;
  while (t < start + durationMs) {
    t += gapMs;
    q.frame(t);
  }
  return t;
}

describe('adaptive quality (TD-005)', () => {
  it('stays high while frames come every ~16.7 ms', () => {
    const q = new AdaptiveQuality();
    frames(q, 0, 1000 / 60, 10_000);
    expect(q.level).toBe('high');
    expect(q.settings()).toEqual({ dprCap: 2, particleCap: MAX_PARTICLES, shadowBlur: true });
  });

  it('drops to medium after 2 s averaging over 18 ms, then to low if still slow, keeping every effect', () => {
    const q = new AdaptiveQuality();
    let t = frames(q, 0, 22, 1900);
    expect(q.level).toBe('high');
    t = frames(q, t, 22, 200);
    expect(q.level).toBe('medium');
    expect(q.settings()).toEqual({ dprCap: 1.5, particleCap: MAX_PARTICLES / 2, shadowBlur: false });
    t = frames(q, t, 22, 2100);
    expect(q.level).toBe('low');
    expect(q.settings()).toEqual({ dprCap: 1, particleCap: MAX_PARTICLES / 2, shadowBlur: false });
    frames(q, t, 40, 5000);
    expect(q.level).toBe('low');
  });

  it('ignores pauses (hidden tab, long gaps) and does not degrade on a short hitch', () => {
    const q = new AdaptiveQuality();
    let t = frames(q, 0, 1000 / 60, 1000);
    t += 5000;
    q.frame(t);
    t = frames(q, t, 1000 / 60, 3000);
    q.frame(t + 80);
    frames(q, t + 80, 1000 / 60, 3000);
    expect(q.level).toBe('high');
  });

  it('reports a change once so the renderer can rebuild', () => {
    const q = new AdaptiveQuality();
    let changes = 0;
    let t = 0;
    for (let i = 0; i < 300; i++) {
      t += 25;
      if (q.frame(t)) changes++;
    }
    expect(changes).toBe(2);
  });
});
