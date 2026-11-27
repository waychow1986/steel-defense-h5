import { CONFIG } from '../../game/config';
import type { Dir, TankType } from '../../game/types';
import { PALETTE } from '../palette';
import { castShadow, litDisc, litRect, polygon, rotPoint, rotRect, type DrawOptions, type Rect, type Shading } from './art';

export type PaletteKey = keyof typeof PALETTE;

/**
 * Declarative tank recipe (TD-003/TD-004). Sizes are fractions of the tank side, given for an
 * up-facing tank centred on 0,0. Every type differs in main colour and in silhouette
 * (span, tread length, barrel width/reach) so player and enemies can be told apart (FR-017, FR-032).
 */
export interface TankStyle {
  body: PaletteKey;
  light: PaletteKey;
  dark: PaletteKey;
  /** Outer width across both treads. */
  span: number;
  treadWidth: number;
  treadLength: number;
  hullWidth: number;
  hullLength: number;
  turret: number;
  barrelWidth: number;
  /** Distance from the centre to the muzzle. */
  barrelReach: number;
  feature: 'chevron' | 'none' | 'fins' | 'plates';
}

export const TANK_STYLES: Readonly<Record<TankType, TankStyle>> = {
  player: {
    body: 'player',
    light: 'playerLight',
    dark: 'playerDark',
    span: 1,
    treadWidth: 0.24,
    treadLength: 1,
    hullWidth: 0.6,
    hullLength: 0.76,
    turret: 0.2,
    barrelWidth: 0.11,
    barrelReach: 0.57,
    feature: 'chevron',
  },
  normal: {
    body: 'enemyNormal',
    light: 'enemyNormalLight',
    dark: 'enemyNormalDark',
    span: 1,
    treadWidth: 0.24,
    treadLength: 0.88,
    hullWidth: 0.6,
    hullLength: 0.7,
    turret: 0.2,
    barrelWidth: 0.11,
    barrelReach: 0.5,
    feature: 'none',
  },
  fast: {
    body: 'enemyFast',
    light: 'enemyFastLight',
    dark: 'enemyFastDark',
    span: 0.92,
    treadWidth: 0.18,
    treadLength: 1,
    hullWidth: 0.44,
    hullLength: 0.8,
    turret: 0.15,
    barrelWidth: 0.08,
    barrelReach: 0.6,
    feature: 'fins',
  },
  heavy: {
    body: 'enemyHeavy',
    light: 'enemyHeavyLight',
    dark: 'enemyHeavyDark',
    span: 1,
    treadWidth: 0.28,
    treadLength: 1,
    hullWidth: 0.7,
    hullLength: 0.8,
    turret: 0.25,
    barrelWidth: 0.17,
    barrelReach: 0.52,
    feature: 'plates',
  },
};

const S = CONFIG.tankSize;
const TURRET_Y = 0.04;
const LINKS = 4;

/** Extra room around the tank square in a tank sprite (barrel reach, shadow, soft edge), tiles. */
export const TANK_PAD = 0.26;

export function tankShading(type: TankType, hit: boolean): Shading {
  if (hit) return { body: PALETTE.hitBody, light: PALETTE.hitLight, dark: PALETTE.hitDark };
  const st = TANK_STYLES[type];
  return { body: PALETTE[st.body], light: PALETTE[st.light], dark: PALETTE[st.dark] };
}

function treadRects(st: TankStyle): Rect[] {
  const half = (st.span * S) / 2;
  const w = st.treadWidth * S;
  const l = st.treadLength * S;
  return [
    { x: -half, y: -l / 2, w, h: l },
    { x: half - w, y: -l / 2, w, h: l },
  ];
}

function barrelRect(st: TankStyle): Rect {
  const w = st.barrelWidth * S;
  return { x: -w / 2, y: -st.barrelReach * S, w, h: st.barrelReach * S + TURRET_Y };
}

/** The tank's whole footprint (across both treads, tread length), so the shadow is cast by the whole body. */
function footprintRect(st: TankStyle): Rect {
  const half = (st.span * S) / 2;
  const l = st.treadLength * S;
  return { x: -half, y: -l / 2, w: st.span * S, h: l };
}

/** Treads (with the moving link phase), hull and type feature; the shadow covers the whole tank. */
export function drawTankHull(ctx: CanvasRenderingContext2D, type: TankType, dir: Dir, phase: number, hit: boolean, opts: DrawOptions): void {
  const st = TANK_STYLES[type];
  const c = tankShading(type, hit);
  const treads = treadRects(st).map((r) => rotRect(dir, r));
  const barrel = rotRect(dir, barrelRect(st));
  const footprint = rotRect(dir, footprintRect(st));
  castShadow(ctx, opts, () => {
    for (const r of [footprint, barrel]) ctx.rect(r.x, r.y, r.w, r.h);
  });
  const treadShade: Shading = { body: c.dark, light: c.body, dark: PALETTE.treadLink };
  for (const [i, local] of treadRects(st).entries()) {
    litRect(ctx, treads[i], treadShade);
    ctx.fillStyle = PALETTE.treadLink;
    const gap = local.h / LINKS;
    for (let k = 0; k < LINKS; k++) {
      const y = local.y + ((k + phase / CONFIG.treadPhases) % LINKS) * gap;
      const bar = rotRect(dir, { x: local.x, y, w: local.w, h: gap * 0.3 });
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    }
  }
  const hull: Rect = { x: (-st.hullWidth * S) / 2, y: (-st.hullLength * S) / 2, w: st.hullWidth * S, h: st.hullLength * S };
  litRect(ctx, rotRect(dir, hull), c);
  const pts = (list: Array<[number, number]>) => list.map(([x, y]) => rotPoint(dir, x * S, y * S));
  if (st.feature === 'plates') {
    ctx.fillStyle = c.dark;
    for (const y of [-0.28, 0.2]) {
      const r = rotRect(dir, { x: hull.x, y: y * S, w: hull.w, h: 0.08 * S });
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  } else if (st.feature === 'fins') {
    polygon(ctx, pts([[-0.22, 0.38], [0, 0.16], [0.22, 0.38]]), c.light);
  } else if (st.feature === 'chevron') {
    polygon(ctx, pts([[-0.16, 0.34], [0, 0.24], [0.16, 0.34], [0, 0.29]]), c.light, false);
  }
}

/** The barrel alone, so it can slide back on recoil (FR-034). */
export function drawTankBarrel(ctx: CanvasRenderingContext2D, type: TankType, dir: Dir, hit: boolean): void {
  litRect(ctx, rotRect(dir, barrelRect(TANK_STYLES[type])), tankShading(type, hit));
}

export function drawTankTurret(ctx: CanvasRenderingContext2D, type: TankType, dir: Dir, hit: boolean): void {
  const [x, y] = rotPoint(dir, 0, TURRET_Y);
  litDisc(ctx, x, y, TANK_STYLES[type].turret * S, tankShading(type, hit));
}
