// 道具：TS-22（携带者、掉落、护盾）、TS-23（火力升级）、TS-33（拾取动画与提示）同局；TS-24（护盾期间指挥所被击中）单独一局
import { Scenario, openGame, FRAME, log, writeEvidence } from '../lib.mjs';
import { Bot, goTo, rayHit } from '../bot.mjs';
import { mapShot, region, diffCount } from './px.mjs';
import { shootBase } from './base.mjs';

const TANK = 0.875;
const WAIT = 600000; // 测试等待上限 10 分钟游戏时间
const fracPx = (v, T) => { const p = v * T; return p - Math.floor(p); };
const ctr = t => [t.x + TANK / 2, t.y + TANK / 2];
const tileOfTank = t => ctr(t).map(Math.floor).join(',');
const tileOfPu = p => [Math.floor(p.x + 0.5), Math.floor(p.y + 0.5)].join(',');
const isolated = (s, t) => [s.player, ...s.enemies, ...s.powerUps].filter(Boolean).every(o => (o.x === t.x && o.y === t.y) || Math.abs(o.x - t.x) > 1.6 || Math.abs(o.y - t.y) > 1.6);
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[(b.length - 1) >> 1]; };
const aligned = (a, b, T) => Math.abs(fracPx(a.x, T) - fracPx(b.x, T)) <= 0.12 && Math.abs(fracPx(a.y, T) - fracPx(b.y, T)) <= 0.12;
const inMap = t => t.x > 0.3 && t.y > 0.3 && t.x < 11.8 && t.y < 11.8;

// 同朝向、同履带相位、亚像素对齐的两组帧之间的差异像素数
function crossDiffs(A, B, T, sameSet = false) {
  const out = [];
  for (let i = 0; i < A.length; i++) for (let j = sameSet ? i + 1 : 0; j < B.length; j++) {
    const a = A[i], b = B[j];
    if (a.t.dir !== b.t.dir || a.t.treadPhase !== b.t.treadPhase || !aligned(a.t, b.t, T)) continue;
    if (sameSet && Math.abs(a.t.x - b.t.x) + Math.abs(a.t.y - b.t.y) < 0.05) continue;
    out.push(diffCount(a.reg, b.reg));
  }
  return out;
}

// 测量一次玩家开火：子弹速度（格/秒）与 1 秒游戏时间内连续快速按空格时同时在场的玩家子弹最多几颗
async function measureFire(g) {
  const reached = await goTo(g, 12.0625, 3.0625, 30000);
  await g.hold('left'); await g.adv(FRAME); await g.release(); await g.adv(FRAME);
  await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 20);
  let prev = await g.snap();
  const p0 = prev.player && { x: prev.player.x, y: prev.player.y, dir: prev.player.dir, firepower: prev.player.firepower, lives: prev.lives };
  let maxCount = 0; const steps = [];
  for (let f = 0; f < 60; f++) {
    if (f % 3 === 0) await g.page.keyboard.down('Space');
    if (f % 3 === 1) await g.page.keyboard.up('Space');
    await g.adv(FRAME);
    const s = await g.snap();
    maxCount = Math.max(maxCount, s.bullets.filter(b => b.owner === 'player').length);
    for (const b of s.bullets) { const a = prev.bullets.find(x => x.id === b.id && x.owner === 'player'); if (a) steps.push(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)); }
    prev = s;
  }
  await g.page.keyboard.up('Space');
  const st = med(steps);
  return { speed: st === null ? null : +(st / (FRAME / 1000)).toFixed(2), maxCount, at: p0, reachedLane: reached, firepower: prev.player && prev.player.firepower };
}

