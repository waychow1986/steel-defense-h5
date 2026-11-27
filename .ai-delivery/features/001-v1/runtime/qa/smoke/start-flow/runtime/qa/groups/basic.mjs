// 不需要长时间等待的场景：TS-01 02 03 04 05 06 10 21 26 38 40 41
import { Scenario, openGame, DESKTOP, mobile, DIRKEY, WASD, TOUCHNAME, DV, FRAME, rectInter, cueCount, log, writeEvidence } from '../lib.mjs';
import { goTo } from '../bot.mjs';

const BANNED = ['坦克大战', 'Battle City', 'Tank 1990', '坦克1990', '坦克世界', 'World of Tanks', '90坦克', 'Tank Force', 'Tank Battalion'];

async function allText(page) {
  return page.evaluate(() => {
    const parts = [document.title, document.body.innerText];
    document.querySelectorAll('[aria-label],[alt],[title]').forEach(e => parts.push(e.getAttribute('aria-label') || '', e.getAttribute('alt') || '', e.getAttribute('title') || ''));
    return parts.join('\n');
  });
}

async function wrap(sc, g, fn) {
  try { await fn(); } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); } }
}

export async function ts01(browser) {
  const sc = new Scenario('TS-01'); let g;
  await wrap(sc, null, async () => {
    g = await openGame(browser, { seed: 1 });
    const p = g.page;
    sc.check('1 标题“钢铁防线”', await p.getByRole('heading', { name: '钢铁防线' }).count() > 0, 'heading 数=' + await p.getByRole('heading', { name: '钢铁防线' }).count());
    sc.check('2 “怎么玩”说明区域', await p.getByRole('region', { name: '怎么玩' }).count() > 0, 'region 怎么玩');
    const texts = [await allText(p)];
    await g.clickStart(); await g.adv(300); texts.push(await allText(p));
    await g.until(s => s.screen === 'playing' && !s.transitioning, 6000); texts.push(await allText(p));
    const all = texts.join('\n');
    const found = BANNED.filter(n => all.toLowerCase().includes(n.toLowerCase()));
    sc.check('3 不出现现有游戏名称', found.length === 0, found.length ? '出现：' + found.join('、') : '名单中名称均未出现；title=' + await p.title());
    sc.addEvidence(await writeEvidence('TS-01-texts.txt', all));
    await g.dumpEvidence(sc, 'end'); await g.close();
  });
  return sc;
}

