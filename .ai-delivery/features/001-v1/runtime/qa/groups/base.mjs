// 指挥所被击中与失败流程：TS-14 16 35（伪时钟同局），TS-34（真实时间）
import { Scenario, openGame, FRAME, cueCount, log, writeEvidence, EVIDENCE_DIR } from '../lib.mjs';
import { Bot, goTo } from '../bot.mjs';
import { PNG } from 'pngjs';

const num = t => { const m = /-?\d+/.exec(t || ''); return m ? Number(m[0]) : null; };
const SPAWN = [4.0625, 12.0625];

// 第 1 关出生点右侧依次是砖（第 12 行第 5 列）与指挥所（第 6 列）。
// 朝右连续开火：先打穿砖，再击中指挥所。onFrame(prev, s, bulletId) 逐帧回调。
export async function shootBase(g, onFrame, maxShots = 30) {
  await g.hold('right'); await g.adv(FRAME); await g.release(); await g.adv(FRAME);
  for (let i = 0; i < maxShots; i++) {
    await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 20);
    await g.adv(400);
    let prev = await g.snap();
    if (prev.base.destroyed || prev.screen !== 'playing') return prev;
    if (prev.player && prev.player.dir !== 'right') { await g.hold('right'); await g.adv(FRAME); await g.release(); prev = await g.snap(); }
    const before = new Set(prev.bullets.map(b => b.id));
    await g.page.keyboard.down('Space');
    let s = await g.snap();
    let id = null;
    for (let f = 0; f < 120; f++) {
      await g.adv(FRAME);
      if (f === 1) await g.page.keyboard.up('Space');
      s = await g.snap();
      if (id === null) { const nb = s.bullets.find(b => b.owner === 'player' && !before.has(b.id)); if (nb) id = nb.id; }
      if (onFrame) await onFrame(prev, s, id);
      if (s.base.destroyed) return s;
      if (id !== null && !s.bullets.some(b => b.id === id)) break;
      prev = s;
    }
  }
  return g.snap();
}

async function setupKill(g) {
  // 自动游玩到消灭至少 1 辆敌人（分数 > 0），再回出生点
  const bot = new Bot(g, { shoot: true, dodge: true, pickup: false });
  let killSnap = null, prevCue = null;
  const s = await bot.run({ maxMs: 180000, stop: s => s.score > 0 || s.screen !== 'playing' && s.screen !== 'levelIntro', onSnap: async (prev, s) => { if (prev && s.score > prev.score && !killSnap) { killSnap = { prev, s }; } } });
  return { s, killSnap };
}