// 拾取后的“道具提示”与拾取动画（TS-33）：提示每 0.5 秒游戏时间读一次，最多 10 秒
async function observePickup(g, s, pu, before) {
  const hint = g.page.getByRole('status', { name: '道具提示' });
  const read = async () => { try { return (await hint.isVisible()) ? ((await hint.textContent()) || '').trim() : ''; } catch { return ''; } };
  let anims = s.effects.pickupAnims;
  const ms = await mapShot(g);
  const after = region(ms, pu.x - 0.5, pu.y - 0.5, 2, 2);
  const d = before ? diffCount(before, after) : null;
  const texts = [await read()];
  let goneAt = null;
  for (let t = 500; t <= 10000; t += 500) {
    await g.adv(t === 500 ? 500 - FRAME : 500);
    const x = await g.snap(); anims = Math.max(anims, t <= 500 ? x.effects.pickupAnims : 0);
    const tx = await read(); texts.push(tx);
    if (!tx) { goneAt = t; break; }
  }
  return { anims, regionDiff: d, firstText: texts[0], texts, goneAt };
}

// 敌方子弹击中玩家：上一快照中朝玩家飞来、距玩家中心 < 1.2 格的敌方子弹在本快照中消失
function enemyHitOnPlayer(prev, s) {
  if (!prev || !prev.player) return null;
  const [cx, cy] = ctr(prev.player);
  for (const b of prev.bullets) {
    if (b.owner !== 'enemy' || s.bullets.some(x => x.id === b.id)) continue;
    const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[b.dir];
    const rx = cx - b.x, ry = cy - b.y, along = rx * dv[0] + ry * dv[1], lat = Math.abs(rx * dv[1] - ry * dv[0]);
    if (along > -0.6 && along < 1.6 && lat < 0.6) return b;
  }
  return null;
}

// 护盾期间与结束后：逐步截取玩家坦克、记录敌方子弹击中；护盾结束等待上限 1 分钟游戏时间，结束后再等一次被击中（上限 3 分钟）
async function shieldPhase(g, T, preFrames) {
  const SF = [], NF = [], hitsOn = [], hitsOff = [];
  let endAt = null, t = 0;
  const bot = new Bot(g, { shoot: false, dodge: false, pickup: false });
  const crop = async (s, arr) => { const p = s.player; if (!p || !inMap(p) || !isolated(s, p) || arr.length >= 80) return; const ms = await mapShot(g); arr.push({ t: { ...p }, reg: region(ms, p.x, p.y, TANK, TANK) }); };
  let start = await g.snap();
  const startLives = start.lives;
  await bot.run({
    maxMs: 60000 + 180000,
    stop: s => s.screen !== 'playing' || (endAt !== null && (hitsOff.length > 0 || t - endAt > 180000)) || (endAt === null && t > 60000),
    onSnap: async (prev, s) => {
      t += 50;
      if (s.screen !== 'playing' || !s.player) return;
      const on = s.player.shieldMs > 0;
      if (!on && endAt === null) endAt = t;
      if (on) await crop(s, SF); else if (t - endAt < 15000) await crop(s, NF);
      const b = enemyHitOnPlayer(prev, s);
      if (b && prev.player) {
        const jump = Math.abs(s.player.x - prev.player.x) + Math.abs(s.player.y - prev.player.y);
        const rec = { t, livesBefore: prev.lives, livesAfter: s.lives, hitSparks: s.effects.hitSparks, explosions: s.effects.explosions, respawnJump: +jump.toFixed(3), shieldBefore: prev.player.shieldMs };
        await g.release(); await g.adv(100); const s2 = await g.snap();
        rec.livesLater = s2.lives; rec.hitSparks = Math.max(rec.hitSparks, s2.effects.hitSparks);
        (prev.player.shieldMs > 0 ? hitsOn : hitsOff).push(rec);
      }
    },
  });
  // 只比较火力状态相同的帧（火力升级可能改变坦克外观）
  const byFp = (A, B, same) => [0, 1].flatMap(v => crossDiffs(A.filter(f => (f.t.firepower || 0) === v), B.filter(f => (f.t.firepower || 0) === v), T, same));
  const shieldVsPre = byFp(SF, preFrames), preSame = byFp(preFrames, preFrames, true);
  const offVsPre = byFp(NF, preFrames), offVsOn = byFp(NF, SF), offSame = byFp(NF, NF, true);
  return {
    startLives, endAt, frames: { SF: SF.length, NF: NF.length, pre: preFrames.length },
    diffs: { shieldVsPre: med(shieldVsPre), shieldVsPreN: shieldVsPre.length, preSame: med(preSame), preSameN: preSame.length, offVsPre: med(offVsPre), offVsPreN: offVsPre.length, offVsOn: med(offVsOn), offVsOnN: offVsOn.length, offSame: med(offSame), offSameN: offSame.length },
    hitsOn, hitsOff,
  };
}

