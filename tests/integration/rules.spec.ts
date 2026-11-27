import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';
import { startPlaying } from './helpers';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

test.describe('AC-8 / AC-13 base hit ends the game', () => {
  test('own bullet on the base: base destroyed, input stops, failure screen with scores and return button', async ({ page }) => {
    await startPlaying(page);
    // Spawn is col 4 row 12; col 5 is brick, col 6 is the base. Face right (blocked, so only turns).
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(100);
    await page.keyboard.up('ArrowRight');
    for (let i = 0; i < 3 && !(await snap(page)).base.destroyed; i++) {
      await page.keyboard.press('Space');
      await page.clock.runFor(400);
    }
    const s = await snap(page);
    expect(s.base.destroyed).toBe(true);
    expect(s.screen).toBe('playing');
    const pos = s.player!;

    // A-9: once lost, movement and fire do nothing.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.press('Space');
    await page.clock.runFor(300);
    await page.keyboard.up('ArrowUp');
    const s2 = await snap(page);
    expect(s2.player!.y).toBe(pos.y);
    expect(s2.bullets.filter((b) => b.owner === 'player')).toHaveLength(0);

    // The failure screen follows the explosion.
    await page.clock.runFor(1500);
    const dialog = page.getByRole('dialog', { name: '失败' });
    await expect(dialog).toBeVisible();
    expect((await snap(page)).screen).toBe('gameOver');
    await expect(dialog.getByRole('status', { name: '本局分数' })).toHaveText(String(s2.score));
    await expect(dialog.getByRole('status', { name: '历史最高分' })).toHaveText(String(s2.highScore));
    await dialog.getByRole('button', { name: '返回开始画面' }).click();
    await page.clock.runFor(600);
    expect((await snap(page)).screen).toBe('start');
    await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();
  });

  test('HUD shows level, score, lives and enemies remaining while playing', async ({ page }) => {
    await startPlaying(page);
    const s = await snap(page);
    await expect(page.getByRole('status', { name: '关卡' })).toContainText(String(s.level));
    await expect(page.getByRole('status', { name: '分数' })).toContainText(String(s.score));
    await expect(page.getByRole('status', { name: '生命' })).toContainText(String(s.lives));
    await expect(page.getByRole('status', { name: '剩余敌人' })).toContainText(String(s.levelInfo.total));
    // Enemies appearing on the field do not change the remaining count.
    await page.clock.runFor(3000);
    const s2 = await snap(page);
    expect(s2.enemies.length).toBeGreaterThan(0);
    expect(s2.enemiesRemaining).toBe(s.levelInfo.total);
    await expect(page.getByRole('status', { name: '剩余敌人' })).toContainText(String(s.levelInfo.total));
  });
});
