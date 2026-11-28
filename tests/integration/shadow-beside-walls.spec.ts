import { expect, test } from '@playwright/test';

/**
 * AC-7 / AC-15 (FR-031, R2): every tank, the base and the power-ups cast their shadow to the same
 * side (bottom-right), and that shadow is darker than the ground on whatever it falls on — bare
 * ground, brick, steel or water — so an element standing flush against a wall (the base is boxed in
 * by bricks on level 1; tanks drive up to walls) still shows the shared bottom-right shadow.
 * Drawn with the real terrain recipe and the real pre-rendered sprites in the browser.
 */

type Side = 'right' | 'bottom';

test('shadows stay darker than the ground when they fall on brick, steel or water', async ({ page }) => {
  await page.goto('/');
  const problems = await page.evaluate(async () => {
    const load = (path: string): Promise<unknown> => import(/* @vite-ignore */ path);
    const cacheMod = (await load('/src/render/sprites/cache.ts')) as typeof import('../../src/render/sprites/cache');
    const { drawTerrain } = (await load('/src/render/sprites/terrain.ts')) as typeof import('../../src/render/sprites/terrain');
    const types = (await load('/src/game/types.ts')) as typeof import('../../src/game/types');
    const { PALETTE } = (await load('/src/render/palette.ts')) as typeof import('../../src/render/palette');
    const { CONFIG } = (await load('/src/game/config.ts')) as typeof import('../../src/game/config');
    // About the tile size of a 1280×800 desktop view.
    const T = 54;
    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
    const cache = new cacheMod.SpriteCache(document);
    cache.configure(T, true);
    const blit = (ctx: CanvasRenderingContext2D, s: { canvas: HTMLCanvasElement; origin: number; size: number } | undefined, x: number, y: number) => {
      if (s) ctx.drawImage(s.canvas, (x - s.origin) * T, (y - s.origin) * T, s.size * T, s.size * T);
    };
    const u = CONFIG.unitsPerTile;
    const tiles = 4;
    const width = tiles * u;
    const walls = [
      ['brick', types.CELL_BRICK],
      ['steel', types.CELL_STEEL],
      ['water', types.CELL_WATER],
    ] as const;
    const items: Array<{ name: string; size: number; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }> = [];
    for (const type of ['player', 'normal', 'fast', 'heavy'] as const) {
      for (const dir of ['up', 'right', 'down', 'left'] as const) {
        items.push({
          name: `tank:${type}:${dir}`,
          size: CONFIG.tankSize,
          draw: (ctx, x, y) => {
            const c = CONFIG.tankSize / 2;
            blit(ctx, cache.hull(type, dir, 0, false), x + c, y + c);
            blit(ctx, cache.barrel(type, dir, false), x + c, y + c);
            blit(ctx, cache.turret(type, dir, false), x + c, y + c);
          },
        });
      }
    }
    items.push({ name: 'base', size: 1, draw: (ctx, x, y) => blit(ctx, cache.base(false), x, y) });
    for (const p of ['shield', 'firepower'] as const) items.push({ name: `powerUp:${p}`, size: 1, draw: (ctx, x, y) => blit(ctx, cache.powerUp(p), x, y) });

    const out: string[] = [];
    // The darker of the two ground tones is the strictest reference.
    const groundLum = Math.min(lum(...hex(PALETTE.ground)), lum(...hex(PALETTE.groundGrain)));
    for (const [wallName, wall] of walls) {
      // Column 2 and row 2 are walls: the element's footprint ends exactly where they begin.
      const cells = new Uint8Array(width * width);
      for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) if (x >= 2 * u || y >= 2 * u) cells[y * width + x] = wall;
      const map = { cols: tiles, rows: tiles, width, height: width, cells };
      for (const it of items) {
        const canvas = document.createElement('canvas');
        canvas.width = tiles * T;
        canvas.height = tiles * T;
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(T, 0, 0, T, 0, 0);
        drawTerrain(ctx, map, { tilePx: T, shadowBlur: false });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const fx = 2 - it.size;
        const fy = 2 - it.size;
        it.draw(ctx, fx, fy);
        // Same strips as the visual acceptance check: 0.15 tile just outside the footprint.
        const d = 0.15;
        const w = it.size;
        const strips: Record<Side, [number, number, number, number]> = {
          right: [fx + w, fy + 0.1, d, w - 0.1],
          bottom: [fx + 0.1, fy + w, w - 0.1, d],
        };
        for (const [side, [x, y, sw, sh]] of Object.entries(strips) as Array<[Side, [number, number, number, number]]>) {
          const x0 = Math.round(x * T);
          const y0 = Math.round(y * T);
          const data = ctx.getImageData(x0, y0, Math.round((x + sw) * T) - x0, Math.round((y + sh) * T) - y0).data;
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (lum(data[i], data[i + 1], data[i + 2]) < groundLum - 8) dark++;
          const frac = dark / (data.length / 4);
          if (frac < 0.3) out.push(`${it.name} beside ${wallName}: ${side} ${Math.round(frac * 100)}% darker than ground`);
        }
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});
