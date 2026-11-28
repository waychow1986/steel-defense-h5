// 连续 5 关到全部通关：TS-20（伪时钟，自动游玩；失败时换种子重开，仍计在等待上限内）
import { Scenario, openGame, log, writeEvidence } from '../lib.mjs';
import { Bot } from '../bot.mjs';

const CAP_MS = 39 * 60000;
const num = t => { const m = /-?\d+/.exec(t || ''); return m ? Number(m[0]) : null; };
const terrains = cells => ({ B: /B/.test(cells), S: /S/.test(cells), W: /W/.test(cells) });

// 读取浮层的过渡状态：data-transition、不透明度、运行中的动画
const probe = page => page.evaluate(() => {
  const dl = [...document.querySelectorAll('[role=dialog]')].filter(d => !d.hidden).map(d => ({ n: d.getAttribute('aria-label'), op: Number(getComputedStyle(d).opacity), tr: d.getAttribute('data-transition'), an: d.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length }));
  const anyT = [...document.querySelectorAll('[data-transition]')].map(e => e.getAttribute('data-transition')).filter(v => v && v !== 'none' && v !== 'idle' && v !== 'done');
  return { dl, anyT };
});

function newTr(from, to) { return { from, to, inTr: 0, mid: 0, reads: 0 }; }
function feedTr(tr, s, p) {
  tr.reads++;
  if (s.transitioning || p.anyT.length) tr.inTr++;
  if (p.dl.some(d => (d.op > 0.01 && d.op < 0.99) || d.an > 0)) tr.mid++;
}

