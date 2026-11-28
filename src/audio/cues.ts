// Original synthesized sound cues (design “音效配方”). Each recipe schedules its own nodes on any
// BaseAudioContext so the same code plays live and renders offline in IT-01.
import type { GameEvent } from '../game/types';

export const CUE_NAMES = ['fire', 'hit', 'explosion', 'pickup', 'levelClear', 'gameOver'] as const;
export type CueName = (typeof CUE_NAMES)[number];

export interface CueRecipe {
  durationS: number;
  play(ctx: BaseAudioContext, dest: AudioNode, when: number): void;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 s of white noise from a fixed LCG, so renders are repeatable. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function noiseSource(ctx: BaseAudioContext, when: number, dur: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.start(when);
  src.stop(when + dur);
  return src;
}

/** Gain node with a fast attack then exponential decay to silence at `when + dur`. */
export function envelope(ctx: BaseAudioContext, dest: AudioNode, when: number, peak: number, dur: number, attack = 0.004): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  g.gain.setValueAtTime(0, when + dur);
  g.connect(dest);
  return g;
}

export function tone(ctx: BaseAudioContext, type: OscillatorType, freq: number, when: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  o.start(when);
  o.stop(when + dur + 0.02);
  return o;
}

export function noiseHit(ctx: BaseAudioContext, dest: AudioNode, when: number, dur: number, peak: number, filter: BiquadFilterType, hz: number): void {
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = hz;
  noiseSource(ctx, when, dur).connect(f).connect(envelope(ctx, dest, when, peak, dur, 0.002));
}

export const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

export const CUE_RECIPES: Record<CueName, CueRecipe> = {
  // White noise through a 1.8 kHz band-pass + square sweep 220→90 Hz.
  fire: {
    durationS: 0.12,
    play(ctx, dest, t) {
      const d = 0.12;
      noiseHit(ctx, dest, t, d, 0.5, 'bandpass', 1800);
      const sq = tone(ctx, 'square', 220, t, d);
      sq.frequency.exponentialRampToValueAtTime(90, t + d);
      sq.connect(envelope(ctx, dest, t, 0.18, d, 0.002));
    },
  },
  // Metallic ting: triangles at 1400 Hz + 2100 Hz, exponential decay.
  hit: {
    durationS: 0.15,
    play(ctx, dest, t) {
      const d = 0.15;
      tone(ctx, 'triangle', 1400, t, d).connect(envelope(ctx, dest, t, 0.35, d, 0.001));
      tone(ctx, 'triangle', 2100, t, d).connect(envelope(ctx, dest, t, 0.22, d * 0.7, 0.001));
    },
  },
  // Noise through a low-pass sweeping 1.2 kHz → 200 Hz + a 60 Hz sine thump.
  explosion: {
    durationS: 0.9,
    play(ctx, dest, t) {
      const d = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1200, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + d);
      noiseSource(ctx, t, d).connect(lp).connect(envelope(ctx, dest, t, 0.9, d, 0.01));
      const thump = tone(ctx, 'sine', 60, t, 0.5);
      thump.frequency.exponentialRampToValueAtTime(35, t + 0.5);
      thump.connect(envelope(ctx, dest, t, 0.7, 0.5, 0.005));
    },
  },
  // Rising sine arpeggio C6-E6-G6-C7, 60 ms each, last note rings out.
  pickup: {
    durationS: 0.3,
    play(ctx, dest, t) {
      [84, 88, 91, 96].forEach((n, i) => {
        const start = t + i * 0.06;
        const d = i === 3 ? 0.12 : 0.06;
        tone(ctx, 'sine', midi(n), start, d).connect(envelope(ctx, dest, start, 0.35, d, 0.003));
      });
    },
  },
  // Major four-note fanfare G4-C5-E5-G5 (square + triangle), last note held.
  levelClear: {
    durationS: 1.2,
    play(ctx, dest, t) {
      const notes: Array<[number, number, number]> = [
        [67, 0, 0.16],
        [72, 0.16, 0.16],
        [76, 0.32, 0.16],
        [79, 0.48, 0.72],
      ];
      for (const [n, at, d] of notes) {
        const start = t + at;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3200;
        const env = envelope(ctx, dest, start, 0.22, d, 0.01);
        lp.connect(env);
        tone(ctx, 'square', midi(n), start, d).connect(lp);
        tone(ctx, 'triangle', midi(n - 12), start, d).connect(env);
      }
    },
  },
  // Minor falling three notes E4-C4-A3 on low-passed sawtooth with a slow vibrato.
  gameOver: {
    durationS: 1.4,
    play(ctx, dest, t) {
      const notes: Array<[number, number, number]> = [
        [64, 0, 0.4],
        [60, 0.4, 0.4],
        [57, 0.8, 0.6],
      ];
      const lfo = tone(ctx, 'sine', 5, t, 1.4);
      const depth = ctx.createGain();
      depth.gain.value = 4;
      lfo.connect(depth);
      for (const [n, at, d] of notes) {
        const start = t + at;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const saw = tone(ctx, 'sawtooth', midi(n), start, d);
        depth.connect(saw.frequency);
        saw.connect(lp).connect(envelope(ctx, dest, start, 0.3, d, 0.03));
      }
    },
  },
};

/** Which cue a simulation event plays, or null (design “事件 → 音效 → 特效映射”). */
export function cueForEvent(e: GameEvent): CueName | null {
  switch (e.type) {
    case 'fire':
      return 'fire';
    case 'brickHit':
    case 'steelHit':
    case 'tankHit':
      return 'hit';
    case 'explode':
      return 'explosion';
    case 'pickup':
      return 'pickup';
    case 'levelClear':
      return 'levelClear';
    case 'gameOver':
      return 'gameOver';
    default:
      return null;
  }
}
