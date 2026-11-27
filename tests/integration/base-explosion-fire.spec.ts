import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';
import { startPlaying } from './helpers';

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

async function stepUntil(page: Page, done: (s: SteelDefenseSnapshot) => boolean, maxMs = 1500): Promise<SteelDefenseSnapshot> {
  for (let t = 0; t < maxMs; t += 20) {
    const s = await snap(page);
    if (done(s)) return s;
    await page.clock.runFor(20);
  }
  return snap(page);
}

/** Fraction of warm (fire-coloured) pixels on the battlefield canvas within ±1.2 tiles of (cx, cy). */
async function warmPixels(page: Page, cx: number, cy: number, cols: number): Promise<number> {
  return page.evaluate(
    ({ cx, cy, cols }) => {
      const c = document.querySelector<HTMLCanvasElement>('#battlefield');
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return -1;
      const t = c.width / cols;
      const x0 = Math.max(0, Math.floor((cx - 1.2) * t));
      const y0 = Math.max(0, Math.floor((cy - 1.2) * t));
      const w = Math.min(c.width - x0, Math.ceil(2.4 * t));
      const h = Math.min(c.height - y0, Math.ceil(2.4 * t));
      const d = ctx.getImageData(x0, y0, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        if (r > 200 && g > 90 && b < 140 && r - b > 90) n++;
      }
      return n / (w * h);
    },
    { cx, cy, cols },
  );
}

test.describe('IT base explosion shows fire (AC-17, TS-32 checkpoint 5)', () => {
  test('fire glow is drawn around the base right after it is hit', async ({ page }) => {
    await startPlaying(page);
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(100);
    await page.keyboard.up('ArrowRight');
    let boom = await snap(page);
    for (let i = 0; i < 6 && !boom.base.destroyed; i++) {
      await page.clock.runFor(400);
      await page.keyboard.press('Space');
      boom = await stepUntil(page, (s) => s.base.destroyed, 800);
    }
    expect(boom.base.destroyed).toBe(true);
    const cx = boom.base.x + 0.5;
    const cy = boom.base.y + 0.5;
    const cols = boom.map.cols;
    // The first rendered frame after the hit: smoke has spawned at the same point as the fire.
    await page.clock.runFor(20);
    expect((await snap(page)).effects.particles).toBeGreaterThan(0);
    const warm = await warmPixels(page, cx, cy, cols);
    // The fire must not be buried under the smoke: at least 1% of the area around the base is fire-coloured.
    expect(warm, `warm pixel fraction ${warm.toFixed(4)}`).toBeGreaterThanOrEqual(0.01);
  });
});