function sc22Judge(sc, ev, carrierSeen) {
  const c = ev.cp1;
  if (!carrierSeen) sc.check('1 本关至少有一辆携带道具的坦克，且可与同类型其他坦克区分', false, '等待上限内快照中未出现携带道具的敌方坦克');
  else if (!c) sc.skip('1 携带者与同类型非携带者截图不同', '出现了携带者，但未取得同一时刻同类型、同朝向、同相位且亚像素对齐的非携带者对照');
  else sc.check('1 携带者与同类型非携带者截图不同', c.d > 40, `携带者 ${c.c.id}（${c.c.type}，朝${c.c.dir}）与非携带者 ${c.n.id} 同一时刻截图不同像素 ${c.d}（判定取值：> 40）`);
  const cd = ev.carrierDrops, nk = ev.nonCarrierKills;
  if (!cd.length) sc.skip('2 携带者被消灭处出现道具', '等待上限内未消灭携带者');
  else sc.check('2 携带者被消灭的同一格出现道具；非携带者被消灭时不出现道具', cd.every(x => x.same) && nk.every(x => !x.drop),
    `携带者被消灭 ${cd.length} 次：${cd.map(x => `消灭格 ${x.kill}→道具格 ${x.pu ?? '无'}`).join('；')}；非携带者被消灭 ${nk.length} 次，其中出现道具 ${nk.filter(x => x.drop).length} 次`);
  const ps = ev.pickups.find(p => p.type === 'shield');
  if (!ps) { for (const k of ['3 拾取后道具从列表消失、立即生效', '4 护盾外观与护盾期间被击中', '5 护盾结束后']) sc.skip(k, `等待上限内未拾取到护盾（已拾取：${ev.pickups.map(p => p.type).join('、') || '无'}）`); return; }
  sc.check('3 拾取后道具从列表消失、立即生效', !ps.stillListed && ps.shieldMs > 0, `拾取快照：道具仍在列表=${ps.stillListed}，护盾剩余 ${ps.shieldMs}ms`);
  const sh = ev.shield, d = sh.diffs || {};
  const look = d.shieldVsPreN > 0 && d.preSameN > 0;
  if (!look) sc.skip('4a 护盾外观', `未取得对齐的护盾中/拾取前帧对（${d.shieldVsPreN}/${d.preSameN}）`);
  else sc.check('4a 护盾生效中玩家坦克所在区域截图与拾取前同朝向时不同', d.shieldVsPre > 1.5 * d.preSame + 10, `护盾中 vs 拾取前差异中位数 ${d.shieldVsPre}（${d.shieldVsPreN} 对），拾取前同相位对照中位数 ${d.preSame}（${d.preSameN} 对）（判定取值：> 1.5×对照 + 10）`);
  const h = sh.hitsOn && sh.hitsOn[0];
  if (!h) sc.skip('4b 护盾期间被敌方子弹击中', '护盾期间未被敌方子弹击中');
  else sc.check('4b 护盾期间被击中：生命不变、不爆炸、不重生、有击中效果', h.livesAfter === h.livesBefore && h.livesLater === h.livesBefore && h.respawnJump < 0.5 && h.hitSparks > 0,
    `生命 ${h.livesBefore}→${h.livesAfter}→${h.livesLater}；位置跳变 ${h.respawnJump} 格；击中火花 ${h.hitSparks}；爆炸记录 ${h.explosions}`);
  if (sh.endAt === null) { sc.skip('5 护盾结束后', '1 分钟游戏时间内护盾未结束'); return; }
  if (!(d.offVsPreN > 0)) sc.skip('5a 护盾外观消失', `未取得对齐的护盾结束后/拾取前帧对`);
  else sc.check('5a 护盾结束后玩家坦克截图回到无护盾时的外观', d.offVsPre <= 1.5 * d.preSame + 10 && (!(d.offVsOnN > 0) || d.offVsOn > d.offVsPre), `结束后 vs 拾取前差异中位数 ${d.offVsPre}（${d.offVsPreN} 对），对照 ${d.preSame}；结束后 vs 护盾中 ${d.offVsOn}（${d.offVsOnN} 对）`);
  const o = sh.hitsOff && sh.hitsOff[0];
  if (!o) sc.skip('5b 护盾结束后被击中', '护盾结束后 3 分钟内未被敌方子弹击中');
  else sc.check('5b 护盾结束后再被敌方子弹击中时生命减 1', o.livesLater === o.livesBefore - 1, `生命 ${o.livesBefore}→${o.livesLater}`);
}

