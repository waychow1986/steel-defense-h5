// 地形：TS-07 08 09
import { Scenario, openGame, FRAME } from '../lib.mjs';
import { goTo } from '../bot.mjs';

function tileCells(s, tx, ty) {
  const out = [];
  for (let y = ty * 4; y < ty * 4 + 4; y++) out.push(s.map.cells[y].slice(tx * 4, tx * 4 + 4));
  return out.join('/');
}

async function tileShot(g, tx, ty) {
  const b = await g.mapBox(); const t = b.width / 13;
  return g.page.screenshot({ clip: { x: b.x + tx * t, y: b.y + ty * t, width: t, height: t } });
}

// 开一枪并跟踪这颗子弹直到消失；返回 {id, path:[{x,y}], gone}
async function fireTrack(g, maxFrames = 180) {
  await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 50);
  await g.adv(600);
  const before = new Set((await g.snap()).bullets.map(b => b.id));
  await g.fire();
  let s = await g.snap();
  const nb = s.bullets.find(b => b.owner === 'player' && !before.has(b.id));
  if (!nb) return null;
  const pathPts = [{ x: nb.x, y: nb.y }];
  for (let i = 0; i < maxFrames; i++) {
    await g.adv(FRAME);
    s = await g.snap();
    const b = s.bullets.find(x => x.id === nb.id);
    if (!b) return { id: nb.id, path: pathPts, gone: true, snap: s };
    pathPts.push({ x: b.x, y: b.y });
  }
  return { id: nb.id, path: pathPts, gone: false, snap: s };
}

async function holdFor(g, dir, ms) {
  await g.hold(dir); await g.adv(ms); await g.release(); await g.adv(FRAME * 2);
  return (await g.snap()).player;
}

async function setup(browser, seed) {
  const g = await openGame(browser, { seed });
  await g.startToPlaying();
  return g;
}

