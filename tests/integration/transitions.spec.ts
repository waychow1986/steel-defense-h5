import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';
import { startPlaying } from './helpers';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

type OverlayState = { hidden: boolean; visible: boolean; transition: string | null };

/** An overlay may be seen when it is shown with its visible class, or still fading out. */
const seen = (o: OverlayState): boolean => !o.hidden && (o.visible || o.transition === 'leaving');

async function overlay(page: Page, name: string): Promise<OverlayState> {
  return page.getByRole('dialog', { name, includeHidden: true }).evaluate((el) => ({
    hidden: (el as HTMLElement).hidden,
    visible: el.classList.contains('is-visible'),
    transition: (el as HTMLElement).dataset.transition ?? null,
  }));
}

/** Steps the fake clock frame by frame across a switch; records transitions and checks the pair never vanishes. */
async function watchSwitch(page: Page, from: string, to: string, ms: number): Promise<{ from: Set<string>; to: Set<string> }> {
  const seenFrom = new Set<string>();
  const seenTo = new Set<string>();
  for (let t = 0; t <= ms; t += 16) {
    const a = await overlay(page, from);
    const b = await overlay(page, to);
    if (a.transition) seenFrom.add(a.transition);
    if (b.transition) seenTo.add(b.transition);
    expect(seen(a) || seen(b), `${from} / ${to} both invisible at +${t}ms`).toBe(true);
    await page.clock.runFor(16);
  }
  return { from: seenFrom, to: seenTo };
}

async function loseByOwnFire(page: Page): Promise<void> {
  await page.keyboard.down('ArrowRight');
  await page.clock.runFor(100);
  await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 3 && !(await snap(page)).base.destroyed; i++) {
    await page.keyboard.press('Space');
    await page.clock.runFor(400);
  }
  expect((await snap(page)).base.destroyed).toBe(true);
}

test.describe('IT-08 screen transitions (AC-18, AC-23)', () => {
  test('start → level intro: start fades out while the intro fades in, never both invisible', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto('/?seed=1');
    await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
    await page.getByRole('button', { name: '开始游戏' }).click();
    expect((await snap(page)).transitioning).toBe(true);
    const seenT = await watchSwitch(page, '开始画面', '关卡开场', 400);
    expect(seenT.from.has('leaving')).toBe(true);
    expect(seenT.to.has('entering')).toBe(true);
    expect((await snap(page)).screen).toBe('levelIntro');
  });

  test('level intro plays the map curtain, then the intro leaves into playing', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto('/?seed=1');
    await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
    await page.getByRole('button', { name: '开始游戏' }).click();
    // Overlays settle by ~370ms; the 450ms curtain is still running.
    await page.clock.runFor(415);
    const s = await snap(page);
    expect(s.screen).toBe('levelIntro');
    expect(s.transitioning).toBe(true);
    await page.clock.runFor(300);
    expect((await snap(page)).transitioning).toBe(false);
    // Intro → playing: the intro dialog fades out.
    await page.clock.runFor(1050);
    let leaving = false;
    for (let t = 0; t < 400; t += 16) {
      if ((await overlay(page, '关卡开场')).transition === 'leaving') leaving = true;
      await page.clock.runFor(16);
    }
    expect(leaving).toBe(true);
    expect((await snap(page)).screen).toBe('playing');
    await expect(page.getByRole('dialog', { name: '关卡开场' })).toBeHidden();
  });

  test('playing → failure → start: each switch is animated and never blank', async ({ page }) => {
    await startPlaying(page);
    await loseByOwnFire(page);
    let entering = false;
    for (let t = 0; t < 2000 && !entering; t += 16) {
      if ((await overlay(page, '失败')).transition === 'entering') entering = true;
      else await page.clock.runFor(16);
    }
    expect(entering).toBe(true);
    expect((await snap(page)).transitioning).toBe(true);
    await page.clock.runFor(500);
    const dialog = page.getByRole('dialog', { name: '失败' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '返回开始画面' }).click();
    const seenT = await watchSwitch(page, '失败', '开始画面', 400);
    expect(seenT.from.has('leaving')).toBe(true);
    expect(seenT.to.has('entering')).toBe(true);
    const s = await snap(page);
    expect(s.screen).toBe('start');
    expect(s.transitioning).toBe(false);
  });
});
