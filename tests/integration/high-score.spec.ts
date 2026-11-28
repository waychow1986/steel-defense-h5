import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';

const KEY = 'steel-defense.highScore.v1';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

const destroyAll = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { harness: { destroyAllEnemies(): void } }).harness.destroyAllEnemies());

async function playAndScore(page: Page, stored: number): Promise<number> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/tests/integration/harness/index.html?seed=1');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, String(stored)]);
  await page.reload();
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.clock.runFor(2000);
  await destroyAll(page);
  await page.clock.runFor(100);
  const s = await snap(page);
  // Still mid-level (the clear screen has not appeared yet).
  expect(s.screen).toBe('playing');
  return s.score;
}

const startHigh = (page: Page) => page.getByRole('dialog', { name: '开始画面' }).getByRole('status', { name: '历史最高分' });

test.describe('IT-06 high score persists (AC-14)', () => {
  test('a score above the record is saved during play and shown on the start screen after reload', async ({ page }) => {
    const score = await playAndScore(page, 50);
    expect(score).toBeGreaterThan(50);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(String(score));
    expect((await snap(page)).highScore).toBe(score);

    await page.goto('/');
    await expect(startHigh(page)).toHaveText(String(score));
  });

  test('a lower score does not overwrite the record', async ({ page }) => {
    const score = await playAndScore(page, 100000);
    expect(score).toBeLessThan(100000);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('100000');
    await page.goto('/');
    await expect(startHigh(page)).toHaveText('100000');
  });
});
