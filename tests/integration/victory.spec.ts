import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

/** Dev-server test page only: destroys every enemy of the current level (on field and still to come). */
const destroyAll = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { harness: { destroyAllEnemies(): void } }).harness.destroyAllEnemies());

async function openAt(page: Page, level: number): Promise<void> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`/tests/integration/harness/index.html?seed=3&startLevel=${level}`);
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.clock.runFor(2000);
  expect((await snap(page)).screen).toBe('playing');
}

test.describe('IT-07 last level and victory (AC-10, AC-18)', () => {
  test('clearing level 5 shows the clear screen, then 全部通关 with score, high score and the return button', async ({ page }) => {
    await openAt(page, 5);
    await page.clock.runFor(3000);
    await destroyAll(page);
    await page.clock.runFor(100);
    const s = await snap(page);
    expect(s.enemiesRemaining).toBe(0);
    expect(s.score).toBeGreaterThan(0);
    expect(s.screen).toBe('playing');

    await page.clock.runFor(1300);
    expect((await snap(page)).screen).toBe('levelClear');
    const clear = page.getByRole('dialog', { name: '过关' });
    await expect(clear).toBeVisible();
    await expect(clear).toContainText('第 5 关 过关');

    await page.clock.runFor(2100);
    const v = await snap(page);
    expect(v.screen).toBe('victory');
    expect(v.level).toBe(5);
    await expect(page.getByRole('dialog', { name: '关卡开场' })).toBeHidden();
    const dialog = page.getByRole('dialog', { name: '全部通关' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status', { name: '本局分数' })).toHaveText(String(s.score));
    await expect(dialog.getByRole('status', { name: '历史最高分' })).toHaveText(String(s.score));
    expect(v.highScore).toBe(s.score);

    await dialog.getByRole('button', { name: '返回开始画面' }).click();
    await page.clock.runFor(600);
    expect((await snap(page)).screen).toBe('start');
    await expect(page.getByRole('dialog', { name: '开始画面' }).getByRole('status', { name: '历史最高分' })).toHaveText(String(s.score));
  });

  test('clearing level 1 leads to the level 2 intro with score and lives carried over', async ({ page }) => {
    await openAt(page, 1);
    await destroyAll(page);
    await page.clock.runFor(100);
    const s = await snap(page);
    await page.clock.runFor(1300);
    await expect(page.getByRole('dialog', { name: '过关' })).toContainText('第 1 关 过关');
    await page.clock.runFor(2100);
    const intro = page.getByRole('dialog', { name: '关卡开场' });
    await expect(intro).toBeVisible();
    const n = await snap(page);
    expect(n.screen).toBe('levelIntro');
    expect(n.level).toBe(2);
    await expect(intro).toContainText('第 2 关');
    await expect(intro).toContainText(`敌人 ${n.levelInfo.total} 辆`);
    expect(n.levelInfo.total).toBeGreaterThan(s.levelInfo.total);
    expect(n.score).toBe(s.score);
    expect(n.lives).toBe(s.lives);
    expect(n.enemiesRemaining).toBe(n.levelInfo.total);
    expect(n.map.cells).not.toEqual(s.map.cells);

    await page.clock.runFor(2000);
    expect((await snap(page)).screen).toBe('playing');
    await expect(page.getByRole('status', { name: '关卡' })).toHaveText('2');
  });
});
