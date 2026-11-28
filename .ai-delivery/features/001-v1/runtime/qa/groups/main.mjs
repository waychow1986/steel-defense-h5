// 自动游玩第 1 关并进入第 2 关的同局观察：TS-11 12 13 19 25 36
import { Scenario, openGame, cueCount, log } from '../lib.mjs';
import { Bot } from '../bot.mjs';

const IDS = ['TS-11', 'TS-12', 'TS-13', 'TS-19', 'TS-25', 'TS-36'];
const SEEDS = [3, 5, 11];
const GAME_CAP_MS = 10 * 60 * 1000;

const num = t => { const m = /-?\d+/.exec(t || ''); return m ? Number(m[0]) : null; };

// HUD 四项：可见、在视口内、文字非空、未被不透明浮层完全遮住
async function hudVisible(page) {
  return page.evaluate(() => {
    const out = {};
    const hud = document.querySelector('[role=group][aria-label="战况"]');
    for (const n of ['关卡', '分数', '生命', '剩余敌人']) {
      const el = hud && [...hud.querySelectorAll('[role=status]')].find(e => e.getAttribute('aria-label') === n);
      if (!el) { out[n] = { ok: false, why: '不存在' }; continue; }
      const r = el.getBoundingClientRect();
      const inView = r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      const text = el.innerText.trim();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      let covered = false;
      if (hit && !hud.contains(hit)) {
        for (let a = hit; a && a !== document.documentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const bg = cs.backgroundColor.match(/[\d.]+/g) || [];
          const alpha = bg.length === 4 ? Number(bg[3]) : (bg.length === 3 ? 1 : 0);
          if (alpha >= 0.99 && Number(cs.opacity) >= 0.99 && cs.visibility !== 'hidden') { covered = (a.id || a.className || a.tagName) + ' bg=' + cs.backgroundColor; break; }
        }
      }
      out[n] = { ok: inView && text !== '' && !covered && getComputedStyle(el).visibility !== 'hidden', text, inView, covered };
    }
    return out;
  });
}

async function readHud(g) { const h = await g.hud(); return { level: num(h['关卡']), score: num(h['分数']), lives: num(h['生命']), remaining: num(h['剩余敌人']), raw: h }; }

