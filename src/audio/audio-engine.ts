// Web Audio graph (design TD audio): cue/music → sfx bus / music bus → master → speakers.
// The context is created and resumed inside the first user gesture so phones allow sound (FR-043).
import { CONFIG } from '../game/config';
import { CUE_RECIPES, type CueName } from './cues';
import { MusicPlayer } from './music';

export type AudioState = 'none' | 'suspended' | 'running' | 'closed' | 'interrupted';

export interface AudioStatus {
  state: AudioState;
  muted: boolean;
  masterGain: number;
  musicPlaying: boolean;
  cues: Array<{ name: CueName; atMs: number }>;
}

type Ctor = new () => AudioContext;

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: MusicPlayer;
}

export class AudioEngine {
  private graph: Graph | null = null;
  private muted = false;
  private wantMusic = false;
  private readonly log: Array<{ name: CueName; atMs: number }> = [];

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly ctor: Ctor | undefined = globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext,
  ) {}

  /** Call from inside a user gesture handler: creates/resumes the context and primes output. */
  unlock(): void {
    let created = false;
    if (!this.graph) {
      if (!this.ctor) return;
      try {
        this.graph = this.build(new this.ctor());
        created = true;
      } catch {
        return;
      }
    }
    if (created || this.graph.ctx.state !== 'running') this.wake(this.graph.ctx);
    if (this.wantMusic) this.graph.music.start();
  }

  /**
   * Call from any later user gesture (touch, key, click): if the system suspended or interrupted
   * the context (backgrounding, a call, screen lock), resume it while the gesture allows it (TD-007).
   * Does not create the context.
   */
  resumeOnGesture(): void {
    if (this.graph && this.graph.ctx.state !== 'running') this.wake(this.graph.ctx);
  }

  /** Re-resume after the page comes back (phones suspend audio in the background). */
  resumeIfVisible(visible: boolean): void {
    if (visible && this.graph && this.graph.ctx.state !== 'running') void this.graph.ctx.resume().catch(() => undefined);
  }

  private wake(ctx: AudioContext): void {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // A one-sample silent buffer started in the gesture unlocks output on iOS Safari.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start();
  }

  private build(ctx: AudioContext): Graph {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 1;
    master.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = CONFIG.audio.sfxGain;
    sfx.connect(master);
    const musicBus = ctx.createGain();
    musicBus.gain.value = CONFIG.audio.musicGain;
    musicBus.connect(master);
    return { ctx, master, sfx, music: new MusicPlayer(ctx, musicBus) };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.graph) return;
    const { ctx, master } = this.graph;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + CONFIG.audio.muteRampS);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMusic(on: boolean): void {
    this.wantMusic = on;
    if (!this.graph) return;
    if (on) this.graph.music.start();
    else this.graph.music.stop();
  }

  play(name: CueName): void {
    if (!this.graph) return;
    const { ctx, sfx } = this.graph;
    CUE_RECIPES[name].play(ctx, sfx, ctx.currentTime);
    this.log.push({ name, atMs: this.now() });
    if (this.log.length > CONFIG.audio.cueLog) this.log.shift();
  }

  status(): AudioStatus {
    return {
      state: (this.graph?.ctx.state as AudioState | undefined) ?? 'none',
      muted: this.muted,
      masterGain: this.muted ? 0 : 1,
      musicPlaying: this.graph?.music.playing ?? false,
      cues: this.log.map((c) => ({ ...c })),
    };
  }
}
