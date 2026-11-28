import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../../src/app/loop';
import { CONFIG } from '../../src/game/config';

describe('UT-loop fixed step', () => {
  it('runs one step per 60 Hz frame and reports fps over the window', () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++);
    for (let i = 0; i <= 120; i++) loop.frame(i * CONFIG.stepMs);
    expect(steps).toBe(120);
    const st = loop.stats();
    expect(st.fps).toBeCloseTo(60, 0);
    expect(st.maxFrameGapMs).toBeCloseTo(16.7, 1);
  });

  it('clamps a long gap so the game never fast-forwards', () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++);
    loop.frame(0);
    loop.frame(10_000);
    expect(steps).toBeLessThanOrEqual(CONFIG.maxStepsPerFrame);
    expect(loop.stats().maxFrameGapMs).toBe(10_000);
    loop.frame(10_000 + CONFIG.stepMs);
    expect(steps).toBeLessThanOrEqual(CONFIG.maxStepsPerFrame + 1);
  });
});
