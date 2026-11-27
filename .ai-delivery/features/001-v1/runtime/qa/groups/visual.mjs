// 画面与动效：TS-29（截图层次/阴影/敌我区分/配色）、TS-31（履带/火光/后坐/拖尾）、TS-32（碎屑/击中/爆炸/震动）
import { Scenario, openGame, FRAME, log, writeEvidence } from '../lib.mjs';
import { Bot, goTo } from '../bot.mjs';
import { shootBase } from './base.mjs';
import { mapShot, region, diffCount, hist, lumLevels, groundColor, mask, rotateToUp, maskDiff, mainColor, shadowSides, isWarm, isGrey, novel, cdist, lum, countWhere } from './px.mjs';

const SPAWN = [4.0625, 12.0625];
const TANK = 0.875;
const tankReg = (ms, t, pad = 0) => region(ms, t.x - pad, t.y - pad, TANK + 2 * pad, TANK + 2 * pad);
const fracPx = (v, T) => { const p = v * T; return p - Math.floor(p); };

async function waitNoShield(g) { return g.until(s => s.player && !(s.player.shieldMs > 0), 20000, 100); }
async function face(g, dir) { await g.hold(dir); await g.adv(FRAME); await g.release(); await g.adv(FRAME); }

// 只比较履带所在的两条边带（与行进方向平行、各占车身 25%），排除车身中部与地面纹理的影响
function treadDiff(a, b, dir) {
  const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  const horiz = dir === 'left' || dir === 'right';
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inStrip = horiz ? (y < h * 0.25 || y >= h * 0.75) : (x < w * 0.25 || x >= w * 0.75);
    if (!inStrip) continue;
    const p = a.px[y * a.w + x], q = b.px[y * b.w + x];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 24) n++;
  }
  return n;
}
// 同一辆坦克在多帧中的对齐截图：挑选亚像素偏移相近的帧两两比较，返回 {diffs:[{d,same}] }
function alignedPairs(frames, T, phaseOf) {
  const out = [];
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = frames[i], b = frames[j];
    if (Math.abs(fracPx(a.t.x, T) - fracPx(b.t.x, T)) > 0.12 || Math.abs(fracPx(a.t.y, T) - fracPx(b.t.y, T)) > 0.12) continue;
    out.push({ i, j, d: phaseOf ? treadDiff(a.reg, b.reg, a.t.dir) : diffCount(a.reg, b.reg), same: phaseOf ? phaseOf(a) === phaseOf(b) : null, dist: Math.abs(a.t.x - b.t.x) + Math.abs(a.t.y - b.t.y) });
  }
  return out;
}

// ---------------- TS-31 ----------------
// 本局玩家阵亡、游戏结束导致后续步骤无法进行时，换种子重新开局（最多 4 局）
async function ts31(browser) {
  let sc = null;
  for (const seed of [31, 131, 231, 331]) {
    sc = await ts31Seed(browser, seed);
    if (sc !== 'RETRY') return sc;
  }
  sc = new Scenario('TS-31'); sc.unreachable('4 局均在完成观察前游戏结束'); return sc;
}

