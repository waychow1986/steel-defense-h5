import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/game/config';
import { readHighScore, saveHighScore } from '../../src/storage/high-score';

function memStorage(initial?: string): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(CONFIG.highScoreKey, initial);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('UT-highscore: stored high score (AC-14)', () => {
  it('reads 0 when nothing is stored or storage is unavailable', () => {
    expect(readHighScore(memStorage())).toBe(0);
    expect(readHighScore(null)).toBe(0);
    const throwing = { getItem: (): string => { throw new Error('blocked'); } };
    expect(readHighScore(throwing)).toBe(0);
  });

  it.each(['abc', '-5', '1.5', '', '10000000'])('treats the invalid value %j as 0', (raw) => {
    expect(readHighScore(memStorage(raw))).toBe(0);
  });

  it('accepts the upper bound 9,999,999', () => {
    expect(readHighScore(memStorage('9999999'))).toBe(9_999_999);
  });

  it('saves a higher score and keeps the stored one when the score is equal or lower', () => {
    const s = memStorage('50');
    expect(saveHighScore(s, 50)).toBe(50);
    expect(saveHighScore(s, 40)).toBe(50);
    expect(s.data.get(CONFIG.highScoreKey)).toBe('50');
    expect(saveHighScore(s, 100)).toBe(100);
    expect(s.data.get(CONFIG.highScoreKey)).toBe('100');
    expect(readHighScore(s)).toBe(100);
  });

  it('keeps the in-memory high score when writing fails', () => {
    const s = { getItem: (): null => null, setItem: (): void => { throw new Error('full'); } };
    expect(saveHighScore(s, 300)).toBe(300);
  });
});
