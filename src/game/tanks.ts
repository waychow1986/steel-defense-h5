import { CONFIG } from './config';
import { blocksTank, boxHits } from './map';
import type { Dir, GameState, PlayerTank, Tank } from './types';

const S = CONFIG.tankSize;
const U = CONFIG.unitsPerTile;
const EPS = 1e-9;
const MARGIN = (1 - S) / 2;

export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function isHorizontal(dir: Dir): boolean {
  return dir === 'left' || dir === 'right';
}

export function createPlayer(id: number): PlayerTank {
  return {
    id,
    side: 'player',
    type: 'player',
    x: CONFIG.playerSpawn.col + MARGIN,
    y: CONFIG.playerSpawn.row + MARGIN,
    dir: 'up',
    moving: false,
    hp: 1,
    maxHp: 1,
    carrier: false,
    speed: CONFIG.playerSpeed,
    fireCooldownMs: 0,
    recoilMs: 0,
    treadPhase: 0,
    treadAccum: 0,
    shieldMs: 0,
    firepower: 0,
    maxBullets: CONFIG.playerMaxBullets,
  };
}

function overlaps(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw - EPS && bx < ax + aw - EPS && ay < by + bh - EPS && by < ay + ah - EPS;
}

/** Whether a tank occupying (x, y) would collide with terrain, the base, map edges or another tank. */
export function tankBlocked(state: GameState, tank: Tank, x: number, y: number): boolean {
  if (x < -EPS || y < -EPS || x + S > CONFIG.cols + EPS || y + S > CONFIG.rows + EPS) return true;
  if (boxHits(state.map, x, y, S, S, blocksTank)) return true;
  if (overlaps(x, y, S, S, state.base.x, state.base.y, 1, 1)) return true;
  const others: Tank[] = state.player && state.player !== tank ? [state.player, ...state.enemies] : state.enemies;
  for (const o of others) {
    if (o === tank) continue;
    if (overlaps(x, y, S, S, o.x, o.y, S, S)) return true;
  }
  return false;
}

function snapCross(v: number): number {
  const g = CONFIG.snapGrid;
  return Math.round((v + S / 2) / g) * g - S / 2;
}

/**
 * Turn and move a tank one step. Returns true when the tank changed direction or position
 * (used to measure input response).
 */
export function moveTank(state: GameState, tank: Tank, dir: Dir | null, dtMs: number): boolean {
  if (dir === null) {
    tank.moving = false;
    return false;
  }
  let changed = false;
  if (dir !== tank.dir) {
    if (isHorizontal(dir) !== isHorizontal(tank.dir)) {
      if (isHorizontal(dir)) {
        const ny = snapCross(tank.y);
        if (!tankBlocked(state, tank, tank.x, ny)) tank.y = ny;
      } else {
        const nx = snapCross(tank.x);
        if (!tankBlocked(state, tank, nx, tank.y)) tank.x = nx;
      }
    }
    tank.dir = dir;
    changed = true;
  }
  const dist = (tank.speed * dtMs) / 1000;
  const { dx, dy } = DIR_VEC[dir];
  const ox = tank.x;
  const oy = tank.y;
  let nx = Math.min(Math.max(ox + dx * dist, 0), CONFIG.cols - S);
  let ny = Math.min(Math.max(oy + dy * dist, 0), CONFIG.rows - S);
  if (tankBlocked(state, tank, nx, ny)) {
    // Slide up to the unit boundary in front of the obstacle.
    if (dir === 'up') ny = Math.ceil(ny * U - EPS) / U;
    else if (dir === 'down') ny = Math.floor((ny + S) * U + EPS) / U - S;
    else if (dir === 'left') nx = Math.ceil(nx * U - EPS) / U;
    else nx = Math.floor((nx + S) * U + EPS) / U - S;
    const backwards = dx * (nx - ox) + dy * (ny - oy) < 0;
    if (backwards || tankBlocked(state, tank, nx, ny)) {
      nx = ox;
      ny = oy;
    }
  }
  tank.x = nx;
  tank.y = ny;
  const moved = Math.abs(nx - ox) + Math.abs(ny - oy);
  tank.moving = moved > EPS;
  if (tank.moving) {
    changed = true;
    tank.treadAccum += moved;
    while (tank.treadAccum >= CONFIG.treadStep) {
      tank.treadAccum -= CONFIG.treadStep;
      tank.treadPhase = (tank.treadPhase + 1) % CONFIG.treadPhases;
    }
  }
  return changed;
}

export function tankCenter(tank: Tank): { x: number; y: number } {
  return { x: tank.x + S / 2, y: tank.y + S / 2 };
}
