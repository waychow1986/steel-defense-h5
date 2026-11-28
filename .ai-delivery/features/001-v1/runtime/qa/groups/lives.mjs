// 失去生命与指挥所被敌方击中：TS-15（敌方子弹击中指挥所），TS-17、TS-18（同局：被击中→重生→生命用完）
import { Scenario, openGame, FRAME, log, writeEvidence } from '../lib.mjs';
import { Bot, goTo, rayHit } from '../bot.mjs';

const num = t => { const m = /-?\d+/.exec(t || ''); return m ? Number(m[0]) : null; };
const near = (a, b) => Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02;

// 被击中后的观察：返回 {expl, hudLives, snapLives, respawn, s}
async function observeHit(g, prev, s) {
  let expl = Math.max(prev.effects.explosions, s.effects.explosions);
  const hitExplosion = s.effects.explosions > 0 || s.audio.cues.filter(c => c.name === 'explosion').length > prev.audio.cues.filter(c => c.name === 'explosion').length;
  await g.release();
  await g.adv(100);
  const s1 = await g.snap(); expl = Math.max(expl, s1.effects.explosions);
  const hud = await g.hud();
  const r = { snapLives: s1.lives, hudLives: num(hud['生命']), expl, hitExplosion, wentNull: !s.player || !s1.player };
  if (s1.lives > 0) {
    const s2 = await g.until(x => x.player && x.screen === 'playing' && !x.transitioning, 8000, 50);
    r.respawn = s2 ? { x: s2.player.x, y: s2.player.y, dir: s2.player.dir } : null;
    r.screen = (s2 || await g.snap()).screen;
  } else {
    const s2 = await g.until(x => x.screen === 'gameOver', 8000, 100);
    r.screen = (s2 || await g.snap()).screen;
    r.minLives = Math.min(s1.lives, (s2 || s1).lives);
    r.playerAfter = !!(s2 || s1).player;
  }
  return r;
}

async function canMoveAndFire(g) {
  const a = await g.snap();
  await g.hold('up'); await g.adv(200); await g.release();
  const b = await g.snap();
  const ids = new Set(b.bullets.map(x => x.id));
  await g.fire(); await g.adv(FRAME);
  const c = await g.snap();
  return { moved: a.player && b.player && (a.player.y !== b.player.y || a.player.x !== b.player.x), fired: c.bullets.some(x => x.owner === 'player' && !ids.has(x.id)) };
}

