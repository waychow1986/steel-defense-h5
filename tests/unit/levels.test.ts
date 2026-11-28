import { describe, expect, it } from 'vitest';
import { LEVELS, levelCounts } from '../../src/game/levels';

const strong = (level: (typeof LEVELS)[number]): number => {
  const c = levelCounts(level).byType;
  return c.fast + c.heavy;
};

describe('UT-levels: five levels that grow harder (AC-11)', () => {
  it('has exactly five levels numbered 1 to 5', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([1, 2, 3, 4])('level %i → next: more enemies in total and no fewer stronger ones', (n) => {
    const a = LEVELS[n - 1];
    const b = LEVELS[n];
    expect(levelCounts(b).total).toBeGreaterThan(levelCounts(a).total);
    expect(strong(b)).toBeGreaterThanOrEqual(strong(a));
  });

  it.each([1, 2, 3, 4])('level %i → next: no fewer fast and no fewer heavy enemies, each on its own', (n) => {
    const a = levelCounts(LEVELS[n - 1]).byType;
    const b = levelCounts(LEVELS[n]).byType;
    expect(b.fast).toBeGreaterThanOrEqual(a.fast);
    expect(b.heavy).toBeGreaterThanOrEqual(a.heavy);
  });

  it('level 5 has more stronger enemies than level 1', () => {
    expect(strong(LEVELS[4])).toBeGreaterThan(strong(LEVELS[0]));
  });

  it('type counts add up to the total, and every level has at least one valid carrier', () => {
    for (const l of LEVELS) {
      const c = levelCounts(l);
      expect(c.byType.normal + c.byType.fast + c.byType.heavy).toBe(c.total);
      expect(l.order).toHaveLength(c.total);
      expect(l.carriers.length).toBeGreaterThan(0);
      for (const i of l.carriers) {
        expect(i).toBeGreaterThanOrEqual(1);
        expect(i).toBeLessThanOrEqual(c.total);
      }
    }
  });

  it('layouts are pairwise different and each has brick, steel and water', () => {
    const keys = LEVELS.map((l) => l.layout.join('\n'));
    expect(new Set(keys).size).toBe(5);
    for (const k of keys) {
      expect(k).toContain('B');
      expect(k).toContain('S');
      expect(k).toContain('W');
    }
  });
});
