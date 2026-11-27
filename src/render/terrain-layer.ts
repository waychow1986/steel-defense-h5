import { CONFIG } from '../game/config';
import type { MapGrid } from '../game/types';
import { drawTerrain } from './sprites/terrain';

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
    const tilePx = (this.sizePx * CONFIG.unitsPerTile) / map.width;
    ctx.setTransform(tilePx, 0, 0, tilePx, 0, 0);
    drawTerrain(ctx, map, { tilePx, shadowBlur: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
