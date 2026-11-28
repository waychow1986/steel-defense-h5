import { CONFIG } from '../../game/config';
import { CELL_BRICK, CELL_STEEL, CELL_WATER, type MapGrid } from '../../game/types';
import { PALETTE } from '../palette';
import { castShadow, litRect, type DrawOptions } from './art';

/**
 * Static terrain in tile units: ground, the walls' shared bottom-right shadow, bricks and steel
 * lit from the top-left, layered water (TD-004, TD-005).
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, map: MapGrid, opts: DrawOptions): void {
  const u = 1 / CONFIG.unitsPerTile;
  const size = map.width * u;
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, size, map.height * u);
  ctx.fillStyle = PALETTE.groundGrain;
  for (let y = 0; y < map.height; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 4; x < map.width; x += 8) ctx.fillRect(x * u, y * u, 4 * u, 4 * u);
  }
  const at = (x: number, y: number) => map.cells[y * map.width + x];
  castShadow(ctx, { ...opts, shadowBlur: false }, () => {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const c = at(x, y);
        if (c === CELL_BRICK || c === CELL_STEEL) ctx.rect(x * u, y * u, u, u);
      }
    }
  });
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const c = at(x, y);
      const r = { x: x * u, y: y * u, w: u, h: u };
      if (c === CELL_BRICK) {
        litRect(ctx, r, { body: PALETTE.brick, light: PALETTE.brickLight, dark: PALETTE.brickMortar }, false);
      } else if (c === CELL_STEEL) {
        litRect(ctx, r, { body: PALETTE.steel, light: PALETTE.steelLight, dark: PALETTE.steelDark }, false);
        ctx.fillStyle = PALETTE.steelLight;
        ctx.fillRect(r.x + u * 0.25, r.y + u * 0.25, u * 0.25, u * 0.25);
      } else if (c === CELL_WATER) {
        // Layered water: body, a dark trough and a light crest on every unit, staggered by row.
        const shift = y % 2 === 0 ? 0 : 0.3;
        ctx.fillStyle = PALETTE.water;
        ctx.fillRect(r.x, r.y, u, u);
        ctx.fillStyle = PALETTE.waterDark;
        ctx.fillRect(r.x + u * (0.1 + shift * 0.5), r.y + u * 0.66, u * 0.75, u * 0.2);
        ctx.fillStyle = PALETTE.waterLight;
        ctx.fillRect(r.x + u * (0.1 + shift), r.y + u * 0.25, u * 0.55, u * 0.25);
      }
    }
  }
}
