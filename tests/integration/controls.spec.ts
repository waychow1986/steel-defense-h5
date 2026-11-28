import { expect, test, type Locator, type Page } from '@playwright/test';
import { snap, startPlaying } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const down = (l: Locator, pointerId: number) =>
  l.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });
const up = (l: Locator, pointerId: number) =>
  l.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });
const btn = (page: Page, name: string) => page.getByRole('button', { name });

test.describe('AC-5 virtual direction pad and fire button', () => {
  test('hold a direction to move, release to stop', async ({ page }) => {
    await startPlaying(page);
    const p0 = (await snap(page)).player!;
    await down(btn(page, '向上'), 1);
    await page.clock.runFor(300);
    const s1 = await snap(page);
    expect(s1.input.direction).toBe('up');
    expect(s1.player!.dir).toBe('up');
    expect(s1.player!.y).toBeLessThan(p0.y);
    await up(btn(page, '向上'), 1);
    await page.clock.runFor(50);
    const s2 = await snap(page);
    expect(s2.input.direction).toBeNull();
    await page.clock.runFor(300);
    expect((await snap(page)).player!.y).toBe(s2.player!.y);
  });

  test('a second finger takes over; lifting it falls back to the first', async ({ page }) => {
    await startPlaying(page);
    await down(btn(page, '向左'), 1);
    await page.clock.runFor(50);
    await down(btn(page, '向上'), 2);
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBe('up');
    await up(btn(page, '向上'), 2);
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBe('left');
    await up(btn(page, '向左'), 1);
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBeNull();
  });

  test('pointercancel releases the held direction', async ({ page }) => {
    await startPlaying(page);
    await down(btn(page, '向右'), 1);
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBe('right');
    await btn(page, '向右').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'touch', bubbles: true });
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBeNull();
  });

  test('fire button shoots one bullet per press', async ({ page }) => {
    await startPlaying(page);
    await down(btn(page, '向上'), 1);
    await page.clock.runFor(50);
    await up(btn(page, '向上'), 1);
    await down(btn(page, '开火'), 2);
    await page.clock.runFor(50);
    const s = await snap(page);
    expect(s.bullets.filter((b) => b.owner === 'player')).toHaveLength(1);
    expect(s.bullets.find((b) => b.owner === 'player')!.dir).toBe('up');
    await up(btn(page, '开火'), 2);
    await page.clock.runFor(50);
    expect((await snap(page)).input.fire).toBe(false);
  });

  test('a real touch held on the pad moves the tank; lifting stops it', async ({ page }) => {
    await startPlaying(page);
    const p0 = (await snap(page)).player!;
    const box = (await btn(page, '向上').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.clock.runFor(300);
    const s1 = await snap(page);
    expect(s1.input.direction).toBe('up');
    expect(s1.player!.y).toBeLessThan(p0.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(50);
    expect((await snap(page)).input.direction).toBeNull();
  });

  test('controls are hidden on the start screen and do not start the game', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto('/?seed=1');
    await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
    await expect(btn(page, '开火')).toBeHidden();
    expect((await snap(page)).screen).toBe('start');
  });
});
