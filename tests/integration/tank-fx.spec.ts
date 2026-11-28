import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';
import { startPlaying } from './helpers';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

/** AC-16: tread animation, muzzle flash, barrel recoil and bullet trail are driven by play and visible in the snapshot. */
test.describe('AC-16 tank motion effects', () => {
  test('treads cycle only while the tank moves', async ({ page }) => {
    await startPlaying(page);
    await page.keyboard.down('ArrowLeft');
    const phases = new Set<number>();
    for (let i = 0; i < 12; i++) {
      await page.clock.runFor(34);
      const p = (await snap(page)).player!;
      expect(p.moving).toBe(true);
      phases.add(p.treadPhase);
    }
    expect(phases.size).toBeGreaterThanOrEqual(3);
    await page.keyboard.up('ArrowLeft');
    await page.clock.runFor(50);
    const stopped = (await snap(page)).player!.treadPhase;
    await page.clock.runFor(400);
    const later = (await snap(page)).player!;
    expect(later.moving).toBe(false);
    expect(later.treadPhase).toBe(stopped);
  });

  test('a shot shows a short muzzle flash, kicks the barrel back and leaves a trail behind the bullet', async ({ page }) => {
    await startPlaying(page);
    await page.keyboard.press('Space');
    await page.clock.runFor(34);
    const fired = await snap(page);
    expect(fired.bullets.filter((b) => b.owner === 'player')).toHaveLength(1);
    expect(fired.effects.muzzleFlashes).toBe(1);
    expect(fired.player!.recoilMs).toBeGreaterThan(0);

    await page.clock.runFor(150);
    const flying = await snap(page);
    expect(flying.effects.muzzleFlashes).toBe(0);
    expect(flying.player!.recoilMs).toBe(0);
    expect(flying.bullets.filter((b) => b.owner === 'player')).toHaveLength(1);
    expect(flying.effects.trails).toBeGreaterThanOrEqual(1);

    await page.clock.runFor(3000);
    const done = await snap(page);
    expect(done.bullets.filter((b) => b.owner === 'player')).toHaveLength(0);
    expect(done.effects.trails).toBeLessThanOrEqual(done.bullets.length);
  });
});