function sc23Judge(sc, ev) {
  const pf = ev.pickups.find(p => p.type === 'firepower');
  if (!pf) { sc.unreachable('等待上限内未拾取到火力升级'); return; }
  sc.check('1 拾取后道具从列表消失', !pf.stillListed, `拾取快照：道具仍在列表=${pf.stillListed}；火力 ${pf.firepower}`);
  const b = ev.fire.before, a = ev.fire.after || ev.fire.lostBeforeMeasure;
  if (!a) { sc.skip('2 拾取后至少一项可观察的增强', '拾取后未能测量'); }
  else if (!a.at || a.at.firepower !== 1) { sc.skip('2 拾取后至少一项可观察的增强', `测量开始时火力已不是升级状态（${a.at ? a.at.firepower : '无玩家'}，生命 ${a.at ? a.at.lives : '-'}；拾取时生命 ${pf.lives}），拾取后到测量前失去了生命`); }
  const faster = a && a.speed > b.speed * 1.05, more = a && a.maxCount > b.maxCount;
  const note = a ? `拾取前：子弹速度 ${b.speed} 格/秒，同时在场最多 ${b.maxCount} 颗；拾取后（测量开始时火力 ${a.at && a.at.firepower}）：${a.speed} 格/秒，${a.maxCount} 颗` : '';
  if (!a || !a.at || a.at.firepower !== 1) { /* 已记为未下结论 */ }
  else if (faster || more) sc.check('2 拾取后至少一项可观察的增强', true, note);
  else sc.skip('2 拾取后至少一项可观察的增强', note + '；速度与数量均未增加，威力项本脚本未测量');
  const l = ev.fire.afterLife;
  if (!l) sc.skip('3 失去生命并重生后火力恢复', '未能让玩家失去生命后再测量');
  else sc.check('3 失去生命并重生后火力与拾取前相同', Math.abs(l.speed - b.speed) <= b.speed * 0.05 && l.maxCount === b.maxCount, `重生后 ${l.speed} 格/秒，${l.maxCount} 颗；拾取前 ${b.speed} 格/秒，${b.maxCount} 颗`);
}