async function ts31Seed(browser, seed) {
  const sc = new Scenario('TS-31');
  const g = await openGame(browser, { seed });
  try {
    await g.startToPlaying();
    // 第 1 关第 3 行整行为空地：开到右端，向左移动，留出移动与子弹飞行的空间
    if (!await goTo(g, 12.0625, 3.0625, 30000)) { sc.unreachable('未能开到第 3 行右端'); return sc; }
    if (!await waitNoShield(g)) { sc.unreachable('玩家护盾未结束'); return sc; }
    await face(g, 'left');
    // 1 移动中：按住向左 0.5 秒
    await g.hold('left');
    const mov = [];
    for (let t = 0; t < 500; t += FRAME) {
      await g.adv(FRAME);
      const s = await g.snap(); const ms = await mapShot(g);
      mov.push({ s, t: s.player, reg: tankReg(ms, s.player), ph: s.player.treadPhase });
    }
    await g.release();
    const T = (await mapShot(g)).T;
    const phases = mov.map(f => f.ph);
    const phChanges = phases.filter((p, i) => i && p !== phases[i - 1]).length;
    // 只比较完整在地图内、朝左移动中的帧（贴边时裁剪区域被截断，不可比）
    const usable = mov.filter(f => f.t.x > 0.3 && f.t.dir === 'left' && f.t.moving);
    const pairs = alignedPairs(usable, T, f => f.ph);
    const med = a => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[(b.length - 1) >> 1]; };
    const diffPh = pairs.filter(p => !p.same && p.dist > 0.05), samePh = pairs.filter(p => p.same && p.dist > 0.05);
    const mDiff = med(diffPh.map(p => p.d)), mSame = med(samePh.map(p => p.d));
    sc.check('1 移动中履带相位持续变化，对齐后的坦克截图履带部位不同', phChanges >= 3 && diffPh.length > 0 && mDiff > 1.5 * mSame + 10,
      `0.5 秒内相位变化 ${phChanges} 次（${phases.join('')}）；对齐的帧对中，相位不同者差异中位数 ${mDiff} 像素（${diffPh.length} 对），相位相同者（对照）中位数 ${mSame} 像素（${samePh.length} 对）`);
    // 2 停止后
    // 观察窗口内玩家附近有敌方坦克或子弹、被击中、画面震动时，该次观察受干扰，重开到第 3 行右端再观察（最多 4 次）
    const near = (o, p) => p && Math.abs(o.x - p.x) < 1.6 && Math.abs(o.y - p.y) < 1.6;
    const disturbed = s => !s.player || s.effects.shakeMs > 0 || s.bullets.some(b => b.owner === 'enemy' && near(b, s.player)) || s.enemies.some(e => near(e, s.player));
    let stopR = null, tries = [];
    for (let a = 0; a < 4 && !stopR; a++) {
      if (a) {
        await g.until(s => s.screen === 'playing' && s.player, 20000, 100);
        await goTo(g, 12.0625, 3.0625, 20000); await face(g, 'left');
        await g.hold('left'); await g.adv(300); await g.release();
      }
      const st = []; let bad = false; const lives0 = (await g.snap()).lives;
      for (let t = 0; t < 500; t += FRAME) { await g.adv(FRAME); const s = await g.snap(); if (disturbed(s)) { bad = true; break; } st.push(s.player.treadPhase); }
      if (bad) { tries.push('停止后 0.5 秒内受干扰'); continue; }
      const ms1 = await mapShot(g); const s1 = await g.snap();
      await g.adv(300); const ms2 = await mapShot(g); const s2 = await g.snap();
      if (disturbed(s1) || disturbed(s2) || s2.lives !== lives0) { tries.push('截图期间受干扰'); continue; }
      stopR = { st, s1, s2, dStop: diffCount(tankReg(ms1, s1.player), tankReg(ms2, s2.player)) };
    }
    if (!stopR) sc.skip('2 停止后履带相位不再变化，对齐后的截图相同', `4 次观察都受敌方干扰：${tries.join('；')}`);
    else {
      const { st, s1, s2, dStop } = stopR;
      sc.check('2 停止后履带相位不再变化，对齐后的截图相同', new Set(st).size === 1 && s1.player.x === s2.player.x && dStop === 0,
        `停止后 0.5 秒相位 ${[...new Set(st)].join(',')}；相隔 300ms 两张坦克截图差异 ${dStop} 像素${tries.length ? `（此前 ${tries.length} 次观察受干扰已重来）` : ''}`);
    }
    // 3 开火：回到第 3 行右端朝左，子弹沿整行空地飞行
    await g.until(s => s.screen === 'playing' && s.player, 20000, 100);
    await goTo(g, 12.0625, 3.0625, 20000); await face(g, 'left'); await g.adv(300);
    const p = (await g.snap()).player;
    const front = ms => region(ms, p.x - 0.6, p.y + 0.15, 0.6, 0.6);
    const preShot = await mapShot(g, 'TS-31-before-fire.png'); sc.addEvidence('TS-31-before-fire.png');
    const pre = await g.snap();
    const preIds = new Set(pre.bullets.map(b => b.id));
    await g.page.keyboard.down('Space');
    const fr = [];
    let bid = null, trailSeen = 0, behindMax = 0, behindNote = '';
    for (let f = 0; f < 40; f++) {
      await g.adv(FRAME);
      if (f === 1) await g.page.keyboard.up('Space');
      const s = await g.snap(); const ms = await mapShot(g);
      if (f === 0) { await mapShot(g, 'TS-31-fire.png'); sc.addEvidence('TS-31-fire.png'); }
      if (bid === null) { const nb = s.bullets.find(b => b.owner === 'player' && !preIds.has(b.id)); if (nb) bid = nb.id; }
      const b = s.bullets.find(x => x.id === bid);
      const rec = { f, muzzle: s.effects.muzzleFlashes, recoil: s.player?.recoilMs, trails: s.effects.trails, frontDiff: f < 4 ? diffCount(front(preShot), front(ms)) : null };
      if (b) {
        rec.bx = b.x; rec.by = b.y; rec.dir = b.dir;
        if (s.effects.trails > 0) trailSeen++;
        if (b.dir === 'left' && p.x - b.x > 1.2) {
          const behind = ms2 => region(ms2, b.x + 0.25, b.y - 0.2, 0.6, 0.4);
          const d = diffCount(behind(preShot), behind(ms));
          if (d > behindMax) { behindMax = d; behindNote = `子弹在 (${b.x.toFixed(2)},${b.y.toFixed(2)})，身后区域与开火前不同像素 ${d}`; }
        }
      }
      fr.push(rec);
    }
    sc.addEvidence(await writeEvidence('TS-31-fire-frames.json', fr));
    const muzzleF = fr.slice(0, 6).some(r => r.muzzle > 0);
    const frontD = Math.max(...fr.slice(0, 4).map(r => r.frontDiff || 0));
    sc.check('3a 开火后出现炮口火光（快照记录出现，炮口前方截图与开火前不同）', muzzleF && frontD > 0, `玩家 (${p.x.toFixed(2)},${p.y.toFixed(2)}) 朝${p.dir}；头 6 帧炮口火光记录 ${fr.slice(0, 6).map(r => r.muzzle).join(',')}；炮口前方区域最大差异 ${frontD} 像素`);
    const rec = fr.map(r => r.recoil);
    const rpos = rec.findIndex(v => v > 0);
    sc.check('3b 后坐计时在开火后大于 0，随后回到 0', rpos >= 0 && rpos < 6 && rec.slice(rpos).some(v => v === 0), `后坐计时序列 ${rec.slice(0, 20).join(',')}`);
    sc.check('4 飞行中的子弹有拖尾记录，子弹身后有非背景像素', bid !== null && trailSeen > 0 && behindMax > 0, `子弹 id=${bid}，有拖尾记录的帧 ${trailSeen}；${behindNote || '未取得子弹身后截图'}`);
    // 5 敌方坦克抽查：跟踪一辆正在移动的敌方坦克
    let eid = null; const ef = [];
    for (let t = 0; t < 20000 && ef.length < 30; t += FRAME) {
      await g.adv(FRAME);
      const s = await g.snap();
      if (eid === null) { const e = s.enemies.find(e => e.moving); if (e) eid = e.id; else continue; }
      const e = s.enemies.find(x => x.id === eid);
      if (!e) { eid = null; ef.length = 0; continue; }
      if (!e.moving || (ef.length && ef[0].t.dir !== e.dir) || e.x < 0.3 || e.y < 0.3 || e.x > 11.8 || e.y > 11.8) { eid = null; ef.length = 0; continue; }
      const ms = await mapShot(g);
      ef.push({ t: e, reg: tankReg(ms, e) });
    }
    if (ef.length < 30) sc.skip('5 敌方坦克移动时履带变化', '20 秒内未取得一辆敌方坦克连续移动 30 帧');
    else {
      // 按快照的履带相位分组：相位相同的帧对为对照
      const ep = alignedPairs(ef, T, f => f.t.treadPhase).filter(p => p.dist > 0.05);
      const dif = ep.filter(p => !p.same), same = ep.filter(p => p.same);
      const md = med(dif.map(p => p.d)), msm = med(same.map(p => p.d));
      if (!dif.length || !same.length) sc.skip('5 敌方坦克移动时履带变化', `敌方坦克 ${eid} 未取得亚像素对齐的帧对（相位不同 ${dif.length} 对，相同 ${same.length} 对）`);
      else sc.check('5 敌方坦克移动时履带变化（对齐后的截图履带部位不同）', dif.length > 0 && md > 1.5 * msm + 10, `敌方坦克 ${eid}（${ef[0].t.type}，朝${ef[0].t.dir}）；相位应不同的帧对差异中位数 ${md}（${dif.length} 对），相位应相同的帧对差异中位数 ${msm}（${same.length} 对）`);
    }
  } catch (e) {
    if ((await g.snap().catch(() => null))?.screen === 'gameOver') return 'RETRY';
    sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error');
  }
  finally { await g.close(); }
  return sc;
}

