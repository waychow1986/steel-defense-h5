import { describe, expect, it } from 'vitest';
import { updateHud, type HudElements } from '../../src/app/hud';
import { CONFIG } from '../../src/game/config';
import { levelDef } from '../../src/game/levels';
import { advanceLevel, createWorld, stepWorld } from '../../src/game/sim';
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

/** A level-N world where every enemy but one is already destroyed; the last one is parked above the player. */
function lastEnemyWorld(level: number, score = 0, lives = 3) {
  const s = createWorld({ seed: 1, level, layout: EMPTY, score, lives });
  const total = levelDef(level).order.length;
  s.enemiesSpawned = total;
  s.enemiesRemaining = 1;
  const e = createEnemy(s.nextId++, 'normal', 4, 9);
  e.fireCooldownMs = 1e9;
  s.enemies.push(e);
  return { s, e };
}

function shootLast(s: ReturnType<typeof createWorld>, e: ReturnType<typeof createEnemy>): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < 600 && s.enemies.includes(e); i += 1) {
    e.x = 4 + (1 - CONFIG.tankSize) / 2;
    e.y = 9 + (1 - CONFIG.tankSize) / 2;
    events.push(...stepWorld(s, { direction: null, fire: true }, STEP_MS));
  }
  return events;
}

describe('UT-flow: level clear and victory (AC-10)', () => {
  it('no clear while an enemy remains; destroying the last one clears the level and freezes the world', () => {
    const { s, e } = lastEnemyWorld(1);
    for (let i = 0; i < 5; i += 1) expect(stepWorld(s, { direction: null, fire: false }, STEP_MS).some((ev) => ev.type === 'levelClear')).toBe(false);
    expect(s.cleared).toBe(false);
    const events = shootLast(s, e);
    expect(events.filter((ev) => ev.type === 'levelClear')).toEqual([{ type: 'levelClear', level: 1 }]);
    expect(events.some((ev) => ev.type === 'victory')).toBe(false);
    expect(s.cleared).toBe(true);
    const t = s.timeMs;
    expect(stepWorld(s, { direction: 'up', fire: true }, STEP_MS)).toEqual([]);
    expect(s.timeMs).toBe(t);
  });

  it('clearing level 5 also reports victory', () => {
    const { s, e } = lastEnemyWorld(5);
    const events = shootLast(s, e);
    expect(events.filter((ev) => ev.type === 'levelClear' || ev.type === 'victory')).toEqual([
      { type: 'levelClear', level: 5 },
      { type: 'victory' },
    ]);
  });

  it('the next level starts fresh with score and lives carried over; firepower is kept, power-ups are not', () => {
    const { s, e } = lastEnemyWorld(2, 1200, 2);
    s.player!.firepower = 1;
    s.player!.maxBullets = CONFIG.playerMaxBulletsUpgraded;
    shootLast(s, e);
    s.powerUps.push({ id: 999, type: 'shield', x: 1, y: 1 });
    const n = advanceLevel(s);
    expect(n.level).toBe(3);
    expect(n.score).toBe(1200 + CONFIG.enemyScore.normal);
    expect(n.lives).toBe(2);
    expect(n.enemiesRemaining).toBe(levelDef(3).order.length);
    expect(n.enemiesSpawned).toBe(0);
    expect(n.enemies).toEqual([]);
    expect(n.bullets).toEqual([]);
    expect(n.powerUps).toEqual([]);
    expect(n.cleared).toBe(false);
    expect(n.player!.firepower).toBe(1);
    expect(n.player!.maxBullets).toBe(CONFIG.playerMaxBulletsUpgraded);
    expect(n.spawnEnabled).toBe(true);
  });

  it('a new game starts at level 1 with score 0 and 3 lives', () => {
    const s = createWorld({ seed: 1, level: 1 });
    expect([s.level, s.score, s.lives, s.cleared]).toEqual([1, 0, 3, false]);
  });
});
