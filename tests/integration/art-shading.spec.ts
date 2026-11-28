import { expect, test } from '@playwright/test';

/**
 * AC-7 / AC-15 (FR-031, FR-032): every tank, the base and the power-ups cast a visible shadow to the
 * same side (bottom-right) next to their footprint, and water is layered (at least three clearly
 * different brightness levels), measured on the real pre-rendered sprites in the browser.
 */

type Side = 'right' | 'bottom' | 'left' | 'top';
interface ElementShadow {
  name: string;
  ground: string;
  frac: Record<Side, number>;
}

test('every tank, the base and the power-ups cast a visible shadow to the bottom-right only', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    // Source modules served by the Vite dev server (the page's own module graph).
    const load = (path: string): Promise<unknown> => import(/* @vite-ignore */ path);
    const cacheMod = (await load('/src/render/sprites/cache.ts')) as typeof import('../../src/render/sprites/cache');
    const { PALETTE } = (await load('/src/render/palette.ts')) as typeof import('../../src/render/palette');
    const { CONFIG } = (await load('/src/game/config.ts')) as typeof import('../../src/game/config');
    const T = 48;
    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const cache = new cacheMod.SpriteCache(document);
    cache.configure(T, true);
    const out: ElementShadow[] = [];
    const dirs = ['up', 'right', 'down', 'left'] as const;
    const items: Array<{ name: string; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void; size: number; centred: boolean }> = [];
    const blit = (ctx: CanvasRenderingContext2D, s: { canvas: HTMLCanvasElement; origin: number; size: number } | undefined, x: number, y: number) => {
      if (s) ctx.drawImage(s.canvas, (x - s.origin) * T, (y - s.origin) * T, s.size * T, s.size * T);
    };
    for (const type of ['player', 'normal', 'fast', 'heavy'] as const) {
      for (const dir of dirs) {
        items.push({
          name: `tank:${type}:${dir}`,
          size: CONFIG.tankSize,
          centred: true,
          draw: (ctx, x, y) => {
            blit(ctx, cache.hull(type, dir, 0, false), x, y);
            blit(ctx, cache.barrel(type, dir, false), x, y);
            blit(ctx, cache.turret(type, dir, false), x, y);
          },
        });
      }
    }
    items.push({ name: 'base', size: 1, centred: false, draw: (ctx, x, y) => blit(ctx, cache.base(false), x, y) });
    for (const p of ['shield', 'firepower'] as const) items.push({ name: `powerUp:${p}`, size: 1, centred: false, draw: (ctx, x, y) => blit(ctx, cache.powerUp(p), x, y) });
    for (const groundKey of ['ground', 'groundGrain'] as const) {
      for (const it of items) {
        const canvas = document.createElement('canvas');
        canvas.width = 3 * T;
        canvas.height = 3 * T;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = PALETTE[groundKey];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Footprint top-left at (1, 1) tiles.
        const fx = 1;
        const fy = 1;
        if (it.centred) it.draw(ctx, fx + it.size / 2, fy + it.size / 2);
        else it.draw(ctx, fx, fy);
        const g = ctx.getImageData(2, 2, 1, 1).data;
        const gl = lum(g[0], g[1], g[2]);
        // Strip 0.15 tile wide just outside the footprint (skipping 0.1 tile at the shared corner).
        const d = 0.15;
        const w = it.size;
        const strips: Record<Side, [number, number, number, number]> = {
          right: [fx + w, fy + 0.1, d, w - 0.1],
          bottom: [fx + 0.1, fy + w, w - 0.1, d],
          left: [fx - d, fy + 0.1, d, w - 0.1],
          top: [fx + 0.1, fy - d, w - 0.1, d],
        };
        const frac = {} as Record<Side, number>;
        for (const [side, [x, y, sw, sh]] of Object.entries(strips) as Array<[Side, [number, number, number, number]]>) {
          const x0 = Math.round(x * T);
          const y0 = Math.round(y * T);
          const x1 = Math.round((x + sw) * T);
          const y1 = Math.round((y + sh) * T);
          const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (lum(data[i], data[i + 1], data[i + 2]) < gl - 8) dark++;
          frac[side] = dark / (data.length / 4);
        }
        out.push({ name: it.name, ground: groundKey, frac });
      }
    }
    return out;
  });
  const problems: string[] = [];
  for (const r of results) {
    const f = r.frac;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const desc = `${r.name} on ${r.ground}: right ${pct(f.right)} bottom ${pct(f.bottom)} left ${pct(f.left)} top ${pct(f.top)}`;
    const isTank = r.name.startsWith('tank:');
    const dir = r.name.split(':')[2];
    // A tank's own barrel may poke out of its footprint on the facing side; that side is not a shadow side.
    const facing: Side | undefined = isTank ? ({ up: 'top', right: 'right', down: 'bottom', left: 'left' } as const)[dir as 'up'] : undefined;
    // The shadow side: both right and bottom for square footprints; a tank whose width is inset may show it on one of them.
    if (!(f.right >= 0.35 && f.bottom >= 0.35)) problems.push(`no clear bottom-right shadow: ${desc}`);
    for (const s of ['left', 'top'] as const) if (s !== facing && f[s] >= 0.25) problems.push(`dark band on the lit ${s} side: ${desc}`);
  }
  expect(problems).toEqual([]);
});

test('water is layered: at least three clearly different brightness levels on every water tile', async ({ page }) => {
  await page.goto('/');
  const levels = await page.evaluate(async () => {
    const load = (path: string): Promise<unknown> => import(/* @vite-ignore */ path);
    const { drawTerrain } = (await load('/src/render/sprites/terrain.ts')) as typeof import('../../src/render/sprites/terrain');
    const { CELL_WATER } = (await load('/src/game/types.ts')) as typeof import('../../src/game/types');
    const { CONFIG } = (await load('/src/game/config.ts')) as typeof import('../../src/game/config');
    const T = 48;
    const u = CONFIG.unitsPerTile;
    const tiles = 3;
    const width = tiles * u;
    const map = { cols: tiles, rows: tiles, width, height: width, cells: new Uint8Array(width * width).fill(CELL_WATER) };
    const canvas = document.createElement('canvas');
    canvas.width = tiles * T;
    canvas.height = tiles * T;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(T, 0, 0, T, 0, 0);
    drawTerrain(ctx, map, { tilePx: T, shadowBlur: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const out: number[] = [];
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const data = ctx.getImageData(tx * T, ty * T, T, T).data;
        // Colour histogram (8 levels per channel), colours covering at least 2% of the tile.
        const bins = new Map<string, { n: number; l: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const k = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
          const e = bins.get(k) ?? { n: 0, l: 0 };
          e.n++;
          e.l += lum(data[i], data[i + 1], data[i + 2]);
          bins.set(k, e);
        }
        const total = data.length / 4;
        const ls = [...bins.values()].filter((b) => b.n / total >= 0.05).map((b) => b.l / b.n).sort((a, b) => a - b);
        const lv: number[] = [];
        for (const l of ls) if (!lv.length || l - lv[lv.length - 1] > 25.5) lv.push(l);
        out.push(lv.length);
      }
    }
    return out;
  });
  for (const n of levels) expect(n).toBeGreaterThanOrEqual(3);
});
