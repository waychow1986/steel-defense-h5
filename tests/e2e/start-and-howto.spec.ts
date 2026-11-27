import { expect, test } from '@playwright/test';
import { openGame, passIntro, PHONE, snap } from './helpers';

const checkStartScreen = async (page: import('@playwright/test').Page) => {
  const start = page.getByRole('dialog', { name: '开始画面' });
  await expect(page.getByRole('heading', { name: '钢铁防线' })).toBeVisible();
  await expect(start.getByRole('button', { name: '开始游戏' })).toBeVisible();
  const howTo = start.getByRole('region', { name: '怎么玩' });
  await expect(howTo).toBeVisible();
  const text = (await howTo.textContent()) ?? '';
  for (const word of ['方向键', 'W', 'A', 'S', 'D', '空格', '开火', '敌方坦克', '指挥所', '静音', '可能听不到音效']) {
    expect(text).toContain(word);
  }
  expect((await snap(page)).screen).toBe('start');
};

test.describe('E2E start screen and how-to (AC-2, AC-3)', () => {
  test('desktop: start screen shows title, how-to and start; keys do nothing; click enters level 1', async ({ page }) => {
    await openGame(page);
    await checkStartScreen(page);
    await page.keyboard.down('ArrowUp');
    await page.keyboard.press('Space');
    await page.clock.runFor(300);
    await page.keyboard.up('ArrowUp');
    const s = await snap(page);
    expect(s.screen).toBe('start');
    expect(s.player).toBeNull();
    expect(s.bullets).toHaveLength(0);
    await page.getByRole('button', { name: '开始游戏' }).click();
    await passIntro(page);
    expect((await snap(page)).level).toBe(1);
  });

  test.describe('phone', () => {
    test.use(PHONE);

    test('phone: how-to is readable without horizontal scroll; tapping start enters level 1', async ({ page }) => {
      await openGame(page);
      await checkStartScreen(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByRole('button', { name: '开始游戏' }).tap();
      await passIntro(page);
      expect((await snap(page)).level).toBe(1);
    });
  });
});
