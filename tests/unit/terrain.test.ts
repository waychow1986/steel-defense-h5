import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, type StepInput } from '../../src/game/sim';
import { mapRows } from '../../src/game/map';
import { LEVELS } from '../../src/game/levels';
import { CONFIG } from '../../src/game/config';
import type { Dir, GameState } from '../../src/game/types';

const STEP_MS = 1000 / 60;
const idle: StepInput = { direction: null, fire: false };

// 13 rows; the player spawns at row 12, column 4 (0-based), facing up.
function layoutWith(tile: string, col = 4, row = 10): string[] {
  const rows = Array.from({ length: 13 }, () => '.............'.split(''));
  rows[11][5] = 'B';
  rows[11][6] = 'B';
  rows[11][7] = 'B';
  rows[12][5] = 'B';
  rows[12][6] = 'H';
  rows[12][7] = 'B';
  rows[row][col] = tile;
  return rows.map((r) => r.join(''));
}

function run(state: GameState, input: StepInput, ms: number): void {
  const steps = Math.round(ms / STEP_MS);
  for (let i = 0; i < steps; i += 1) stepWorld(state, input, STEP_MS);
}

function fireAndWait(state: GameState): void {
  const events = stepWorld(state, { direction: null, fire: true }, STEP_MS);
  expect(events.some((e) => e.type === 'fire')).toBe(true);
  let guard = 0;
  while (state.bullets.length > 0 && guard < 600) {
    stepWorld(state, idle, STEP_MS);
    guard += 1;
  }
  expect(state.bullets.length).toBe(0);
}

function tileUnits(state: GameState, col: number, row: number): string[] {
  const rows = mapRows(state.map);
  return rows.slice(row * 4, row * 4 + 4).map((r) => r.slice(col * 4, col * 4 + 4));
}

function face(state: GameState, dir: Dir): void {
  stepWorld(state, { direction: dir, fire: false }, 1);
  stepWorld(state, idle, 1);
}

describe('UT-terrain: brick', () => {
  it('a hit clears a 2x4 strip perpendicular to the flight, the rest of the wall stays', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('B') });
    expect(s.player?.dir).toBe('up');
    fireAndWait(s);
    const units = tileUnits(s, 4, 10);
    expect(units).toEqual(['BBBB', 'BBBB', '....', '....']);
  });

  it('the bullet disappears at the brick and emits brickHit', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('B') });
    const events = stepWorld(s, { direction: null, fire: true }, STEP_MS);
    expect(events.some((e) => e.type === 'fire')).toBe(true);
    let hit = false;
    for (let i = 0; i < 120 && s.bullets.length > 0; i += 1) {
      const ev = stepWorld(s, idle, STEP_MS);
      if (ev.some((e) => e.type === 'brickHit')) hit = true;
    }
    expect(hit).toBe(true);
    expect(s.bullets.length).toBe(0);
  });

  it('blocks the tank until shot through, then the tank can drive across', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('B') });
    run(s, { direction: 'up', fire: false }, 2000);
    expect(s.player!.y).toBeGreaterThanOrEqual(11 - 1e-9);
    expect(s.player!.y).toBeLessThan(11.01);
    fireAndWait(s);
    fireAndWait(s);
    expect(tileUnits(s, 4, 10)).toEqual(['....', '....', '....', '....']);
    run(s, { direction: 'up', fire: false }, 1000);
    expect(s.player!.y).toBeLessThan(10);
  });

  it('a horizontal hit clears 4 rows x 2 columns', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('B', 1, 12) });
    face(s, 'left');
    expect(s.player!.dir).toBe('left');
    fireAndWait(s);
    expect(tileUnits(s, 1, 12)).toEqual(['BB..', 'BB..', 'BB..', 'BB..']);
  });
});

describe('UT-terrain: steel', () => {
  it('is unchanged after five hits and blocks the tank', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('S') });
    const before = mapRows(s.map).join('\n');
    for (let i = 0; i < 5; i += 1) fireAndWait(s);
    expect(mapRows(s.map).join('\n')).toBe(before);
    run(s, { direction: 'up', fire: false }, 2000);
    expect(s.player!.y).toBeGreaterThanOrEqual(11 - 1e-9);
  });

  it('emits steelHit when a bullet stops on it', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('S') });
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    const types: string[] = [];
    for (let i = 0; i < 120 && s.bullets.length > 0; i += 1) {
      types.push(...stepWorld(s, idle, STEP_MS).map((e) => e.type));
    }
    expect(types).toContain('steelHit');
  });
});

describe('UT-terrain: water', () => {
  it('blocks the tank', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('W') });
    run(s, { direction: 'up', fire: false }, 2000);
    expect(s.player!.y).toBeGreaterThanOrEqual(11 - 1e-9);
    expect(s.player!.y).toBeLessThan(11.01);
  });

  it('lets bullets fly over and stays unchanged', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('W') });
    const before = mapRows(s.map).join('\n');
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    let passed = false;
    for (let i = 0; i < 120 && s.bullets.length > 0; i += 1) {
      stepWorld(s, idle, STEP_MS);
      if (s.bullets.length > 0 && s.bullets[0].y < 10) passed = true;
    }
    expect(passed).toBe(true);
    expect(mapRows(s.map).join('\n')).toBe(before);
  });
});

