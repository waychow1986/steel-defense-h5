import type { Dir } from '../game/types';

/**
 * Held-direction stack with "last pressed wins" and fallback on release (A-4),
 * plus a fire latch so a tap shorter than one simulation step still fires once.
 * Input is ignored while disabled (any screen other than `playing`, A-9).
 */
export class InputState {
  private held: Dir[] = [];
  private fireDown = false;
  private fireLatch = false;
  private enabled = false;
  private pendingPressAt: number | null = null;
  lastResponseMs: number | null = null;

  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    this.clear();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get direction(): Dir | null {
    return this.held.length > 0 ? this.held[this.held.length - 1] : null;
  }

  get fireHeld(): boolean {
    return this.fireDown;
  }

  pressDirection(dir: Dir, timeStamp: number): void {
    if (!this.enabled) return;
    this.held = this.held.filter((d) => d !== dir);
    this.held.push(dir);
    this.pendingPressAt = timeStamp;
  }

  releaseDirection(dir: Dir): void {
    this.held = this.held.filter((d) => d !== dir);
  }

  pressFire(timeStamp: number): void {
    if (!this.enabled) return;
    if (!this.fireDown) this.pendingPressAt = timeStamp;
    this.fireDown = true;
    this.fireLatch = true;
  }

  releaseFire(): void {
    this.fireDown = false;
  }

  /** Whether the simulation should try to fire this step; clears the tap latch. */
  consumeFire(): boolean {
    const f = this.fireDown || this.fireLatch;
    this.fireLatch = false;
    return f;
  }

  /** Called when the tank first responds after a press; records press-to-response ms once. */
  markResponded(now: number): void {
    if (this.pendingPressAt === null) return;
    this.lastResponseMs = Math.max(0, now - this.pendingPressAt);
    this.pendingPressAt = null;
  }

  clear(): void {
    this.held = [];
    this.fireDown = false;
    this.fireLatch = false;
    this.pendingPressAt = null;
  }
}
