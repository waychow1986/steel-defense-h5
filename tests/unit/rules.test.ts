import { describe, expect, it } from 'vitest';
import { fireBullet } from '../../src/game/bullets';
import { CONFIG } from '../../src/game/config';
import { createWorld, stepWorld, type StepInput } from '../../src/game/sim';
import { createEnemy } from '../../src/game/tanks';
import type { GameEvent, GameState } from '../../src/game/types';

const STEP_MS = 1000 / 60;
const idle: StepInput = { direction: null, fire: false };
const MARGIN = (1 - CONFIG.tankSize) / 2;

// Base at row 12 col 6 with brick above; columns 5 and 7 of row 12 are open.
const OPEN_SIDES = Array.from({ length: 13 }, (_, r) => (r === 11 ? '......B......' : r === 12 ? '......H......' : '.............'));

function runUntil(s: GameState, done: (ev: GameEvent[]) => boolean, maxMs = 3000): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(maxMs / STEP_MS); i += 1) {
    const ev = stepWorld(s, idle, STEP_MS);
    all.push(...ev);
    if (done(ev)) break;
  }
  return all;
}

/** An enemy two tiles above the player, facing down, with a bullet already in flight. */
function enemyShootsPlayer(s: GameState): GameEvent[] {
  const p = s.player!;
  const col = Math.round(p.x - MARGIN);
  const row = Math.round(p.y - MARGIN);
  const e = createEnemy(s.nextId++, 'normal', col, row - 3);
  e.fireCooldownMs = 1e9;
  s.enemies.push(e);
  expect(fireBullet(s, e, 1, CONFIG.bulletSpeed)).not.toBeNull();
  const ev = runUntil(s, (x) => x.some((e2) => e2.type === 'lifeLost' || e2.type === 'tankHit' || e2.type === 'gameOver'));
  s.enemies = s.enemies.filter((t) => t !== e);
  return ev;
}

function placePlayer(s: GameState, col: number, row: number, dir: 'up' | 'left' | 'right' | 'down'): void {
  const p = s.player!;
  p.x = col + MARGIN;
  p.y = row + MARGIN;
  p.dir = dir;
}

describe('UT-base-lives: base (AC-8)', () => {
  it("the player's own bullet hitting the base ends the game", () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 3, 12, 'right');
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    const ev = runUntil(s, (x) => x.some((e) => e.type === 'gameOver'));
    expect(s.base.destroyed).toBe(true);
    expect(ev.some((e) => e.type === 'explode' && e.target === 'base')).toBe(true);
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
    expect(s.lost).toBe(true);
  });

  it('an enemy bullet hitting the base ends the game', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    const e = createEnemy(s.nextId++, 'normal', 9, 12);
    e.dir = 'left';
    e.fireCooldownMs = 1e9;
    s.enemies.push(e);
    fireBullet(s, e, 1, CONFIG.bulletSpeed);
    const ev = runUntil(s, (x) => x.some((x2) => x2.type === 'gameOver'));
    expect(s.base.destroyed).toBe(true);
    expect(ev.some((x) => x.type === 'gameOver')).toBe(true);
  });

  it('after the game is lost, input no longer moves or fires', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 3, 12, 'right');
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    runUntil(s, (x) => x.some((e) => e.type === 'gameOver'));
    const before = JSON.stringify(s.player);
    for (let i = 0; i < 30; i += 1) {
      const ev = stepWorld(s, { direction: 'up', fire: true }, STEP_MS);
      expect(ev.some((e) => e.type === 'fire' && e.owner === 'player')).toBe(false);
    }
    expect(JSON.stringify(s.player)).toBe(before);
  });

  it('a shield does not protect the base', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 3, 12, 'right');
    s.player!.shieldMs = 5000;
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    const ev = runUntil(s, (x) => x.some((e) => e.type === 'gameOver'));
    expect(s.base.destroyed).toBe(true);
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
  });
});

describe('UT-base-lives: lives (AC-9)', () => {
  it('a hit costs one life and the player respawns at the spawn point facing up with firepower reset', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 1, 8, 'left');
    s.player!.firepower = 1;
    s.player!.maxBullets = CONFIG.playerMaxBulletsUpgraded;
    const ev = enemyShootsPlayer(s);
    expect(ev.some((e) => e.type === 'explode' && e.target === 'tank')).toBe(true);
    expect(ev.find((e) => e.type === 'lifeLost')).toEqual({ type: 'lifeLost', lives: 2 });
    expect(s.lives).toBe(2);
    runUntil(s, () => s.player !== null, 500);
    const p = s.player!;
    expect(p).not.toBeNull();
    expect(p.x).toBeCloseTo(CONFIG.playerSpawn.col + MARGIN, 9);
    expect(p.y).toBeCloseTo(CONFIG.playerSpawn.row + MARGIN, 9);
    expect(p.dir).toBe('up');
    expect(p.firepower).toBe(0);
    expect(p.maxBullets).toBe(CONFIG.playerMaxBullets);
    expect(s.lost).toBe(false);
    stepWorld(s, { direction: 'up', fire: true }, STEP_MS);
    expect(s.player!.y).toBeLessThan(CONFIG.playerSpawn.row + MARGIN);
  });

  it('losing the last life ends the game and the player does not respawn', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES, lives: 2 });
    placePlayer(s, 1, 8, 'left');
    enemyShootsPlayer(s);
    expect(s.lives).toBe(1);
    expect(s.lost).toBe(false);
    runUntil(s, () => s.player !== null, 500);
    const ev = enemyShootsPlayer(s);
    expect(s.lives).toBe(0);
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
    expect(s.lost).toBe(true);
    runUntil(s, () => false, 2000);
    expect(s.player).toBeNull();
    expect(s.lives).toBe(0);
  });

  it('while shielded an enemy hit costs no life and reports a shielded tankHit', () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 1, 8, 'left');
    s.player!.shieldMs = 5000;
    const before = s.player;
    const ev = enemyShootsPlayer(s);
    expect(ev.find((e) => e.type === 'tankHit')).toMatchObject({ tankId: before!.id, shielded: true });
    expect(ev.some((e) => e.type === 'lifeLost' || e.type === 'explode')).toBe(false);
    expect(s.lives).toBe(3);
    expect(s.player).toBe(before);
    expect(s.bullets).toHaveLength(0);
  });

  it("the player's own bullets never hurt the player", () => {
    const s = createWorld({ seed: 1, level: 1, layout: OPEN_SIDES });
    placePlayer(s, 1, 8, 'up');
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    const ev = runUntil(s, () => s.bullets.length === 0);
    expect(ev.some((e) => e.type === 'lifeLost' || e.type === 'tankHit')).toBe(false);
    expect(s.lives).toBe(3);
  });
});
