import { describe, expect, it } from 'vitest';
import { stepBullets, fireBullet } from '../../src/game/bullets';
import { CONFIG } from '../../src/game/config';
import { levelDef } from '../../src/game/levels';
import { createWorld, stepWorld, type StepInput } from '../../src/game/sim';
import { createEnemy, moveTank } from '../../src/game/tanks';
import type { GameEvent, GameState } from '../../src/game/types';

const STEP_MS = 1000 / 60;
const idle: StepInput = { direction: null, fire: false };
const EMPTY = Array.from({ length: 13 }, (_, r) => (r === 12 ? '......H......' : '.............'));
// Steel around the base so enemy bullets cannot end the game during long spawn runs.
const FORT = EMPTY.map((row, r) => (r === 11 ? '.....SSS.....' : r === 12 ? '.....SHS.....' : row));

function measureSpeed(type: 'normal' | 'fast' | 'heavy'): number {
  const s = createWorld({ seed: 1, level: 1, layout: EMPTY });
  s.player = null;
  const e = createEnemy(s.nextId++, type, 6, 0);
  s.enemies.push(e);
  const y0 = e.y;
  const steps = 30;
  for (let i = 0; i < steps; i += 1) moveTank(s, e, 'down', STEP_MS);
  return (e.y - y0) / ((steps * STEP_MS) / 1000);
}

/** Lets a player bullet fly into an enemy placed two tiles above the player. */
function shootEnemyOnce(s: GameState, enemyId: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = s.player!;
  p.fireCooldownMs = 0;
  expect(fireBullet(s, p, p.maxBullets, CONFIG.bulletSpeed)).not.toBeNull();
  for (let i = 0; i < 120 && s.bullets.some((b) => b.owner === 'player'); i += 1) stepBullets(s, STEP_MS, events);
  expect(events.some((e) => (e.type === 'tankHit' && e.tankId === enemyId) || e.type === 'explode')).toBe(true);
  return events;
}

describe('UT-enemies: types (AC-7)', () => {
  it('fast is at least 1.5x as fast as normal; heavy is slowest', () => {
    const normal = measureSpeed('normal');
    const fast = measureSpeed('fast');
    const heavy = measureSpeed('heavy');
    expect(normal).toBeCloseTo(CONFIG.enemySpeed.normal, 5);
    expect(fast / normal).toBeGreaterThanOrEqual(1.5);
    expect(heavy).toBeLessThan(normal);
  });

  it('a heavy tank survives the first hit and is destroyed only after at least 2 hits', () => {
    const s = createWorld({ seed: 1, level: 1, layout: EMPTY });
    const heavy = createEnemy(s.nextId++, 'heavy', 4, 9);
    s.enemies.push(heavy);
    const first = shootEnemyOnce(s, heavy.id);
    expect(first.find((e) => e.type === 'tankHit')).toMatchObject({ tankId: heavy.id, shielded: false });
    expect(s.enemies).toContain(heavy);
    expect(s.score).toBe(0);
    let hits = 1;
    while (s.enemies.includes(heavy) && hits < 10) {
      shootEnemyOnce(s, heavy.id);
      hits += 1;
    }
    expect(s.enemies).not.toContain(heavy);
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(s.score).toBe(CONFIG.enemyScore.heavy);
  });

  it('normal and fast tanks are destroyed by one player bullet', () => {
    for (const type of ['normal', 'fast'] as const) {
      const s = createWorld({ seed: 1, level: 1, layout: EMPTY });
      const e = createEnemy(s.nextId++, type, 4, 9);
      s.enemies.push(e);
      const ev = shootEnemyOnce(s, e.id);
      expect(ev.some((x) => x.type === 'explode' && x.target === 'tank')).toBe(true);
      expect(s.enemies).toHaveLength(0);
    }
  });

  it('enemy bullets do not hurt other enemies', () => {
    const s = createWorld({ seed: 1, level: 1, layout: EMPTY });
    const shooter = createEnemy(s.nextId++, 'normal', 4, 2);
    const victim = createEnemy(s.nextId++, 'normal', 4, 5);
    s.enemies.push(shooter, victim);
    fireBullet(s, shooter, 1, CONFIG.bulletSpeed);
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i += 1) stepBullets(s, STEP_MS, events);
    expect(s.enemies).toContain(victim);
    expect(events.some((e) => e.type === 'tankHit' || e.type === 'explode')).toBe(false);
  });
});

