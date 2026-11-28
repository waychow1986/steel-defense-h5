import { CONFIG } from '../game/config';

export interface PerfStats {
  fps: number;
  maxFrameGapMs: number;
  frames: number;
}

/**
 * Fixed-step accumulator driven by frame timestamps (TD-003). Gaps are clamped so a
 * background tab never fast-forwards the game, and each frame runs at most a few steps.
 */
export class FixedLoop {
  private last: number | null = null;
  private acc = 0;
  private frames = 0;
  private window: Array<{ t: number; gap: number }> = [];

  constructor(private readonly step: (dtMs: number) => void) {}

  /** Feeds one frame timestamp (ms); returns the number of fixed steps run. */
  frame(now: number): number {
    if (this.last === null) {
      this.last = now;
      this.record(now, 0);
      return 0;
    }
    const gap = Math.max(0, now - this.last);
    this.last = now;
    this.record(now, gap);
    this.acc += Math.min(gap, CONFIG.maxFrameGapMs);
    let steps = 0;
    while (this.acc >= CONFIG.stepMs - 1e-6 && steps < CONFIG.maxStepsPerFrame) {
      this.step(CONFIG.stepMs);
      this.acc -= CONFIG.stepMs;
      steps++;
    }
    if (steps === CONFIG.maxStepsPerFrame && this.acc > CONFIG.stepMs) this.acc = 0;
    if (this.acc < 0) this.acc = 0;
    return steps;
  }

  /** Forget the previous timestamp, e.g. after the tab was hidden. */
  resetClock(): void {
    this.last = null;
    this.acc = 0;
  }

  private record(now: number, gap: number): void {
    this.frames++;
    this.window.push({ t: now, gap });
    const from = now - CONFIG.perfWindowMs;
    while (this.window.length > 0 && this.window[0].t < from) this.window.shift();
  }

  stats(): PerfStats {
    const n = this.window.length;
    let maxGap = 0;
    for (const w of this.window) maxGap = Math.max(maxGap, w.gap);
    const span = n > 1 ? this.window[n - 1].t - this.window[0].t : 0;
    const fps = span > 0 ? ((n - 1) * 1000) / span : 0;
    return { fps: Math.round(fps * 10) / 10, maxFrameGapMs: Math.round(maxGap * 10) / 10, frames: this.frames };
  }
}
