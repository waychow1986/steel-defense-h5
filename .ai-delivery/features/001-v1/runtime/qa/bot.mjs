// 自动游玩（测试的操作手段，不是产品要求）：按快照规划路线、瞄准、躲避
import { DV, FRAME } from './lib.mjs';

const N = 52;
const TS = 0.875; // 坦克边长（格），由快照坐标观察得到
const OFF = 0.0625;

export const unitOf = v => Math.max(0, Math.min(48, Math.round((v - OFF) * 4)));
const center = t => [t.x + TS / 2, t.y + TS / 2];

function blockedCell(s, ux, uy) {
  if (ux < 0 || uy < 0 || ux >= N || uy >= N) return 'X';
  const bx = s.base.x * 4, by = s.base.y * 4;
  if (ux >= bx && ux < bx + 4 && uy >= by && uy < by + 4) return 'X';
  const c = s.map.cells[uy][ux];
  return c === 'S' || c === 'W' ? 'X' : c;
}
function footCost(s, ux, uy) {
  let cost = 1;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const c = blockedCell(s, ux + i, uy + j);
    if (c === 'X') return Infinity;
    if (c === 'B') cost += 3;
  }
  return cost;
}

// Dijkstra（砖可打穿，代价较高）
export function plan(s, from, goal) {
  const W = 49;
  const dist = new Float64Array(W * W).fill(Infinity), prev = new Int32Array(W * W).fill(-1);
  const st = from[1] * W + from[0];
  dist[st] = 0;
  const open = [[0, st]];
  const gk = goal[1] * W + goal[0];
  let best = st, bestH = Infinity;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (d > dist[k]) continue;
    const x = k % W, y = (k / W) | 0;
    const h = Math.abs(x - goal[0]) + Math.abs(y - goal[1]);
    if (h < bestH) { bestH = h; best = k; }
    if (k === gk) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const c = footCost(s, nx, ny); if (c === Infinity) continue;
      const nk = ny * W + nx, nd = d + c;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; open.push([nd, nk]); }
    }
    if (open.length > 6000) break;
  }
  const path = []; let k = best;
  while (k !== -1) { path.push([k % W, (k / W) | 0]); k = prev[k]; }
  return path.reverse();
}

function dirTo(a, b) {
  if (b[0] > a[0]) return 'right'; if (b[0] < a[0]) return 'left';
  if (b[1] > a[1]) return 'down'; if (b[1] < a[1]) return 'up';
  return null;
}

// 从玩家中心沿 dir 的射线，返回第一个碰到的东西
export function rayHit(s, dir, from, opts = {}) {
  const [dx, dy] = DV[dir];
  let [cx, cy] = from;
  for (let i = 0; i < 60; i++) {
    cx += dx * 0.25; cy += dy * 0.25;
    if (cx < 0 || cy < 0 || cx >= 13 || cy >= 13) return { kind: 'edge' };
    const base = s.base;
    if (!base.destroyed && cx >= base.x && cx < base.x + 1 && cy >= base.y && cy < base.y + 1) return { kind: 'base', dist: i * 0.25 };
    for (const e of s.enemies) {
      if (cx >= e.x - 0.15 && cx <= e.x + TS + 0.15 && cy >= e.y - 0.15 && cy <= e.y + TS + 0.15) return { kind: 'enemy', enemy: e, dist: i * 0.25 };
    }
    if (opts.player && s.player) {
      const p = s.player;
      if (cx >= p.x && cx <= p.x + TS && cy >= p.y && cy <= p.y + TS) return { kind: 'player', dist: i * 0.25 };
    }
    const c = s.map.cells[Math.floor(cy * 4)][Math.floor(cx * 4)];
    if (c === 'S') return { kind: 'steel', dist: i * 0.25 };
    if (c === 'B' && !opts.throughBrick) return { kind: 'brick', dist: i * 0.25 };
  }
  return { kind: 'none' };
}

// 射击是否安全：不会打到我方指挥所，也不会打掉指挥所周围的砖
export function safeToFire(s, dir) {
  const p = s.player; if (!p) return false;
  const c = center(p);
  const h = rayHit(s, dir, c, { throughBrick: true });
  const b = s.base;
  if (h.kind === 'base') return false;
  // 指挥所周围一圈的砖不打
  const [dx, dy] = DV[dir];
  let [x, y] = c;
  for (let i = 0; i < 8; i++) {
    x += dx * 0.25; y += dy * 0.25;
    if (x >= b.x - 1 && x < b.x + 2 && y >= b.y - 1 && y < b.y + 1 && s.map.cells[Math.floor(y * 4)]?.[Math.floor(x * 4)] === 'B') return false;
  }
  return true;
}

// 把玩家坦克开到指定位置（格坐标，左上角），不射击不躲避；返回是否到达
export async function goTo(g, tx, ty, maxMs = 15000) {
  const goal = [unitOf(tx), unitOf(ty)];
  const bot = new Bot(g, { shoot: false, dodge: false, pickup: false, goal: () => goal });
  const near = s => s.player && Math.abs(s.player.x - tx) < 0.3 && Math.abs(s.player.y - ty) < 0.3;
  let s = await bot.run({ maxMs, stop: near });
  await g.release(); await g.adv(50);
  if (!s) return false;
  // 精调：逐帧点动
  for (let i = 0; i < 40; i++) {
    s = await g.snap(); const p = s.player; if (!p) return false;
    const ex = tx - p.x, ey = ty - p.y;
    if (Math.abs(ex) < 0.06 && Math.abs(ey) < 0.06) return true;
    const dir = Math.abs(ex) >= Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : (ey > 0 ? 'down' : 'up');
    await g.hold(dir); await g.adv(FRAME); await g.release(); await g.adv(FRAME);
  }
  return false;
}

