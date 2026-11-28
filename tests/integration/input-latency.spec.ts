import { expect, test, type Page } from '@playwright/test';
import { snap } from './helpers';

/**
 * IT-04 (AC-23): real time, no fake clock. Each press is timed in the page from the input event's
 * own timestamp to the first animation frame whose snapshot shows the response; after release the
 * tank must not move again more than 100 ms later.
 */

const LIMIT_MS = 100;

type Probe = 'dir:up' | 'dir:down' | 'dir:left' | 'dir:right' | 'shot';

async function startRealTime(page: Page): Promise<void> {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect.poll(async () => (await snap(page)).screen, { timeout: 10_000 }).toBe('playing');
}

/**
 * Arms a watcher: the next `eventType` event's timeStamp starts the clock; every animation frame
 * after it checks the snapshot for `probe`. Resolves with the delay in ms (or -1 after 1 s).
 */
async function armResponse(page: Page, eventType: 'keydown' | 'pointerdown', probe: Probe): Promise<void> {
  await page.evaluate(
    ([eventType, probe]) => {
      type W = Window & {
        steelDefense: { snapshot(): { player: { dir: string; recoilMs: number } | null } };
        __latency?: Promise<number>;
      };
      const w = window as unknown as W;
      w.__latency = new Promise<number>((resolve) => {
        window.addEventListener(
          eventType,
          (e) => {
            const pressedAt = e.timeStamp;
            const check = () => {
              const s = w.steelDefense.snapshot();
              const done =
                // A shot kicks the barrel back at once, even when the bullet hits a wall in the same step.
                probe === 'shot' ? (s.player?.recoilMs ?? 0) > 0 : s.player?.dir === probe.slice(4);
              const now = performance.now();
              if (done) resolve(now - pressedAt);
              else if (now - pressedAt > 1000) resolve(-1);
              else requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          },
          { once: true, capture: true },
        );
      });
    },
    [eventType, probe] as const,
  );
}

const measured = (page: Page) => page.evaluate(() => (window as unknown as { __latency: Promise<number> }).__latency);

/** Logs the player position every frame for 600 ms after the next `eventType`; returns ms from it to the last change. */
async function armStop(page: Page, eventType: 'keyup' | 'pointerup'): Promise<void> {
  await page.evaluate((eventType) => {
    type W = Window & { steelDefense: { snapshot(): { player: { x: number; y: number } | null } }; __stop?: Promise<number> };
    const w = window as unknown as W;
    w.__stop = new Promise<number>((resolve) => {
      window.addEventListener(
        eventType,
        (e) => {
          const releasedAt = e.timeStamp;
          const log: Array<{ t: number; x: number; y: number }> = [];
          const tick = () => {
            const p = w.steelDefense.snapshot().player!;
            const t = performance.now();
            log.push({ t, x: p.x, y: p.y });
            if (t - releasedAt < 600) {
              requestAnimationFrame(tick);
              return;
            }
            const last = log[log.length - 1];
            let lastChange = 0;
            for (let i = 1; i < log.length; i++) {
              if (log[i].x !== log[i - 1].x || log[i].y !== log[i - 1].y) lastChange = log[i].t - releasedAt;
            }
            // The tank must have come to rest at the end of the window.
            resolve(last.x === log[0].x && last.y === log[0].y ? 0 : lastChange);
          };
          tick();
        },
        { once: true, capture: true },
      );
    });
  }, eventType);
}

const stopDelay = (page: Page) => page.evaluate(() => (window as unknown as { __stop: Promise<number> }).__stop);

test.describe('IT-04 keyboard response (AC-23)', () => {
  test('each direction key and the fire key respond within 100 ms', async ({ page }) => {
    await startRealTime(page);
    const presses: Array<[string, Probe]> = [
      ['ArrowLeft', 'dir:left'],
      ['KeyW', 'dir:up'],
      ['ArrowRight', 'dir:right'],
      ['KeyS', 'dir:down'],
      ['Space', 'shot'],
    ];
    for (const [key, probe] of presses) {
      await page.waitForTimeout(300);
      await armResponse(page, 'keydown', probe);
      await page.keyboard.down(key);
      const ms = await measured(page);
      await page.keyboard.up(key);
      expect(ms, `${key} → ${probe}`).toBeGreaterThanOrEqual(0);
      expect(ms, `${key} → ${probe}`).toBeLessThanOrEqual(LIMIT_MS);
      const last = (await snap(page)).input.lastResponseMs;
      expect(last).not.toBeNull();
      expect(last!).toBeLessThanOrEqual(LIMIT_MS);
    }
  });

  test('the tank stops within 100 ms of releasing the key', async ({ page }) => {
    await startRealTime(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    const before = (await snap(page)).player!;
    await page.waitForTimeout(100);
    const moving = (await snap(page)).player!;
    expect(moving.y, 'tank moves while the key is held').toBeLessThan(before.y);
    await armStop(page, 'keyup');
    await page.keyboard.up('ArrowUp');
    expect(await stopDelay(page)).toBeLessThanOrEqual(LIMIT_MS);
    expect((await snap(page)).input.direction).toBeNull();
  });
});

test.describe('IT-04 touch response (AC-23)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  const touch = (page: Page, name: string, type: 'pointerdown' | 'pointerup', pointerId: number) =>
    page.getByRole('button', { name }).dispatchEvent(type, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });

  test('virtual pad and fire button respond within 100 ms; the tank stops within 100 ms of lifting', async ({ page }) => {
    await startRealTime(page);
    const presses: Array<[string, Probe]> = [
      ['向左', 'dir:left'],
      ['向右', 'dir:right'],
      ['向下', 'dir:down'],
      ['向上', 'dir:up'],
    ];
    for (const [name, probe] of presses) {
      await page.waitForTimeout(250);
      await armResponse(page, 'pointerdown', probe);
      await touch(page, name, 'pointerdown', 1);
      const ms = await measured(page);
      await touch(page, name, 'pointerup', 1);
      expect(ms, `${name} → ${probe}`).toBeGreaterThanOrEqual(0);
      expect(ms, `${name} → ${probe}`).toBeLessThanOrEqual(LIMIT_MS);
    }
    await page.waitForTimeout(300);
    await armResponse(page, 'pointerdown', 'shot');
    await touch(page, '开火', 'pointerdown', 2);
    const fireMs = await measured(page);
    await touch(page, '开火', 'pointerup', 2);
    expect(fireMs).toBeGreaterThanOrEqual(0);
    expect(fireMs).toBeLessThanOrEqual(LIMIT_MS);

    await touch(page, '向上', 'pointerdown', 3);
    await page.waitForTimeout(500);
    await armStop(page, 'pointerup');
    await touch(page, '向上', 'pointerup', 3);
    expect(await stopDelay(page)).toBeLessThanOrEqual(LIMIT_MS);
  });
});