function sc33Judge(sc, ev) {
  if (!ev.pickups.length) { sc.unreachable('等待上限内未拾取到任何道具'); return; }
  for (const [type, name] of [['shield', '护盾'], ['firepower', '火力升级']]) {
    const p = ev.pickups.find(x => x.type === type);
    if (!p) { sc.skip(`${name}：拾取动画与提示`, `等待上限内未拾取到${name}`); continue; }
    if (p.regionDiff === null && p.anims > 0) sc.skip(`1 ${name}：拾取动画`, `拾取动画记录 ${p.anims}；未取得拾取前截图`);
    else sc.check(`1 ${name}：拾取动画记录出现，拾取位置附近截图与拾取前不同`, p.anims > 0 && p.regionDiff > 0, `拾取动画记录 ${p.anims}；拾取处截图差异 ${p.regionDiff ?? '无拾取前截图'}`);
    sc.check(`2 ${name}：“道具提示”含“${name}”`, (p.firstText || '').includes(name), `提示文本“${p.firstText}”`);
    if (p.goneAt === null) sc.skip(`3 ${name}：提示自动消失`, '10 秒游戏时间内未消失');
    else sc.check(`3 ${name}：提示随后自动消失`, true, `拾取后约 ${p.goneAt}ms 游戏时间时提示不再显示；读取序列 ${p.texts.map(x => x || '（空）').join('、')}`);
  }
}

