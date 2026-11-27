import { CONFIG } from './config';
import { cellAt, setCell, unitSpan } from './map';
import { DIR_VEC, tankCenter } from './tanks';
import {
  CELL_BRICK,
  CELL_EMPTY,
  CELL_STEEL,
  type Bullet,
  type EnemyType,
  type GameEvent,
  type GameState,
  type PlayerTank,
  type Tank,
} from './types';

const U = CONFIG.unitsPerTile;
const B = CONFIG.bulletSize;
const S = CONFIG.tankSize;

/** Spawns a bullet at the tank's muzzle; returns null when the owner has no free bullet slot. */
export function fireBullet(state: GameState, tank: Tank, maxBullets: number, speed: number): Bullet | null {
  const owned = state.bullets.filter((b) => b.ownerId === tank.id).length;
  if (owned >= maxBullets) return null;
  const c = tankCenter(tank);
  const v = DIR_VEC[tank.dir];
  const bullet: Bullet = {
    id: state.nextId++,
    owner: tank.side,
    ownerId: tank.id,
    x: c.x + (v.dx * S) / 2,
    y: c.y + (v.dy * S) / 2,
    dir: tank.dir,
    speed,
  };
  state.bullets.push(bullet);
  return bullet;
}

type HitResult = 'none' | 'brick' | 'steel';

/** Checks the bullet box against brick/steel; a brick hit clears a 4-across × 2-along strip. */
function hitTerrain(state: GameState, b: Bullet): HitResult {
  const [x0, x1] = unitSpan(b.x - B / 2, B);
  const [y0, y1] = unitSpan(b.y - B / 2, B);
  let brickLead: number | null = null;
  let steel = false;
  const vertical = b.dir === 'up' || b.dir === 'down';
  for (let uy = y0; uy < y1; uy += 1) {
    for (let ux = x0; ux < x1; ux += 1) {
      const c = cellAt(state.map, ux, uy);
      if (c === CELL_STEEL) steel = true;
      if (c === CELL_BRICK) {
        const along = vertical ? uy : ux;
        if (brickLead === null) brickLead = along;
        else if (b.dir === 'up' || b.dir === 'left') brickLead = Math.max(brickLead, along);
        else brickLead = Math.min(brickLead, along);
      }
    }
  }
  if (brickLead !== null) {
    const across = Math.round((vertical ? b.x : b.y) * U);
    const half = CONFIG.brickClearAcross / 2;
    const step = b.dir === 'up' || b.dir === 'left' ? -1 : 1;
    for (let k = 0; k < CONFIG.brickClearAlong; k += 1) {
      const along = brickLead + k * step;
      for (let a = across - half; a < across + half; a += 1) {
        const ux = vertical ? a : along;
        const uy = vertical ? along : a;
        if (cellAt(state.map, ux, uy) === CELL_BRICK) setCell(state.map, ux, uy, CELL_EMPTY);
      }
    }
    return 'brick';
  }
  return steel ? 'steel' : 'none';
}

function hitsBase(state: GameState, b: Bullet): boolean {
  const { x, y } = state.base;
  return b.x + B / 2 > x && b.x - B / 2 < x + 1 && b.y + B / 2 > y && b.y - B / 2 < y + 1;
}

function hitsTank(b: Bullet, t: Tank): boolean {
  return b.x + B / 2 > t.x && b.x - B / 2 < t.x + S && b.y + B / 2 > t.y && b.y - B / 2 < t.y + S;
}

/** Marks the game as lost once (base destroyed or no lives left). */
export function loseGame(state: GameState, events: GameEvent[]): void {
  if (state.lost) return;
  state.lost = true;
  events.push({ type: 'gameOver' });
}

function damageEnemy(state: GameState, t: Tank, events: GameEvent[]): void {
  const c = tankCenter(t);
  t.hp -= 1;
  if (t.hp > 0) {
    events.push({ type: 'tankHit', tankId: t.id, x: c.x, y: c.y, shielded: false });
    return;
  }
  state.enemies = state.enemies.filter((e) => e !== t);
  events.push({ type: 'explode', target: 'tank', x: c.x, y: c.y });
  state.enemiesRemaining = Math.max(0, state.enemiesRemaining - 1);
  state.score += CONFIG.enemyScore[t.type as EnemyType];
  events.push({ type: 'scoreChanged', score: state.score });
}

/** Enemy bullet on the player: a shield absorbs it, otherwise one life is lost (respawn happens in the step). */
function damagePlayer(state: GameState, p: PlayerTank, events: GameEvent[]): void {
  const c = tankCenter(p);
  if (p.shieldMs > 0) {
    events.push({ type: 'tankHit', tankId: p.id, x: c.x, y: c.y, shielded: true });
    return;
  }
  events.push({ type: 'explode', target: 'tank', x: c.x, y: c.y });
  state.player = null;
  state.lives = Math.max(0, state.lives - 1);
  events.push({ type: 'lifeLost', lives: state.lives });
  if (state.lives === 0) loseGame(state, events);
}

/** Player bullets hit enemies; enemy bullets hit only the player (A-6). */
function hitTank(state: GameState, b: Bullet, events: GameEvent[]): boolean {
  if (b.owner === 'player') {
    const t = state.enemies.find((e) => hitsTank(b, e));
    if (!t) return false;
    damageEnemy(state, t, events);
    return true;
  }
  const p = state.player;
  if (!p || !hitsTank(b, p)) return false;
  damagePlayer(state, p, events);
  return true;
}

/** Advances all bullets with sub-steps; removes those that hit something or leave the map. */
export function stepBullets(state: GameState, dtMs: number, events: GameEvent[]): void {
  const subs = CONFIG.bulletSubSteps;
  const alive: Bullet[] = [];
  for (const b of state.bullets) {
    const v = DIR_VEC[b.dir];
    const d = (b.speed * dtMs) / 1000 / subs;
    let gone = false;
    for (let i = 0; i < subs && !gone; i += 1) {
      b.x += v.dx * d;
      b.y += v.dy * d;
      if (b.x < 0 || b.y < 0 || b.x > CONFIG.cols || b.y > CONFIG.rows) {
        gone = true;
        break;
      }
      if (!state.base.destroyed && hitsBase(state, b)) {
        state.base.destroyed = true;
        events.push({ type: 'explode', target: 'base', x: state.base.x + 0.5, y: state.base.y + 0.5 });
        loseGame(state, events);
        gone = true;
        break;
      }
      if (hitTank(state, b, events)) {
        gone = true;
        break;
      }
      const hit = hitTerrain(state, b);
      if (hit === 'brick') {
        events.push({ type: 'brickHit', x: b.x, y: b.y, dir: b.dir });
        gone = true;
      } else if (hit === 'steel') {
        events.push({ type: 'steelHit', x: b.x, y: b.y });
        gone = true;
      }
    }
    if (!gone) alive.push(b);
  }
  state.bullets = alive;
}
