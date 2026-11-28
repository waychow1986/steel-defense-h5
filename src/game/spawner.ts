import { CONFIG } from './config';
import { levelDef } from './levels';
import { nextRandom } from './rng';
import { createEnemy, tankBlocked } from './tanks';
import type { GameEvent, GameState } from './types';

/** Random enemy fire delay in [min, max] ms. */
export function enemyFireDelay(state: GameState): number {
  const [min, max] = CONFIG.enemyFireIntervalMs;
  return min + nextRandom(state) * (max - min);
}

/**
 * Brings enemies onto the top row in level order (TD-017): at most `enemyMaxOnField` at once,
 * one every `enemySpawnIntervalMs`, rotating over the spawn columns. A blocked spawn point is
 * skipped for the next one; if all are blocked the spawn waits.
 */
export function stepSpawner(state: GameState, dtMs: number, events: GameEvent[]): void {
  if (!state.spawnEnabled) return;
  const def = levelDef(state.level);
  state.spawnTimerMs = Math.min(state.spawnTimerMs + dtMs, CONFIG.enemySpawnIntervalMs);
  if (state.spawnTimerMs < CONFIG.enemySpawnIntervalMs) return;
  if (state.enemiesSpawned >= def.order.length || state.enemies.length >= CONFIG.enemyMaxOnField) return;
  const cols = CONFIG.enemySpawnCols;
  for (let k = 0; k < cols.length; k += 1) {
    const slot = (state.spawnSlot + k) % cols.length;
    const index = state.enemiesSpawned + 1;
    const carrierSeq = def.carriers.indexOf(index) + 1;
    const tank = createEnemy(state.nextId, def.order[index - 1], cols[slot], 0, carrierSeq > 0);
    if (tankBlocked(state, tank, tank.x, tank.y)) continue;
    if (carrierSeq > 0) tank.carrierSeq = carrierSeq;
    state.nextId += 1;
    tank.fireCooldownMs = enemyFireDelay(state);
    state.enemies.push(tank);
    state.enemiesSpawned = index;
    state.spawnSlot = (slot + 1) % cols.length;
    state.spawnTimerMs = 0;
    events.push({ type: 'enemySpawned', tankId: tank.id });
    return;
  }
}
