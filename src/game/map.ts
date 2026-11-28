import { CONFIG } from './config';
import { CELL_BRICK, CELL_EMPTY, CELL_STEEL, CELL_WATER, type Cell, type MapGrid } from './types';

const U = CONFIG.unitsPerTile;
const EPS = 1e-6;

const CHAR_TO_CELL: Record<string, Cell> = { '.': CELL_EMPTY, B: CELL_BRICK, S: CELL_STEEL, W: CELL_WATER, H: CELL_EMPTY };
const CELL_TO_CHAR = ['.', 'B', 'S', 'W'] as const;

export function createMap(layout: readonly string[]): MapGrid {
  const cols = CONFIG.cols;
  const rows = CONFIG.rows;
  if (layout.length !== rows || layout.some((l) => l.length !== cols)) {
    throw new RangeError('layout must be 13 rows of 13 chars');
  }
  const width = cols * U;
  const height = rows * U;
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = CHAR_TO_CELL[layout[r][c]];
      if (v === undefined) throw new RangeError(`unknown layout char ${layout[r][c]}`);
      for (let dy = 0; dy < U; dy += 1) {
        for (let dx = 0; dx < U; dx += 1) cells[(r * U + dy) * width + c * U + dx] = v;
      }
    }
  }
  return { cols, rows, width, height, cells };
}

export function cellAt(map: MapGrid, ux: number, uy: number): Cell {
  if (ux < 0 || uy < 0 || ux >= map.width || uy >= map.height) return CELL_STEEL;
  return map.cells[uy * map.width + ux] as Cell;
}

export function setCell(map: MapGrid, ux: number, uy: number, v: Cell): void {
  if (ux < 0 || uy < 0 || ux >= map.width || uy >= map.height) return;
  map.cells[uy * map.width + ux] = v;
}

/** 52 strings, one char per unit: '.', 'B', 'S', 'W'. */
export function mapRows(map: MapGrid): string[] {
  const out: string[] = [];
  for (let y = 0; y < map.height; y += 1) {
    let line = '';
    for (let x = 0; x < map.width; x += 1) line += CELL_TO_CHAR[map.cells[y * map.width + x]];
    out.push(line);
  }
  return out;
}

/** Unit index range [from, to) covered by the span [a, a+len) in tiles (touching edges excluded). */
export function unitSpan(a: number, len: number): [number, number] {
  return [Math.floor(a * U + EPS), Math.ceil((a + len) * U - EPS)];
}

/** True when any unit inside the box (tiles) matches the predicate. */
export function boxHits(map: MapGrid, x: number, y: number, w: number, h: number, pred: (c: Cell) => boolean): boolean {
  const [x0, x1] = unitSpan(x, w);
  const [y0, y1] = unitSpan(y, h);
  for (let uy = y0; uy < y1; uy += 1) {
    for (let ux = x0; ux < x1; ux += 1) {
      if (pred(cellAt(map, ux, uy))) return true;
    }
  }
  return false;
}

export const blocksTank = (c: Cell): boolean => c !== CELL_EMPTY;
export const blocksBullet = (c: Cell): boolean => c === CELL_BRICK || c === CELL_STEEL;
