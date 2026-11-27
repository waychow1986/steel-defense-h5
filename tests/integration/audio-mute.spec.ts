import { expect, test, type Page } from '@playwright/test';
import type { SteelDefenseSnapshot } from '../../src/app/diagnostics';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

const snap = (page: Page): Promise<SteelDefenseSnapshot> =>
  page.evaluate(() => (window as unknown as { steelDefense: { snapshot(): SteelDefenseSnapshot } }).steelDefense.snapshot());

/**
 * Taps every connection into an AudioContext's destination with an AnalyserNode, so the test can
 * measure what actually reaches the speakers (not just what the UI claims).
 */
function installOutputTap(): void {
  const taps = new Map<BaseAudioContext, AnalyserNode>();
  const original = AudioNode.prototype.connect;
  (window as unknown as { __outputRms: () => number }).__outputRms = () => {
    let peak = 0;
    for (const analyser of taps.values()) {
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      peak = Math.max(peak, Math.sqrt(sum / buf.length));
    }
    return peak;
  };
  AudioNode.prototype.connect = function (this: AudioNode, dest: AudioNode | AudioParam, ...rest: number[]) {
    if (dest instanceof AudioDestinationNode && this.context instanceof AudioContext) {
      let analyser = taps.get(this.context);
      if (!analyser) {
        analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        taps.set(this.context, analyser);
      }
      (original as (d: AudioNode) => AudioNode).call(this, analyser);
    }
    return (original as (d: AudioNode | AudioParam, ...r: number[]) => AudioNode).call(this, dest, ...rest);
  } as typeof AudioNode.prototype.connect;
}

/** Max RMS of the destination signal sampled over `ms` of real time. */
async function outputLevel(page: Page, ms: number): Promise<number> {
  let peak = 0;
  for (let t = 0; t < ms; t += 50) {
    peak = Math.max(peak, await page.evaluate(() => (window as unknown as { __outputRms: () => number }).__outputRms()));
    await page.waitForTimeout(50);
  }
  return peak;
}

test.describe('IT-02 audio unlock and mute (AC-20, AC-21)', () => {
  test('start unlocks audio with music; mute silences the real output (music too); unmute restores it', async ({ page }) => {
    await page.addInitScript(installOutputTap);
    await page.goto('/?seed=1');
    const muteBtn = page.getByRole('button', { name: '静音' });
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    const idle = await snap(page);
    expect(idle.audio.muted).toBe(false);
    expect(idle.audio.masterGain).toBe(1);

    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect.poll(async () => (await snap(page)).audio.state).toBe('running');
    const on = await snap(page);
    expect(on.audio).toMatchObject({ muted: false, masterGain: 1, musicPlaying: true });
    // Music alone is audible.
    expect(await outputLevel(page, 1500)).toBeGreaterThan(0.001);

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    const muted = await snap(page);
    expect(muted.audio).toMatchObject({ muted: true, masterGain: 0 });
    await page.waitForTimeout(150);
    // Music keeps its place but nothing reaches the output, sound effects included.
    await page.keyboard.press('Space');
    expect(await outputLevel(page, 1000)).toBeLessThan(1e-4);

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    const back = await snap(page);
    expect(back.audio).toMatchObject({ muted: false, masterGain: 1, musicPlaying: true });
    expect(await outputLevel(page, 1500)).toBeGreaterThan(0.001);
  });

  test('phone: touching start enables audio, music plays and the fire button plays the fire cue', async ({ browser }) => {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto('/?seed=1');
    await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
    expect((await snap(page)).audio.state).not.toBe('running');

    await page.getByRole('button', { name: '开始游戏' }).tap();
    await page.clock.runFor(2100);
    const s = await snap(page);
    expect(s.screen).toBe('playing');
    expect(s.audio).toMatchObject({ state: 'running', muted: false, masterGain: 1, musicPlaying: true });

    const box = (await page.getByRole('button', { name: '开火' }).boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.clock.runFor(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(50);
    expect((await snap(page)).audio.cues.map((c) => c.name)).toContain('fire');
    await context.close();
  });
});