async function runHits(browser) {
  const S = { 'TS-17': new Scenario('TS-17'), 'TS-18': new Scenario('TS-18') };
  for (const seed of [17, 170, 1700]) {
    const g = await openGame(browser, { seed });
    try {
      await g.startToPlaying();
      const spawn = { ...(await g.snap()).player };
      const hits = [];
      let t = 0, baseLost = false;
      while (hits.length < 3 && t < 480000) {
        const bot = new Bot(g, { shoot: false, dodge: false, pickup: false });
        let hp = null;
        // 敌方子弹逼近玩家时松开按键、逐帧推进，使重生时刻不受驾驶输入影响
        const danger = x => x.player && x.bullets.some(b => b.owner !== 'player' && Math.abs(b.x - x.player.x - 0.4) < 2 && Math.abs(b.y - x.player.y - 0.4) < 2);
        const onSnap = async (prev, x) => {
          t += 50;
          if (hp) return;
          if (prev && x.lives < prev.lives) { hp = { prev, x }; return; }
          if (x.screen !== 'playing' || !danger(x)) return;
          await g.release();
          let last = x;
          for (let i = 0; i < 40; i++) {
            await g.adv(FRAME); t += FRAME;
            const y = await g.snap();
            if (y.lives < last.lives) { hp = { prev: last, x: y }; return; }
            last = y;
            if (y.screen !== 'playing' || !danger(y)) return;
          }
        };
        const s = await bot.run({ maxMs: 480000 - t, stop: x => !!hp || x.screen === 'gameOver' || x.base.destroyed, onSnap });
        if (!hp && s && (s.base.destroyed && s.lives > 0)) { baseLost = true; break; }
        if (!hp) break;
        hits.push({ ...(await observeHit(g, hp.prev, hp.x)), livesBefore: hp.prev.lives });
        if (hits[hits.length - 1].snapLives > 0) hits[hits.length - 1].act = await canMoveAndFire(g);
        if (hits[hits.length - 1].snapLives === 0) break;
      }
      await writeEvidence(`TS-17-hits-seed${seed}.json`, { spawn, hits });
      if (baseLost) { log('TS-17/18 种子', seed, '指挥所先被摧毁，换种子'); await g.close(); continue; }
      const sc = S['TS-17'];
      sc.addEvidence(`TS-17-hits-seed${seed}.json`);
      if (!hits.length) { sc.unreachable('8 分钟内未被击中'); S['TS-18'].unreachable('8 分钟内未被击中'); await g.close(); return S; }
      const h1 = hits[0];
      sc.check('1 被击中后有爆炸效果，生命 3→2（快照与 HUD 一致）', h1.hitExplosion && h1.livesBefore === 3 && h1.snapLives === 2 && h1.hudLives === 2,
        `种子 ${seed}；爆炸记录 ${h1.expl}（爆炸=${h1.hitExplosion}）；生命 ${h1.livesBefore}→快照 ${h1.snapLives}，HUD ${h1.hudLives}`);
      sc.check('2 重新出现在出生位置，朝上', !!h1.respawn && near(h1.respawn, spawn) && h1.respawn.dir === 'up',
        `出生位置 (${spawn.x},${spawn.y})；重生 ${h1.respawn ? `(${h1.respawn.x},${h1.respawn.y}) 朝${h1.respawn.dir}` : '未重生'}`);
      sc.check('3 游戏继续进行，可以移动与开火', h1.screen === 'playing' && h1.act && h1.act.moved && h1.act.fired, `画面 ${h1.screen}；移动=${h1.act?.moved} 开火=${h1.act?.fired}`);
      const s18 = S['TS-18']; s18.addEvidence(`TS-17-hits-seed${seed}.json`);
      if (hits.length < 3) { s18.unreachable('8 分钟内未被击中 3 次'); await g.close(); return S; }
      const h2 = hits[1], h3 = hits[2];
      s18.check('1 第 2 次被击中后生命为 1，在出生点重生，游戏继续', h2.snapLives === 1 && h2.hudLives === 1 && !!h2.respawn && near(h2.respawn, spawn) && h2.screen === 'playing',
        `生命 快照 ${h2.snapLives} HUD ${h2.hudLives}；重生 ${h2.respawn ? `(${h2.respawn.x},${h2.respawn.y})` : '无'}；画面 ${h2.screen}`);
      const fail = g.page.getByRole('dialog', { name: '失败' });
      const fv = await fail.isVisible();
      s18.check('2 第 3 次被击中后生命为 0，显示失败画面，生命不为负，不再重生', h3.snapLives === 0 && h3.minLives >= 0 && h3.screen === 'gameOver' && fv && !h3.playerAfter,
        `生命 快照 ${h3.snapLives} HUD ${h3.hudLives}，最小 ${h3.minLives}；画面 ${h3.screen}，失败浮层可见=${fv}；之后仍有玩家坦克=${h3.playerAfter}`);
      await g.close();
      return S;
    } catch (e) {
      Object.values(S).forEach(sc => sc.check('脚本执行', false, '执行异常：' + e.message));
      await g.dumpEvidence(S['TS-17'], 'error'); await g.close(); return S;
    }
  }
  Object.values(S).forEach(sc => sc.unreachable('各种子均在被击中前指挥所先被摧毁'));
  return S;
}