// ---------------- TS-32 ----------------
async function fireAndWatch(g, frames = 90) {
  const pre = await g.snap(); const preShot = await mapShot(g);
  const preIds = new Set(pre.bullets.map(b => b.id));
  await g.page.keyboard.down('Space');
  let bid = null, last = null; const seq = [];
  for (let f = 0; f < frames; f++) {
    await g.adv(FRAME);
    if (f === 1) await g.page.keyboard.up('Space');
    const s = await g.snap();
    if (bid === null) { const nb = s.bullets.find(b => b.owner === 'player' && !preIds.has(b.id)); if (nb) bid = nb.id; }
    const b = s.bullets.find(x => x.id === bid);
    if (bid !== null && !b) { const ms = await mapShot(g); seq.push({ s, ms }); for (let k = 0; k < 3; k++) { await g.adv(FRAME); seq.push({ s: await g.snap(), ms: await mapShot(g) }); } return { pre, preShot, last, seq }; }
    last = b;
  }
  return { pre, preShot, last, seq };
}

async function explosionTimeline(g, cx, cy) {
  const shots = [];
  for (const dt of [0, 150, 300, 300, 400, 500]) { if (dt) await g.adv(dt); const s = await g.snap(); shots.push({ s, ms: await mapShot(g) }); }
  await g.adv(1500);
  const ref = await mapShot(g);
  const R = ms => region(ms, cx - 1.2, cy - 1.2, 2.4, 2.4);
  const rr = R(ref);
  return shots.map((x, i) => {
    const r = R(x.ms);
    const w = novel(r, rr, isWarm), gr = novel(r, rr, isGrey);
    return { i, warm: w.n, warmRaw: countWhere(r, isWarm, rr), topColors: hist(r).slice(0, 8).map(h => `${h.c.join(',')}:${(h.f * 100).toFixed(1)}%`), grey: gr.n, greyBox: gr.box, expl: x.s.effects.explosions, shake: x.s.effects.shakeMs, particles: x.s.effects.particles };
  });
}
function judgeExplosion(tl) {
  const warmEarly = Math.max(...tl.slice(0, 3).map(x => x.warm));
  const greyAny = tl.some(x => x.grey > 0);
  const gb = tl.map(x => x.greyBox);
  const first = gb.findIndex(v => v > 0);
  const spread = first >= 0 && Math.max(...gb.slice(first)) > gb[first];
  return { ok: warmEarly > 0 && greyAny && spread, note: `火光像素（前 3 张）最大 ${warmEarly}，烟雾灰色像素序列 ${tl.map(x => x.grey).join(',')}，灰色范围面积序列 ${gb.join(',')}` };
}

