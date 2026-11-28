import { expect, test } from '@playwright/test';
import { openGame, passIntro, PHONE, snap } from './helpers';

test.use(PHONE);

test.describe('E2E landscape hint (AC-22, I1)', () => {
  test('rotating the phone shows the rotate hint; rotating back resumes the same game', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: '开始游戏' }).tap();
    await passIntro(page);
    const hint = page.getByRole('alertdialog', { name: '请旋转手机' });
    await expect(hint).toBeHidden();
    const before = await snap(page);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('竖');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeHidden();
    const after = await snap(page);
    expect(after.screen).toBe('playing');
    expect(after.level).toBe(before.level);
    expect(after.score).toBe(before.score);
    await expect(page.getByRole('img', { name: '战场' })).toBeVisible();
    await expect(page.getByRole('button', { name: '开火' })).toBeVisible();
  });
});
