import { expect, test } from '@playwright/test';
import { openGame, passIntro, PHONE, snap, touchHold } from './helpers';

test.use(PHONE);

test.describe('E2E phone level flow (AC-2, AC-5, AC-22)', () => {
  test('tap start; hold the virtual pad to move, lift to stop; tap fire to shoot', async ({ page }) => {
    await openGame(page);
    await expect(page.getByRole('button', { name: '开火' })).toBeHidden();
    await page.getByRole('button', { name: '开始游戏' }).tap();
    await passIntro(page);

    const pad = page.getByRole('group', { name: '方向键' });
    await expect(pad).toBeVisible();
    const fire = page.getByRole('button', { name: '开火' });
    await expect(fire).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const p0 = (await snap(page)).player!;
    await touchHold(page, pad.getByRole('button', { name: '向上' }), 400);
    await page.clock.runFor(50);
    const p1 = (await snap(page)).player!;
    expect(p1.dir).toBe('up');
    expect(p1.y).toBeLessThan(p0.y);
    expect((await snap(page)).input.direction).toBeNull();
    await page.clock.runFor(300);
    expect((await snap(page)).player!.y).toBe(p1.y);

    await touchHold(page, fire, 30);
    const shot = (await snap(page)).bullets.filter((b) => b.owner === 'player');
    expect(shot).toHaveLength(1);
    expect(shot[0].dir).toBe('up');
  });
});