describe('UT-terrain: map edges', () => {
  it('the tank cannot leave the map', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('.') });
    run(s, { direction: 'left', fire: false }, 3000);
    expect(s.player!.x).toBeCloseTo(0, 9);
    run(s, { direction: 'down', fire: false }, 1000);
    expect(s.player!.y + CONFIG.tankSize).toBeLessThanOrEqual(13 + 1e-9);
    run(s, { direction: 'up', fire: false }, 6000);
    expect(s.player!.y).toBeCloseTo(0, 9);
  });

  it('a bullet that reaches the edge disappears', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('.') });
    stepWorld(s, { direction: null, fire: true }, STEP_MS);
    expect(s.bullets.length).toBe(1);
    run(s, idle, 2000);
    expect(s.bullets.length).toBe(0);
  });
});

describe('UT-terrain: movement', () => {
  it('moves at the configured speed and only along the facing axis', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('.') });
    const x0 = s.player!.x;
    const y0 = s.player!.y;
    run(s, { direction: 'up', fire: false }, 500);
    expect(s.player!.x).toBe(x0);
    expect(y0 - s.player!.y).toBeCloseTo(CONFIG.playerSpeed * 0.5, 1);
    expect(s.player!.moving).toBe(true);
    stepWorld(s, idle, STEP_MS);
    expect(s.player!.moving).toBe(false);
  });

  it('snaps the cross axis to the nearest half tile when turning', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('.') });
    run(s, { direction: 'up', fire: false }, 300);
    run(s, { direction: 'left', fire: false }, 50);
    const centerY = s.player!.y + CONFIG.tankSize / 2;
    expect((centerY * 2) % 1).toBeCloseTo(0, 9);
  });

  it('keeps one player bullet at a time while fire is held', () => {
    const s = createWorld({ seed: 1, level: 1, layout: layoutWith('.') });
    let fires = 0;
    for (let i = 0; i < 30; i += 1) {
      fires += stepWorld(s, { direction: null, fire: true }, STEP_MS).filter((e) => e.type === 'fire').length;
      expect(s.bullets.length).toBeLessThanOrEqual(1);
    }
    expect(fires).toBe(1);
  });
});

describe('UT-terrain: levels', () => {
  it('has five levels, each containing brick, steel, water and the base with brick on three sides', () => {
    expect(LEVELS).toHaveLength(5);
    for (const lv of LEVELS) {
      expect(lv.layout).toHaveLength(13);
      const text = lv.layout.join('');
      expect(text).toMatch(/B/);
      expect(text).toMatch(/S/);
      expect(text).toMatch(/W/);
      expect(lv.layout[12][6]).toBe('H');
      expect(lv.layout[12][5]).toBe('B');
      expect(lv.layout[12][7]).toBe('B');
      expect(lv.layout[11][6]).toBe('B');
      expect(lv.layout[12][4]).toBe('.');
      for (const c of [0, 6, 12]) expect(lv.layout[0][c]).toBe('.');
    }
  });

  // Brick and open ground count as passable (brick can be shot away); steel and water do not.
  function reachesBase(layout: readonly string[], start: { row: number; col: number }): boolean {
    const rows = layout.length;
    const cols = layout[0].length;
    const passable = (r: number, c: number): boolean =>
      r >= 0 && r < rows && c >= 0 && c < cols && (layout[r][c] === '.' || layout[r][c] === 'B');
    const isBase = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols && layout[r][c] === 'H';
    const seen = new Set<string>([`${start.row},${start.col}`]);
    const queue = [start];
    while (queue.length > 0) {
      const { row, col } = queue.shift()!;
      const next = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];
      if (next.some(([r, c]) => isBase(r, c))) return true;
      for (const [r, c] of next) {
        const key = `${r},${c}`;
        if (!seen.has(key) && passable(r, c)) {
          seen.add(key);
          queue.push({ row: r, col: c });
        }
      }
    }
    return false;
  }

  it.each(LEVELS.map((lv) => [lv.level, lv] as const))(
    'level %i: the player spawn and all three enemy spawns can reach the command post',
    (_n, lv) => {
      expect(reachesBase(lv.layout, CONFIG.playerSpawn)).toBe(true);
      for (const col of CONFIG.enemySpawnCols) {
        expect(reachesBase(lv.layout, { row: 0, col })).toBe(true);
      }
    },
  );

  it('the reachability check rejects a base sealed by steel and water', () => {
    const sealed = [...LEVELS[0].layout];
    sealed[10] = 'SSSSSSWWWWWWW';
    expect(reachesBase(sealed, CONFIG.playerSpawn)).toBe(true);
    expect(reachesBase(sealed, { row: 0, col: 0 })).toBe(false);
  });

  it('builds the 52x52 unit map from the layout', () => {
    const s = createWorld({ seed: 1, level: 1 });
    const rows = mapRows(s.map);
    expect(rows).toHaveLength(52);
    LEVELS[0].layout.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const expected = ch === 'B' ? 'B' : ch === 'S' ? 'S' : ch === 'W' ? 'W' : '.';
        expect(rows[r * 4][c * 4]).toBe(expected);
      });
    });
  });
});