let shared = null;
async function runShared(browser) {
  const S = { 'TS-14': new Scenario('TS-14'), 'TS-16': new Scenario('TS-16'), 'TS-35': new Scenario('TS-35') };
  const g = await openGame(browser, { seed: 14, highScore: 99999 });
  try {
    await g.startToPlaying();
    const level1 = (await g.snap()).levels[0];
    // TS-35 1 开火 / 2 击中：在出生点朝上打砖墙（第 9 行第 4 列）
    {
      const a = await g.snap();
      await g.hold('up'); await g.adv(FRAME); await g.release();
      await g.fire();
      const b = await g.snap();
      S['TS-35'].check('1 开火后新增“开火”音效', cueCount(b, 'fire') > cueCount(a, 'fire'), `fire 音效 ${cueCount(a, 'fire')}→${cueCount(b, 'fire')}`);
      await g.until(s => !s.bullets.some(x => x.owner === 'player'), 3000, FRAME);
      const c = await g.snap();
      S['TS-35'].check('2 子弹击中砖墙后新增“击中”音效', cueCount(c, 'hit') > cueCount(b, 'hit'), `hit 音效 ${cueCount(b, 'hit')}→${cueCount(c, 'hit')}`);
    }
    const { s: ks, killSnap } = await setupKill(g);
    if (!killSnap) { Object.values(S).forEach(sc => sc.unreachable('未能消灭敌人')); return { S, g }; }
    const ka = killSnap.prev, kb = killSnap.s;
    S['TS-35'].check('3 消灭敌人后新增“爆炸”音效', cueCount(kb, 'explosion') > cueCount(ka, 'explosion'), `explosion 音效 ${cueCount(ka, 'explosion')}→${cueCount(kb, 'explosion')}`);
    if (!await goTo(g, ...SPAWN, 30000)) { S['TS-14'].unreachable('未能回到出生点'); S['TS-16'].unreachable('未能回到出生点'); return { S, g }; }
    const hudBefore = num((await g.hud())['分数']);
    // TS-14
    let hitFrame = null; const frames = [];
    const end = await shootBase(g, async (prev, s, id) => {
      if (!prev.base.destroyed && s.base.destroyed && !hitFrame) hitFrame = { prev, s, id };
    });
    if (!hitFrame) { S['TS-14'].unreachable('未能击中指挥所'); S['TS-16'].unreachable('未能击中指挥所'); return { S, g }; }
    const { prev: hp, s: hs, id } = hitFrame;
    const wasThere = hp.bullets.some(b => b.id === id), goneNow = !hs.bullets.some(b => b.id === id);
    S['TS-14'].check('1 子弹在指挥所处消失的同一次快照中指挥所已摧毁', wasThere && goneNow && hs.base.destroyed, `前一帧子弹存在=${wasThere}，本帧子弹消失=${goneNow}，指挥所已摧毁=${hs.base.destroyed}`);
    // 失败后输入无效
    const p0 = hs.player;
    await g.hold('up'); await g.page.keyboard.down('Space');
    const recs = [];
    let t = 0, sawClear = false, shake = 0, expl = 0;
    while (t < 2000) {
      await g.adv(FRAME); t += FRAME;
      const s = await g.snap();
      const ov = await g.page.evaluate(() => {
        const d = [...document.querySelectorAll('[role=dialog]')].find(e => e.getAttribute('aria-label') === '失败');
        const anyT = [...document.querySelectorAll('[data-transition]')].map(e => e.getAttribute('data-transition')).filter(Boolean);
        return d ? { hidden: d.hidden, op: Number(getComputedStyle(d).opacity), tr: d.getAttribute('data-transition'), top: Math.round((d.firstElementChild || d).getBoundingClientRect().top * 10) / 10, an: d.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length, anyT } : { anyT };
      });
      recs.push({ t: Math.round(t), screen: s.screen, transitioning: s.transitioning, ...ov });
      if (s.screen === 'levelClear') sawClear = true;
      shake = Math.max(shake, s.effects.shakeMs); expl = Math.max(expl, s.effects.explosions);
    }
    await g.page.keyboard.up('Space'); await g.release();
    const s2 = await g.snap();
    const p2 = s2.player;
    const noMove = !p2 || !p0 || (p2.x === p0.x && p2.y === p0.y);
    const noBullet = !s2.bullets.some(b => b.owner === 'player');
    const failVisible = await g.page.getByRole('dialog', { name: '失败' }).isVisible();
    S['TS-14'].check('2 判为失败：不再接受移动与开火，出现失败画面，期间无过关画面', s2.screen === 'gameOver' && failVisible && noMove && noBullet && !sawClear,
      `screen=${s2.screen} 失败浮层可见=${failVisible} 坦克未移动=${noMove} 无玩家子弹=${noBullet} 出现过关=${sawClear}`);
    S['TS-14'].check('3 指挥所爆炸：爆炸记录与画面震动', (hs.effects.explosions > 0 || expl > 0) && shake > 0, `爆炸记录最大 ${Math.max(expl, hs.effects.explosions)}，震动时长最大 ${shake}ms`);
    const inTr = recs.filter(r => r.transitioning || (r.tr && r.tr !== 'none' && r.tr !== 'idle'));
    const partial = recs.filter(r => r.op > 0 && r.op < 1 && r.hidden === false);
    const vis = recs.filter(r => r.hidden === false);
    const moving = vis.filter(r => r.an > 0 && r.tr).length + (new Set(vis.map(r => r.top)).size > 1 ? 1 : 0);
    S['TS-14'].check('4 进入失败画面时有过渡（过渡进行中，且浮层部分透明或处于移动/动画中间状态）', inTr.length > 0 && (partial.length > 0 || moving > 0), `过渡进行中读数 ${inTr.length} 次，浮层部分透明读数 ${partial.length} 次，移动/动画中间状态 ${moving} 次；样例 ${JSON.stringify(recs.filter((_, i) => i % 15 === 0).slice(0, 8))}`);
    S['TS-14'].addEvidence(await writeEvidence('TS-14-transition.json', recs));
    S['TS-14'].check('5 失败音效 gameOver', cueCount(s2, 'gameOver') > cueCount(hp, 'gameOver'), `gameOver 音效 ${cueCount(hp, 'gameOver')}→${cueCount(s2, 'gameOver')}`);
    S['TS-35'].check('4 失败后新增“失败”音效', cueCount(s2, 'gameOver') > cueCount(hp, 'gameOver'), `gameOver 音效 ${cueCount(hp, 'gameOver')}→${cueCount(s2, 'gameOver')}`);
    const names = ['fire', 'hit', 'explosion', 'gameOver'];
    S['TS-35'].check('5 四类事件的音效名称互不相同', new Set(names.map(n => s2.audio.cues.some(c => c.name === n) ? n : null).filter(Boolean)).size === 4, `记录中的音效名称：${[...new Set(s2.audio.cues.map(c => c.name))].join(',')}`);
    // TS-16
    const dlg = g.page.getByRole('dialog', { name: '失败' });
    const scoreT = await dlg.getByRole('status', { name: '本局分数' }).innerText().catch(() => '');
    const hsT = await dlg.getByRole('status', { name: '历史最高分' }).innerText().catch(() => '');
    const btn = dlg.getByRole('button', { name: '返回开始画面' });
    S['TS-16'].check('1 失败画面显示本局分数、历史最高分 99999 与返回按钮', num(scoreT) === hudBefore && hudBefore > 0 && num(hsT) === 99999 && await btn.isVisible(),
      `本局分数“${scoreT}”（失败前 HUD 分数 ${hudBefore}），历史最高分“${hsT}”，按钮可见=${await btn.isVisible()}`);
    await btn.click();
    const st = await g.until(s => s.screen === 'start' && !s.transitioning, 5000, 100);
    const startVis = await g.page.getByRole('dialog', { name: '开始画面' }).isVisible();
    S['TS-16'].check('2 点击后回到开始画面', !!st && startVis, `screen=${st?.screen} 开始画面可见=${startVis}`);
    const ns = await g.startToPlaying();
    const h = await g.hud();
    S['TS-16'].check('3 新一局：关卡 1、分数 0、生命 3，HUD 与快照一致', ns && ns.level === 1 && ns.score === 0 && ns.lives === 3 && num(h['关卡']) === 1 && num(h['分数']) === 0 && num(h['生命']) === 3,
      `快照 关卡${ns?.level} 分数${ns?.score} 生命${ns?.lives}；HUD=${JSON.stringify(h)}`);
    // 由 levels[0].layout 展开为单元格对比
    const exp = [];
    for (const row of level1.layout) { const line = [...row].map(c => (c === 'B' || c === 'S' || c === 'W' ? c : '.').repeat(4)).join(''); for (let k = 0; k < 4; k++) exp.push(line); }
    const same = ns && ns.map.cells.join('\n') === exp.join('\n');
    S['TS-16'].check('4 新一局地图为第 1 关完整地图，指挥所未摧毁', same && ns.base.destroyed === false, `地图与 levels[0] 一致=${same}，指挥所已摧毁=${ns?.base.destroyed}`);
  } catch (e) { S['TS-14'].check('脚本执行', false, '执行异常：' + e.message); }
  return { S, g };
}

