// 截图像素统计（测试的判定手段；取值为测试设计，不作为产品要求）
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR } from '../lib.mjs';

export const lum = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
export const cdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 地图区域截图：返回 {png, T(每格像素)}
export async function mapShot(g, save) {
  const b = await g.mapBox();
  const buf = await g.page.screenshot({ clip: b, animations: 'allow' });
  if (save) { try { fs.writeFileSync(path.join(EVIDENCE_DIR, save), buf); } catch { } }
  const png = PNG.sync.read(buf);
  return { png, T: png.width / 13 };
}

// 按格坐标裁出区域：{w,h,px:[[r,g,b]...]}
export function region(ms, tx, ty, tw, th) {
  const { png, T } = ms;
  const x0 = Math.max(0, Math.round(tx * T)), y0 = Math.max(0, Math.round(ty * T));
  const x1 = Math.min(png.width, Math.round((tx + tw) * T)), y1 = Math.min(png.height, Math.round((ty + th) * T));
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * png.width + x) * 4; px.push([png.data[i], png.data[i + 1], png.data[i + 2]]); }
  return { w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), px, x0, y0 };
}

// 两个同尺寸区域明显不同（任一通道差 > thr）的像素数
export function diffCount(a, b, thr = 24) {
  const n = Math.min(a.px.length, b.px.length); let c = 0;
  for (let i = 0; i < n; i++) if (Math.max(Math.abs(a.px[i][0] - b.px[i][0]), Math.abs(a.px[i][1] - b.px[i][1]), Math.abs(a.px[i][2] - b.px[i][2])) > thr) c++;
  return c + Math.abs(a.px.length - b.px.length);
}

// 颜色直方图（每通道量化到 8 级）
export function hist(reg) {
  const m = new Map();
  for (const p of reg.px) { const k = p.map(v => v >> 5).join(','); const e = m.get(k) || { n: 0, s: [0, 0, 0] }; e.n++; e.s[0] += p[0]; e.s[1] += p[1]; e.s[2] += p[2]; m.set(k, e); }
  return [...m.values()].map(e => ({ c: e.s.map(v => Math.round(v / e.n)), n: e.n, f: e.n / reg.px.length })).sort((a, b) => b.n - a.n);
}

// 层次：占比不可忽略（≥ minFrac）的颜色中，亮度两两相差大于 10%（25.5）的颜色组数
export function lumLevels(reg, minFrac = 0.02) {
  const ls = hist(reg).filter(h => h.f >= minFrac).map(h => lum(h.c)).sort((a, b) => a - b);
  const lv = [];
  for (const l of ls) if (!lv.length || l - lv[lv.length - 1] > 25.5) lv.push(l);
  return lv.length;
}

// 地面色：空地格的主色
export function groundColor(ms, s) {
  for (let ty = 0; ty < 13; ty++) for (let tx = 0; tx < 13; tx++) {
    const rows = s.map.cells.slice(ty * 4, ty * 4 + 4).map(r => r.slice(tx * 4, tx * 4 + 4)).join('');
    if (/^\.+$/.test(rows) && !(s.base.x === tx && s.base.y === ty)) {
      const busy = [s.player, ...s.enemies].filter(Boolean).some(t => t.x < tx + 1.5 && t.x + 1.5 > tx && t.y < ty + 1.5 && t.y + 1.5 > ty);
      if (busy) continue;
      return hist(region(ms, tx + 0.2, ty + 0.2, 0.6, 0.6))[0].c;
    }
  }
  return [32, 32, 32];
}

// 前景掩码：与地面色明显不同、且不是阴影（比地面暗）的像素
export function mask(reg, ground) {
  const gl = lum(ground);
  return reg.px.map(p => cdist(p, ground) > 30 && lum(p) > gl - 6 ? 1 : 0);
}
// 把方形掩码旋转到“朝上”
export function rotateToUp(m, w, dir) {
  const r = new Array(m.length).fill(0);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    let sx = x, sy = y;
    if (dir === 'down') { sx = w - 1 - x; sy = w - 1 - y; }
    else if (dir === 'left') { sx = y; sy = w - 1 - x; } // 逆时针转回：朝上图中 (x,y) 对应朝左图中 (y, w-1-x)
    else if (dir === 'right') { sx = w - 1 - y; sy = x; }
    r[y * w + x] = m[sy * w + sx] || 0;
  }
  return r;
}
export function maskDiff(a, b) {
  let x = 0, u = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { if (a[i] || b[i]) u++; if (a[i] !== b[i]) x++; }
  return u ? x / u : 0;
}

