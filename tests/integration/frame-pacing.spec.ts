import { expect, test } from '@playwright/test';
import { snap } from './helpers';

/**
 * IT-05 (AC-23): real time, fixed seed, 20 s of level 1 with a simple autopilot (turning and firing).
 * Headless Chromium renders in software, so this is a regression signal; the device numbers are
 * confirmed by the G3 tests on real hardware.
 */
test('20 s of level 1: average ≥55 fps and no frame gap of 100 ms or more', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect.poll(async () => (await snap(page)).screen, { timeout: 10_000 }).toBe('playing');
  // Let the first second of play settle before the measured window starts.
  await page.waitForTimeout(1000);
  const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowUp'];
  const samples: Array<{ fps: number; maxFrameGapMs: number; screen: string }> = [];
  for (let i = 0; i < 20; i++) {
    const key = keys[i % keys.length];
    await page.keyboard.down(key);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
    await page.keyboard.up(key);
    const s = await snap(page);
    samples.push({ fps: s.perf.fps, maxFrameGapMs: s.perf.maxFrameGapMs, screen: s.screen });
  }
  const playing = samples.filter((s) => s.screen === 'playing');
  expect(playing.length).toBeGreaterThanOrEqual(10);
  const worstGap = Math.max(...playing.map((s) => s.maxFrameGapMs));
  const avgFps = playing.reduce((sum, s) => sum + s.fps, 0) / playing.length;
  expect(worstGap, `samples: ${JSON.stringify(samples)}`).toBeLessThan(100);
  expect(avgFps, `samples: ${JSON.stringify(samples)}`).toBeGreaterThanOrEqual(55);
});