async function ts32(browser) {
  const sc = new Scenario('TS-32');
  const g = await openGame(browser, { seed: 32 });
  try {
    await g.startToPlaying();
    // 1 砖墙：出生点朝上，第 9 行第 4 列为砖
    await face(g, 'up');
    {
      const s0 = await g.snap(); const ground = groundColor(await mapShot(g), s0);
      const brickCols = hist(region(await mapShot(g), 4, 9, 1, 0.7)).filter(h => h.f > 0.08).map(h => h.c).filter(c => cdist(c, ground) > 40);
      const r = await fireAndWatch(g);
      const hit = r.seq[0];
      if (!hit) sc.skip('1 击中砖墙有碎屑', '子弹未消失');
      else {
        const pmax = Math.max(...r.seq.map(x => x.s.effects.particles));
        const near = ms => region(ms, 3.3, 9.6, 2.4, 2.2);
        const a = near(r.preShot);
        let chips = 0;
        for (const x of r.seq) { const b = near(x.ms); let n = 0; b.px.forEach((q, i) => { if (brickCols.some(c => cdist(c, q) < 40) && !brickCols.some(c => cdist(c, a.px[i]) < 40)) n++; }); chips = Math.max(chips, n); }
        sc.check('1 击中砖墙：粒子数增加，击中处附近出现砖色小块', pmax > r.pre.effects.particles && chips > 0, `粒子数 ${r.pre.effects.particles}→最大 ${pmax}；击中处附近新出现的砖色像素最多 ${chips}（砖色 ${JSON.stringify(brickCols)}）`);
      }
    }
    // 2 钢墙：第 8 行第 0 列为钢，从 (0.0625,10.0625) 朝上开火
    if (!await goTo(g, 0.0625, 10.0625, 20000)) sc.skip('2 击中钢墙', '未能开到钢墙下方');
    else {
      await face(g, 'up');
      await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 50);
      const r = await fireAndWatch(g);
      if (!r.seq.length) sc.skip('2 击中钢墙', '子弹未消失');
      else {
        const sp = Math.max(...r.seq.map(x => x.s.effects.hitSparks));
        const reg = ms => region(ms, 0, 8.4, 1, 1.4);
        const d = Math.max(...r.seq.map(x => diffCount(reg(r.preShot), reg(x.ms))));
        const steelLeft = r.seq[0].s.map.cells.slice(32, 36).map(l => l.slice(0, 4)).join('');
        sc.check('2 击中钢墙：击中火花记录出现，截图与击中前不同', sp > r.pre.effects.hitSparks && d > 0, `击中火花 ${r.pre.effects.hitSparks}→最大 ${sp}；击中处截图差异最大 ${d} 像素；钢墙格 ${steelLeft}（子弹最后位置 ${r.last ? r.last.y.toFixed(2) : '-'}）`);
      }
    }
    // 3/4 自动游玩：重甲型第 1 次命中、首次消灭敌人
    let heavyDone = false, killDone = false;
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: false });
    await bot.run({
      maxMs: 360000, stop: s => (heavyDone && killDone) || s.screen === 'gameOver' || s.screen === 'victory',
      onSnap: async (prev, s) => {
        if (!prev || prev.screen !== 'playing') return;
        if (!heavyDone) {
          const hh = s.enemies.find(e => { const q = prev.enemies.find(x => x.id === e.id); return e.type === 'heavy' && q && e.hp < q.hp; });
          if (hh) {
            heavyDone = true;
            const sp = s.effects.hitSparks;
            await mapShot(g, 'TS-32-heavy-hit.png'); sc.addEvidence('TS-32-heavy-hit.png');
            sc.check('3 击中重甲型但未消灭：击中位置有可见的击中效果', sp > 0, `重甲型 ${hh.id} 生命 ${prev.enemies.find(x => x.id === hh.id).hp}→${hh.hp}，击中火花记录 ${prev.effects.hitSparks}→${sp}`);
          }
        }
        if (!killDone && s.score > prev.score) {
          const gone = prev.enemies.find(e => !s.enemies.some(x => x.id === e.id));
          if (!gone) return;
          killDone = true;
          await g.release();
          const tl = await explosionTimeline(g, gone.x + 0.44, gone.y + 0.44);
          sc.addEvidence(await writeEvidence('TS-32-kill-timeline.json', tl));
          const j = judgeExplosion(tl);
          const ex = Math.max(s.effects.explosions, ...tl.map(x => x.expl)), sh = Math.max(s.effects.shakeMs, ...tl.map(x => x.shake));
          sc.check('4 坦克被消灭：爆炸记录、火光与烟雾随时间扩散、画面震动', ex > 0 && sh > 0 && j.ok, `爆炸记录最大 ${ex}，震动时长最大 ${sh}ms；${j.note}`);
        }
      },
    });
    if (!heavyDone) sc.skip('3 击中未消灭的坦克', '等待上限内未击中重甲型');
    if (!killDone) sc.skip('4 坦克爆炸', '等待上限内未消灭敌人');
    // 5 指挥所
    const s5 = await g.snap();
    if (s5.screen !== 'playing' || !await goTo(g, ...SPAWN, 30000)) sc.skip('5 指挥所爆炸', `未能回到出生点（${s5.screen}）`);
    else {
      let hitS = null;
      await shootBase(g, async (prev, s) => { if (!hitS && s.base.destroyed) hitS = s; });
      if (!hitS) sc.skip('5 指挥所爆炸', '未能击中指挥所');
      else {
        const tl = await explosionTimeline(g, hitS.base.x + 0.5, hitS.base.y + 0.5);
        sc.addEvidence(await writeEvidence('TS-32-base-timeline.json', tl));
        const j = judgeExplosion(tl);
        const ex = Math.max(hitS.effects.explosions, ...tl.map(x => x.expl)), sh = Math.max(hitS.effects.shakeMs, ...tl.map(x => x.shake));
        sc.check('5 指挥所被击中：爆炸记录、火光与烟雾随时间扩散、画面震动', ex > 0 && sh > 0 && j.ok, `爆炸记录最大 ${ex}，震动时长最大 ${sh}ms；${j.note}`);
      }
    }
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error'); }
  finally { await g.close(); }
  return sc;
}

