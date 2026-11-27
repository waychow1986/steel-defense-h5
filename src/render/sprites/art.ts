import type { Dir } from '../../game/types';
import { PALETTE } from '../palette';

/**
 * TD-004 unified drawing style, shared by every sprite recipe: light from the top-left,
 * shadows cast to the bottom-right, one outline width and colour.
 * All recipes draw in tile units; `logicalPxPerTile` converts the "2 logical pixel" outline.
 */
export const ART = {
  logicalPxPerTile: 48,
  outlinePx: 2,
  /** Shadow offset to the bottom-right, tiles. */
  shadowOffset: 0.06,
  shadowColor: PALETTE.shadow,
  outlineColor: PALETTE.outline,
  /** Lit (top-left) and shaded (bottom-right) edge thickness, tiles. */
  edge: 0.05,
  /** Soft shadow edge in high quality, tiles (TD-005 turns it off when degraded). */
  shadowBlur: 0.04,
} as const;

export const OUTLINE_WIDTH = ART.outlinePx / ART.logicalPxPerTile;

/** Options a sprite build may vary; colours never vary outside the palette. */
export interface DrawOptions {
  /** Pixels per tile of the target canvas; only used for the soft shadow edge. */
  tilePx: number;
  shadowBlur: boolean;
}

export const DEFAULT_DRAW: DrawOptions = { tilePx: ART.logicalPxPerTile, shadowBlur: false };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shading {
  body: string;
  light: string;
  dark: string;
}

/** Maps a point given for an up-facing sprite (centre 0,0) to the facing `dir`. */
export function rotPoint(dir: Dir, x: number, y: number): [number, number] {
  switch (dir) {
    case 'up':
      return [x, y];
    case 'right':
      return [-y, x];
    case 'down':
      return [-x, -y];
    case 'left':
      return [y, -x];
  }
}

/** Same as rotPoint for an axis-aligned rect; the result stays axis-aligned. */
export function rotRect(dir: Dir, r: Rect): Rect {
  const [ax, ay] = rotPoint(dir, r.x, r.y);
  const [bx, by] = rotPoint(dir, r.x + r.w, r.y + r.h);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Fills `silhouette` in the shadow colour, offset to the bottom-right (the one place shadows are drawn). */
export function castShadow(ctx: CanvasRenderingContext2D, opts: DrawOptions, silhouette: () => void): void {
  ctx.save();
  ctx.translate(ART.shadowOffset, ART.shadowOffset);
  ctx.fillStyle = ART.shadowColor;
  if (opts.shadowBlur) {
    ctx.shadowColor = ART.shadowColor;
    ctx.shadowBlur = ART.shadowBlur * opts.tilePx;
  }
  ctx.beginPath();
  silhouette();
  ctx.fill();
  ctx.restore();
}

/** Strokes the current path with the shared outline (the one place outlines are drawn). */
export function strokeOutline(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.strokeStyle = ART.outlineColor;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** A rect lit from the top-left: body fill, light top/left edges, dark bottom/right edges, outline. */
export function litRect(ctx: CanvasRenderingContext2D, r: Rect, c: Shading, outline = true): void {
  const e = Math.min(ART.edge, r.w / 3, r.h / 3);
  ctx.fillStyle = c.body;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = c.light;
  ctx.fillRect(r.x, r.y, r.w, e);
  ctx.fillRect(r.x, r.y, e, r.h);
  ctx.fillStyle = c.dark;
  ctx.fillRect(r.x, r.y + r.h - e, r.w, e);
  ctx.fillRect(r.x + r.w - e, r.y, e, r.h);
  if (outline) {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    strokeOutline(ctx);
  }
}

/** A disc lit from the top-left: dark rim at the bottom-right, body, highlight, outline. */
export function litDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: Shading): void {
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  strokeOutline(ctx);
}

/** A closed polygon filled with `fill` and outlined. */
export function polygon(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>, fill: string, outline = true): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  if (outline) strokeOutline(ctx);
}