async function attempt(browser, seed, deadline) {
  const S = Object.fromEntries(IDS.map(id => [id, new Scenario(id)]));
  const g = await openGame(browser, { seed });
  const page = g.page;
  const origAdv = g.adv.bind(g); g.t = 0;
  g.adv = async ms => { g.t += Math.max(1, Math.round(ms)); return origAdv(ms); };
  const o = {
    firstSeen: new Map(), maxOnField: 0, kills: [], newAfterKill: false, types: new Set(),
    hist: new Map(), speeds: { normal: [], fast: [], heavy: [] }, heavy: new Map(),
    hudScreens: {}, events: { kill: [], life: [], level: [] }, inv: [],
    remainingOneControl: null, cleared: null, intro2: null, level2: null, pickupCue: null, levelClearCue: null,
  };
  let level1Cells = null, total1 = null, reachedL2 = false, gameOver = false;
  try {
    await g.clickStart();
    const si = await g.until(s => s.screen === 'levelIntro' && !s.transitioning, 3000, 20);
    if (si) {
      o.hudScreens.levelIntro = await hudVisible(page);
      const h = await readHud(g);
      S['TS-25'].check('2 开场提示时：关卡为当前关、剩余敌人等于本关敌人总数', h.level === si.level && h.remaining === si.levelInfo.total, `HUD=${JSON.stringify(h.raw)} 快照 level=${si.level} total=${si.levelInfo.total}`);
    }
    await g.until(s => s.screen === 'playing' && s.player, 6000, 50);
    const s0 = await g.snap(); level1Cells = s0.map.cells.join('\n'); total1 = s0.levelInfo.total;
    o.hudScreens.playing = await hudVisible(page);
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: true });
    let pending = null;
    const onSnap = async (prev, s) => {
      if (!prev) return;
      // TS-25 HUD 更新时效：变化在 (prev, s] 间发生，现在读；旧值则再推进 50ms（不超过事件后 100ms）再读
      const evs = [];
      if (s.level === prev.level && (s.score !== prev.score || s.enemiesRemaining !== prev.enemiesRemaining)) evs.push('kill');
      if (s.lives < prev.lives) evs.push('life');
      if (s.level > prev.level) evs.push('level');
      if (evs.length) {
        let h = await readHud(g); let late = false;
        const same = (h2, x) => h2.score === x.score && h2.remaining === x.enemiesRemaining && h2.lives === x.lives && h2.level === x.level;
        if (!same(h, s)) { await g.adv(50); late = true; h = await readHud(g); }
        const s2 = await g.snap();
        const ok = same(h, s2) || same(h, s);
        for (const e of evs) o.events[e].push({ ok, obs: `事件前 快照 分数${prev.score} 生命${prev.lives} 剩余${prev.enemiesRemaining} 关卡${prev.level}；事件后${late ? '≤100ms' : '≤50ms'} HUD=${JSON.stringify(h.raw)} 快照 分数${s2.score} 生命${s2.lives} 剩余${s2.enemiesRemaining} 关卡${s2.level}` });
      }
      if (s.level !== 1 || prev.level !== 1) {
        if (s.level === 2 && s.screen === 'levelIntro' && !o.intro2) {
          const t = await page.getByRole('dialog', { name: '关卡开场' }).innerText().catch(() => '');
          o.intro2 = { text: t.replace(/\s+/g, ' '), total: s.levelInfo.total, l2total: s.levels[1].total, l1total: s.levels[0].total };
        }
        if (s.level === 2 && s.screen === 'playing' && !o.level2) {
          o.level2 = { hud: await readHud(g), snap: s };
          reachedL2 = true;
        }
        return;
      }
      // 以下为第 1 关观察
      const ids = new Set(s.enemies.map(e => e.id));
      const gone = prev.enemies.filter(e => !ids.has(e.id));
      for (const e of s.enemies) {
        o.types.add(e.type);
        if (!o.firstSeen.has(e.id)) {
          o.firstSeen.set(e.id, { y: e.y, type: e.type });
          if (o.kills.length) o.newAfterKill = true;
          if (!gone.length && s.enemiesRemaining !== prev.enemiesRemaining) o.inv.push(`新敌人 ${e.id} 出现时剩余敌人 ${prev.enemiesRemaining}→${s.enemiesRemaining}`);
        }
        // 速度：同向、移动、垂直轴不变的连续段
        const h = o.hist.get(e.id) || [];
        const last = h[h.length - 1];
        const cont = last && last.dir === e.dir && e.moving && ((e.dir === 'up' || e.dir === 'down') ? Math.abs(e.x - last.x) < 1e-6 && Math.abs(e.y - last.y) > 1e-4 : Math.abs(e.y - last.y) < 1e-6 && Math.abs(e.x - last.x) > 1e-4);
        if (!cont) {
          if (h.length >= 2) {
            const dt = h[h.length - 1].t - h[0].t;
            if (dt >= 500) o.speeds[e.type].push((Math.abs(h[h.length - 1].x - h[0].x) + Math.abs(h[h.length - 1].y - h[0].y)) / (dt / 1000));
          }
          o.hist.set(e.id, [{ t: g.t, x: e.x, y: e.y, dir: e.dir }]);
        } else { h.push({ t: g.t, x: e.x, y: e.y, dir: e.dir }); o.hist.set(e.id, h); }
        if (e.type === 'heavy') {
          const hv = o.heavy.get(e.id) || { maxHp: e.maxHp, lastHp: e.hp, firstHit: null };
          if (e.hp < hv.lastHp && !hv.firstHit) hv.firstHit = { present: true, scoreSame: s.score === prev.score, obs: `第1次命中后 hp ${hv.lastHp}→${e.hp}，仍在场，分数 ${prev.score}→${s.score}` };
          hv.lastHp = e.hp; o.heavy.set(e.id, hv);
        }
      }
      o.maxOnField = Math.max(o.maxOnField, s.enemies.length);
      if (gone.length) {
        const k = { types: gone.map(e => e.type), scoreUp: s.score > prev.score, remDrop: prev.enemiesRemaining - s.enemiesRemaining, n: gone.length, ids: gone.map(e => e.id), obs: `${gone.map(e => e.type).join(',')} 消灭：分数 ${prev.score}→${s.score}，剩余 ${prev.enemiesRemaining}→${s.enemiesRemaining}` };
        for (const e of gone) {
          if (e.type === 'heavy') { const hv = o.heavy.get(e.id); if (hv) hv.killed = { hits: hv.maxHp - hv.lastHp + 1, ...k }; }
          o.hist.delete(e.id);
        }
        o.kills.push(k);
      }
      if (s.enemiesRemaining === 1 && s.level === 1 && o.remainingOneControl === null) o.remainingOneControl = { ok: s.screen === 'playing', obs: `剩余敌人为 1 时画面=${s.screen}` };
      if (s.screen === 'levelClear' && !o.cleared) {
        o.cleared = { score: s.score, lives: s.lives, cue: cueCount(s, 'levelClear') > cueCount(prev, 'levelClear') || cueCount(s, 'levelClear') > 0, seen: true };
        o.hudScreens.levelClear = await hudVisible(page);
        const dlgText = await page.getByRole('dialog', { name: '过关' }).innerText().catch(() => '');
        o.cleared.text = dlgText.replace(/\s+/g, ' ');
      }
      if (s.powerUps.length < prev.powerUps.length && (s.player?.shieldMs > (prev.player?.shieldMs || 0) || s.player?.firepower > (prev.player?.firepower || 0))) {
        o.pickupCue = { ok: cueCount(s, 'pickup') > cueCount(prev, 'pickup'), obs: `拾取道具：pickup 音效 ${cueCount(prev, 'pickup')}→${cueCount(s, 'pickup')}` };
      }
      if (s.screen === 'gameOver') gameOver = true;
    };
    pending = await bot.run({ maxMs: GAME_CAP_MS, deadline, onSnap, stop: s => s.screen === 'gameOver' || (reachedL2 && s.level === 2) });
    if (o.level2) { const s = await g.snap(); o.level2.cueSnap = s; }
  } catch (e) {
    S['TS-11'].check('脚本执行', false, '执行异常：' + e.message);
  }
  return { S, o, g, level1Cells, total1, reachedL2, gameOver };
}

