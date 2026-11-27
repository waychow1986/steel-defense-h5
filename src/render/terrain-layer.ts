import { CELL_BRICK, CELL_STEEL, CELL_WATER, type MapGrid } from '../game/types';
import { PALETTE } from './palette';

/** Offscreen terrain layer; rebuilt only when the map changes or the canvas is resized. */
export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private dirty = true;
  private sizePx = 0;

  constructor(doc: Document) {
    this.canvas = doc.createElement('canvas');
  }

  invalidate(): void {
    this.dirty = true;
  }

  ensure(map: MapGrid, sizePx: number): HTMLCanvasElement {
    if (sizePx !== this.sizePx) {
      this.sizePx = sizePx;
      this.canvas.width = sizePx;
      this.canvas.height = sizePx;
      this.dirty = true;
    }
    if (this.dirty) {
      this.draw(map);
      this.dirty = false;
    }
    return this.canvas;
  }

  private draw(map: MapGrid): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const u = this.sizePx / map.width;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, this.sizePx, this.sizePx);
    ctx.fillStyle = PALETTE.groundGrain;
    for (let y = 0; y < map.height; y += 4) {
      for (let x = (y / 4) % 2 === 0 ? 0 : 4; x < map.width; x += 8) ctx.fillRect(x * u, y * u, 4 * u, 4 * u);
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const c = map.cells[y * map.width + x];
        const px = x * u;
        const py = y * u;
        if (c === CELL_BRICK) {
          ctx.fillStyle = PALETTE.brickMortar;
          ctx.fillRect(px, py, u, u);
          ctx.fillStyle = PALETTE.brick;
          ctx.fillRect(px + u * 0.08, py + u * 0.08, u * 0.84, u * 0.8);
          ctx.fillStyle = PALETTE.brickLight;
          ctx.fillRect(px + u * 0.08, py + u * 0.08, u * 0.84, u * 0.16);
        } else if (c === CELL_STEEL) {
          ctx.fillStyle = PALETTE.steelDark;
          ctx.fillRect(px, py, u, u);
          ctx.fillStyle = PALETTE.steel;
          ctx.fillRect(px + u * 0.1, py + u * 0.1, u * 0.8, u * 0.8);
          ctx.fillStyle = PALETTE.steelLight;
          ctx.fillRect(px + u * 0.1, py + u * 0.1, u * 0.35, u * 0.35);
        } else if (c === CELL_WATER) {
          ctx.fillStyle = PALETTE.water;
          ctx.fillRect(px, py, u, u);
          if ((x + y) % 3 === 0) {
            ctx.fillStyle = PALETTE.waterLight;
            ctx.fillRect(px + u * 0.15, py + u * 0.45, u * 0.6, u * 0.12);
          }
        }
      }
    }
  }
}
