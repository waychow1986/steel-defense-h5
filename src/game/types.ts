export type Dir = 'up' | 'down' | 'left' | 'right';
export type Screen = 'start' | 'levelIntro' | 'playing' | 'levelClear' | 'gameOver' | 'victory';
export type EnemyType = 'normal' | 'fast' | 'heavy';
export type TankType = 'player' | EnemyType;
export type PowerUpType = 'shield' | 'firepower';

/** Terrain cell values, one per 1/4-tile unit. */
export const CELL_EMPTY = 0;
export const CELL_BRICK = 1;
export const CELL_STEEL = 2;
export const CELL_WATER = 3;
export type Cell = 0 | 1 | 2 | 3;

export interface MapGrid {
  cols: number;
  rows: number;
  /** Units per side (cols * unitsPerTile). */
  width: number;
  height: number;
  cells: Uint8Array;
}

export interface Tank {
  id: number;
  side: 'player' | 'enemy';
  type: TankType;
  /** Top-left corner, tiles. */
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  hp: number;
  maxHp: number;
  carrier: boolean;
  speed: number;
  fireCooldownMs: number;
  recoilMs: number;
  treadPhase: number;
  /** Distance travelled since the last tread phase change, tiles. */
  treadAccum: number;
}

export interface PlayerTank extends Tank {
  side: 'player';
  type: 'player';
  shieldMs: number;
  firepower: 0 | 1;
  maxBullets: number;
}

export interface Bullet {
  id: number;
  owner: 'player' | 'enemy';
  ownerId: number;
  /** Centre point, tiles. */
  x: number;
  y: number;
  dir: Dir;
  speed: number;
}

export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
}

export interface Base {
  /** Top-left of the base tile, tiles. */
  x: number;
  y: number;
  destroyed: boolean;
}

export type GameEvent =
  | { type: 'fire'; owner: 'player' | 'enemy'; x: number; y: number; dir: Dir }
  | { type: 'brickHit'; x: number; y: number; dir: Dir }
  | { type: 'steelHit'; x: number; y: number }
  | { type: 'tankHit'; tankId: number; x: number; y: number; shielded: boolean }
  | { type: 'explode'; target: 'tank' | 'base'; x: number; y: number }
  | { type: 'pickup'; powerUp: PowerUpType; x: number; y: number }
  | { type: 'lifeLost'; lives: number }
  | { type: 'scoreChanged'; score: number }
  | { type: 'enemySpawned'; tankId: number }
  | { type: 'levelClear'; level: number }
  | { type: 'gameOver' }
  | { type: 'victory' };

export interface LevelDef {
  level: number;
  /** 13 strings of 13 chars: '.' empty, 'B' brick, 'S' steel, 'W' water, 'H' base. */
  layout: readonly string[];
  /** Spawn order, e.g. ['normal', 'fast', ...]. */
  order: readonly EnemyType[];
  /** 1-based spawn indices of power-up carriers. */
  carriers: readonly number[];
}

export interface GameState {
  screen: Screen;
  level: number;
  score: number;
  lives: number;
  enemiesRemaining: number;
  enemiesSpawned: number;
  timeMs: number;
  rngSeed: number;
  rngState: number;
  nextId: number;
  map: MapGrid;
  base: Base;
  player: PlayerTank | null;
  enemies: Tank[];
  bullets: Bullet[];
  powerUps: PowerUp[];
}
