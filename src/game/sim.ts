import { fireBullet, stepBullets } from './bullets';
import { CONFIG } from './config';
import { levelCounts, levelDef } from './levels';
import { createMap } from './map';
import { stepEnemies } from './enemy-ai';
import { stepSpawner } from './spawner';
import { createPlayer, moveTank, tankBlocked } from './tanks';
import type { Dir, GameEvent, GameState, Screen } from './types';

export interface StepInput {
  direction: Dir | null;
  fire: boolean;
}

export interface WorldOptions {
  seed: number;
  level: number;
  /** Test-only override of the level map. */
  layout?: readonly string[];
  screen?: Screen;
  score?: number;
  lives?: number;
  /** Bring enemies on. Defaults to true for real levels and false when a test layout is given. */
  spawnEnemies?: boolean;
}

export function createWorld(opts: WorldOptions): GameState {
  const def = levelDef(opts.level);
  const state: GameState = {
    screen: opts.screen ?? 'playing',
    level: opts.level,
    score: opts.score ?? 0,
    lives: opts.lives ?? CONFIG.startLives,
    enemiesRemaining: levelCounts(def).total,
    enemiesSpawned: 0,
    spawnEnabled: opts.spawnEnemies ?? opts.layout === undefined,
    // The first enemy appears as soon as play starts; later ones follow the spawn interval.
    // The first enemy arrives one spawn interval after play starts, giving the player a moment to orient.
    spawnTimerMs: 0,
    spawnSlot: 0,
    lost: false,
    timeMs: 0,
    rngSeed: opts.seed >>> 0,
    rngState: opts.seed >>> 0,
    nextId: 1,
    map: createMap(opts.layout ?? def.layout),
    base: { x: CONFIG.baseTile.col, y: CONFIG.baseTile.row, destroyed: false },
    player: null,
    enemies: [],
    bullets: [],
    powerUps: [],
  };
  state.player = createPlayer(state.nextId++);
  return state;
}

export interface StepResult extends Array<GameEvent> {
  /** True when the player's tank responded to input this step (turned, moved or fired). */
  responded?: boolean;
}

/** One fixed simulation step. Pure with respect to the outside world (no clocks, no Math.random). */
export function stepWorld(state: GameState, input: StepInput, dtMs: number): StepResult {
  const events: StepResult = [];
  if (state.lost) return events;
  state.timeMs += dtMs;
  respawnPlayer(state);
  const p = state.player;
  if (p) {
    p.recoilMs = Math.max(0, p.recoilMs - dtMs);
    p.fireCooldownMs = Math.max(0, p.fireCooldownMs - dtMs);
    p.shieldMs = Math.max(0, p.shieldMs - dtMs);
    const moved = moveTank(state, p, input.direction, dtMs);
    let fired = false;
    if (input.fire) {
      const speed = p.firepower ? CONFIG.bulletSpeedUpgraded : CONFIG.bulletSpeed;
      const b = fireBullet(state, p, p.maxBullets, speed);
      if (b) {
        fired = true;
        p.recoilMs = CONFIG.recoilMs;
        events.push({ type: 'fire', owner: 'player', x: b.x, y: b.y, dir: b.dir });
      }
    }
    events.responded = moved || fired;
  }
  stepEnemies(state, dtMs, events);
  stepSpawner(state, dtMs, events);
  stepBullets(state, dtMs, events);
  respawnPlayer(state);
  return events;
}

/** After a lost life the player reappears at the spawn point facing up with base firepower (A-12); waits while the spot is occupied. */
function respawnPlayer(state: GameState): void {
  if (state.player || state.lost || state.lives <= 0) return;
  const p = createPlayer(state.nextId);
  if (tankBlocked(state, p, p.x, p.y)) return;
  state.nextId += 1;
  state.player = p;
}