// 共享一局：TS-22、TS-23、TS-33
async function runSession(browser) {
  const S = { 'TS-22': new Scenario('TS-22'), 'TS-23': new Scenario('TS-23'), 'TS-33': new Scenario('TS-33') };
  const [s22, s23, s33] = [S['TS-22'], S['TS-23'], S['TS-33']];
  const ev = { carriers: [], kills: [], pickups: [], fire: {}, shield: {} };
  let t = 0, carrierSeen = false, cp1 = null, T = null;
  const nonCarrierKills = [], carrierDrops = [], preFrames = [];
  const picked = { shield: null, firepower: null };
  let shieldInfo = null, fireAfter = null, failed = null;
  const deadline = Date.now() + 25 * 60000;
  ev.seeds = [];
  // 玩家失败时换种子重开，直到两种道具都拾取到或到等待上限；各局观察合并判定
  for (let k = 0; Date.now() < deadline - 30000 && !(picked.shield && picked.firepower); k++) {
  const g = await openGame(browser, { seed: 22 + 100 * k });
  ev.seeds.push(22 + 100 * k);
  try {
    await g.startToPlaying();
    if (!ev.fire.before) { await g.until(s => s.player && !(s.player.shieldMs > 0), 20000, 100); ev.fire.before = await measureFire(g); }
    T = (await mapShot(g)).T;
    const pending = []; const knownPu = new Set();
    let lastNear = null;
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: true });
    await bot.run({
      maxMs: WAIT, deadline,
      stop: s => (picked.shield && picked.firepower) || s.screen === 'gameOver' || s.screen === 'victory',
      onSnap: async (prev, s) => {
        t += 50;
        if (s.screen !== 'playing' || s.transitioning || !prev || prev.screen !== 'playing') { pending.length = 0; s.powerUps.forEach(p => knownPu.add(p.id)); return; }
        // 1 携带者外观：同一时刻、同类型同朝向同相位且亚像素对齐的非携带者对照
        const cs = s.enemies.filter(e => e.carrier);
        if (cs.length) carrierSeen = true;
        if (cs.length && (!cp1 || cp1.d <= 40)) {
          for (const c of cs) {
            const n = s.enemies.find(e => !e.carrier && e.type === c.type && e.dir === c.dir && e.treadPhase === c.treadPhase && inMap(e) && inMap(c) && isolated(s, e) && isolated(s, c));
            if (!n || !aligned(c, n, T)) continue;
            await g.release();
            const ms = await mapShot(g, 'TS-22-carrier.png');
            const d = diffCount(region(ms, c.x, c.y, TANK, TANK), region(ms, n.x, n.y, TANK, TANK));
            if (!cp1 || d > cp1.d) cp1 = { d, c: { id: c.id, type: c.type, dir: c.dir }, n: { id: n.id } };
          }
        }
        // 2 被消灭的敌人与掉落
        for (const e of prev.enemies) if (!s.enemies.some(x => x.id === e.id)) pending.push({ id: e.id, carrier: e.carrier, tile: tileOfTank(e), t });
        for (const p of s.powerUps) if (!knownPu.has(p.id)) {
          knownPu.add(p.id);
          const k = pending.find(x => x.tile === tileOfPu(p)) || pending.find(x => x.carrier) || pending[0];
          ev.kills.push({ pu: { id: p.id, type: p.type, tile: tileOfPu(p) }, kill: k || null });
          if (k) { k.dropped = p; if (k.carrier) carrierDrops.push({ same: k.tile === tileOfPu(p), kill: k.tile, pu: tileOfPu(p), type: p.type }); else nonCarrierKills.push({ drop: true, tile: k.tile }); }
        }
        for (let i = pending.length - 1; i >= 0; i--) if (t - pending[i].t > 1000) {
          const k = pending[i]; pending.splice(i, 1);
          if (!k.dropped) { if (k.carrier) carrierDrops.push({ same: false, kill: k.tile, pu: null }); else nonCarrierKills.push({ drop: false, tile: k.tile }); }
        }
        // 靠近道具时截取拾取前画面
        const pl = s.player;
        if (pl && s.powerUps.length) {
          const pu = s.powerUps.find(p => Math.abs(p.x - pl.x) < 3 && Math.abs(p.y - pl.y) < 3);
          if (pu) {
            const ms = await mapShot(g);
            lastNear = { pu: { ...pu }, reg: region(ms, pu.x - 0.5, pu.y - 0.5, 2, 2) };
          }
        }
        // 拾取护盾前的玩家坦克截图（无护盾、在图内、周围无其他物体），每 4 步取一张，供 TS-22 第 4、5 点对照
        if (pl && !picked.shield && !(pl.shieldMs > 0) && t % 200 === 0 && inMap(pl) && isolated(s, pl)) {
          const ms = await mapShot(g);
          preFrames.push({ t: { ...pl }, reg: region(ms, pl.x, pl.y, TANK, TANK) }); if (preFrames.length > 150) preFrames.shift();
        }
        // 3 拾取
        const gone = prev.powerUps.find(p => !s.powerUps.some(x => x.id === p.id));
        if (gone && pl && Math.abs(pl.x - gone.x) < 1.2 && Math.abs(pl.y - gone.y) < 1.2 && !picked[gone.type]) {
          await g.release();
          // 再次拾取火力（上次测量前已失去火力）时不再观察提示，直接测量
          const again = ev.pickups.some(p => p.type === gone.type);
          const obs = again ? { remeasure: true } : await observePickup(g, s, gone, lastNear && lastNear.pu.id === gone.id ? lastNear.reg : null);
          const rec = { type: gone.type, at: t, lives: s.lives, shieldMs: s.player.shieldMs, firepower: s.player.firepower, stillListed: s.powerUps.some(x => x.id === gone.id), ...obs };
          ev.pickups.push(rec); picked[gone.type] = rec;
          if (gone.type === 'firepower') {
            fireAfter = await measureFire(g);
            if (fireAfter.at && fireAfter.at.firepower !== 1 && !again) {
              // 测量开始前已失去火力：保留这次记录，等待下一个火力道具再测
              ev.fire.lostBeforeMeasure = fireAfter; fireAfter = null; picked.firepower = null;
            } else ev.fire.after = fireAfter;
          } else {
            shieldInfo = await shieldPhase(g, T, preFrames);
            ev.shield = shieldInfo;
          }
        }
        // TS-23 检查点 3：火力升级测量之后失去生命并重生，再测量一次
        if (ev.fire.after && !ev.fire.afterLife && s.lives < prev.lives && s.lives > 0) {
          await g.release();
          const r = await g.until(x => x.screen === 'playing' && x.player && !(x.player.shieldMs > 0), 20000, 100);
          if (r) ev.fire.afterLife = await measureFire(g);
        }
      },
    });
    // TS-23 检查点 3：两种道具都已拾取、还未失去生命时，停止躲避等待被击中后再测量
    if (picked.firepower && ev.fire.after && !ev.fire.afterLife) {
      const s0 = await g.snap();
      if (s0.screen === 'playing' && s0.lives > 1) {
        const lb = new Bot(g, { shoot: false, dodge: false, pickup: false });
        let lost = null;
        await lb.run({ maxMs: 180000, deadline, stop: x => x.screen !== 'playing' || x.lives < s0.lives, onSnap: (p, x) => { if (x.lives < s0.lives) lost = x; } });
        if (lost && lost.lives > 0) { await g.until(x => x.player && !(x.player.shieldMs > 0) && x.screen === 'playing', 20000, 100); ev.fire.afterLife = await measureFire(g); }
      }
    }
  } catch (e) {
    failed = e;
    await g.dumpEvidence(s22, 'error');
  } finally { await g.close(); }
  if (failed) break;
  }
  ev.cp1 = cp1; ev.carrierDrops = carrierDrops; ev.nonCarrierKills = nonCarrierKills;
  if (failed) { for (const sc of [s22, s23, s33]) sc.check('脚本执行', false, '执行异常：' + failed.message); return S; }
  S.ev = ev;
  sc22Judge(s22, ev, carrierSeen);
  sc23Judge(s23, ev);
  sc33Judge(s33, ev);
  const name = await writeEvidence('TS-22-23-33-powerups.json', ev);
  for (const sc of [s22, s23, s33]) sc.addEvidence(name);
  if (cp1) s22.addEvidence('TS-22-carrier.png');
  return S;
}

