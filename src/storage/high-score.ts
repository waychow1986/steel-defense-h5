import { CONFIG } from '../game/config';

/** TD-013: stored values above this are treated as corrupt (0). */
const MAX_HIGH_SCORE = 9_999_999;

/** Reads the stored high score; missing, invalid or unavailable storage counts as 0. */
export function readHighScore(storage: Pick<Storage, 'getItem'> | null): number {
  try {
    const raw = storage?.getItem(CONFIG.highScoreKey);
    if (raw == null || !/^\d+$/.test(raw)) return 0;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n <= MAX_HIGH_SCORE ? n : 0;
  } catch {
    return 0;
  }
}

/** Saves the score if it beats the stored one; returns the resulting high score. */
export function saveHighScore(storage: Pick<Storage, 'getItem' | 'setItem'> | null, score: number): number {
  const current = readHighScore(storage);
  if (score <= current) return current;
  try {
    storage?.setItem(CONFIG.highScoreKey, String(score));
  } catch {
    // Storage may be full or blocked; keep the in-memory value.
  }
  return score;
}

export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
