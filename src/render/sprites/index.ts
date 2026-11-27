import { CONFIG } from '../../game/config';
import { CELL_BRICK, CELL_EMPTY, CELL_STEEL, CELL_WATER, type Dir, type MapGrid, type PowerUpType, type TankType } from '../../game/types';
import type { DrawOptions } from './art';
import { drawBase, drawBullet, drawMuzzle, drawPowerUp, MUZZLE_FRAMES } from './items';
import { drawTankBarrel, drawTankHull, drawTankTurret } from './tank';
import { drawTerrain } from './terrain';

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export const TANK_TYPES: readonly TankType[] = ['player', 'normal', 'fast', 'heavy'];
export const POWER_UP_TYPES: readonly PowerUpType[] = ['shield', 'firepower'];

/** One drawable sprite recipe; `shadow` says whether the sprite casts the shared shadow. */
export interface SpriteRecipe {
  name: string;
  shadow: boolean;
  draw(ctx: CanvasRenderingContext2D, opts: DrawOptions): void;
}

/** A small map with every terrain kind, used to check the terrain recipe. */
function sampleMap(): MapGrid {
  const kinds = [CELL_EMPTY, CELL_BRICK, CELL_STEEL, CELL_WATER];
  const width = 8;
  const height = 8;
  const cells = Uint8Array.from({ length: width * height }, (_, i) => kinds[Math.floor(i / 2) % kinds.length]);
  return { cols: 2, rows: 2, width, height, cells };
}

/** Every sprite recipe in the game (UT-art checks palette use, shadow offset and outline width on all of them). */
export function allRecipes(): SpriteRecipe[] {
  const list: SpriteRecipe[] = [];
  for (const type of TANK_TYPES) {
    for (const dir of DIRS) {
      for (const hit of [false, true]) {
        for (let phase = 0; phase < CONFIG.treadPhases; phase++) {
          list.push({ name: `tank:${type}:${dir}:${phase}:${hit}`, shadow: true, draw: (c, o) => drawTankHull(c, type, dir, phase, hit, o) });
        }
        list.push({ name: `barrel:${type}:${dir}:${hit}`, shadow: false, draw: (c) => drawTankBarrel(c, type, dir, hit) });
        list.push({ name: `turret:${type}:${dir}:${hit}`, shadow: false, draw: (c) => drawTankTurret(c, type, dir, hit) });
      }
    }
  }
  for (const destroyed of [false, true]) list.push({ name: `base:${destroyed}`, shadow: true, draw: (c, o) => drawBase(c, destroyed, o) });
  for (const type of POWER_UP_TYPES) list.push({ name: `powerUp:${type}`, shadow: true, draw: (c, o) => drawPowerUp(c, type, o) });
  list.push({ name: 'bullet', shadow: true, draw: (c, o) => drawBullet(c, o) });
  for (let f = 0; f < MUZZLE_FRAMES; f++) {
    for (const dir of DIRS) list.push({ name: `muzzle:${f}:${dir}`, shadow: false, draw: (c) => drawMuzzle(c, f, dir) });
  }
  const map = sampleMap();
  list.push({ name: 'terrain', shadow: true, draw: (c, o) => drawTerrain(c, map, o) });
  return list;
}