// 主色：区域内占比最大的非阴影、非地面颜色
export function mainColor(reg, ground) {
  const gl = lum(ground);
  const h = hist({ px: reg.px.filter(p => cdist(p, ground) > 30 && lum(p) > gl - 6) });
  return h.length ? h[0].c : null;
}

// 阴影方向：比地面暗的像素的质心相对前景质心的偏移（格像素）
export function shadowOffset(reg, ground) {
  const gl = lum(ground); let dx = 0, dy = 0, dn = 0, fx = 0, fy = 0, fn = 0;
  reg.px.forEach((p, i) => {
    const x = i % reg.w, y = (i / reg.w) | 0;
    if (lum(p) < gl - 8 && cdist(p, ground) > 10) { dx += x; dy += y; dn++; }
    else if (cdist(p, ground) > 30) { fx += x; fy += y; fn++; }
  });
  if (!dn || !fn) return { dark: dn, ox: 0, oy: 0 };
  return { dark: dn, ox: dx / dn - fx / fn, oy: dy / dn - fy / fn };
}
// 阴影带：元素外框四周各取 0.2 格宽的邻近条带，统计“比地面暗、且为地面色变暗”的像素占比；占比 > 25% 的条带为阴影侧
// 元素外侧紧邻的四条 0.15 格条带的平均亮度；某侧比对侧暗 > 6 时记为阴影侧（元素可能贴着砖墙等非地面，故与对侧比较）
// 元素外侧四条 0.15 格条带中，比地面亮度暗 8 以上的像素占比；占比 ≥ 30% 的一侧算作有暗带
export function shadowSides(ms, x, y, w, h, ground) {
  const d = 0.15, gl = lum(ground);
  const dk = r => r.px.length ? r.px.filter(p => lum(p) < gl - 8).length / r.px.length : 0;
  const f = { 右: dk(region(ms, x + w, y + 0.1, d, h - 0.1)), 下: dk(region(ms, x + 0.1, y + h, w - 0.1, d)), 左: dk(region(ms, x - d, y + 0.1, d, h - 0.1)), 上: dk(region(ms, x + 0.1, y - d, w - 0.1, d)) };
  const sides = ['右', '下', '左', '上'].filter(k => f[k] >= 0.3).join('');
  return { f, sides: sides || '无' };
}
export const side = o => `${o.ox > 0.3 ? '右' : o.ox < -0.3 ? '左' : ''}${o.oy > 0.3 ? '下' : o.oy < -0.3 ? '上' : ''}` || '无';

// 暖色高亮（火光）与灰色（烟雾）像素数
export const isWarm = p => p[0] > 200 && p[1] > 90 && p[2] < 140 && p[0] - p[2] > 90;
export const isGrey = p => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 24 && lum(p) > 60 && lum(p) < 210;
// 新出现的颜色：满足 f、且与参考区域中任何非罕见颜色（占比 ≥ 0.5%）都不相近的像素（排除画面震动造成的原有颜色位移）
export function novel(reg, ref, f) {
  const known = hist(ref).filter(h => h.f >= 0.005).map(h => h.c);
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  reg.px.forEach((p, i) => {
    if (!f(p) || known.some(c => cdist(c, p) < 30)) return;
    n++; const x = i % reg.w, y = (i / reg.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  });
  return { n, box: n ? (x1 - x0 + 1) * (y1 - y0 + 1) : 0 };
}
export function countWhere(reg, f, ref) { let n = 0; reg.px.forEach((p, i) => { if (f(p) && (!ref || !f(ref.px[i] || [0, 0, 0]))) n++; }); return n; }
// 变化像素的外接框面积
export function changedBBox(a, b, f, thr = 24) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  a.px.forEach((p, i) => { const q = b.px[i]; if (!q) return; if (Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])) > thr && (!f || f(q))) { const x = i % a.w, y = (i / a.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
  return x1 < 0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1);
}
