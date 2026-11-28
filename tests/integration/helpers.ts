import { expect, type Page } from '@playwright/test';

export type Snapshot = {
  screen: string;
  transitioning: boolean;
  seed: number;
  level: number;
  score: number;
  lives: number;
  enemiesRemaining: number;
  levelInfo: { total: number; byType: Record<string, number> };
  levels: Array<{ level: number; total: number; layout: string[] }>;
  player: null | { x: number; y: number; dir: string; moving: boolean };
  bullets: Array<{ owner: string; x: number; y: number; dir: string }>;
  map: { cols: number; rows: number; unitsPerTile: number; cells: string[] };
  perf: { fps: number; maxFrameGapMs: number; frames: number };
  input: { direction: string | null; fire: boolean; lastResponseMs: number | null };
};

export async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): Snapshot } }).steelDefense.snapshot());
}

/** Opens the page with a paused fake clock and enters level 1 `playing`. */
export async function startPlaying(page: Page, seed = 1): Promise<void> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`/?seed=${seed}`);
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.clock.runFor(100);
  expect((await snap(page)).screen).toBe('levelIntro');
  await page.clock.runFor(2000);
  expect((await snap(page)).screen).toBe('playing');
}
