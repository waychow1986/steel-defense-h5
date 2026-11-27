import { describe, expect, it } from 'vitest';
import { updateHud, type HudElements } from '../../src/app/hud';
import { CONFIG } from '../../src/game/config';
import { levelDef } from '../../src/game/levels';
import { createWorld, stepWorld } from '../../src/game/sim';
import { createEnemy } from '../../src/game/tanks';
import type { EnemyType, GameEvent } from '../../src/game/types';

const STEP_MS = 1000 / 60;
const EMPTY = Array.from({ length: 13 }, (_, r) => (r === 12 ? '......H......' : '.............'));

function fakeHud(): HudElements {
  const el = (): HTMLElement => ({ textContent: '' }) as unknown as HTMLElement;
  return { level: el(), score: el(), lives: el(), enemies: el() };
}

/** Player fires up at an enemy parked two tiles above; returns events until the enemy is gone. */
function killWithShots(type: EnemyType, startScore = 0) {
  const s = createWorld({ seed: 1, level: 1, layout: EMPTY, score: startScore });
  const e = createEnemy(s.nextId++, type, 4, 9);
  e.fireCooldownMs = 1e9;
  s.enemies.push(e);
  const events: GameEvent[] = [];
  for (let i = 0; i < 600 && s.enemies.includes(e); i += 1) {
    // Pin the target so the AI cannot wander off between shots.
    e.x = 4 + (1 - CONFIG.tankSize) / 2;
    e.y = 9 + (1 - CONFIG.tankSize) / 2;
    events.push(...stepWorld(s, { direction: null, fire: true }, STEP_MS));
  }
  return { s, events, gone: !s.enemies.includes(e) };
}

describe('UT-flow: scoring and HUD (AC-13)', () => {
  it.each([
    ['normal', CONFIG.enemyScore.normal],
    ['fast', CONFIG.enemyScore.fast],
    ['heavy', CONFIG.enemyScore.heavy],
  ] as const)('destroying a %s enemy adds %i points and lowers enemies remaining by one', (type, points) => {
    const total = levelDef(1).order.length;
    const { s, events, gone } = killWithShots(type, 500);
    expect(gone).toBe(true);
    expect(s.score).toBe(500 + points);
    expect(s.enemiesRemaining).toBe(total - 1);
    expect(events.filter((e) => e.type === 'scoreChanged')).toEqual([{ type: 'scoreChanged', score: 500 + points }]);
  });

  it('the HUD shows the new score, lives and enemies remaining on the next update', () => {
    const { s } = killWithShots('normal');
    const hud = fakeHud();
    updateHud(hud, s);
    expect(hud.level.textContent).toBe('1');
    expect(hud.score.textContent).toBe(String(CONFIG.enemyScore.normal));
    expect(hud.lives.textContent).toBe('3');
    expect(hud.enemies.textContent).toBe(String(levelDef(1).order.length - 1));
  });

  it('enemies remaining counts unspawned enemies and does not change when an enemy appears', () => {
    const FORT = EMPTY.map((row, r) => (r === 11 ? '.....SSS.....' : r === 12 ? '.....SHS.....' : row));
    const s = createWorld({ seed: 1, level: 1, layout: FORT, spawnEnemies: true });
    const total = levelDef(1).order.length;
    let spawned = 0;
    for (let i = 0; i < Math.round(6000 / STEP_MS); i += 1) {
      s.player!.shieldMs = 1e9;
      spawned += stepWorld(s, { direction: null, fire: false }, STEP_MS).filter((e) => e.type === 'enemySpawned').length;
    }
    expect(spawned).toBeGreaterThan(0);
    expect(s.enemiesSpawned).toBe(spawned);
    expect(s.enemiesRemaining).toBe(total);
  });
});
