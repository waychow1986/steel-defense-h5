// 驱动层公共辅助：浏览器上下文、快照读取、时间推进、输入、结果记录
import fs from 'node:fs';
import path from 'node:path';

export const BASE_URL = (process.env.AIDH_SERVICE_WEB_URL || '').replace(/\/$/, '');
export const EVIDENCE_DIR = process.env.QA_EVIDENCE_DIR || path.resolve('evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export const DESKTOP = { viewport: { width: 1280, height: 800 } };
export const mobile = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
export const HS_KEY = 'steel-defense.highScore.v1';
export const FRAME = 1000 / 60;

export function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

// 场景结果记录器：checkpoint 未下结论时记为 skip（不计入判定）
export class Scenario {
  constructor(id) { this.id = id; this.checkpoints = []; this.evidence = []; this.reportable = true; }
  check(step, passed, observation = '') {
    this.checkpoints.push({ step, passed: !!passed, observation: String(observation).slice(0, 600) });
    return !!passed;
  }
  skip(step, observation) { this.checkpoints.push({ step, passed: true, observation: '未下结论（未到达所需局面）：' + observation, _skip: true }); }
  unreachable(why) { this.reportable = false; this.why = why; }
  addEvidence(name) { this.evidence.push(name); }
  toResult() {
    if (!this.reportable) return null;
    const judged = this.checkpoints.filter(c => !c._skip);
    if (judged.length === 0) return null;
    // 有未下结论的检查点且其余都通过时，不能判为通过：不报告（由平台算为无法验证）
    if (judged.length < this.checkpoints.length && judged.every(c => c.passed)) return null;
    return {
      id: this.id,
      passed: judged.every(c => c.passed),
      checkpoints: this.checkpoints.map(({ _skip, ...c }) => c),
      evidence: this.evidence,
    };
  }
}

export async function writeEvidence(name, data) {
  const f = path.join(EVIDENCE_DIR, name);
  fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  return name;
}

// 打开一个新的上下文与页面。opts: { device, seed, clock(默认 true), highScore, persistentDir }
export async function openGame(browser, opts = {}) {
  const device = opts.device || DESKTOP;
  const ctx = opts.context || await browser.newContext({ ...device });
  const page = await ctx.newPage();
  const consoleLog = [];
  page.on('console', m => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
  if (opts.highScore !== undefined) {
    await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('__qa_hs_set')) { localStorage.setItem(k, v); sessionStorage.setItem('__qa_hs_set', '1'); } }, [HS_KEY, String(opts.highScore)]);
  }
  if (opts.clock !== false) await page.clock.install();
  const seed = opts.seed ?? 1;
  await page.goto(`${BASE_URL}/?seed=${seed}`);
  await page.waitForFunction(() => window.steelDefense && typeof window.steelDefense.snapshot === 'function');
  if (opts.clock !== false) await page.clock.runFor(300);
  const g = new Game(ctx, page, consoleLog, opts.clock !== false, !!device.hasTouch);
  return g;
}

export class Game {
  constructor(ctx, page, consoleLog, fake, touch) {
    this.ctx = ctx; this.page = page; this.consoleLog = consoleLog; this.fake = fake; this.touch = touch;
    this.held = null; this.touchHeld = null;
  }
  snap() { return this.page.evaluate(() => window.steelDefense.snapshot()); }
  async adv(ms) {
    if (this.fake) await this.page.clock.runFor(Math.max(1, Math.round(ms)));
    else await this.page.waitForTimeout(ms);
  }
  // 推进时间直到 pred(snapshot) 为真；返回快照或 null
  async until(pred, maxMs, step = 100) {
    let t = 0;
    while (t <= maxMs) {
      const s = await this.snap();
      if (pred(s)) return s;
      await this.adv(step); t += step;
    }
    return null;
  }
  async clickStart() {
    const btn = this.page.getByRole('button', { name: '开始游戏' });
    if (this.touch) await btn.tap(); else await btn.click();
  }
  async startToPlaying() {
    await this.clickStart();
    return this.until(s => s.screen === 'playing' && !s.transitioning && s.player, 6000, 100);
  }
  // 键盘
  async keyDown(code) { await this.page.keyboard.down(code); }
  async keyUp(code) { await this.page.keyboard.up(code); }
  async hold(dir) {
    if (this.touch) return this.touchHold(dir);
    const code = DIRKEY[dir];
    if (this.held === code) return;
    if (this.held) await this.page.keyboard.up(this.held);
    this.held = code;
    if (code) await this.page.keyboard.down(code);
  }
  async release() { return this.hold(null); }
  async fire() {
    if (this.touch) return this.touchFire();
    await this.page.keyboard.down('Space'); await this.adv(FRAME); await this.page.keyboard.up('Space');
  }
  // 触摸（虚拟按键）
  async touchHold(dir) {
    if (this.touchHeld === dir) return;
    if (this.touchHeld) {
      // 局面结束时虚拟按键可能已隐藏：松开失败不影响后续
      await this.page.getByRole('button', { name: TOUCHNAME[this.touchHeld], exact: true }).dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true }, { timeout: 3000 }).catch(() => { });
    }
    this.touchHeld = dir;
    if (dir) await this.page.getByRole('button', { name: TOUCHNAME[dir], exact: true }).dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  }
  async touchFire() {
    const b = this.page.getByRole('button', { name: '开火', exact: true });
    await b.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: false, bubbles: true });
    await this.adv(FRAME);
    await b.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', isPrimary: false, bubbles: true });
  }
  async hud() {
    const p = this.page;
    const r = {};
    for (const n of ['关卡', '分数', '生命', '剩余敌人']) {
      const l = p.getByRole('group', { name: '战况' }).getByRole('status', { name: n, exact: true });
      r[n] = (await l.count()) ? (await l.first().innerText()).trim() : null;
    }
    return r;
  }
  async shot(name, clip) {
    try { await this.page.screenshot({ path: path.join(EVIDENCE_DIR, name), clip, animations: 'allow', timeout: 10000 }); return name; } catch { return null; }
  }
  async mapBox() { return this.page.getByRole('img', { name: '战场' }).boundingBox(); }
  async dumpEvidence(sc, tag) {
    try {
      const s = await this.snap();
      sc.addEvidence(await writeEvidence(`${sc.id}-${tag}-snapshot.json`, s));
    } catch { /* 页面不可用时忽略 */ }
    sc.addEvidence(await writeEvidence(`${sc.id}-${tag}-console.log`, this.consoleLog.join('\n')));
    const n = await this.shot(`${sc.id}-${tag}.png`); if (n) sc.addEvidence(n);
  }
  async close() { try { await this.ctx.close(); } catch { } }
}

export const DIRKEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
export const WASD = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
export const TOUCHNAME = { up: '向上', down: '向下', left: '向左', right: '向右' };
export const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function rectInter(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function cueCount(s, name) { return s.audio.cues.filter(c => c.name === name).length; }
export function lastCueAt(s, name) { const c = s.audio.cues.filter(c => c.name === name); return c.length ? c[c.length - 1].atMs : -1; }
export function cell(s, ux, uy) { return (s.map.cells[uy] || '')[ux]; }