function judge(r) {
  const { S, o, level1Cells, total1, reachedL2 } = r;
  // TS-11
  const first = [...o.firstSeen.values()];
  if (first.length) {
    S['TS-11'].check('1 每辆敌人第一次出现时位于地图最上面一行', first.every(f => f.y < 1), `首次出现纵坐标：${first.map(f => f.y.toFixed(2)).join(' ')}`);
    S['TS-11'].check('2 任一时刻场上敌人数少于本关敌人总数', o.maxOnField < total1, `场上最多 ${o.maxOnField} 辆，本关总数 ${total1}`);
  }
  if (o.cleared) S['TS-11'].check('3 消灭后有新敌人补上；累计出现数等于开场总数', o.newAfterKill && o.firstSeen.size === total1, `消灭后有新敌人出现=${o.newAfterKill}；累计出现 ${o.firstSeen.size} 辆，开场总数 ${total1}`);
  else S['TS-11'].skip('3 累计出现数', '未过关');
  // TS-12
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
  if (o.types.size === 3) S['TS-12'].check('1 出现过普通型、快速型、重甲型', true, `出现类型：${[...o.types].join(',')}`);
  else S['TS-12'].skip('1 三种类型', `目前只出现：${[...o.types].join(',')}`);
  const vn = med(o.speeds.normal), vf = med(o.speeds.fast);
  if (vn && vf) S['TS-12'].check('2 快速型速度 ÷ 普通型速度 ≥ 1.5', vf / vn >= 1.5, `普通型 ${vn.toFixed(3)} 格/秒（${o.speeds.normal.length} 段），快速型 ${vf.toFixed(3)} 格/秒（${o.speeds.fast.length} 段），比值 ${(vf / vn).toFixed(3)}`);
  else S['TS-12'].skip('2 速度比', `未测到足够的直线段：普通 ${o.speeds.normal.length} 快速 ${o.speeds.fast.length}`);
  // TS-13
  const hv = [...o.heavy.values()].find(h => h.killed);
  if (hv) {
    if (hv.firstHit) S['TS-13'].check('1 第 1 次命中后仍在场、分数不变', hv.firstHit.present && hv.firstHit.scoreSame, hv.firstHit.obs);
    else S['TS-13'].check('1 第 1 次命中后仍在场、分数不变', false, `重甲型未观察到命中后仍在场（hp 上限 ${hv.maxHp}，被消灭前 hp ${hv.lastHp}）`);
    S['TS-13'].check('2 被消灭时累计命中 ≥ 2，分数增加、剩余敌人减 1', hv.killed.hits >= 2 && hv.killed.scoreUp && hv.killed.remDrop === hv.killed.n, `累计命中 ${hv.killed.hits}；${hv.killed.obs}`);
    const others = o.kills.filter(k => !k.types.includes('heavy'));
    if (others.length) S['TS-13'].check('3 其他类型被消灭时分数增加、剩余敌人减 1', others.every(k => k.scoreUp && k.remDrop === k.n), others.slice(0, 6).map(k => k.obs).join('；'));
  } else S['TS-13'].unreachable('未消灭重甲型');
  // TS-19
  if (o.cleared && reachedL2) {
    S['TS-19'].check('1 对照：剩余敌人为 1 时仍为游戏进行中', o.remainingOneControl?.ok, o.remainingOneControl?.obs || '未观察到剩余 1 的时刻');
    S['TS-19'].check('2 最后一辆被消灭后出现过关画面且播放 levelClear', o.cleared.seen && o.cleared.cue, `过关画面文字：${o.cleared.text}；levelClear 音效=${o.cleared.cue}`);
    const it = o.intro2;
    if (it) {
      const n = num((/敌人\s*(\d+)/.exec(it.text) || [])[0]);
      S['TS-19'].check('3 关卡开场显示“第 2 关”与第 2 关敌人总数，且多于第 1 关', /第\s*2\s*关/.test(it.text) && n === it.l2total && n === it.total && it.l2total > it.l1total, `开场文字：${it.text}；快照第 2 关总数 ${it.l2total}，第 1 关 ${it.l1total}`);
    } else S['TS-19'].check('3 关卡开场显示第 2 关', false, '未观察到第 2 关开场提示');
    const l2 = o.level2; const h = l2.hud;
    S['TS-19'].check('4 第 2 关 HUD：关卡 2、分数与生命带入、剩余敌人为本关总数', h.level === 2 && h.score === o.cleared.score && h.lives === o.cleared.lives && h.remaining === l2.snap.levelInfo.total,
      `HUD=${JSON.stringify(h.raw)}；第 1 关结束 分数${o.cleared.score} 生命${o.cleared.lives}；第 2 关总数 ${l2.snap.levelInfo.total}`);
    const cells = l2.snap.map.cells.join('\n');
    S['TS-19'].check('5 第 2 关地图与第 1 关不同，且含砖、钢、水', cells !== level1Cells && /B/.test(cells) && /S/.test(cells) && /W/.test(cells), `地图不同=${cells !== level1Cells}`);
  } else S['TS-19'].unreachable('未过关进入第 2 关');
  // TS-25
  const vis = Object.entries(o.hudScreens);
  for (const [k, v] of vis) S['TS-25'].check(`1 ${k} 画面期间四项信息可见`, Object.values(v).every(x => x.ok), JSON.stringify(v));
  if (!o.hudScreens.levelClear) S['TS-25'].skip('1 过关画面期间四项信息可见', '未过关');
  const ev = (key, label) => {
    const a = o.events[key];
    if (a.length) S['TS-25'].check(label, a.every(x => x.ok), a.slice(0, 5).map(x => x.obs).join(' | ') + (a.some(x => !x.ok) ? ' | 未通过：' + a.filter(x => !x.ok).map(x => x.obs).join(' | ') : ''));
    else S['TS-25'].skip(label, '事件未发生');
  };
  ev('kill', '3/6 消灭敌人后 100ms 内 HUD 分数与剩余敌人与快照一致');
  S['TS-25'].check('3 敌人出现时剩余敌人不变', o.inv.length === 0, o.inv.join('；') || '敌人出现时剩余敌人均未变化');
  ev('life', '4/6 失去生命后 100ms 内 HUD 生命减 1');
  ev('level', '5/6 过关后 100ms 内 HUD 关卡变为下一关');
  // TS-36
  if (o.pickupCue) S['TS-36'].check('拾取后新增“拾取”音效', o.pickupCue.ok, o.pickupCue.obs);
  else S['TS-36'].skip('拾取音效', '未拾取道具');
  if (o.cleared) S['TS-36'].check('过关后新增“过关”音效', o.cleared.cue, `levelClear 音效=${o.cleared.cue}`);
  else S['TS-36'].skip('过关音效', '未过关');
}

let shared = null;
async function runAll(browser) {
  const deadline = Date.now() + Number(process.env.QA_MAIN_BUDGET_MS || 15 * 60 * 1000);
  let r = null;
  for (const seed of SEEDS) {
    if (r) await r.g.close();
    log('main seed', seed);
    r = await attempt(browser, seed, deadline);
    if (r.reachedL2 || Date.now() > deadline) break;
  }
  judge(r);
  for (const sc of Object.values(r.S)) await r.g.dumpEvidence(sc, 'main');
  await r.g.close();
  return r.S;
}

export const scenarios = Object.fromEntries(IDS.map(id => [id, async browser => { shared = shared || runAll(browser); return (await shared)[id]; }]));