async function ts20(browser) {
  const sc = new Scenario('TS-20');
  const deadline = Date.now() + CAP_MS;
  const ev = { games: [], intros: {}, maps: {}, transitions: [] };
  let final = null;
  for (let k = 0; Date.now() < deadline - 60000 && !final; k++) {
    const seed = 20 + k * 100;
    const g = await openGame(browser, { seed, highScore: 50 });
    const game = { seed, maxLevel: 0, end: null };
    ev.games.push(game);
    try {
      await g.clickStart();
      let cur = null, lastClear = null, after5 = [];
      const bot = new Bot(g, { shoot: true, dodge: true, pickup: true });
      const onSnap = async (prev, s) => {
        if (!prev || s.screen !== prev.screen) {
          cur = newTr(prev ? prev.screen : 'start', s.screen); cur.level = s.level; ev.transitions.push(cur);
          if (lastClear && lastClear.level === 5) after5.push(s.screen + (s.screen === 'levelIntro' ? ':' + s.level : ''));
        }
        if (cur && (s.screen !== 'playing' || s.transitioning || cur.reads < 3) && cur.reads < 40) feedTr(cur, s, await probe(g.page));
        game.maxLevel = Math.max(game.maxLevel, s.level || 0);
        if (s.screen === 'levelIntro' && !ev.intros[s.level]) {
          const t = (await g.page.getByRole('dialog', { name: '关卡开场' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
          if (t) ev.intros[s.level] = { text: t, total: (s.levels.find(l => l.level === s.level) || {}).total, seed };
        }
        if (s.screen === 'playing' && !ev.maps[s.level]) ev.maps[s.level] = s.map.cells.join('\n');
        if (s.screen === 'levelClear' && (!lastClear || lastClear.level !== s.level)) {
          const hud = await g.hud();
          lastClear = { level: s.level, score: s.score, hudScore: num(hud['分数']), text: (await g.page.getByRole('dialog', { name: '过关' }).innerText().catch(() => '')).replace(/\s+/g, ' ') };
          if (s.level === 5) game.clear5 = lastClear;
        }
      };
      const end = await bot.run({ maxMs: CAP_MS, deadline, onSnap, stop: s => s.screen === 'gameOver' || s.screen === 'victory' || (s.screen === 'levelIntro' && s.level > 5) });
      game.end = end ? end.screen : null;
      log('TS-20 种子', seed, '结束于', game.end, '最高关卡', game.maxLevel);
      if (end && end.screen === 'victory') {
        await g.until(s => !s.transitioning, 5000, 100);
        const dlg = g.page.getByRole('dialog', { name: '全部通关' });
        const vis = await dlg.isVisible();
        const scoreT = await dlg.getByRole('status', { name: '本局分数' }).innerText().catch(() => '');
        const hsT = await dlg.getByRole('status', { name: '历史最高分' }).innerText().catch(() => '');
        const btn = dlg.getByRole('button', { name: '返回开始画面' });
        const btnVis = await btn.isVisible().catch(() => false);
        await g.shot('TS-20-victory.png'); sc.addEvidence('TS-20-victory.png');
        final = { seed, vis, scoreT, hsT, btnVis, clear5: game.clear5, after5 };
        if (btnVis) {
          const tr = newTr('victory', 'start'); ev.transitions.push(tr);
          await btn.click();
          for (let i = 0; i < 30; i++) { const s = await g.snap(); if (s.screen !== 'victory' || s.transitioning) feedTr(tr, s, await probe(g.page)); if (s.screen === 'start' && !s.transitioning && i > 2) break; await g.adv(100); }
          const st = await g.snap();
          const startHs = await g.page.getByRole('dialog', { name: '开始画面' }).getByRole('status', { name: '历史最高分' }).innerText().catch(() => '');
          await g.clickStart();
          const ng = await g.until(s => s.screen === 'levelIntro' || s.screen === 'playing', 6000, 100);
          await g.adv(300);
          const hud = await g.hud(); const ns = await g.snap();
          final.back = { screen: st.screen, startHs, newGame: ng ? { level: ns.level, score: ns.score, lives: ns.lives, hud } : null };
        }
      }
    } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error'); await g.close(); break; }
    await g.close();
  }
  sc.addEvidence(await writeEvidence('TS-20-campaign.json', { ...ev, final }));

  // 1 第 2～5 关开场、三种地形、5 关地图两两不同
  const introObs = [], introBad = [];
  for (let n = 2; n <= 5; n++) {
    const it = ev.intros[n]; if (!it) continue;
    const ok = new RegExp(`第\\s*${n}\\s*关`).test(it.text) && num(it.text.replace(new RegExp(`第\\s*${n}\\s*关`), '')) === it.total;
    if (!ok) introBad.push(n);
    introObs.push(`第 ${n} 关开场“${it.text}”（快照总数 ${it.total}）`);
  }
  const mapLv = Object.keys(ev.maps).map(Number).sort();
  const mapBad = mapLv.filter(l => { const t = terrains(ev.maps[l]); return !(t.B && t.S && t.W); });
  const same = [];
  for (let i = 0; i < mapLv.length; i++) for (let j = i + 1; j < mapLv.length; j++) if (ev.maps[mapLv[i]] === ev.maps[mapLv[j]]) same.push(`${mapLv[i]}/${mapLv[j]}`);
  const c1 = introObs.length > 0 || mapLv.length > 1;
  const c1Note = `${introObs.join('；') || '未到达第 2 关开场'}；已见地图关卡 ${mapLv.join('、')}，缺少三种地形的关 ${mapBad.join('、') || '无'}，相同地图 ${same.join('、') || '无'}`;
  if (c1) sc.check('1 第 2～5 关开场显示“第 N 关”与敌人总数；各关地图含三种地形且两两不同', !introBad.length && !mapBad.length && !same.length, c1Note);
  // 5 过渡
  const trs = ev.transitions.filter(t => t.from !== t.to && !(t.from === 'start' && t.to === 'start'));
  const noTr = trs.filter(t => t.reads > 0 && !(t.inTr > 0 && t.mid > 0)).map(t => `${t.from}→${t.to}(第${t.level ?? '-'}关)`);
  const trNote = `观察到画面切换 ${trs.length} 次；无过渡中间状态的切换：${noTr.join('、') || '无'}（判定：切换期间读到“过渡进行中”且浮层部分透明或有运行中的动画）`;
  if (!final) {
    if (trs.length) sc.check('5 各画面之间都有过渡（已到达部分）', !noTr.length, trNote);
    sc.unreachable(`等待上限内未到达全部通关画面（各局：${ev.games.map(x => `种子 ${x.seed} 最高第 ${x.maxLevel} 关，结束于 ${x.end}`).join('；')}）`);
    return sc;
  }
  // 2 第 5 关过关→全部通关
  sc.check('2 第 5 关过关后先出现过关画面，再出现全部通关画面，没有第 6 关开场', !!final.clear5 && final.vis && !final.after5.some(x => x.startsWith('levelIntro')),
    `第 5 关过关画面“${final.clear5 ? final.clear5.text : '未见'}”；之后画面序列 ${final.after5.join('→')}；全部通关浮层可见=${final.vis}`);
  // 3 全部通关画面内容
  const sc5 = final.clear5 ? final.clear5.hudScore : null;
  sc.check('3 全部通关画面显示本局分数（等于第 5 关结束时 HUD 分数）、历史最高分（等于本局分数）与返回按钮',
    sc5 !== null && num(final.scoreT) === sc5 && num(final.hsT) === sc5 && sc5 > 50 && final.btnVis,
    `本局分数“${final.scoreT}”，历史最高分“${final.hsT}”（预置 50），第 5 关结束时 HUD 分数 ${sc5}；按钮可见=${final.btnVis}`);
  // 4 返回开始画面与新一局
  const b = final.back;
  if (!b) sc.check('4 返回开始画面并开新一局', false, '“返回开始画面”按钮不可见，无法返回');
  else {
    const n = b.newGame;
    sc.check('4 返回开始画面，历史最高分等于本局分数；新一局为第 1 关、分数 0、生命 3',
      b.screen === 'start' && num(b.startHs) === sc5 && !!n && n.level === 1 && n.score === 0 && n.lives === 3 && num(n.hud['关卡']) === 1 && num(n.hud['分数']) === 0 && num(n.hud['生命']) === 3,
      `点击后画面 ${b.screen}，开始画面历史最高分“${b.startHs}”；新一局 ${n ? `快照 关卡 ${n.level} 分数 ${n.score} 生命 ${n.lives}，HUD ${JSON.stringify(n.hud)}` : '未进入'}`);
  }
  sc.check('5 各画面之间都有过渡', trs.length > 0 && !noTr.length, trNote);
  return sc;
}

export const scenarios = { 'TS-20': ts20 };