export async function ts02(browser) {
  const sc = new Scenario('TS-02');
  for (const [tag, dev] of [['电脑', DESKTOP], ['手机', mobile(390, 844)]]) {
    let g;
    try {
      g = await openGame(browser, { seed: 2, device: dev });
      const p = g.page;
      const s0 = await g.snap();
      const dlg = p.getByRole('dialog', { name: '开始画面' });
      const vis = await dlg.isVisible();
      const hasTitle = (await p.getByRole('heading', { name: '钢铁防线' }).isVisible()) || /钢铁防线/.test(await dlg.innerText()) ? 1 : 0;
      const hasBtn = await dlg.getByRole('button', { name: '开始游戏' }).count();
      const txt = (await dlg.innerText()).replace(/\s+/g, ' ');
      sc.check(`1 ${tag}：首屏为开始画面且有标题、开始按钮、说明`, s0.screen === 'start' && vis && hasTitle > 0 && hasBtn > 0 && txt.length > 20,
        `screen=${s0.screen} 可见=${vis} 标题=${hasTitle} 按钮=${hasBtn} 文字=${txt.slice(0, 80)}`);
      if (!dev.hasTouch) {
        for (const k of ['ArrowUp', 'ArrowLeft', 'Space']) { await p.keyboard.down(k); await g.adv(200); await p.keyboard.up(k); }
      } else {
        await p.touchscreen.tap(5, 5);
      }
      await g.adv(300);
      const s1 = await g.snap();
      const pb = s1.bullets.filter(b => b.owner === 'player').length;
      sc.check(`2 ${tag}：开始画面期间按键不操作坦克`, s1.screen === 'start' && pb === 0 && JSON.stringify(s1.player) === JSON.stringify(s0.player),
        `screen=${s1.screen} 玩家子弹=${pb} player前=${JSON.stringify(s0.player)} 后=${JSON.stringify(s1.player)}`);
      await g.clickStart();
      let introSeen = false, introText = '';
      for (let i = 0; i < 40 && !introSeen; i++) {
        const d = p.getByRole('dialog', { name: '关卡开场' });
        if (await d.isVisible()) { introText = (await d.innerText()).replace(/\s+/g, ' '); introSeen = /第\s*1\s*关/.test(introText); }
        if (!introSeen) await g.adv(50);
      }
      const s2 = await g.until(s => s.screen === 'playing' && !s.transitioning, 8000);
      sc.check(`3 ${tag}：出现“第 1 关”开场后进入游戏`, introSeen && s2 && s2.level === 1,
        `开场文字=${introText} 之后 screen=${s2?.screen} level=${s2?.level}`);
      sc.addEvidence(await g.shot(`TS-02-${tag}-playing.png`) || '');
    } catch (e) { sc.check(`${tag} 脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { await g.dumpEvidence(sc, tag); await g.close(); } }
  }
  return sc;
}

export async function ts03(browser) {
  const sc = new Scenario('TS-03');
  for (const [tag, dev] of [['电脑', DESKTOP], ['手机', mobile(390, 844)]]) {
    let g;
    try {
      g = await openGame(browser, { seed: 1, device: dev });
      const r = g.page.getByRole('region', { name: '怎么玩' });
      const t = (await r.innerText()).replace(/\s+/g, ' ');
      sc.addEvidence(await writeEvidence(`TS-03-${tag}.txt`, t));
      sc.check(`1 ${tag}：方向键与 W/A/S/D`, /方向键/.test(t) && /W/.test(t) && /A/.test(t) && /S/.test(t) && /D/.test(t), t.slice(0, 300));
      sc.check(`2 ${tag}：空格开火`, /空格/.test(t), '');
      sc.check(`3 ${tag}：手机虚拟方向键与开火按钮`, /(虚拟|屏幕|手机)/.test(t) && /方向键/.test(t) && /开火/.test(t), '');
      sc.check(`4 ${tag}：目标为消灭敌方坦克、守住指挥所`, /消灭/.test(t) && /敌/.test(t) && /指挥所/.test(t) && /(守|保护)/.test(t), '');
      sc.check(`5 ${tag}：静音模式可能听不到音效的提示`, /静音/.test(t) && /(听不到|听不见|没有声音|无声)/.test(t) && /音效|声音/.test(t), '');
      if (dev.hasTouch) {
        const box = await r.boundingBox();
        const vw = dev.viewport.width;
        const sw = await g.page.evaluate(() => document.documentElement.scrollWidth);
        const visible = await r.isVisible();
        sc.check('手机：说明区域可见、不需横向滚动', visible && box && box.x >= -0.5 && box.x + box.width <= vw + 0.5 && sw <= vw,
          `box=${JSON.stringify(box)} 视口宽=${vw} scrollWidth=${sw}`);
      }
    } catch (e) { sc.check(`${tag} 脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { await g.dumpEvidence(sc, tag); await g.close(); } }
  }
  return sc;
}

// 按住移动一段时间，每 100ms 读快照；返回 {ok, obs}
async function holdMove(g, dir, ms, press, release) {
  const s0 = await g.snap(); const p0 = s0.player;
  await press();
  const reads = []; let t = 0;
  while (t < ms) { await g.adv(100); t += 100; const s = await g.snap(); reads.push(s.player); }
  await release();
  await g.adv(FRAME);
  const relPos = (await g.snap()).player;
  await g.adv(500 - FRAME);
  const after = (await g.snap()).player;
  const [dx, dy] = DV[dir];
  let prog = true, axis = true, dirOk = true, prev = p0;
  // 转向时允许首次读数对齐网格（不超过半格的 1/4），其后垂直轴坐标必须保持不变
  const r0 = reads[0];
  if (r0 && (dx === 0 ? Math.abs(r0.x - p0.x) : Math.abs(r0.y - p0.y)) > 0.125) axis = false;
  for (const r of reads) {
    if (!r) { prog = false; continue; }
    const d = (r.x - prev.x) * dx + (r.y - prev.y) * dy;
    if (!(d > 0.001)) prog = false;
    if (r0 && (dx === 0 ? Math.abs(r.x - r0.x) > 0.001 : Math.abs(r.y - r0.y) > 0.001)) axis = false;
    if (r.dir !== dir) dirOk = false;
    prev = r;
  }
  const stopped = after && relPos && Math.abs(after.x - relPos.x) < 1e-6 && Math.abs(after.y - relPos.y) < 1e-6;
  const after2 = (await g.snap()).player;
  const stillAfter = after && after2 && after.x === after2.x && after.y === after2.y;
  await g.adv(300);
  const after3 = (await g.snap()).player;
  const still = after && after3 && after.x === after3.x && after.y === after3.y && stillAfter;
  return {
    move: dirOk && prog && axis, stop: !!(stopped && still && after.dir === dir), after,
    obs: `起点(${p0.x.toFixed(3)},${p0.y.toFixed(3)}) 读数=${reads.map(r => r && `${r.dir}(${r.x.toFixed(2)},${r.y.toFixed(2)})`).join(' ')} 松开时=(${relPos?.x.toFixed(3)},${relPos?.y.toFixed(3)}) 再0.5s=(${after?.x.toFixed(3)},${after?.y.toFixed(3)},${after?.dir}) 再0.3s=(${after3?.x.toFixed(3)},${after3?.y.toFixed(3)})`,
  };
}

async function fireCheck(g, fireFn) {
  await g.until(s => !s.bullets.some(b => b.owner === 'player'), 3000, 50);
  await g.adv(600);
  const s0 = await g.snap(); const dir = s0.player.dir;
  const before = new Set(s0.bullets.map(b => b.id));
  await fireFn();
  const s1 = await g.snap();
  const nb = s1.bullets.filter(b => b.owner === 'player' && !before.has(b.id));
  if (!nb.length) return { ok: false, obs: `朝向${dir} 开火后没有新的玩家子弹` };
  const b = nb[0];
  await g.adv(FRAME * 2);
  const b2 = (await g.snap()).bullets.find(x => x.id === b.id);
  const [dx, dy] = DV[dir];
  const moved = b2 ? ((b2.x - b.x) * dx + (b2.y - b.y) * dy > 0 && Math.abs((b2.x - b.x) * dy) + Math.abs((b2.y - b.y) * dx) < 1e-6) : true;
  return { ok: b.dir === dir && moved, obs: `朝向${dir} 子弹dir=${b.dir} (${b.x.toFixed(2)},${b.y.toFixed(2)})→${b2 ? `(${b2.x.toFixed(2)},${b2.y.toFixed(2)})` : '已消失'}` };
}

// 键盘/触摸共用的 8 向（或 4 向）测试。A 点 (3.0625,5.0625)：右、下、左方向都有空地
async function moveSuite(sc, g, keys, label, pressFor, fireFn) {
  const A = [3.0625, 5.0625];
  if (!await goTo(g, ...A)) { sc.check(`${label} 移动到测试位置`, false, '未能到达测试位置'); return false; }
  const seq = keys; // [{dir, key, ms}]
  for (const k of seq) {
    const r = await holdMove(g, k.dir, k.ms, () => pressFor(k, true), () => pressFor(k, false));
    sc.check(`1 ${label} ${k.name}：朝向与持续移动`, r.move, r.obs);
    sc.check(`1 ${label} ${k.name}：松开后停止且朝向保持`, r.stop, r.obs);
    if (k.fire) {
      const f = await fireCheck(g, fireFn);
      sc.check(`2 ${label} 朝${k.dir}开火：子弹沿车头方向`, f.ok, f.obs);
    }
    if (k.back) { await goTo(g, ...A); }
  }
  return true;
}

export async function ts04(browser) {
  const sc = new Scenario('TS-04'); let g;
  try {
    g = await openGame(browser, { seed: 4 });
    const p = g.page;
    await g.clickStart();
    await g.until(s => s.screen === 'levelIntro' && s.player, 3000, 50);
    const si = await g.snap();
    for (const k of ['ArrowUp', 'ArrowLeft', 'Space']) { await p.keyboard.down(k); await g.adv(100); await p.keyboard.up(k); }
    const si2 = await g.snap();
    sc.check('5 对照：开场提示期间按键无效', si2.screen === 'levelIntro' && si2.bullets.filter(b => b.owner === 'player').length === 0 && (!si.player || (si.player.x === si2.player?.x && si.player.y === si2.player?.y)),
      `screen=${si2.screen} 前=${JSON.stringify(si.player && [si.player.x, si.player.y])} 后=${JSON.stringify(si2.player && [si2.player.x, si2.player.y])} 子弹=${si2.bullets.length}`);
    await g.until(s => s.screen === 'playing' && !s.transitioning, 6000);
    const keys = [
      { name: '→', dir: 'right', key: 'ArrowRight', ms: 450, fire: true },
      { name: 'D', dir: 'right', key: 'KeyD', ms: 450 },
      { name: '←', dir: 'left', key: 'ArrowLeft', ms: 450, fire: true },
      { name: 'A', dir: 'left', key: 'KeyA', ms: 450, back: true },
      { name: '↓', dir: 'down', key: 'ArrowDown', ms: 450, fire: true },
      { name: 'S', dir: 'down', key: 'KeyS', ms: 450 },
      { name: '↑', dir: 'up', key: 'ArrowUp', ms: 400, fire: true },
      { name: 'W', dir: 'up', key: 'KeyW', ms: 400, back: true },
    ];
    const press = async (k, down) => down ? p.keyboard.down(k.key) : p.keyboard.up(k.key);
    if (await moveSuite(sc, g, keys, '键盘', press, () => g.fire())) {
      // 3 多键：在 (5.8125,5.0625) 处上方与左方都有空地
      if (await goTo(g, 7.0625, 5.0625)) {
        await p.keyboard.down('ArrowLeft'); await g.adv(150);
        await p.keyboard.down('ArrowUp'); await g.adv(100);
        const a = await g.snap(); await g.adv(150); const b = await g.snap();
        sc.check('3 多键：按住←再按住↑ → 朝上并向上移动', a.player.dir === 'up' && b.player.dir === 'up' && b.player.y < a.player.y - 0.01,
          `(${a.player.x.toFixed(2)},${a.player.y.toFixed(2)},${a.player.dir})→(${b.player.x.toFixed(2)},${b.player.y.toFixed(2)},${b.player.dir})`);
        await p.keyboard.up('ArrowUp'); await g.adv(100);
        const c = await g.snap(); await g.adv(150); const d = await g.snap();
        sc.check('3 多键：松开↑（仍按←）→ 转向左并向左移动', c.player.dir === 'left' && d.player.dir === 'left' && d.player.x < c.player.x - 0.01,
          `(${c.player.x.toFixed(2)},${c.player.y.toFixed(2)},${c.player.dir})→(${d.player.x.toFixed(2)},${d.player.y.toFixed(2)},${d.player.dir})`);
        await p.keyboard.up('ArrowLeft');
      }
      // 4 障碍：A 点上方是水面（第 4 行）
      if (await goTo(g, 3.0625, 5.0625)) {
        await p.keyboard.down('ArrowUp'); await g.adv(2000); const s = await g.snap(); await p.keyboard.up('ArrowUp');
        sc.check('4 朝水面按住 2 秒：停在障碍前不进入', s.player.y >= 5 - 1e-6, `坦克 y=${s.player.y.toFixed(3)}（水面在第 4 行，下边界 y=5）`);
      }
    }
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

async function tdown(p, name, id) {
  await p.getByRole('button', { name, exact: true }).dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true });
}
async function tup(p, name, id) {
  await p.getByRole('button', { name, exact: true }).dispatchEvent('pointerup', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true });
}

