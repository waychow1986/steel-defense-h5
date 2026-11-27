import { CONFIG } from '../game/config';
import { MAX_PARTICLES } from './particles';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualitySettings {
  dprCap: number;
  particleCap: number;
  /** Soft edge on tank and object shadows. */
  shadowBlur: boolean;
}

const SETTINGS: Record<QualityLevel, QualitySettings> = {
  high: { dprCap: CONFIG.maxDpr, particleCap: MAX_PARTICLES, shadowBlur: true },
  medium: { dprCap: 1.5, particleCap: MAX_PARTICLES / 2, shadowBlur: false },
  low: { dprCap: 1, particleCap: MAX_PARTICLES / 2, shadowBlur: false },
};

const NEXT: Record<QualityLevel, QualityLevel> = { high: 'medium', medium: 'low', low: 'low' };

/** Window over which the average frame gap is judged, ms. */
export const QUALITY_WINDOW_MS = 2000;
/** Average frame gap above which quality steps down, ms. */
export const QUALITY_SLOW_GAP_MS = 18;

/**
 * TD-005 adaptive quality (fallback for H-1): when the average frame gap over 2 s exceeds 18 ms,
 * lower the DPR cap and particle cap and drop the soft shadow edge; still slow, DPR 1.
 * Only sharpness and particle count drop — every required effect stays.
 */
export class AdaptiveQuality {
  level: QualityLevel = 'high';
  private last: number | null = null;
  private sum = 0;
  private count = 0;

  /** Feeds one frame time (ms); returns true when the level just changed. */
  frame(now: number): boolean {
    const prev = this.last;
    this.last = now;
    if (prev === null) return false;
    const gap = now - prev;
    if (gap <= 0) return false;
    if (gap > CONFIG.maxFrameGapMs) {
      // A pause (hidden tab, debugger), not a slow device.
      this.sum = 0;
      this.count = 0;
      return false;
    }
    this.sum += gap;
    this.count++;
    if (this.sum < QUALITY_WINDOW_MS) return false;
    const slow = this.sum / this.count > QUALITY_SLOW_GAP_MS;
    this.sum = 0;
    this.count = 0;
    if (!slow || this.level === 'low') return false;
    this.level = NEXT[this.level];
    return true;
  }

  resetClock(): void {
    this.last = null;
    this.sum = 0;
    this.count = 0;
  }

  settings(): QualitySettings {
    return { ...SETTINGS[this.level] };
  }
}
