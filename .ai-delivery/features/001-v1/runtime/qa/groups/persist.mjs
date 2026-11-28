// TS-27 历史最高分：进行中即保存、关闭重开仍保留、较低分数不覆盖（持久浏览器上下文 + 伪时钟）
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Scenario, openGame, DESKTOP, HS_KEY } from '../lib.mjs';
import { Bot, goTo } from '../bot.mjs';
import { shootBase } from './base.mjs';

const SPAWN = [4.0625, 12.0625];
const num = t => { const m = /-?\d+/.exec(t || ''); return m ? Number(m[0]) : null; };
const stored = g => g.page.evaluate(k => localStorage.getItem(k), HS_KEY);

async function startHs(g) {
  const t = await g.page.getByRole('dialog', { name: '开始画面' }).getByRole('status', { name: '历史最高分' }).innerText().catch(() => '');
  return { t: t.trim(), n: num(t) };
}

async function ts27() {
  const sc = new Scenario('TS-27');
  const dir = fs.mkdtempSync(path.join(process.cwd(), 'qa-profile-'));
  const launch = () => chromium.launchPersistentContext(dir, { ...DESKTOP });
  let g = null;
  try {
    // 第 1 步：预置 50，玩到分数超过 50
    g = await openGame(null, { context: await launch(), seed: 27, highScore: 50 });
    const h0 = await startHs(g);
    if (h0.n !== 50) { sc.unreachable(`预置历史最高分 50 未生效（开始画面显示“${h0.t}”）`); return sc; }
    await g.startToPlaying();
    const bot = new Bot(g, { shoot: true, dodge: true, pickup: false });
    let first = null, eq50 = null;
    const r1 = await bot.run({
      maxMs: 240000, stop: s => s.score > 50 || s.screen === 'gameOver',
      onSnap: async (prev, s) => { if (!eq50 && s.score === 50) eq50 = { score: s.score, saved: await stored(g) }; if (!first && s.score > 50) first = { score: s.score, saved: await stored(g) }; },
    });
    if (!first) { sc.unreachable(`未能使本局分数超过 50（最终 screen=${r1?.screen} 分数=${r1?.score}）`); return sc; }
    if (eq50) sc.check('1a 本局分数等于 50 时（等于一侧）保存值仍为 50', Number(eq50.saved) === 50, `分数 50 时保存值“${eq50.saved}”`);
    sc.check('1 本局分数超过 50 的时刻，本地保存的最高分已等于本局分数（进行中即保存）', Number(first.saved) === first.score, `首次超过 50：本局分数 ${first.score}，保存值“${first.saved}”，screen=${r1.screen}`);
    let second = null;
    const r2 = await bot.run({
      maxMs: 240000, stop: s => s.score > first.score || s.screen === 'gameOver',
      onSnap: async (prev, s) => { if (!second && s.score > first.score) second = { score: s.score, saved: await stored(g) }; },
    });
    if (second) sc.check('1b 本局分数继续增加时保存值随之增加', Number(second.saved) === second.score, `分数 ${first.score}→${second.score}，保存值“${second.saved}”`);
    else sc.skip('1b 本局分数继续增加时保存值随之增加', `本局未能再得分（screen=${r2?.screen}）`);
    const s1 = await g.snap();
    const saved1 = Number(await stored(g));
    const score1 = s1.score;
    sc.check('1c 关闭前保存值等于本局分数', saved1 === score1 && s1.screen !== 'gameOver', `关闭前 screen=${s1.screen} 本局分数 ${score1}，保存值 ${saved1}`);
    // 第 2 步：不结束本局，关闭整个上下文后重开
    await g.close(); g = null;
    g = await openGame(null, { context: await launch(), seed: 27 });
    const s2 = await g.snap();
    const h2 = await startHs(g);
    const startVis = await g.page.getByRole('dialog', { name: '开始画面' }).isVisible();
    sc.check('2 重新打开回到开始画面，历史最高分显示关闭前的本局分数', s2.screen === 'start' && startVis && h2.n === score1, `screen=${s2.screen} 开始画面可见=${startVis}，历史最高分“${h2.t}”，期望 ${score1}`);
    // 第 3 步：新一局以低分失败
    await g.startToPlaying();
    const ns = await g.snap();
    if (!await goTo(g, ...SPAWN, 30000)) { sc.skip('3 较低分数失败后不覆盖', '未能回到出生点'); }
    else {
      const end = await shootBase(g);
      const st = await g.until(s => s.screen === 'gameOver' && !s.transitioning, 5000, 100);
      if (!st) sc.skip('3 较低分数失败后不覆盖', `未能以失败结束（screen=${end?.screen}）`);
      else {
        const dlg = g.page.getByRole('dialog', { name: '失败' });
        const sT = (await dlg.getByRole('status', { name: '本局分数' }).innerText().catch(() => '')).trim();
        const hT = (await dlg.getByRole('status', { name: '历史最高分' }).innerText().catch(() => '')).trim();
        sc.check('3 失败画面历史最高分仍为第 1 步的分数（本局分数更低）', num(hT) === score1 && st.score < score1, `本局分数“${sT}”（快照 ${st.score}，开局 ${ns.score}），历史最高分“${hT}”，期望 ${score1}`);
        await dlg.getByRole('button', { name: '返回开始画面' }).click();
        await g.until(s => s.screen === 'start' && !s.transitioning, 5000, 100);
        const h3 = await startHs(g);
        sc.check('3b 返回后开始画面历史最高分仍为第 1 步的分数', h3.n === score1, `开始画面历史最高分“${h3.t}”，保存值“${await stored(g)}”，期望 ${score1}`);
      }
    }
    // 第 4 步：再次关闭重开
    await g.close(); g = null;
    g = await openGame(null, { context: await launch(), seed: 27 });
    const h4 = await startHs(g);
    sc.check('4 再次重新打开后仍显示第 1 步的分数', h4.n === score1, `开始画面历史最高分“${h4.t}”，期望 ${score1}`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally {
    if (g) { await g.dumpEvidence(sc, 'end').catch(() => { }); await g.close(); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return sc;
}

export const scenarios = { 'TS-27': ts27 };
