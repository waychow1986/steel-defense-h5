import { CONFIG } from '../../game/config';
import type { Dir, PowerUpType } from '../../game/types';
import { PALETTE } from '../palette';
import { castShadow, litRect, polygon, rotPoint, strokeOutline, type DrawOptions } from './art';

/** Radar bunker on a one-tile cell (0..1); a dark rubble slab once destroyed. */
export function drawBase(ctx: CanvasRenderingContext2D, destroyed: boolean, opts: DrawOptions): void {
  const box = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
  castShadow(ctx, opts, () => ctx.rect(box.x, box.y, box.w, box.h));
  if (destroyed) {
    litRect(ctx, box, { body: PALETTE.baseDestroyed, light: PALETTE.smokeLight, dark: PALETTE.smoke });
    return;
  }
  litRect(ctx, box, { body: PALETTE.baseDark, light: PALETTE.base, dark: PALETTE.outline });
  polygon(
    ctx,
    [
      [0.5, 0.18],
      [0.82, 0.5],
      [0.5, 0.82],
      [0.18, 0.5],
    ],
    PALETTE.base,
  );
  // Radar dish highlight on the lit side.
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(0.43, 0.43, 0.07, 0, Math.PI * 2);
  ctx.fill();
}

/** Shield: blue shield badge; firepower: red upward arrow; on a light card (one-tile cell 0..1). */
export function drawPowerUp(ctx: CanvasRenderingContext2D, type: PowerUpType, opts: DrawOptions): void {
  const card = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  castShadow(ctx, opts, () => ctx.rect(card.x, card.y, card.w, card.h));
  litRect(ctx, card, { body: PALETTE.powerUpCard, light: PALETTE.hitLight, dark: PALETTE.textDim });
  const cx = 0.5;
  const cy = 0.5;
  if (type === 'shield') {
    polygon(
      ctx,
      [
        [cx, cy - 0.28],
        [cx + 0.24, cy - 0.18],
        [cx + 0.2, cy + 0.1],
        [cx, cy + 0.3],
        [cx - 0.2, cy + 0.1],
        [cx - 0.24, cy - 0.18],
      ],
      PALETTE.powerUpShield,
    );
  } else {
    polygon(
      ctx,
      [
        [cx, cy - 0.3],
        [cx + 0.24, cy],
        [cx + 0.09, cy],
        [cx + 0.09, cy + 0.28],
        [cx - 0.09, cy + 0.28],
        [cx - 0.09, cy],
        [cx - 0.24, cy],
      ],
      PALETTE.powerUpFire,
    );
  }
}

/** Bullet core centred on 0,0. */
export function drawBullet(ctx: CanvasRenderingContext2D, opts: DrawOptions): void {
  const r = CONFIG.bulletSize * 0.32;
  castShadow(ctx, opts, () => ctx.arc(0, 0, r, 0, Math.PI * 2));
  ctx.fillStyle = PALETTE.bullet;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  strokeOutline(ctx);
}

export const MUZZLE_FRAMES = 3;

/**
 * Muzzle flash frame (0 = brightest) centred on the muzzle, pointing along `dir` (FR-034).
 * A light source, so it casts no shadow and has no outline.
 */
export function drawMuzzle(ctx: CanvasRenderingContext2D, frame: number, dir: Dir): void {
  const k = 1 - frame / MUZZLE_FRAMES;
  const p = (x: number, y: number) => rotPoint(dir, x * k, y * k);
  polygon(ctx, [p(-0.2, 0.05), p(-0.12, -0.18), p(0, -0.36), p(0.12, -0.18), p(0.2, 0.05)], PALETTE.muzzleEdge, false);
  polygon(ctx, [p(-0.13, 0.03), p(0, -0.26), p(0.13, 0.03)], PALETTE.muzzleMid, false);
  ctx.fillStyle = PALETTE.muzzleCore;
  ctx.beginPath();
  ctx.arc(0, 0, 0.09 * k + 0.02, 0, Math.PI * 2);
  ctx.fill();
}
