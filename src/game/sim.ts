import { fireBullet, stepBullets } from './bullets';
import { CONFIG } from './config';
import { levelCounts, levelDef } from './levels';
import { createMap } from './map';
import { createPlayer, moveTank } from './tanks';
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
  state.timeMs += dtMs;
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
  stepBullets(state, dtMs, events);
  return events;
}
