// Original 8-bar background loop (design “背景音乐”): triangle bass, noise snare-like drum and a
// low-passed square lead, scheduled with a look-ahead pump on the AudioContext clock.
import { CONFIG } from '../game/config';
import { envelope, midi, noiseHit, tone } from './cues';

const A = CONFIG.audio;
const STEP_S = 60 / A.musicBpm / 2; // eighth notes
const STEPS = 8 * 8;

/** Bass root per bar (MIDI). */
const BASS = [45, 45, 41, 43, 45, 48, 40, 40];
/** Lead, one entry per eighth note per bar; 0 = rest. */
const LEAD: number[][] = [
  [69, 0, 72, 0, 76, 0, 74, 72],
  [71, 0, 0, 69, 71, 72, 71, 0],
  [69, 0, 65, 0, 69, 0, 72, 0],
  [71, 0, 67, 0, 74, 0, 71, 0],
  [69, 0, 72, 76, 0, 79, 76, 0],
  [74, 0, 72, 0, 76, 0, 79, 0],
  [76, 0, 74, 72, 71, 0, 68, 0],
  [69, 0, 0, 0, 71, 0, 68, 0],
];

function scheduleStep(ctx: BaseAudioContext, dest: AudioNode, step: number, t: number): void {
  const bar = Math.floor(step / 8) % 8;
  const beat = step % 8;
  if (beat % 2 === 0) {
    const n = BASS[bar] + (beat === 4 ? 7 : 0);
    tone(ctx, 'triangle', midi(n), t, STEP_S * 1.8).connect(envelope(ctx, dest, t, 0.5, STEP_S * 1.8, 0.01));
  }
  if (beat === 2 || beat === 6) noiseHit(ctx, dest, t, 0.09, 0.28, 'bandpass', 2400);
  else if (beat % 2 === 1) noiseHit(ctx, dest, t, 0.03, 0.08, 'highpass', 7000);
  const lead = LEAD[bar][beat];
  if (lead) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(envelope(ctx, dest, t, 0.16, STEP_S * 0.9, 0.008));
    tone(ctx, 'square', midi(lead), t, STEP_S * 0.9).connect(lp);
  }
}

/** Loops the tune into `dest` while started. */
export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
    this.pump();
    this.timer = setInterval(() => this.pump(), A.musicTickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const now = this.ctx.currentTime;
    // After a stall (tab hidden, context suspended) skip ahead instead of bursting old notes.
    if (this.nextAt < now) this.nextAt = now + 0.02;
    while (this.nextAt < now + A.musicLookAheadS) {
      scheduleStep(this.ctx, this.dest, this.step, this.nextAt);
      this.step = (this.step + 1) % STEPS;
      this.nextAt += STEP_S;
    }
  }
}
