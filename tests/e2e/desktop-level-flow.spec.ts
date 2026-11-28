import { expect, test } from '@playwright/test';
import { openGame, passIntro, snap } from './helpers';

test.describe('E2E desktop level flow (AC-2, AC-4, AC-18)', () => {
  test('start → curtain intro → playing; keyboard moves and fires; HUD and side how-to visible', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: '开始游戏' }).click();
    expect((await snap(page)).transitioning).toBe(true);
    await passIntro(page);
    expect((await snap(page)).transitioning).toBe(false);

    const map = page.getByRole('img', { name: '战场' });
    await expect(map).toBeVisible();
    const hud = page.getByRole('group', { name: '战况' });
    await expect(hud.getByRole('status', { name: '关卡' })).toContainText('1');
    await expect(hud.getByRole('status', { name: '生命' })).toContainText('3');
    await expect(page.getByRole('region', { name: '怎么玩' }).first()).toBeVisible();

    const p0 = (await snap(page)).player!;
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(400);
    await page.keyboard.up('ArrowUp');
    await page.clock.runFor(50);
    const p1 = (await snap(page)).player!;
    expect(p1.dir).toBe('up');
    expect(p1.y).toBeLessThan(p0.y);
    await page.clock.runFor(300);
    expect((await snap(page)).player!.y).toBe(p1.y);

    await page.keyboard.press('Space');
    await page.clock.runFor(30);
    const shot = (await snap(page)).bullets.filter((b) => b.owner === 'player');
    expect(shot).toHaveLength(1);
    expect(shot[0].dir).toBe('up');

    await page.clock.runFor(3000);
    const s = await snap(page);
    expect(s.screen).toBe('playing');
    expect(s.enemies.length).toBeGreaterThan(0);
  });
});
