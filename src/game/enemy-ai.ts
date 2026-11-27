import { fireBullet } from './bullets';
import { CONFIG } from './config';
import { nextRandom } from './rng';
import { enemyFireDelay } from './spawner';
import { isHorizontal, moveTank, tankCenter } from './tanks';
import type { Dir, GameEvent, GameState, Tank } from './types';

const REPICK_CHANCE = 0.25;
// Down 40%, left/right/up 20% each (TD-019): leans towards the base.
const DIR_WEIGHTS: ReadonlyArray<[Dir, number]> = [
  ['down', 0.4],
  ['left', 0.2],
  ['right', 0.2],
  ['up', 0.2],
];

function pickDir(state: GameState): Dir {
  let r = nextRandom(state);
  for (const [dir, w] of DIR_WEIGHTS) {
    if (r < w) return dir;
    r -= w;
  }
  return 'down';
}

function tileAlong(tank: Tank): number {
  const c = tankCenter(tank);
  return Math.floor(isHorizontal(tank.dir) ? c.x : c.y);
}

/** Moves every enemy forward, occasionally re-picking a direction, and fires on a random timer. */
export function stepEnemies(state: GameState, dtMs: number, events: GameEvent[]): void {
  for (const e of state.enemies) {
    e.recoilMs = Math.max(0, e.recoilMs - dtMs);
    const before = tileAlong(e);
    const moved = moveTank(state, e, e.dir, dtMs) && e.moving;
    const crossed = tileAlong(e) !== before;
    if ((!moved || crossed) && nextRandom(state) < REPICK_CHANCE) {
      const dir = pickDir(state);
      if (dir !== e.dir) moveTank(state, e, dir, 0);
    }
    e.fireCooldownMs -= dtMs;
    if (e.fireCooldownMs <= 0) {
      const b = fireBullet(state, e, 1, CONFIG.bulletSpeed);
      if (b) {
        e.recoilMs = CONFIG.recoilMs;
        events.push({ type: 'fire', owner: 'enemy', x: b.x, y: b.y, dir: b.dir });
        e.fireCooldownMs = enemyFireDelay(state);
      } else {
        e.fireCooldownMs = 0;
      }
    }
  }
}