async function sharedRun(browser) {
  const { S, g } = await runShared(browser);
  for (const sc of Object.values(S)) await g.dumpEvidence(sc, 'end');
  await g.close();
  return S;
}

// ---------- TS-34 真实时间过渡 ----------
const BG = [0x10, 0x14, 0x18];
function blankRatio(buf) {
  const png = PNG.sync.read(buf); let n = 0; const d = png.data;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - BG[0]) < 6 && Math.abs(d[i + 1] - BG[1]) < 6 && Math.abs(d[i + 2] - BG[2]) < 6) n++;
  return n / (d.length / 4);
}

async function startRec(page) {
  await page.evaluate(() => {
    window.__qaRec = []; window.__qaOn = true;
    const loop = () => {
      if (!window.__qaOn) return;
      const s = window.steelDefense.snapshot();
      const dl = [...document.querySelectorAll('[role=dialog]')].filter(d => !d.hidden).map(d => ({ n: d.getAttribute('aria-label'), op: Number(getComputedStyle(d).opacity), tf: getComputedStyle(d).transform, tr: d.getAttribute('data-transition'), top: Math.round((d.firstElementChild || d).getBoundingClientRect().top * 10) / 10, an: d.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length }));
      const anyT = [...document.querySelectorAll('[data-transition]')].map(e => e.getAttribute('data-transition'));
      window.__qaRec.push({ t: Math.round(performance.now()), screen: s.screen, transitioning: s.transitioning, dl, anyT });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
async function stopRec(page) { return page.evaluate(() => { window.__qaOn = false; return window.__qaRec; }); }

async function observe(g, label, trigger, done, maxMs = 6000) {
  const shots = [];
  await startRec(g.page);
  await trigger();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const buf = await g.page.screenshot({ scale: 'css' });
    shots.push(blankRatio(buf));
    const s = await g.snap();
    if (done(s) && Date.now() - t0 > 300) break;
  }
  await g.page.waitForTimeout(200);
  const rec = await stopRec(g.page);
  const inTr = rec.filter(r => r.transitioning || r.anyT.some(v => v && v !== 'none' && v !== 'idle' && v !== 'done'));
  const partial = rec.filter(r => r.dl.some(d => d.op > 0.01 && d.op < 0.99));
  const tops = {};
  for (const r of rec) for (const d of r.dl) (tops[d.n] ||= new Set()).add(d.top);
  const moving = rec.filter(r => r.dl.some(d => d.an > 0 && d.tr) ).length + Object.values(tops).filter(s => s.size > 1).length;
  let flash = false;
  for (let i = 1; i + 1 < shots.length; i++) if (shots[i - 1] < 0.97 && shots[i] >= 0.97 && shots[i + 1] < 0.97) flash = true;
  return { label, ok: inTr.length > 0 && (partial.length > 0 || moving > 0), flash, rec, shots, obs: `${label}：读数 ${rec.length} 次，过渡进行中 ${inTr.length} 次，浮层部分透明 ${partial.length} 次，浮层移动/动画中间状态 ${moving} 次；截图 ${shots.length} 张，空白比例 ${shots.map(x => x.toFixed(2)).join(' ')}` };
}

async function ts34(browser) {
  const sc = new Scenario('TS-34'); let g;
  try {
    g = await openGame(browser, { seed: 34, clock: false });
    const page = g.page;
    const seen = {};
    seen.start = await page.getByRole('dialog', { name: '开始画面' }).isVisible();
    const r1 = await observe(g, '开始画面→关卡开场', () => g.clickStart(), s => s.screen === 'levelIntro' && !s.transitioning);
    const introText = (await page.getByRole('dialog', { name: '关卡开场' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
    seen.intro = /第\s*1\s*关/.test(introText) && /\d+/.test(introText.replace(/第\s*1\s*关/, ''));
    const r2 = await observe(g, '关卡开场→游戏进行中', async () => { }, s => s.screen === 'playing' && !s.transitioning);
    // 真实时间：在出生点朝右连续开火打穿砖墙击中指挥所
    let r3 = null;
    const deadline = Date.now() + 30000;
    await g.hold('right'); await page.waitForTimeout(30); await g.release();
    let s = await g.snap();
    while (!s.base.destroyed && s.screen === 'playing' && Date.now() < deadline) {
      if (s.player && s.player.dir !== 'right') { await g.hold('right'); await page.waitForTimeout(20); await g.release(); }
      await page.keyboard.down('Space'); await page.waitForTimeout(40); await page.keyboard.up('Space');
      await page.waitForTimeout(300);
      s = await g.snap();
      if (!s.base.destroyed && s.bullets.some(b => b.owner === 'player')) { await page.waitForTimeout(200); s = await g.snap(); }
      if (s.base.destroyed) break;
    }
    if (s.base.destroyed || s.screen !== 'playing') {
      r3 = await observe(g, '游戏进行中→失败画面', async () => { }, x => x.screen === 'gameOver' && !x.transitioning, 8000);
    }
    seen.gameOver = await page.getByRole('dialog', { name: '失败' }).isVisible();
    let r4 = null;
    if (seen.gameOver) r4 = await observe(g, '失败画面→开始画面', () => page.getByRole('dialog', { name: '失败' }).getByRole('button', { name: '返回开始画面' }).click(), x => x.screen === 'start' && !x.transitioning);
    sc.check('1 开始画面、关卡开场（含第 N 关与敌人数量）、失败画面都出现过', seen.start && seen.intro && seen.gameOver, `开始=${seen.start} 开场=${seen.intro}（${introText}） 失败=${seen.gameOver}`);
    const rs = [r1, r2, r3, r4].filter(Boolean);
    for (const r of rs) sc.check(`2 ${r.label} 有过渡`, r.ok, r.obs);
    for (const r of rs) sc.check(`3 ${r.label} 无整屏空白闪烁`, !r.flash, r.obs);
    if (!r3) sc.skip('2 游戏进行中→失败画面', '未能击中指挥所');
    sc.addEvidence(await writeEvidence('TS-34-records.json', rs.map(r => ({ label: r.label, shots: r.shots, rec: r.rec.slice(0, 400) }))));
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export const scenarios = {
  'TS-14': async b => { shared = shared || sharedRun(b); return (await shared)['TS-14']; },
  'TS-16': async b => { shared = shared || sharedRun(b); return (await shared)['TS-16']; },
  'TS-35': async b => { shared = shared || sharedRun(b); return (await shared)['TS-35']; },
  'TS-34': ts34,
};
