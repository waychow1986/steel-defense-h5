// AC-23 真实时间：TS-42 输入响应与松开停止，TS-43/44 帧率、长停顿与闪烁（不装伪时钟）
import { PNG } from 'pngjs';
import { Scenario, openGame, DESKTOP, mobile, writeEvidence, log } from '../lib.mjs';
import { Bot } from '../bot.mjs';

const MOBILE = mobile(390, 844);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- TS-42 ----------
async function installRec(page) {
  await page.evaluate(() => {
    if (window.__qa) return;
    window.__qa = { ev: [], fr: [] };
    const evh = e => window.__qa.ev.push({ type: e.type, t: e.timeStamp });
    for (const ty of ['keydown', 'keyup', 'pointerdown', 'pointerup']) window.addEventListener(ty, evh, true);
    const loop = () => {
      const s = window.steelDefense.snapshot();
      window.__qa.fr.push({ t: performance.now(), x: s.player?.x, y: s.player?.y, dir: s.player?.dir, lrm: s.input.lastResponseMs, b: s.bullets.filter(b => b.owner === 'player').map(b => b.id), lives: s.lives, screen: s.screen, bd: !!s.base?.destroyed, pn: !s.player, er: s.enemiesRemaining });
      if (window.__qa.fr.length > 600) window.__qa.fr.splice(0, 300);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
const resetRec = page => page.evaluate(() => { window.__qa.ev = []; window.__qa.fr = []; });
const takeRec = page => page.evaluate(() => ({ ev: window.__qa.ev, fr: window.__qa.fr }));

function analyzePress(pre, rec, kind) {
  const down = rec.ev.find(e => e.type === 'keydown' || e.type === 'pointerdown');
  if (!down) return { ok: false, why: '未记录到按下事件' };
  const after = rec.fr.filter(f => f.t >= down.t);
  let resp;
  if (kind === 'fire') resp = after.find(f => f.b.some(id => !pre.b.includes(id)));
  else resp = after.find(f => f.x !== pre.x || f.y !== pre.y || f.dir !== pre.dir);
  if (!resp) {
    const l = after.at(-1);
    // 按测试计划：没有可见响应且快照也没有本次响应记录才判“没有响应”；有本次记录则按记录值判定
    const rf = after.find(f => f.lrm !== null && f.lrm !== undefined && f.lrm !== pre.lrm);
    if (rf) return { lrm: rf.lrm, updated: true, ok: rf.lrm <= 100, note: `无可见位置/朝向变化（可能被阻挡），快照记录本次响应 ${rf.lrm}ms；按下前 ${pre.x},${pre.y},${pre.dir}`, rel: kind === 'move' ? true : undefined, relWhy: '未移动' };
    return { ok: false, why: `按下后坦克没有响应（无移动、转向或子弹）；按下前 ${pre.x},${pre.y},${pre.dir}，最后一帧 ${l?.x},${l?.y},${l?.dir}，事件 ${rec.ev.map(e => e.type).join(',')}，帧数 ${after.length}`, lrm: l?.lrm };
  }
  const lrm = resp.lrm;
  const measured = resp.t - down.t;
  const updated = lrm !== null && (lrm !== pre.lrm || Math.abs(measured - lrm) <= 34);
  const r = { lrm, measured: Math.round(measured * 10) / 10, updated, ok: lrm !== null && updated && lrm <= 100 };
  if (kind === 'move') {
    const up = rec.ev.find(e => (e.type === 'keyup' || e.type === 'pointerup') && e.t > down.t);
    if (!up) return { ...r, rel: false, relWhy: '未记录到松开事件' };
    const late = rec.fr.filter(f => f.t > up.t + 100);
    const same = late.length >= 3 && late.every(f => f.x === late[0].x && f.y === late[0].y);
    const atUp = rec.fr.filter(f => f.t <= up.t).at(-1);
    r.rel = same; r.relWhy = `松开后>100ms 帧数 ${late.length}，位置 ${[...new Set(late.map(f => `${f.x?.toFixed(3)},${f.y?.toFixed(3)}`))].join(' | ')}；松开时位置 ${atUp?.x?.toFixed(3)},${atUp?.y?.toFixed(3)}`;
  }
  return r;
}

// 敌人可能在测量期间摧毁指挥所：失败后开新一局继续（每次按下相互独立）
// 指挥所已毁（失败前爆炸阶段）、玩家坦克不存在、或本关敌人已清（过关前阶段）时游戏不接受输入（规格 A-9），不能在此测量
const notMeasurable = s => s.screen !== 'playing' || !s.player || s.transitioning || !!s.base?.destroyed || s.enemiesRemaining === 0;

async function ensurePlaying(g) {
  let s = await g.snap();
  if (!notMeasurable(s)) return;
  if (s.screen === 'playing' && (s.base?.destroyed || s.enemiesRemaining === 0)) {
    // 等爆炸阶段结束进入失败/过关画面
    await g.until(x => x.screen !== 'playing', 8000, 100).catch(() => { });
    s = await g.snap();
  }
  if (s.screen === 'gameOver' || s.screen === 'victory') {
    const btn = g.page.getByRole('button', { name: '返回开始画面' });
    if (g.touch) await btn.tap(); else await btn.click();
    await g.until(x => x.screen === 'start' && !x.transitioning, 5000, 100);
  }
  if ((await g.snap()).screen === 'start') await g.startToPlaying();
  else await g.until(x => !notMeasurable(x), 15000, 100);
  await g.release();
}

async function presses(g, kind, n) {
  const page = g.page; const out = [];
  let attempts = 0, lastLives = null;
  const dirs = ['up', 'down'];
  while (out.length < n && attempts++ < n + 30) {
    if (kind === 'fire') {
      await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 50);
      await sleep(600);
    } else await sleep(150);
    const s0 = await g.snap();
    if (notMeasurable(s0)) { await ensurePlaying(g); lastLives = null; continue; }
    // 刚重生或新开局：等待稳定后再按，避免按在出生保护/入场阶段
    if (lastLives !== s0.lives) { lastLives = s0.lives; await sleep(2000); continue; }
    if (kind === 'fire' && s0.player.dir !== 'up') { await g.hold('up'); await sleep(20); await g.release(); await sleep(300); }
    await resetRec(page); await sleep(50);
    const pr = (await takeRec(page)).fr.at(-1);
    const pre = { x: pr.x, y: pr.y, dir: pr.dir, lrm: pr.lrm, b: pr.b };
    const dir = dirs[out.length % 2];
    try {
      if (kind === 'fire') { await g.fire(); await sleep(400); }
      else { await g.hold(dir); await sleep(500); await g.release(); await sleep(400); }
    } catch { g.touchHeld = null; await g.release().catch(() => { }); continue; }
    const rec = await takeRec(page);
    // 期间被击中、画面变化、指挥所被毁、玩家坦克不存在或进入过关前阶段：重做这次按下
    if (rec.fr.some(f => f.lives !== pr.lives || f.screen !== 'playing' || f.x === undefined || f.pn || f.bd || f.er === 0)) continue;
    out.push({ i: out.length + 1, dir: kind === 'fire' ? 'fire' : dir, ...analyzePress(pre, rec, kind) });
  }
  return out;
}

function judge(sc, label, list, n, kind) {
  const bad = list.filter(r => !r.ok);
  sc.check(`1 ${label}：每次按下的快照响应时间 ≤ 100ms 且为本次记录`, list.length >= n && bad.length === 0,
    `有效次数 ${list.length}/${n}；` + list.map(r => `#${r.i}${r.dir}:${r.why ? r.why : `lrm=${r.lrm?.toFixed?.(1)} 页面内测得≈${r.measured} 已更新=${r.updated}`}`).join('；'));
  if (kind === 'move') {
    const relBad = list.filter(r => !r.rel);
    sc.check(`2 ${label}：松开后 100ms 起坦克位置都相同`, list.length >= n && relBad.length === 0, list.map(r => `#${r.i}${r.dir}:${r.rel ? '停' : '未停'}（${r.relWhy}）`).join('；'));
  }
}

async function ts42(browser) {
  const sc = new Scenario('TS-42'); const all = {};
  for (const [dev, device, seed] of [['电脑', DESKTOP, 42], ['手机竖屏', MOBILE, 42]]) {
    let g;
    try {
      g = await openGame(browser, { device, seed, clock: false });
      if (!await g.startToPlaying()) { sc.check(`${dev}：进入游戏进行中`, false, '未能进入游戏进行中'); continue; }
      await installRec(g.page);
      const how = device.hasTouch ? '虚拟按键' : '键盘';
      const f = await presses(g, 'fire', 10);
      judge(sc, `${dev}${how}开火`, f, 10, 'fire');
      const m = await presses(g, 'move', 10);
      judge(sc, `${dev}${how}移动`, m, 10, 'move');
      all[dev] = { fire: f, move: m };
    } catch (e) { sc.check(`${dev}：脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { await g.dumpEvidence(sc, dev).catch(() => { }); await g.close(); } }
  }
  sc.addEvidence(await writeEvidence('TS-42-presses.json', all));
  return sc;
}

// ---------- TS-43 / TS-44 ----------
function uniformRatio(png, x0, y0, w, h) {
  const hist = new Map(); let n = 0;
  const X1 = Math.min(png.width, x0 + w), Y1 = Math.min(png.height, y0 + h);
  for (let y = Math.max(0, y0); y < Y1; y += 2) for (let x = Math.max(0, x0); x < X1; x += 2) {
    const i = (y * png.width + x) * 4; const d = png.data;
    const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
    hist.set(k, (hist.get(k) || 0) + 1); n++;
  }
  return n ? Math.max(...hist.values()) / n : 1;
}

// 一次测量：新开一局（固定种子），自动游玩第 1 关直到过关、失败或到达总截止时间
async function measure(browser, device, seed, deadline) {
  const g = await openGame(browser, { device, seed, clock: false });
  try {
    if (!await g.startToPlaying()) return { g, err: '未能进入游戏进行中' };
    const mb = await g.mapBox();
    const t0 = Date.now();
    // 前 40 秒守在指挥所前方，之后主动追击敌人（测试自选的游玩方式，使测量时段尽量不少于 60 秒）
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: false, goal: () => Date.now() - t0 < 40000 ? [4, 12] : null });
    let done = false, end = null;
    const botP = bot.run({ maxMs: 1e9, deadline, stop: s => s.screen !== 'playing' || s.level !== 1 })
      .then(s => { end = s; }).catch(e => { end = { error: e.message }; }).finally(() => { done = true; });
    const perf = [], shots = [];
    let lastPerf = 0;
    while (!done && Date.now() < deadline) {
      const buf = await g.page.screenshot({ scale: 'css' });
      const png = PNG.sync.read(buf);
      const hudVis = await g.page.getByRole('group', { name: '战况' }).isVisible().catch(() => false);
      shots.push({ t: Date.now() - t0, full: uniformRatio(png, 0, 0, png.width, png.height), map: mb ? uniformRatio(png, Math.round(mb.x), Math.round(mb.y), Math.round(mb.width), Math.round(mb.height)) : null, hud: hudVis });
      if (Date.now() - lastPerf >= 1000 && Date.now() - t0 >= 5000) {
        lastPerf = Date.now();
        const s = await g.snap();
        if (s.screen === 'playing') perf.push({ t: Date.now() - t0, ...s.perf });
      }
      await sleep(400);
    }
    await botP;
    const dur = (Date.now() - t0) / 1000;
    const fin = await g.snap();
    return { g, seed, dur, perf, shots, fin, end: end && { screen: end.screen, level: end.level, error: end.error } };
  } catch (e) { return { g, err: e.message }; }
}

async function perfRun(browser, id, device) {
  const sc = new Scenario(id); let g;
  try {
    // 测试等待上限 6 分钟：第 1 关在 60 秒内结束（过关或失败）时，换种子新开一局重测，取第一段不少于 60 秒的测量时段
    const deadline = Date.now() + 6 * 60000; const tries = [];
    let m = null;
    for (let seed = 43; Date.now() < deadline - 30000; seed++) {
      if (g) { await g.close(); g = null; }
      m = await measure(browser, device, seed, deadline); g = m.g;
      tries.push(m.err ? { seed, err: m.err } : { seed, dur: m.dur, end: m.fin.screen });
      if (m.err) { m = null; continue; }
      if (m.dur >= 60) break;
    }
    sc.addEvidence(await writeEvidence(`${id}-perf.json`, { tries, chosen: m && { seed: m.seed, dur: m.dur, end: m.end, perf: m.perf, shots: m.shots } }));
    if (!m || m.dur < 60) { sc.unreachable(`6 分钟内没有不少于 60 秒的测量时段：${JSON.stringify(tries)}`); return sc; }
    const { dur, perf, shots, fin } = m;
    const maxGap = Math.max(...perf.map(p => p.maxFrameGapMs));
    const avgFps = perf.reduce((a, p) => a + p.fps, 0) / perf.length;
    const head = `种子 ${m.seed}，测量时段 ${dur.toFixed(1)} 秒（结束：screen=${fin.screen} 关卡 ${fin.level}），每秒读数 ${perf.length} 次`;
    sc.check('1 测量时段内最大帧间隔 ≤ 100ms', perf.length > 0 && maxGap <= 100, `${head}，最大帧间隔 ${maxGap}ms；画质 ${[...new Set(perf.map(p => p.quality))].join(',')}`);
    sc.check('2 测量时段内平均帧率 ≥ 55', perf.length > 0 && avgFps >= 55, `${head}，平均帧率 ${avgFps.toFixed(1)}，最低读数 ${Math.min(...perf.map(p => p.fps))}`);
    const flashes = [];
    for (let i = 1; i + 1 < shots.length; i++) {
      const [a, b, c] = [shots[i - 1], shots[i], shots[i + 1]];
      if (a.full < 0.97 && b.full >= 0.97 && c.full < 0.97) flashes.push(`${b.t}ms 整屏空白`);
      if (a.map !== null && a.map < 0.97 && b.map >= 0.97 && c.map < 0.97) flashes.push(`${b.t}ms 地图整体不见`);
      if (a.hud && !b.hud && c.hud) flashes.push(`${b.t}ms HUD 不见`);
    }
    sc.check('3 不闪烁：截图序列中无整屏空白后恢复、地图或 HUD 整体消失后恢复', flashes.length === 0 && shots.length >= 3,
      `截图 ${shots.length} 张（约每 0.4 秒加截图耗时）；${flashes.length ? flashes.join('，') : '未发现'}；整屏单色比例最大 ${Math.max(...shots.map(s => s.full)).toFixed(2)}`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end').catch(() => { }); await g.close(); } }
  return sc;
}

export const scenarios = {
  'TS-42': ts42,
  'TS-43': b => perfRun(b, 'TS-43', DESKTOP),
  'TS-44': b => perfRun(b, 'TS-44', MOBILE),
};
