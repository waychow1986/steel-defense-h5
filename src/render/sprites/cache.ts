import { CONFIG } from '../../game/config';
import type { Dir, PowerUpType, TankType } from '../../game/types';
import type { DrawOptions } from './art';
import { DIRS, POWER_UP_TYPES, TANK_TYPES } from './index';
import { drawBase, drawBullet, drawMuzzle, drawPowerUp, MUZZLE_FRAMES } from './items';
import { drawTankBarrel, drawTankHull, drawTankTurret, TANK_PAD } from './tank';

/** A pre-rendered sprite: draw at (anchor − origin) with `size` tiles per side. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Offset from the anchor point to the sprite's top-left corner, tiles. */
  origin: number;
  size: number;
}

const TANK_HALF = CONFIG.tankSize / 2 + TANK_PAD;
const CELL_PAD = 0.12;
const BULLET_HALF = 0.2;
const MUZZLE_HALF = 0.45;

/**
 * TD-003: every sprite is drawn once onto an offscreen canvas at the current tile size × DPR
 * and only `drawImage`d during play. Rebuilt when the scale or quality changes.
 */
export class SpriteCache {
  private readonly sprites = new Map<string, Sprite>();
  private tilePx = 0;
  private blur = true;

  constructor(private readonly doc: Document) {}

  /** Rebuilds all sprites when the tile size (backing pixels) or shadow quality changes. */
  configure(tilePx: number, shadowBlur: boolean): void {
    if (tilePx === this.tilePx && shadowBlur === this.blur && this.sprites.size > 0) return;
    this.tilePx = tilePx;
    this.blur = shadowBlur;
    this.sprites.clear();
    if (tilePx <= 0) return;
    const opts: DrawOptions = { tilePx, shadowBlur };
    for (const type of TANK_TYPES) {
      for (const dir of DIRS) {
        for (const hit of [false, true]) {
          for (let phase = 0; phase < CONFIG.treadPhases; phase++) {
            this.build(`hull:${type}:${dir}:${phase}:${hit}`, TANK_HALF * 2, TANK_HALF, (c) => drawTankHull(c, type, dir, phase, hit, opts));
          }
          this.build(`barrel:${type}:${dir}:${hit}`, TANK_HALF * 2, TANK_HALF, (c) => drawTankBarrel(c, type, dir, hit));
          this.build(`turret:${type}:${dir}:${hit}`, TANK_HALF * 2, TANK_HALF, (c) => drawTankTurret(c, type, dir, hit));
        }
      }
    }
    // Cell sprites are anchored on the cell's top-left corner, drawn in 0..1.
    for (const destroyed of [false, true]) this.build(`base:${destroyed}`, 1 + CELL_PAD * 2, CELL_PAD, (c) => drawBase(c, destroyed, opts));
    for (const type of POWER_UP_TYPES) this.build(`powerUp:${type}`, 1 + CELL_PAD * 2, CELL_PAD, (c) => drawPowerUp(c, type, opts));
    this.build('bullet', BULLET_HALF * 2, BULLET_HALF, (c) => drawBullet(c, opts));
    for (let f = 0; f < MUZZLE_FRAMES; f++) for (const dir of DIRS) this.build(`muzzle:${f}:${dir}`, MUZZLE_HALF * 2, MUZZLE_HALF, (c) => drawMuzzle(c, f, dir));
  }

  /** Draws a sprite whose drawing origin sits `origin` tiles from the canvas top-left, on a `side`-tile canvas. */
  private build(key: string, side: number, origin: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const canvas = this.doc.createElement('canvas');
    const px = Math.max(1, Math.ceil(side * this.tilePx));
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const t = px / side;
      ctx.setTransform(t, 0, 0, t, origin * t, origin * t);
      draw(ctx);
    }
    this.sprites.set(key, { canvas, origin, size: side });
  }

  private get(key: string): Sprite | undefined {
    return this.sprites.get(key);
  }

  hull(type: TankType, dir: Dir, phase: number, hit: boolean): Sprite | undefined {
    return this.get(`hull:${type}:${dir}:${phase % CONFIG.treadPhases}:${hit}`);
  }

  barrel(type: TankType, dir: Dir, hit: boolean): Sprite | undefined {
    return this.get(`barrel:${type}:${dir}:${hit}`);
  }

  turret(type: TankType, dir: Dir, hit: boolean): Sprite | undefined {
    return this.get(`turret:${type}:${dir}:${hit}`);
  }

  base(destroyed: boolean): Sprite | undefined {
    return this.get(`base:${destroyed}`);
  }

  powerUp(type: PowerUpType): Sprite | undefined {
    return this.get(`powerUp:${type}`);
  }

  bullet(): Sprite | undefined {
    return this.get('bullet');
  }

  muzzle(frame: number, dir: Dir): Sprite | undefined {
    return this.get(`muzzle:${frame}:${dir}`);
  }
}