// 打开指挥所上方的砖：从 (6.0625, 9.0625) 朝下逐发开火，直到下方射线首先碰到指挥所
async function openAboveBase(g) {
  if (!await goTo(g, 6.0625, 9.0625, 30000)) return false;
  await g.hold('down'); await g.adv(FRAME); await g.release();
  for (let i = 0; i < 12; i++) {
    const s = await g.snap(); const p = s.player; if (!p) return false;
    if (rayHit(s, 'down', [p.x + 0.44, p.y + 0.44]).kind === 'base') return true;
    await g.until(x => !x.bullets.some(b => b.owner === 'player'), 3000, 50);
    await g.fire(); await g.until(x => !x.bullets.some(b => b.owner === 'player'), 3000, FRAME);
    if ((await g.snap()).base.destroyed) return false;
  }
  return false;
}

async function ts15(browser) {
  const sc = new Scenario('TS-15');
  for (const seed of [15, 150, 1500]) {
    const g = await openGame(browser, { seed });
    try {
      await g.startToPlaying();
      const opened = await openAboveBase(g);
      if ((await g.snap()).base.destroyed) { await g.close(); continue; }
      await goTo(g, 0.0625, 12.0625, 30000);
      await g.release();
      let t = 0, prev = await g.snap(), hit = null;
      while (t < 600000) {
        const close = prev.bullets.some(b => b.owner === 'enemy' && Math.abs(b.x - (prev.base.x + 0.5)) < 2.5 && Math.abs(b.y - (prev.base.y + 0.5)) < 2.5);
        const dt = close ? FRAME : 100;
        await g.adv(dt); t += dt;
        const s = await g.snap();
        if (s.base.destroyed && !prev.base.destroyed) { hit = { prev, s }; break; }
        if (s.screen === 'gameOver' || s.lives === 0) break;
        prev = s;
      }
      if (!hit) { log('TS-15 种子', seed, '未发生（生命用完或到上限），换种子'); await g.close(); continue; }
      const { prev: p, s } = hit;
      const bx = p.base.x + 0.5, by = p.base.y + 0.5;
      const nb = b => Math.abs(b.x - bx) < 1.2 && Math.abs(b.y - by) < 1.2;
      const enemyGone = p.bullets.filter(b => b.owner === 'enemy' && nb(b) && !s.bullets.some(x => x.id === b.id));
      const playerNear = p.bullets.filter(b => b.owner === 'player' && nb(b));
      sc.check('1 敌方子弹击中指挥所的同一次快照中指挥所已摧毁', enemyGone.length > 0 && playerNear.length === 0 && s.base.destroyed,
        `种子 ${seed}，第 ${(t / 1000).toFixed(1)} 秒；指挥所附近消失的敌方子弹 ${enemyGone.map(b => b.id).join(',') || '无'}，附近的玩家子弹 ${playerNear.length}；指挥所已摧毁=${s.base.destroyed}；预先打开上方砖墙=${opened}`);
      const go = await g.until(x => x.screen === 'gameOver', 8000, 100);
      const fv = await g.page.getByRole('dialog', { name: '失败' }).isVisible();
      sc.check('2 随后显示失败画面', !!go && fv, `画面 ${(go || await g.snap()).screen}，失败浮层可见=${fv}`);
      await g.shot('TS-15-gameover.png').then(n => n && sc.addEvidence(n));
      await g.close();
      return sc;
    } catch (e) { sc.check('脚本执行', false, '执行异常：' + e.message); await g.dumpEvidence(sc, 'error'); await g.close(); return sc; }
  }
  sc.unreachable('各种子在 10 分钟游戏时间内均未发生敌方子弹击中指挥所（或玩家先失去全部生命）');
  return sc;
}

let hitsP = null;
export const scenarios = {
  'TS-15': ts15,
  'TS-17': async b => (await (hitsP ??= runHits(b)))['TS-17'],
  'TS-18': async b => (await (hitsP ??= runHits(b)))['TS-18'],
};
