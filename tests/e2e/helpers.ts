import { expect, type Locator, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

export const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

/** Opens the game with a paused fake clock so screen timings can be stepped deterministically. */
export async function openGame(page: Page, seed = 1): Promise<void> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`/?seed=${seed}`);
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await expect(page.getByRole('dialog', { name: '开始画面' })).toBeVisible();
}

/** From the level intro, waits until the game is in `playing`. */
export async function passIntro(page: Page): Promise<void> {
  await page.clock.runFor(100);
  expect((await snap(page)).screen).toBe('levelIntro');
  await expect(page.getByRole('dialog', { name: '关卡开场' })).toContainText('第 1 关');
  await page.clock.runFor(2000);
  expect((await snap(page)).screen).toBe('playing');
  await expect(page.getByRole('dialog', { name: '关卡开场' })).toBeHidden();
}

/** Holds a real touch (CDP touch events) on the centre of `target` for `ms` of game time. */
export async function touchHold(page: Page, target: Locator, ms: number): Promise<void> {
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.clock.runFor(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
