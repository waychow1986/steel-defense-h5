import { expect, test, type Page } from '@playwright/test';
import { snap, startPlaying } from './helpers';

type Rect = { x: number; y: number; width: number; height: number };

const phone = (width: number, height: number) => ({
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function rect(page: Page, selector: string): Promise<Rect> {
  const box = await page.locator(selector).boundingBox();
  expect(box, selector).not.toBeNull();
  return box!;
}

async function expectNoHorizontalScrollAndCanvasInside(page: Page): Promise<Rect> {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
  }));
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
  const canvas = await rect(page, 'canvas');
  expect(canvas.width).toBeGreaterThan(100);
  expect(canvas.x).toBeGreaterThanOrEqual(0);
  expect(canvas.y).toBeGreaterThanOrEqual(0);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(m.innerW + 0.5);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(m.innerH + 0.5);
  await expectCanvasFillsStage(page, canvas);
  return canvas;
}

/** The map is a square whose side equals the smaller of the stage's free width and height. */
async function expectCanvasFillsStage(page: Page, canvas: Rect): Promise<void> {
  const free = await page.evaluate(() => {
    const stage = document.getElementById('stage')!;
    const s = getComputedStyle(stage);
    return Math.min(
      stage.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      stage.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom),
    );
  });
  expect(Math.abs(canvas.width - canvas.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvas.width - free)).toBeLessThanOrEqual(2);
}

test.describe('IT-03 layout: the map scales with the window (AC-22)', () => {
  test('resizing the window resizes the square map to fit the stage', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await startPlaying(page);
    const small = await expectNoHorizontalScrollAndCanvasInside(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect
      .poll(async () => (await page.locator('canvas').boundingBox())!.width)
      .toBeGreaterThan(small.width + 50);
    const large = await expectNoHorizontalScrollAndCanvasInside(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => Math.round((await page.locator('canvas').boundingBox())!.width)).toBe(Math.round(small.width));
    expect(large.width).toBeGreaterThan(small.width);
  });
});

test.describe('IT-03 layout: desktop sizes (AC-22)', () => {
  for (const [w, h] of [
    [1024, 768],
    [1280, 800],
  ] as const) {
    test(`${w}×${h}: no horizontal scroll, whole map visible`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await startPlaying(page);
      await expectNoHorizontalScrollAndCanvasInside(page);
      await expect(page.getByRole('group', { name: '方向键' })).toBeHidden();
    });
  }
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [430, 932],
] as const) {
  test.describe(`IT-03 layout: phone ${w}×${h} (AC-5, AC-22)`, () => {
    test.use(phone(w, h));

    test('no horizontal scroll; virtual controls never cover the map or HUD', async ({ page }) => {
      await startPlaying(page);
      const canvas = await expectNoHorizontalScrollAndCanvasInside(page);
      const controls = [
        page.getByRole('button', { name: '向上' }),
        page.getByRole('button', { name: '向下' }),
        page.getByRole('button', { name: '向左' }),
        page.getByRole('button', { name: '向右' }),
        page.getByRole('button', { name: '开火' }),
      ];
      const hud = ['关卡', '分数', '生命', '剩余敌人'].map((n) => page.getByRole('status', { name: n }));
      const hudRects: Rect[] = [];
      for (const h of hud) {
        await expect(h).toBeVisible();
        hudRects.push((await h.boundingBox())!);
      }
      for (const c of controls) {
        await expect(c).toBeVisible();
        const r = (await c.boundingBox())!;
        expect(r.width).toBeGreaterThanOrEqual(44);
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(r.x + r.width).toBeLessThanOrEqual(w);
        expect(r.y + r.height).toBeLessThanOrEqual(h);
        expect(intersects(r, canvas)).toBe(false);
        for (const hr of hudRects) expect(intersects(r, hr)).toBe(false);
      }
      // Nothing is stacked on top of the map corners, the map centre or the HUD values.
      const points: Array<[number, number, string]> = [
        [canvas.x + 1, canvas.y + 1, 'canvas'],
        [canvas.x + canvas.width - 1, canvas.y + 1, 'canvas'],
        [canvas.x + 1, canvas.y + canvas.height - 1, 'canvas'],
        [canvas.x + canvas.width - 1, canvas.y + canvas.height - 1, 'canvas'],
        [canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, 'canvas'],
        ...hudRects.map((r): [number, number, string] => [r.x + r.width / 2, r.y + r.height / 2, 'output']),
      ];
      const hits = await page.evaluate(
        (pts) => pts.map(([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel as string)),
        points,
      );
      expect(hits).toEqual(points.map(() => true));
    });
  });
}

test.describe('IT-03 layout: landscape phone shows the rotate hint (AC-22, I1)', () => {
  test.use(phone(390, 844));

  test('rotate to landscape: hint covers the page and the game keeps its state; back to portrait hides it', async ({ page }) => {
    await startPlaying(page);
    const hint = page.getByRole('alertdialog', { name: '请旋转手机' });
    await expect(hint).toBeHidden();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(hint).toBeVisible();
    const box = (await hint.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(843);
    expect(box.height).toBeGreaterThanOrEqual(389);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeHidden();
    expect((await snap(page)).screen).toBe('playing');
    await expect(page.getByRole('button', { name: '开火' })).toBeVisible();
  });
});