// ---------------- TS-29 ----------------
// 判定取值（测试设计）：颜色量化 8 级/通道；“占比不可忽略”= 占比 ≥ 0.2%；界面颜色与集合中某色的色差 ≤ 40
function fullTile(s, ch) {
  for (let ty = 0; ty < 13; ty++) for (let tx = 0; tx < 13; tx++) {
    if (s.map.cells.slice(ty * 4, ty * 4 + 4).every(r => r.slice(tx * 4, tx * 4 + 4) === ch.repeat(4))) return [tx, ty];
  }
  return null;
}
const isolated = (s, t) => [s.player, ...s.enemies, ...s.powerUps].filter(Boolean).every(o => (o.x === t.x && o.y === t.y) || Math.abs(o.x - t.x) > 1.6 || Math.abs(o.y - t.y) > 1.6);

async function ts29(browser) {
  const sc = new Scenario('TS-29');
  const g = await openGame(browser, { seed: 29 });
  try {
    await g.startToPlaying();
    await waitNoShield(g);
    await g.adv(1500);
    const s0 = await g.snap();
    const ms0 = await mapShot(g, 'TS-29-map.png'); sc.addEvidence('TS-29-map.png');
    const ground = groundColor(ms0, s0);
    const el = {}; // 名称 -> {body, around, tank?, dir?}
    const addTank = (name, ms, t) => { el[name] = { body: tankReg(ms, t), ms, rect: [t.x, t.y, TANK, TANK], dir: t.dir, tank: true }; };
    if (s0.player && isolated(s0, s0.player)) addTank('玩家坦克', ms0, s0.player);
    for (const [ch, name] of [['B', '砖墙'], ['S', '钢墙'], ['W', '水面']]) { const p = fullTile(s0, ch); if (p) el[name] = { body: region(ms0, p[0], p[1], 1, 1) }; }
    el['指挥所'] = { body: region(ms0, s0.base.x, s0.base.y, 1, 1), ms: ms0, rect: [s0.base.x, s0.base.y, 1, 1] };
    // 等待三类敌人与道具出现（与 TS-22 同上限 10 分钟游戏时间）
    const seenAt = {};
    let mapUnion = [ms0];
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: false });
    const types = { normal: '普通型敌方坦克', fast: '快速型敌方坦克', heavy: '重甲型敌方坦克' };
    const have = () => Object.values(types).every(n => el[n]) && el['道具'] && el['玩家坦克'];
    let tt = 0;
    await bot.run({
      maxMs: 600000, stop: s => have() || s.screen === 'gameOver' || s.screen === 'victory',
      onSnap: async (prev, s) => {
        tt += 50;
        if (s.screen !== 'playing' || s.transitioning) return;
        for (const e of s.enemies) seenAt[e.id] ??= tt;
        const cand = s.enemies.filter(e => !el[types[e.type]] && tt - seenAt[e.id] > 1200 && !e.carrier && isolated(s, e));
        const pu = !el['道具'] && s.powerUps.find(p => isolated(s, p));
        const pl = !el['玩家坦克'] && s.player && !(s.player.shieldMs > 0) && isolated(s, s.player) && s.player;
        if (!cand.length && !pu && !pl) return;
        await g.release();
        const ms = await mapShot(g); mapUnion.push(ms);
        for (const e of cand) if (!el[types[e.type]]) { addTank(types[e.type], ms, e); await mapShot(g, `TS-29-${e.type}.png`); sc.addEvidence(`TS-29-${e.type}.png`); }
        if (pu) { el['道具'] = { body: region(ms, pu.x, pu.y, 1, 1), ms, rect: [pu.x, pu.y, 1, 1], kind: pu.type }; await mapShot(g, 'TS-29-powerup.png'); sc.addEvidence('TS-29-powerup.png'); }
        if (pl) addTank('玩家坦克', ms, pl);
      },
    });
    const all = ['玩家坦克', ...Object.values(types), '砖墙', '钢墙', '水面', '指挥所', '道具'];
    // 1 层次
    const lv = all.filter(n => el[n]).map(n => `${n}:${lumLevels(el[n].body)}`);
    const lvOk = all.filter(n => el[n]).every(n => lumLevels(el[n].body) >= 3);
    const missing = all.filter(n => !el[n]);
    if (missing.length && lvOk) sc.skip('1 各元素至少 3 种明显不同的颜色', `已取得 ${lv.join('，')}；未出现 ${missing.join('、')}`);
    else sc.check('1 各元素至少 3 种明显不同的颜色（亮度差 > 10%）', lvOk, `亮度层次数 ${lv.join('，')}${missing.length ? '；未出现 ' + missing.join('、') : ''}`);
    // 2 阴影
    const shadowEls = ['玩家坦克', ...Object.values(types), '指挥所', '道具'].filter(n => el[n]);
    const sides = shadowEls.map(n => { const o = shadowSides(el[n].ms, ...el[n].rect, ground); return { n, side: o.sides, o }; });
    const common = ['右', '下', '左', '上'].filter(k => sides.every(x => x.side.includes(k)));
    const sdOk = sides.length > 0 && common.length > 0;
    const pc = v => (v * 100).toFixed(0) + '%';
    const sdNote = `地面色 ${ground.join(',')}；共同阴影侧 ${common.join('') || '无'}；` + sides.map(x => `${x.n}:阴影侧 ${x.side}（外侧条带暗于地面的像素占比 右${pc(x.o.f.右)} 下${pc(x.o.f.下)} 左${pc(x.o.f.左)} 上${pc(x.o.f.上)}）`).join('，') + '（判定取值：外侧 0.15 格条带中比地面亮度低 8 以上的像素占比 ≥ 30%）';
    if (shadowEls.length < 6 && sdOk) sc.skip('2 阴影同一侧', sdNote + '；部分元素未出现');
    else sc.check('2 坦克、指挥所、道具邻近同一侧有比地面更暗的像素带', sdOk, sdNote);
    // 3 敌我区分
    const tanks = ['玩家坦克', ...Object.values(types)].filter(n => el[n]);
    const mc = Object.fromEntries(tanks.map(n => [n, mainColor(el[n].body, ground)]));
    const W = Math.min(...tanks.map(n => Math.min(el[n].body.w, el[n].body.h)));
    const sq = r => { const out = []; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) out.push(r.px[y * r.w + x]); return { w: W, h: W, px: out }; };
    const sil = Object.fromEntries(tanks.map(n => [n, rotateToUp(mask(sq(el[n].body), ground), W, el[n].dir)]));
    const pairs = []; let pOk = true;
    for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i], b = tanks[j];
      const cd = mc[a] && mc[b] ? cdist(mc[a], mc[b]) : 0, md = maskDiff(sil[a], sil[b]);
      if (!(cd > 30 && md > 0.05)) pOk = false;
      pairs.push(`${a}/${b}: 主色差 ${cd.toFixed(0)}，轮廓差 ${(md * 100).toFixed(1)}%`);
    }
    const tNote = `主色 ${tanks.map(n => n + '=' + (mc[n] || []).join(',')).join('；')}；${pairs.join('；')}（判定取值：主色差 > 30，轮廓不同像素 > 5%）`;
    if (tanks.length < 4 && pOk) sc.skip('3 敌我区分', tNote + '；部分坦克类型未出现');
    else sc.check('3 玩家与三类敌人主色两两不同、轮廓两两不同', pOk, tNote);
    // 4 同一套配色
    const pal = [];
    for (const ms of mapUnion) for (const h of hist(region(ms, 0, 0, 13, 13))) if (h.f >= 0.002 && !pal.some(c => cdist(c, h.c) < 8)) pal.push(h.c);
    // 单个元素在整幅地图中占比很小，另把各元素自身占比 ≥ 2% 的颜色计入画面颜色集合
    for (const n of all) if (el[n]) for (const h of hist(el[n].body)) if (h.f >= 0.02 && !pal.some(c => cdist(c, h.c) < 8)) pal.push(h.c);
    const ui = await g.page.evaluate(() => {
      const pick = (label, e) => { if (!e) return []; const cs = getComputedStyle(e); return [['背景', cs.backgroundColor], ['文字', cs.color], ['边框', cs.borderTopColor]].map(([k, v]) => ({ k: label + k, v, w: k === '边框' ? parseFloat(cs.borderTopWidth) : 1 })); };
      const out = [];
      out.push(...pick('页面', document.body));
      out.push(...pick('HUD', document.querySelector('[role=group][aria-label="战况"]')));
      const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.offsetParent !== null; };
      for (const b of [...document.querySelectorAll('button')].filter(vis)) out.push(...pick('按钮“' + (b.getAttribute('aria-label') || b.textContent.trim()) + '”', b));
      for (const d of [...document.querySelectorAll('[role=dialog]')].filter(vis)) out.push(...pick('浮层“' + d.getAttribute('aria-label') + '”', d));
      return out;
    });
    const parse = v => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(v); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null; };
    const seen = new Map();
    for (const u of ui) { const p = parse(u.v); if (!p || p.a === 0 || u.w === 0) continue; const key = p.c.join(','); if (!seen.has(key)) seen.set(key, { c: p.c, names: [] }); seen.get(key).names.push(u.k); }
    const far = [...seen.values()].map(x => ({ ...x, d: Math.min(...pal.map(c => cdist(c, x.c))) }));
    const bad = far.filter(x => x.d > 40);
    sc.check('4 界面主色（背景、文字、边框）都落在游戏画面的颜色集合中', far.length > 0 && bad.length === 0,
      `画面颜色集合 ${pal.length} 种；界面颜色与集合最近色差：${far.map(x => `${x.c.join(',')}=${x.d.toFixed(0)}（${x.names.slice(0, 2).join('、')}${x.names.length > 2 ? '等' : ''}）`).join('；')}（判定取值：色差 ≤ 40）`);
    sc.addEvidence(await writeEvidence('TS-29-palette.json', { palette: pal, ui: far }));
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error'); }
  finally { await g.close(); }
  return sc;
}

export const scenarios = { 'TS-29': ts29, 'TS-31': ts31, 'TS-32': ts32 };