export async function ts07(browser) {
  const sc = new Scenario('TS-07'); let g;
  try {
    g = await setup(browser, 7);
    // 第 1 关第 10 行第 1 列是一格厚的砖墙（水平砖墙 1～2 列），下方第 11 行为空地
    const TX = 1, TY = 10;
    if (!await goTo(g, 1.0625, 11.0625)) { sc.unreachable('未能到达砖墙前'); return sc; }
    const pc = await holdFor(g, 'up', 1500);
    sc.check('4 对照：打通前驶向砖墙停在砖墙前', pc.y >= TY + 1 - 1e-6 && pc.dir === 'up', `坦克 y=${pc.y.toFixed(3)}（砖墙下边界 y=${TY + 1}）`);
    // 退后约一格再开火，使子弹在快照中可见；最后一段向上移动使坦克朝上
    if (!await goTo(g, 1.0625, 12.0625)) { sc.unreachable('未能退到开火位置'); return sc; }
    await holdFor(g, 'up', FRAME);
    const s0 = await g.snap();
    const wall0 = tileCells(s0, TX, TY) + '|' + tileCells(s0, TX + 1, TY);
    const img0 = await tileShot(g, TX, TY);
    const t1 = await fireTrack(g);
    if (!t1) { sc.check('1 第一枪：子弹在砖墙处消失', false, '开火后没有出现玩家子弹'); return sc; }
    const minY = Math.min(...t1.path.map(p => p.y));
    sc.check('1 第一枪：子弹在砖墙处消失', t1.gone && minY >= TY - 0.25, `子弹最高到 y=${minY.toFixed(2)}，${t1.gone ? '已消失' : '未消失'}`);
    await g.adv(500);
    const s1 = await g.snap();
    const wall1 = tileCells(s1, TX, TY) + '|' + tileCells(s1, TX + 1, TY);
    const changed = [...wall0].filter((c, i) => c === 'B' && wall1[i] === '.').length;
    const remain = [...wall1].filter(c => c === 'B').length;
    sc.check('1 第一枪：部分砖块变空地、同一面砖墙仍有其余砖块', changed > 0 && remain > 0, `变为空地 ${changed} 块，剩余砖块 ${remain} 块；前=${wall0} 后=${wall1}`);
    const img1 = await tileShot(g, TX, TY);
    sc.check('2 截图对比：击中处画面发生变化', !img0.equals(img1), `击中前后砖墙格截图${img0.equals(img1) ? '相同' : '不同'}`);
    // 连续开枪直到坦克正前方（第 1 列）砖墙被打通
    let open = false, shots = 1;
    for (; shots < 30 && !open; shots++) {
      await fireTrack(g);
      const s = await g.snap();
      open = !tileCells(s, TX, TY).includes('B');
    }
    if (!open) { sc.skip('3 打通后可驶入', `开 ${shots} 枪后正前方砖墙仍未打通`); return sc; }
    const t2 = await fireTrack(g, 240);
    const minY2 = t2 ? Math.min(...t2.path.map(p => p.y)) : NaN;
    sc.check('3 打通后：子弹从缺口飞过不消失', !!t2 && minY2 < TY - 0.5, `子弹最高到 y=${minY2.toFixed?.(2)}（原砖墙上边界 y=${TY}）`);
    const pp = await holdFor(g, 'up', 1200);
    sc.check('3 打通后：坦克驶入并越过原砖墙格', pp.y + 0.875 <= TY + 1e-6 || pp.y < TY - 0.5, `坦克 y=${pp.y.toFixed(3)}（原砖墙格 y∈[${TY},${TY + 1})）`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts08(browser) {
  const sc = new Scenario('TS-08'); let g;
  try {
    g = await setup(browser, 8);
    // 第 1 关第 8 行第 0 列是钢墙，下方第 9 行为空地
    const TX = 0, TY = 8;
    if (!await goTo(g, 0.0625, 10.4)) { sc.unreachable('未能到达钢墙前'); return sc; }
    if (!await goTo(g, 0.0625, 10.0625)) { sc.unreachable('未能到达钢墙前'); return sc; }
    await holdFor(g, 'up', FRAME);
    await g.adv(1000);
    const s0 = await g.snap(); const c0 = tileCells(s0, TX, TY);
    const img0 = await tileShot(g, TX, TY);
    const obs = []; let allGone = true;
    for (let i = 0; i < 5; i++) {
      const t = await fireTrack(g);
      if (!t) { const q = (await g.snap()).player; allGone = false; obs.push(`第${i + 1}枪未出现子弹（坦克 ${q.x.toFixed(2)},${q.y.toFixed(2)},${q.dir}）`); continue; }
      const minY = Math.min(...t.path.map(p => p.y));
      const ok = t.gone && minY >= TY + 0.5;
      if (!ok) allGone = false;
      obs.push(`第${i + 1}枪最高 y=${minY.toFixed(2)}${t.gone ? '消失' : '未消失'}`);
    }
    sc.check('1 每颗子弹在钢墙处消失', allGone, obs.join('；'));
    await g.adv(1500);
    const s1 = await g.snap(); const c1 = tileCells(s1, TX, TY);
    sc.check('2 5 次后该钢墙单元全部仍为钢墙', c1 === 'SSSS/SSSS/SSSS/SSSS' && c0 === c1, `前=${c0} 后=${c1}`);
    const img1 = await tileShot(g, TX, TY);
    sc.check('2 击中前后钢墙区域截图相同（效果消失后）', img0.equals(img1), `钢墙格截图${img0.equals(img1) ? '相同' : '不同'}`);
    const p = await holdFor(g, 'up', 2000);
    sc.check('3 坦克停在钢墙前不进入', p.y >= TY + 1 - 1e-6, `坦克 y=${p.y.toFixed(3)}（钢墙下边界 y=${TY + 1}）`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts09(browser) {
  const sc = new Scenario('TS-09'); let g;
  try {
    g = await setup(browser, 9);
    // 第 1 关第 4 行第 3 列是水面，上方第 3 行空地，第 2 行同列是砖墙
    const TX = 3, TY = 4;
    if (!await goTo(g, 3.0625, 5.0625)) { sc.unreachable('未能到达水边'); return sc; }
    const s0 = await g.snap(); const c0 = tileCells(s0, TX, TY);
    const p = await holdFor(g, 'up', 2000);
    sc.check('1 坦克不进入水面单元，停在水边', p.y >= TY + 1 - 1e-6 && p.dir === 'up', `坦克 y=${p.y.toFixed(3)}（水面下边界 y=${TY + 1}）`);
    const t = await fireTrack(g, 240);
    if (!t) { sc.check('2 子弹越过水面继续飞行', false, '开火后没有出现玩家子弹'); return sc; }
    const beyond = t.path.filter(q => q.y < TY - 0.1);
    const s1 = await g.snap(); const c1 = tileCells(s1, TX, TY);
    sc.check('2 子弹越过水面继续飞行', beyond.length >= 2, `子弹轨迹 y：${t.path.filter((_, i) => i % 5 === 0).map(q => q.y.toFixed(2)).join(' ')}；越过水面后仍存在的读数 ${beyond.length} 次`);
    sc.check('2 水面单元不变', c0 === c1 && /^[W\/]+$/.test(c1), `前=${c0} 后=${c1}`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export const scenarios = { 'TS-07': ts07, 'TS-08': ts08, 'TS-09': ts09 };