describe('UT-enemies: batched spawning (AC-7)', () => {
  it('spawns from the top row in rotation, never more than 4 on the field, not all at once', () => {
    const s = createWorld({ seed: 1, level: 1, layout: FORT, spawnEnemies: true });
    const total = levelDef(1).order.length;
    const spawned: Array<{ x: number; y: number; t: number }> = [];
    let maxOnField = 0;
    for (let i = 0; i < Math.round(20_000 / STEP_MS); i += 1) {
      s.player!.shieldMs = 1e9;
      const ev = stepWorld(s, idle, STEP_MS);
      for (const e of ev) {
        if (e.type !== 'enemySpawned') continue;
        const tank = s.enemies.find((t) => t.id === e.tankId)!;
        spawned.push({ x: tank.x, y: tank.y, t: s.timeMs });
      }
      maxOnField = Math.max(maxOnField, s.enemies.length);
      expect(s.enemies.length).toBeLessThanOrEqual(CONFIG.enemyMaxOnField);
    }
    expect(maxOnField).toBe(CONFIG.enemyMaxOnField);
    expect(spawned.length).toBeLessThan(total);
    expect(s.enemiesRemaining).toBe(total);
    const margin = (1 - CONFIG.tankSize) / 2;
    spawned.forEach((sp, i) => {
      expect(sp.y).toBeCloseTo(margin, 9);
      expect(sp.x).toBeCloseTo(CONFIG.enemySpawnCols[i % 3] + margin, 9);
      if (i > 0) expect(sp.t - spawned[i - 1].t).toBeGreaterThanOrEqual(CONFIG.enemySpawnIntervalMs - 1e-6);
    });
  });

  it('refills after enemies are destroyed until the whole level order has appeared, in order, with carriers marked', () => {
    const s = createWorld({ seed: 3, level: 1, layout: FORT, spawnEnemies: true });
    const def = levelDef(1);
    const seen: Array<{ type: string; carrier: boolean }> = [];
    for (let i = 0; i < Math.round(120_000 / STEP_MS) && seen.length < def.order.length; i += 1) {
      s.player!.shieldMs = 1e9;
      for (const e of stepWorld(s, idle, STEP_MS)) {
        if (e.type !== 'enemySpawned') continue;
        const t = s.enemies.find((x) => x.id === e.tankId)!;
        seen.push({ type: t.type, carrier: t.carrier });
      }
      // Remove the field after each spawn burst so the spawner has to refill.
      if (s.enemies.length === CONFIG.enemyMaxOnField) {
        s.enemies = [];
        s.bullets = [];
      }
    }
    expect(seen.map((x) => x.type)).toEqual([...def.order]);
    expect(seen.map((x, i) => (x.carrier ? i + 1 : 0)).filter(Boolean)).toEqual([...def.carriers]);
    expect(s.enemiesSpawned).toBe(def.order.length);
  });

  it('enemies move and fire on their own, at most one bullet each, deterministically per seed', () => {
    const runOnce = (seed: number): string => {
      const s = createWorld({ seed, level: 1, layout: FORT, spawnEnemies: true });
      let enemyFires = 0;
      for (let i = 0; i < Math.round(8000 / STEP_MS); i += 1) {
        s.player!.shieldMs = 1e9;
        const ev = stepWorld(s, idle, STEP_MS);
        enemyFires += ev.filter((e) => e.type === 'fire' && e.owner === 'enemy').length;
        for (const t of s.enemies) expect(s.bullets.filter((b) => b.ownerId === t.id).length).toBeLessThanOrEqual(1);
      }
      expect(enemyFires).toBeGreaterThan(0);
      expect(s.enemies.some((t) => t.y > 1)).toBe(true);
      return JSON.stringify({ e: s.enemies.map((t) => [t.x, t.y, t.dir]), b: s.bullets.length, r: s.rngState });
    };
    expect(runOnce(42)).toBe(runOnce(42));
    expect(runOnce(42)).not.toBe(runOnce(43));
  });
});