export class Bot {
  constructor(g, opts = {}) {
    this.g = g; this.opts = opts; this.path = null; this.pathAge = 0; this.lastPos = null; this.stuck = 0; this.wiggle = 0;
    this.step = opts.step || 50;
  }
  async tap(dir) {
    await this.g.hold(dir); await this.g.adv(FRAME); await this.g.release();
  }
  pickGoal(s) {
    const p = s.player;
    if (this.opts.goal) { const gl = this.opts.goal(s); if (gl) return gl; }
    if (this.opts.pickup !== false && s.powerUps.length) {
      const pu = s.powerUps[0]; return [unitOf(pu.x), unitOf(pu.y)];
    }
    if (!s.enemies.length) return [unitOf(6), unitOf(9)];
    let best = null, bd = 1e9;
    for (const e of s.enemies) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y); if (d < bd) { bd = d; best = e; } }
    // 尽量与敌人同列（在其下方）射击
    return [unitOf(best.x), unitOf(Math.min(10, best.y + 3))];
  }
  danger(s) {
    const p = s.player; const [pcx, pcy] = center(p);
    for (const b of s.bullets) {
      if (b.owner !== 'enemy') continue;
      const [dx, dy] = DV[b.dir];
      const rx = pcx - b.x, ry = pcy - b.y;
      const along = rx * dx + ry * dy, lat = Math.abs(rx * dy - ry * dx);
      if (along > 0 && along < 3 && lat < 0.6) return b;
    }
    return null;
  }
  // 一步：返回快照
  async act(s) {
    const g = this.g; const p = s.player;
    if (s.screen !== 'playing' || !p) { await g.release(); await g.adv(this.step); return; }
    const [pcx, pcy] = center(p);
    // 1 射击机会
    if (this.opts.shoot !== false && (!this.opts.shootGate || this.opts.shootGate(s))) {
      for (const dir of ['up', 'left', 'right', 'down']) {
        const h = rayHit(s, dir, [pcx, pcy], { throughBrick: true });
        if (h.kind === 'enemy' && h.dist < 9 && safeToFire(s, dir)) {
          await g.release();
          if (p.dir !== dir) await this.tap(dir);
          await g.fire(); await g.adv(this.step - FRAME);
          return;
        }
      }
    }
    // 2 躲避
    const b = this.opts.dodge !== false && this.danger(s);
    if (b && !this.wiggle) {
      const perp = (b.dir === 'up' || b.dir === 'down') ? ['left', 'right'] : ['up', 'down'];
      const ok = perp.filter(d => footCost(s, unitOf(p.x) + DV[d][0], unitOf(p.y) + DV[d][1]) < 2);
      if (ok.length) { await g.hold(ok[0]); await g.adv(this.step); return; }
    }
    // 3 寻路
    const from = [unitOf(p.x), unitOf(p.y)];
    const goal = this.pickGoal(s);
    if (!this.path || this.pathAge++ > 8 || !this.goal || this.goal[0] !== goal[0] || this.goal[1] !== goal[1]) {
      this.path = plan(s, from, goal); this.pathAge = 0; this.goal = goal;
    }
    // 去掉已走过的点
    let idx = this.path.findIndex(q => q[0] === from[0] && q[1] === from[1]);
    if (idx < 0) { this.path = plan(s, from, goal); idx = 0; }
    const next = this.path[idx + 1];
    let dir = next ? dirTo(from, next) : null;
    if (this.wiggle > 0) { this.wiggle--; dir = this.wiggleDir; }
    // 卡住：前方是砖则开火打通；否则换方向晃动
    const moved = this.lastPos && (Math.abs(this.lastPos[0] - p.x) + Math.abs(this.lastPos[1] - p.y)) > 0.01;
    this.lastPos = [p.x, p.y];
    if (dir && !moved && g.held) this.stuck++; else this.stuck = 0;
    if (dir && this.stuck >= 2) {
      const ahead = rayHit(s, dir, [pcx, pcy]);
      if (ahead.kind === 'brick' && ahead.dist < 1.2 && safeToFire(s, dir)) {
        await g.release(); if (p.dir !== dir) await this.tap(dir); await g.fire(); await g.adv(this.step - FRAME); return;
      }
      if (this.stuck >= 4) {
        const alt = (dir === 'up' || dir === 'down') ? ['left', 'right'] : ['up', 'down'];
        this.wiggleDir = alt[(Math.random() * 2) | 0]; this.wiggle = 3; this.stuck = 0; this.path = null;
      }
    }
    if (dir) await g.hold(dir); else await g.release();
    await g.adv(this.step);
  }
  // 运行直到 stop(s) 为真或超时（游戏时间 ms）；onSnap(prev, s) 用于观察
  async run({ stop, maxMs, onSnap, deadline }) {
    let t = 0, prev = null, s;
    while (t < maxMs) {
      if (deadline && Date.now() > deadline) break;
      s = await this.g.snap();
      if (onSnap) await onSnap(prev, s);
      if (stop && stop(s)) { await this.g.release(); return s; }
      await this.act(s);
      prev = s; t += this.step;
    }
    await this.g.release();
    return null;
  }
}