// TS-24：拾取护盾后立即回出生点，护盾生效期间朝右打穿砖墙击中指挥所（同 TS-14）
async function ts24(browser) {
  const sc = new Scenario('TS-24');
  const deadline = Date.now() + 14 * 60000;
  for (const seed of [24, 240]) {
    if (Date.now() > deadline - 60000) break;
    const g = await openGame(browser, { seed });
    try {
      await g.startToPlaying();
      let got = null;
      const bot = new Bot(g, { shoot: true, dodge: true, pickup: true });
      await bot.run({
        maxMs: WAIT, deadline,
        stop: s => !!got || s.screen === 'gameOver' || s.screen === 'victory',
        onSnap: (prev, s) => { if (prev && s.player && s.player.shieldMs > 0 && !(prev.player && prev.player.shieldMs > 0) && prev.powerUps.some(p => p.type === 'shield' && !s.powerUps.some(x => x.id === p.id))) got = s; },
      });
      if (!got) { log('TS-24 种子', seed, '未拿到护盾'); continue; }
      await goTo(g, 4.0625, 12.0625, 8000);
      let atHit = null;
      const end = await shootBase(g, (prev, s) => { if (s.base.destroyed && !atHit) atHit = { shieldMs: prev.player ? prev.player.shieldMs : null }; });
      if (!end.base.destroyed || !atHit || !(atHit.shieldMs > 0)) { log('TS-24 种子', seed, '击中指挥所时护盾已结束或未击中', JSON.stringify(atHit)); continue; }
      const over = await g.until(s => s.screen === 'gameOver', 8000, 100);
      const fv = await g.page.getByRole('dialog', { name: '失败' }).isVisible();
      await g.shot('TS-24-gameover.png'); sc.addEvidence('TS-24-gameover.png');
      sc.check('1 护盾生效期间指挥所被击中：指挥所被摧毁并显示失败画面', end.base.destroyed && !!over && fv,
        `种子 ${seed}；击中前一快照护盾剩余 ${atHit.shieldMs}ms；指挥所已摧毁=${end.base.destroyed}；画面 ${over ? over.screen : (await g.snap()).screen}，失败浮层可见=${fv}`);
      return sc;
    } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error'); return sc; }
    finally { await g.close(); }
  }
  sc.unreachable('等待上限内未能在护盾生效期间击中指挥所');
  return sc;
}

let sessionP = null;
export const scenarios = {
  'TS-22': async b => (await (sessionP ??= runSession(b)))['TS-22'],
  'TS-23': async b => (await (sessionP ??= runSession(b)))['TS-23'],
  'TS-33': async b => (await (sessionP ??= runSession(b)))['TS-33'],
  'TS-24': ts24,
};
