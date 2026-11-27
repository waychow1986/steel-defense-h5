import { describe, expect, it } from 'vitest';
import { CUE_NAMES, CUE_RECIPES, cueForEvent } from '../../src/audio/cues';
import type { GameEvent } from '../../src/game/types';

describe('event → sound cue mapping (AC-19)', () => {
  it('the six sound events each map to their own cue', () => {
    const cases: Array<[GameEvent, string]> = [
      [{ type: 'fire', owner: 'player', x: 0, y: 0, dir: 'up' }, 'fire'],
      [{ type: 'fire', owner: 'enemy', x: 0, y: 0, dir: 'down' }, 'fire'],
      [{ type: 'brickHit', x: 0, y: 0, dir: 'up' }, 'hit'],
      [{ type: 'steelHit', x: 0, y: 0 }, 'hit'],
      [{ type: 'tankHit', tankId: 1, x: 0, y: 0, shielded: false }, 'hit'],
      [{ type: 'explode', target: 'tank', x: 0, y: 0 }, 'explosion'],
      [{ type: 'explode', target: 'base', x: 0, y: 0 }, 'explosion'],
      [{ type: 'pickup', powerUp: 'firepower', x: 0, y: 0 }, 'pickup'],
      [{ type: 'levelClear', level: 1 }, 'levelClear'],
      [{ type: 'gameOver' }, 'gameOver'],
    ];
    for (const [event, cue] of cases) expect(cueForEvent(event)).toBe(cue);
    expect(new Set(CUE_NAMES).size).toBe(6);
  });

  it('events without a sound map to no cue', () => {
    expect(cueForEvent({ type: 'scoreChanged', score: 1 })).toBeNull();
    expect(cueForEvent({ type: 'lifeLost', lives: 1 })).toBeNull();
    expect(cueForEvent({ type: 'enemySpawned', tankId: 1 })).toBeNull();
    expect(cueForEvent({ type: 'victory' })).toBeNull();
  });

  it('every cue has its own recipe and duration from the design table', () => {
    expect(Object.keys(CUE_RECIPES).sort()).toEqual([...CUE_NAMES].sort());
    expect(CUE_RECIPES.fire.durationS).toBeCloseTo(0.12);
    expect(CUE_RECIPES.hit.durationS).toBeCloseTo(0.15);
    expect(CUE_RECIPES.explosion.durationS).toBeCloseTo(0.9);
    expect(CUE_RECIPES.pickup.durationS).toBeCloseTo(0.3);
    expect(CUE_RECIPES.levelClear.durationS).toBeCloseTo(1.2);
    expect(CUE_RECIPES.gameOver.durationS).toBeCloseTo(1.4);
  });
});
