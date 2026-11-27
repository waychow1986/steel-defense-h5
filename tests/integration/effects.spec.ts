import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';
import { startPlaying } from './helpers';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

const cueNames = (s: SteelDefenseSnapshot): string[] => s.audio.cues.map((c) => c.name);

/** Advances the paused clock in small steps until `done` holds (or `maxMs` passes) and returns that snapshot. */
async function stepUntil(page: Page, done: (s: SteelDefenseSnapshot) => boolean, maxMs = 1500): Promise<SteelDefenseSnapshot> {
  for (let t = 0; t < maxMs; t += 20) {
    const s = await snap(page);
    if (done(s)) return s;
    await page.clock.runFor(20);
  }
  return snap(page);
}

test.describe('IT effects and cues wired to game events (AC-17, AC-19)', () => {
  test('brick debris, then base explosion with shake, and the fire/hit/explosion/gameOver cues', async ({ page }) => {
    await startPlaying(page);
    const before = await snap(page);
    expect(before.effects).toMatchObject({ particles: 0, explosions: 0, shakeMs: 0 });
    expect(before.audio.state).toBe('running');

    // Face the brick between the spawn and the base and shoot it.
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(100);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    const fired = await stepUntil(page, (s) => cueNames(s).includes('fire'), 200);
    expect(cueNames(fired)).toContain('fire');

    const hit = await stepUntil(page, (s) => cueNames(s).includes('hit'));
    expect(cueNames(hit)).toContain('hit');
    expect(hit.effects.particles).toBeGreaterThan(0);

    // Keep shooting until the base is hit.
    let boom = hit;
    for (let i = 0; i < 4 && !boom.base.destroyed; i++) {
      await page.clock.runFor(400);
      await page.keyboard.press('Space');
      boom = await stepUntil(page, (s) => s.base.destroyed, 800);
    }
    expect(boom.base.destroyed).toBe(true);
    expect(boom.effects.explosions).toBeGreaterThan(0);
    expect(boom.effects.shakeMs).toBeGreaterThan(0);
    expect(cueNames(boom)).toEqual(expect.arrayContaining(['explosion', 'gameOver']));
    const atMs = boom.audio.cues.map((c) => c.atMs);
    expect([...atMs].sort((a, b) => a - b)).toEqual(atMs);

    // The effects keep playing during the post-hit delay and finish.
    await page.clock.runFor(1500);
    const after = await snap(page);
    expect(after.screen).toBe('gameOver');
    expect(after.effects.shakeMs).toBe(0);
    expect(after.audio.musicPlaying).toBe(false);
  });
});