export async function ts05(browser) {
  const sc = new Scenario('TS-05'); let g;
  try {
    g = await openGame(browser, { seed: 5, device: mobile(390, 844) });
    const p = g.page;
    await g.startToPlaying();
    const grp = p.getByRole('group', { name: '方向键' });
    const names = [];
    for (const n of ['向上', '向下', '向左', '向右']) if (await grp.getByRole('button', { name: n, exact: true }).isVisible()) names.push(n);
    const fireVis = await p.getByRole('button', { name: '开火', exact: true }).isVisible();
    sc.check('1 显示方向键组与开火按钮', names.length === 4 && fireVis, `可见方向键=${names.join(',')} 开火=${fireVis}`);
    const keys = [
      { name: '向右', dir: 'right', ms: 450, fire: true },
      { name: '向左', dir: 'left', ms: 450, fire: true, back: true },
      { name: '向下', dir: 'down', ms: 450, fire: true },
      { name: '向上', dir: 'up', ms: 400, fire: true, back: true },
    ];
    const press = async (k, down) => down ? tdown(p, k.name, 1) : tup(p, k.name, 1);
    const fireFn = async () => { await tdown(p, '开火', 2); await g.adv(FRAME); await tup(p, '开火', 2); };
    // 把方向键检查点与开火检查点归入规格中的编号
    const proxy = { check: (step, ok, obs) => sc.check(step.replace(/^1 /, '2 ').replace(/^2 触摸 朝/, '3 触摸“开火”朝'), ok, obs) };
    if (await moveSuite(proxy, g, keys, '触摸', press, fireFn)) {
      if (await goTo(g, 7.0625, 5.0625)) {
        await tdown(p, '向左', 1); await g.adv(150);
        await tdown(p, '向上', 3); await g.adv(100);
        const a = await g.snap(); await g.adv(150); const b = await g.snap();
        sc.check('4 按住“向左”再按住“向上” → 向上移动', b.player.dir === 'up' && b.player.y < a.player.y - 0.01,
          `(${a.player.x.toFixed(2)},${a.player.y.toFixed(2)},${a.player.dir})→(${b.player.x.toFixed(2)},${b.player.y.toFixed(2)},${b.player.dir})`);
        await tup(p, '向上', 3); await g.adv(100);
        const c = await g.snap(); await g.adv(150); const d = await g.snap();
        sc.check('4 抬起“向上” → 转为向左', d.player.dir === 'left' && d.player.x < c.player.x - 0.01,
          `(${c.player.x.toFixed(2)},${c.player.y.toFixed(2)},${c.player.dir})→(${d.player.x.toFixed(2)},${d.player.y.toFixed(2)},${d.player.dir})`);
        await tup(p, '向左', 1);
      } else sc.check('4 移动到多键测试位置', false, '未能到达');
    }
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

async function rects(p) {
  const grp = p.getByRole('group', { name: '方向键' });
  const btns = { 方向键: await grp.boundingBox() };
  for (const n of ['向上', '向下', '向左', '向右']) btns[n] = await grp.getByRole('button', { name: n, exact: true }).boundingBox();
  btns['开火'] = await p.getByRole('button', { name: '开火', exact: true }).boundingBox();
  const info = {};
  const hud = p.getByRole('group', { name: '战况' });
  for (const n of ['关卡', '分数', '生命', '剩余敌人']) info[n] = await hud.getByRole('status', { name: n, exact: true }).boundingBox();
  const map = await p.getByRole('img', { name: '战场' }).boundingBox();
  return { btns, info, map, hud: await hud.boundingBox() };
}

export async function ts06(browser) {
  const sc = new Scenario('TS-06');
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    let g;
    try {
      g = await openGame(browser, { seed: 6, device: mobile(w, h) });
      const p = g.page;
      await g.clickStart();
      const si = await g.until(s => s.screen === 'levelIntro', 3000, 50);
      for (const phase of ['开场提示', '游戏进行中']) {
        if (phase === '游戏进行中') await g.until(s => s.screen === 'playing' && !s.transitioning, 6000);
        const r = await rects(p);
        const bad1 = [], bad2 = [], bad3 = [];
        for (const [bn, br] of Object.entries(r.btns)) {
          if (!br) { bad1.push(bn + '无矩形'); continue; }
          if (rectInter(br, r.map) > 0) bad1.push(bn);
          for (const [inn, ir] of Object.entries(r.info)) if (!ir || rectInter(br, ir) > 0) bad2.push(`${bn}×${inn}`);
        }
        const all = { ...r.btns, ...r.info, 地图: r.map };
        for (const [n, b] of Object.entries(all)) if (!b || b.x < -0.5 || b.y < -0.5 || b.x + b.width > w + 0.5 || b.y + b.height > h + 0.5) bad3.push(n);
        const ev = await writeEvidence(`TS-06-${w}-${phase}.json`, r); sc.addEvidence(ev);
        sc.check(`1 ${w}×${h} ${phase}：虚拟按键与地图不相交`, bad1.length === 0, bad1.length ? '相交：' + bad1.join(',') : '交集面积均为 0');
        sc.check(`2 ${w}×${h} ${phase}：虚拟按键与四项信息不相交`, bad2.length === 0, bad2.length ? '相交：' + bad2.join(',') : '交集面积均为 0');
        sc.check(`3 ${w}×${h} ${phase}：元素都在可视区域内`, bad3.length === 0, bad3.length ? '超出：' + bad3.join(',') : '全部在视口内');
        if (phase === '游戏进行中') {
          const m = r.map;
          const pts = [[m.x + 1, m.y + 1], [m.x + m.width - 1, m.y + 1], [m.x + 1, m.y + m.height - 1], [m.x + m.width - 1, m.y + m.height - 1], [m.x + m.width / 2, m.y + m.height / 2]];
          for (const ir of Object.values(r.info)) if (ir) pts.push([ir.x + ir.width / 2, ir.y + ir.height / 2]);
          const hits = await p.evaluate((pts) => pts.map(([x, y]) => {
            const e = document.elementFromPoint(x, y); if (!e) return 'none';
            const grp = [...document.querySelectorAll('[role=group]')].find(g => g.getAttribute('aria-label') === '方向键');
            const fireBtn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === '开火');
            return (grp && grp.contains(e)) || (fireBtn && fireBtn.contains(e)) ? 'covered' : (e.tagName + (e.id ? '#' + e.id : ''));
          }), pts);
          sc.check(`4 ${w}×${h} 命中测试：地图四角与中心、四项信息中心不被虚拟按键盖住`, !hits.includes('covered'), hits.join(','));
        }
      }
    } catch (e) { sc.check(`${w} 脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { await g.dumpEvidence(sc, String(w)); await g.close(); } }
  }
  return sc;
}

function hasThree(rows) { const t = rows.join(''); return t.includes('B') && t.includes('S') && t.includes('W'); }
export function layoutMatchesCells(layout, cells) {
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
    const ch = layout[r][c]; if (!'.BSW'.includes(ch)) continue;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (cells[r * 4 + i][c * 4 + j] !== ch) return `(${r},${c})`;
  }
  return null;
}

export async function ts10(browser) {
  const sc = new Scenario('TS-10'); let g;
  try {
    g = await openGame(browser, { seed: 10 });
    await g.startToPlaying();
    const s = await g.snap();
    const r = s.levels.map(l => `${l.level}:${hasThree(l.layout)}`);
    sc.check('1 5 关布局都同时含砖、钢、水', s.levels.length === 5 && s.levels.every(l => hasThree(l.layout)), r.join(' '));
    const mm = layoutMatchesCells(s.levels[0].layout, s.map.cells);
    sc.check('2 第 1 关实际地图含三种地形且与布局一致', hasThree(s.map.cells) && !mm, mm ? '不一致位置 ' + mm : '一致');
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts21(browser) {
  const sc = new Scenario('TS-21'); let g;
  try {
    g = await openGame(browser, { seed: 21 });
    await g.clickStart();
    let txt = '';
    for (let i = 0; i < 40; i++) { const d = g.page.getByRole('dialog', { name: '关卡开场' }); if (await d.isVisible()) { txt = (await d.innerText()).replace(/\s+/g, ' '); if (/第\s*1\s*关/.test(txt)) break; } await g.adv(50); }
    const s = await g.snap(); const L = s.levels;
    sc.addEvidence(await writeEvidence('TS-21-levels.json', L.map(l => ({ level: l.level, total: l.total, byType: l.byType }))));
    sc.check('1 恰好 5 关', L.length === 5, `关数=${L.length}`);
    const strong = l => l.byType.fast + l.byType.heavy;
    const totals = L.map(l => l.total), st = L.map(strong);
    sc.check('2 每关敌人总数严格多于上一关', totals.every((t, i) => i === 0 || t > totals[i - 1]), `总数=${totals.join(',')}`);
    sc.check('3 较强类型数量不少于上一关', st.every((t, i) => i === 0 || t >= st[i - 1]), `快速+重甲=${st.join(',')}`);
    sc.check('4 第 5 关较强类型多于第 1 关', st[4] > st[0], `${st[0]} → ${st[4]}`);
    const sums = L.every(l => l.byType.normal + l.byType.fast + l.byType.heavy === l.total);
    const lay = new Set(L.map(l => l.layout.join('|')));
    sc.check('5 各类型之和等于总数，5 关布局两两不同', sums && lay.size === 5, `和一致=${sums} 不同布局数=${lay.size}`);
    const nums = (txt.replace(/第\s*1\s*关/, '').match(/\d+/g) || []).map(Number);
    sc.check('6 第 1 关开场提示敌人数等于数据', nums.includes(L[0].total), `开场文字=${txt} 数据总数=${L[0].total}`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts26(browser) {
  const sc = new Scenario('TS-26');
  for (const [tag, hs, exp] of [['A 不预置', undefined, '0'], ['B 预置 50', 50, '50']]) {
    let g;
    try {
      g = await openGame(browser, { seed: 26, highScore: hs });
      const t = (await g.page.getByRole('dialog', { name: '开始画面' }).getByRole('status', { name: '历史最高分' }).innerText()).trim();
      const nums = t.match(/\d+/g) || [];
      sc.check(`${tag}：历史最高分显示 ${exp}`, nums.length === 1 && nums[0] === exp, `显示“${t}”`);
    } catch (e) { sc.check(`${tag} 脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { await g.dumpEvidence(sc, tag[0]); await g.close(); } }
  }
  return sc;
}

export async function ts38(browser) {
  const sc = new Scenario('TS-38'); let g;
  try {
    g = await openGame(browser, { seed: 38 });
    const p = g.page;
    const mute = () => p.getByRole('button', { name: '静音' });
    const s0 = await g.snap();
    const pr0 = await mute().getAttribute('aria-pressed');
    const visStart = await mute().isVisible();
    await g.startToPlaying(); await g.adv(300);
    const s1 = await g.snap();
    const visGame = await mute().isVisible();
    sc.check('1 默认有声、开始与游戏中都能看到静音按钮、背景音乐播放', visStart && visGame && pr0 === 'false' && !s0.audio.muted && !s1.audio.muted && s1.audio.musicPlaying && s1.audio.masterGain > 0,
      `开始画面可见=${visStart} 游戏中可见=${visGame} aria-pressed=${pr0} muted=${s0.audio.muted}/${s1.audio.muted} music=${s1.audio.musicPlaying} gain=${s1.audio.masterGain}`);
    await mute().click(); await g.adv(300);
    await g.fire(); await g.adv(500);
    const s2 = await g.snap(); const pr2 = await mute().getAttribute('aria-pressed');
    sc.check('2 点击后静音：aria-pressed=true、muted、总音量 0', pr2 === 'true' && s2.audio.muted && s2.audio.masterGain === 0, `aria-pressed=${pr2} muted=${s2.audio.muted} gain=${s2.audio.masterGain}`);
    await mute().click(); await g.adv(300); await g.fire(); await g.adv(200);
    const s3 = await g.snap(); const pr3 = await mute().getAttribute('aria-pressed');
    sc.check('3 再点击恢复有声、音乐仍在播放', pr3 === 'false' && !s3.audio.muted && s3.audio.masterGain > 0 && s3.audio.musicPlaying, `aria-pressed=${pr3} muted=${s3.audio.muted} gain=${s3.audio.masterGain} music=${s3.audio.musicPlaying}`);
    await p.getByRole('button', { name: '返回开始画面' }).count(); // 游戏中无此按钮时忽略
    await p.reload(); await p.waitForFunction(() => window.steelDefense); await g.adv(300);
    await mute().click(); await g.adv(200);
    const pm = await mute().getAttribute('aria-pressed');
    await p.reload(); await p.waitForFunction(() => window.steelDefense); await g.adv(300);
    const s4 = await g.snap(); const pr4 = await mute().getAttribute('aria-pressed');
    sc.check('4 开始画面静音后重新加载又为有声', pm === 'true' && pr4 === 'false' && !s4.audio.muted, `重载前 aria-pressed=${pm}；重载后 aria-pressed=${pr4} muted=${s4.audio.muted}`);
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts40(browser) {
  const sc = new Scenario('TS-40'); let g;
  try {
    g = await openGame(browser, { seed: 40, device: mobile(390, 844) });
    const p = g.page;
    const t = (await p.getByRole('region', { name: '怎么玩' }).innerText()).replace(/\s+/g, ' ');
    await g.startToPlaying(); await g.adv(200);
    const s1 = await g.snap();
    sc.check('1 触摸开始后音频运行、未静音、音量非 0、音乐播放', s1.audio.state === 'running' && !s1.audio.muted && s1.audio.masterGain > 0 && s1.audio.musicPlaying, JSON.stringify({ ...s1.audio, cues: undefined }));
    const n0 = cueCount(s1, 'fire');
    await p.getByRole('button', { name: '开火', exact: true }).tap(); await g.adv(100);
    const s2 = await g.snap();
    sc.check('2 触摸“开火”后新增“开火”音效', cueCount(s2, 'fire') > n0, `fire 次数 ${n0}→${cueCount(s2, 'fire')}`);
    sc.check('3 说明中有静音可能听不到音效的提示', /静音/.test(t) && /(听不到|听不见|没有声音|无声)/.test(t), t.slice(0, 200));
  } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) { await g.dumpEvidence(sc, 'end'); await g.close(); } }
  return sc;
}

export async function ts41(browser) {
  const sc = new Scenario('TS-41');
  const sizes = [[1024, 768, DESKTOP], [1280, 800, DESKTOP], [1920, 1080, DESKTOP], [360, 640, 1], [390, 844, 1], [430, 932, 1]];
  const maps = [];
  for (const [w, h, kind] of sizes) {
    let g;
    try {
      const dev = kind === 1 ? mobile(w, h) : { viewport: { width: w, height: h } };
      g = await openGame(browser, { seed: 41, device: dev });
      const p = g.page;
      for (const phase of ['开始画面', '游戏进行中']) {
        if (phase === '游戏进行中') await g.startToPlaying();
        const m = await p.evaluate(() => { window.scrollTo(500, 0); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sx: window.scrollX }; });
        sc.check(`1 ${w}×${h} ${phase}：无横向滚动`, m.sw <= m.cw && m.sx === 0, JSON.stringify(m));
        if (phase !== '游戏进行中') continue;
        const mb = await p.getByRole('img', { name: '战场' }).boundingBox();
        const hb = await p.getByRole('group', { name: '战况' }).boundingBox();
        const inV = b => b && b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5;
        if (phase === '游戏进行中') {
          sc.check(`2 ${w}×${h}：地图与 HUD 在视口内`, inV(mb) && inV(hb), `地图=${JSON.stringify(mb)} HUD=${JSON.stringify(hb)}`);
          maps.push({ w, h, mb });
        }
      }
    } catch (e) { sc.check(`${w}×${h} 脚本执行`, false, '执行异常：' + e.message); }
    finally { if (g) { sc.addEvidence(await g.shot(`TS-41-${w}x${h}.png`) || ''); await g.close(); } }
  }
  if (maps.length) {
    const ratios = maps.map(m => m.mb.width / m.mb.height);
    const r0 = ratios[0];
    const same = ratios.every(r => Math.abs(r - r0) / r0 <= 0.01);
    let mono = true;
    for (const a of maps) for (const b of maps) if (a.w > b.w && a.h >= b.h && a.mb.width < b.mb.width - 0.5) mono = false;
    sc.check('3 等比缩放：宽高比一致（≤1%），较宽视口地图不更小', same && mono, maps.map(m => `${m.w}×${m.h}:${m.mb.width.toFixed(0)}×${m.mb.height.toFixed(0)}`).join(' '));
  }
  let g;
  try {
    g = await openGame(browser, { seed: 41, device: mobile(844, 390) });
    const p = g.page;
    const ad = p.getByRole('alertdialog', { name: '请旋转手机' });
    const v1 = await ad.isVisible();
    await p.setViewportSize({ width: 390, height: 844 }); await g.adv(300);
    const v2 = await ad.isVisible();
    const mapVis = await p.getByRole('img', { name: '战场' }).isVisible().catch(() => false);
    const startVis = await p.getByRole('dialog', { name: '开始画面' }).isVisible();
    sc.check('4 横屏显示“请旋转手机”，改回竖屏后消失且画面正常', v1 && !v2 && (mapVis || startVis), `横屏提示可见=${v1} 竖屏提示可见=${v2} 地图可见=${mapVis} 开始画面可见=${startVis}`);
    await g.dumpEvidence(sc, 'rotate');
  } catch (e) { sc.check('横屏 脚本执行', false, '执行异常：' + e.message); }
  finally { if (g) await g.close(); }
  return sc;
}

export const scenarios = { 'TS-01': ts01, 'TS-02': ts02, 'TS-03': ts03, 'TS-04': ts04, 'TS-05': ts05, 'TS-06': ts06, 'TS-10': ts10, 'TS-21': ts21, 'TS-26': ts26, 'TS-38': ts38, 'TS-40': ts40, 'TS-41': ts41 };
