import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/game/config';
import { levelDef } from '../../src/game/levels';
import { powerUpTypeFor } from '../../src/game/powerups';
import { createWorld, stepWorld } from '../../src/game/sim';
import { createEnemy } from '../../src/game/tanks';
import type { GameEvent, GameState, PowerUpType, Tank } from '../../src/game/types';

const STEP_MS = 1000 / 60;
const EMPTY = Array.from({ length: 13 }, (_, r) => (r === 12 ? '......H......' : '.............'));
const IDLE = { direction: null, fire: false } as const;
const M = (1 - CONFIG.tankSize) / 2;

function world(): GameState {
  return createWorld({ seed: 1, level: 1, layout: EMPTY });
}

/** Parks an enemy at (col,row) and fires at it from the player spawn (col 4, row 12) until it is gone. */
function shootDown(s: GameState, e: Tank): GameEvent[] {
  e.fireCooldownMs = 1e9;
  s.enemies.push(e);
  const events: GameEvent[] = [];
  const col = Math.round(e.x - M);
  const row = Math.round(e.y - M);
  for (let i = 0; i < 600 && s.enemies.includes(e); i += 1) {
    e.x = col + M;
    e.y = row + M;
    e.fireCooldownMs = 1e9;
    events.push(...stepWorld(s, { direction: null, fire: true }, STEP_MS));
  }
  expect(s.enemies.includes(e)).toBe(false);
  return events;
}

function placePowerUp(s: GameState, type: PowerUpType, col: number, row: number): void {
  s.powerUps.push({ id: s.nextId++, type, x: col, y: row });
}

describe('UT-powerups: drops (AC-12)', () => {
  it('a destroyed carrier leaves a power-up in the tile where it was destroyed', () => {
    const s = world();
    shootDown(s, createEnemy(s.nextId++, 'normal', 4, 8, true));
    expect(s.powerUps).toHaveLength(1);
    expect(s.powerUps[0]).toMatchObject({ type: 'shield', x: 4, y: 8 });
  });

  it('a destroyed non-carrier leaves nothing', () => {
    const s = world();
    shootDown(s, createEnemy(s.nextId++, 'normal', 4, 8, false));
    expect(s.powerUps).toHaveLength(0);
  });

  it('the type alternates by carrier number: odd shield, even firepower', () => {
    expect([1, 2, 3, 4].map(powerUpTypeFor)).toEqual(['shield', 'firepower', 'shield', 'firepower']);
    const s = world();
    const second = createEnemy(s.nextId++, 'normal', 4, 8, true);
    second.carrierSeq = 2;
    shootDown(s, second);
    expect(s.powerUps.map((u) => u.type)).toEqual(['firepower']);
  });

  it('spawned carriers are numbered by their place in the level carrier list', () => {
    const FORT = EMPTY.map((row, r) => (r === 11 ? '.....SSS.....' : r === 12 ? '.....SHS.....' : row));
    const s = createWorld({ seed: 1, level: 1, layout: FORT, spawnEnemies: true });
    const def = levelDef(1);
    const seen = new Map<number, Tank>();
    for (let i = 0; i < 20000 && s.enemiesSpawned < def.carriers[0]; i += 1) {
      s.player!.shieldMs = 1e9;
      stepWorld(s, IDLE, STEP_MS);
      for (const e of s.enemies) seen.set(e.id, e);
      // Keep the field free so spawning continues.
      if (s.enemies.length >= CONFIG.enemyMaxOnField) s.enemies = [];
    }
    const carriers = [...seen.values()].filter((e) => e.carrier);
    expect(carriers).toHaveLength(1);
    expect(carriers[0].carrierSeq).toBe(1);
  });
});

describe('UT-powerups: pickup and effects (AC-12)', () => {
  it('the player picks up a power-up by driving onto it; it disappears and applies at once', () => {
    const s = world();
    placePowerUp(s, 'shield', 4, 11);
    let events: GameEvent[] = [];
    for (let i = 0; i < 60 && s.powerUps.length > 0; i += 1) events = stepWorld(s, { direction: 'up', fire: false }, STEP_MS);
    expect(s.powerUps).toHaveLength(0);
    expect(events.find((e) => e.type === 'pickup')).toMatchObject({ type: 'pickup', powerUp: 'shield' });
    expect(s.player!.shieldMs).toBe(CONFIG.shieldMs);
  });

  it('enemies cannot pick up power-ups', () => {
    const s = world();
    placePowerUp(s, 'shield', 8, 5);
    const e = createEnemy(s.nextId++, 'normal', 8, 5);
    e.fireCooldownMs = 1e9;
    s.enemies.push(e);
    stepWorld(s, IDLE, STEP_MS);
    expect(s.powerUps).toHaveLength(1);
  });

  it('shield absorbs enemy bullets, lasts 10 s, and a second shield restarts the timer', () => {
    const s = world();
    placePowerUp(s, 'shield', 4, 12);
    stepWorld(s, IDLE, STEP_MS);
    expect(s.player!.shieldMs).toBe(CONFIG.shieldMs);
    for (let t = 0; t < 4000; t += STEP_MS) stepWorld(s, IDLE, STEP_MS);
    placePowerUp(s, 'shield', 4, 12);
    stepWorld(s, IDLE, STEP_MS);
    expect(s.player!.shieldMs).toBe(CONFIG.shieldMs);

    s.bullets.push({ id: s.nextId++, owner: 'enemy', ownerId: 999, x: 4.5, y: 11.5, dir: 'down', speed: 9 });
    for (let i = 0; i < 30; i += 1) stepWorld(s, IDLE, STEP_MS);
    expect(s.lives).toBe(3);
    expect(s.player).not.toBeNull();

    for (let i = 0; i < Math.ceil(CONFIG.shieldMs / STEP_MS); i += 1) stepWorld(s, IDLE, STEP_MS);
    expect(s.player!.shieldMs).toBe(0);
    s.bullets.push({ id: s.nextId++, owner: 'enemy', ownerId: 999, x: 4.5, y: 11.5, dir: 'down', speed: 9 });
    for (let i = 0; i < 30; i += 1) stepWorld(s, IDLE, STEP_MS);
    expect(s.lives).toBe(2);
  });

  it('firepower makes bullets faster and allows two at once; it is lost with a life', () => {
    const s = world();
    placePowerUp(s, 'firepower', 4, 12);
    const events = stepWorld(s, IDLE, STEP_MS);
    expect(events.find((e) => e.type === 'pickup')).toMatchObject({ powerUp: 'firepower' });
    expect(s.player!.firepower).toBe(1);
    expect(s.player!.maxBullets).toBe(CONFIG.playerMaxBulletsUpgraded);

    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    const mine = s.bullets.filter((b) => b.owner === 'player');
    expect(mine).toHaveLength(2);
    expect(mine.every((b) => b.speed === CONFIG.bulletSpeedUpgraded)).toBe(true);
    expect(CONFIG.bulletSpeedUpgraded).toBeGreaterThan(CONFIG.bulletSpeed);

    s.bullets = [{ id: s.nextId++, owner: 'enemy', ownerId: 999, x: 4.5, y: 11.5, dir: 'down', speed: 9 }];
    for (let i = 0; i < 30; i += 1) stepWorld(s, IDLE, STEP_MS);
    expect(s.lives).toBe(2);
    expect(s.player).not.toBeNull();
    expect(s.player!.firepower).toBe(0);
    expect(s.player!.maxBullets).toBe(CONFIG.playerMaxBullets);
  });
});
