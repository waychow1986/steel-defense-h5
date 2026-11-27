import { expect, test } from '@playwright/test';
import { openGame, passIntro, snap } from './helpers';

test.describe('E2E failure and return (AC-8, AC-18)', () => {
  test('own shot destroys the base → failure screen → back to start → can play again', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: '开始游戏' }).click();
    await passIntro(page);

    // Spawn sits two tiles left of the base behind one brick: face right and shoot.
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(100);
    await page.keyboard.up('ArrowRight');
    for (let i = 0; i < 3 && !(await snap(page)).base.destroyed; i++) {
      await page.keyboard.press('Space');
      await page.clock.runFor(400);
    }
    expect((await snap(page)).base.destroyed).toBe(true);

    await page.clock.runFor(1500);
    const failed = page.getByRole('dialog', { name: '失败' });
    await expect(failed).toBeVisible();
    expect((await snap(page)).screen).toBe('gameOver');
    await failed.getByRole('button', { name: '返回开始画面' }).click();
    expect((await snap(page)).transitioning).toBe(true);
    await page.clock.runFor(600);
    expect((await snap(page)).screen).toBe('start');
    await expect(failed).toBeHidden();
    await expect(page.getByRole('dialog', { name: '开始画面' })).toBeVisible();

    await page.getByRole('button', { name: '开始游戏' }).click();
    await passIntro(page);
    const s = await snap(page);
    expect(s.level).toBe(1);
    expect(s.lives).toBe(3);
    expect(s.base.destroyed).toBe(false);
  });
});
