import { LEVELS, levelCounts, levelDef } from '../game/levels';
import { mapRows } from '../game/map';
import type { Dir, EnemyType, GameState, PowerUpType, Screen } from '../game/types';
import type { PerfStats } from './loop';

/** Read-only state contract exposed as `window.steelDefense.snapshot()` (design “诊断接口”). */
export interface SteelDefenseSnapshot {
  screen: Screen;
  transitioning: boolean;
  seed: number;
  level: number;
  score: number;
  lives: number;
  enemiesRemaining: number;
  highScore: number;
  levelInfo: { total: number; byType: Record<EnemyType, number> };
  levels: Array<{ level: number; total: number; byType: Record<EnemyType, number>; layout: string[] }>;
  player: null | {
    x: number;
    y: number;
    dir: Dir;
    moving: boolean;
    shieldMs: number;
    firepower: number;
    maxBullets: number;
    speed: number;
    recoilMs: number;
    treadPhase: number;
  };
  enemies: Array<{ id: number; type: EnemyType; x: number; y: number; dir: Dir; moving: boolean; hp: number; maxHp: number; speed: number; carrier: boolean }>;
  bullets: Array<{ id: number; owner: 'player' | 'enemy'; x: number; y: number; dir: Dir; speed: number }>;
  powerUps: Array<{ id: number; type: PowerUpType; x: number; y: number }>;
  base: { x: number; y: number; destroyed: boolean };
  map: { cols: number; rows: number; unitsPerTile: number; cells: string[] };
  effects: { particles: number; shakeMs: number; muzzleFlashes: number; hitSparks: number; explosions: number; pickupAnims: number; trails: number };
  audio: {
    state: 'none' | 'suspended' | 'running' | 'closed' | 'interrupted';
    muted: boolean;
    masterGain: number;
    musicPlaying: boolean;
    cues: Array<{ name: 'fire' | 'hit' | 'explosion' | 'pickup' | 'levelClear' | 'gameOver'; atMs: number }>;
  };
  perf: PerfStats & { quality: 'high' | 'medium' | 'low' };
  input: { direction: Dir | null; fire: boolean; lastResponseMs: number | null };
}

export interface SnapshotSources {
  screen: Screen;
  transitioning: boolean;
  seed: number;
  /** Level shown before a game starts (start screen). */
  level: number;
  state: GameState | null;
  highScore: number;
  effects: SteelDefenseSnapshot['effects'];
  audio: SteelDefenseSnapshot['audio'];
  perf: PerfStats;
  input: { direction: Dir | null; fire: boolean; lastResponseMs: number | null };
}

export function buildSnapshot(src: SnapshotSources): SteelDefenseSnapshot {
  const s = src.state;
  const level = s?.level ?? src.level;
  const p = s?.player ?? null;
  const def = levelDef(level);
  const counts = levelCounts(def);
  return {
    screen: src.screen,
    transitioning: src.transitioning,
    seed: src.seed,
    level,
    score: s?.score ?? 0,
    lives: s?.lives ?? 0,
    enemiesRemaining: s?.enemiesRemaining ?? counts.total,
    highScore: src.highScore,
    levelInfo: { total: counts.total, byType: { ...counts.byType } },
    levels: LEVELS.map((d) => {
      const c = levelCounts(d);
      return { level: d.level, total: c.total, byType: { ...c.byType }, layout: [...d.layout] };
    }),
    player: p
      ? {
          x: p.x,
          y: p.y,
          dir: p.dir,
          moving: p.moving,
          shieldMs: p.shieldMs,
          firepower: p.firepower,
          maxBullets: p.maxBullets,
          speed: p.speed,
          recoilMs: p.recoilMs,
          treadPhase: p.treadPhase,
        }
      : null,
    enemies: (s?.enemies ?? []).map((e) => ({
      id: e.id,
      type: e.type as EnemyType,
      x: e.x,
      y: e.y,
      dir: e.dir,
      moving: e.moving,
      hp: e.hp,
      maxHp: e.maxHp,
      speed: e.speed,
      carrier: e.carrier,
    })),
    bullets: (s?.bullets ?? []).map((b) => ({ id: b.id, owner: b.owner, x: b.x, y: b.y, dir: b.dir, speed: b.speed })),
    powerUps: (s?.powerUps ?? []).map((u) => ({ id: u.id, type: u.type, x: u.x, y: u.y })),
    base: s ? { ...s.base } : { x: 6, y: 12, destroyed: false },
    map: {
      cols: 13,
      rows: 13,
      unitsPerTile: 4,
      cells: s ? mapRows(s.map) : [],
    },
    effects: { ...src.effects },
    audio: { ...src.audio, cues: src.audio.cues.map((c) => ({ ...c })) },
    perf: { ...src.perf, quality: 'high' },
    input: { ...src.input },
  };
}
