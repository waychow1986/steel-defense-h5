// 测试脚本主程序：按组执行场景，写出脚本结果契约第 2 版
import fs from 'node:fs';
import { chromium } from 'playwright';
import { Scenario, log } from './lib.mjs';

const T0 = Date.now();
const TIMEOUT_MS = (Number(process.env.QA_TIMEOUT_SECONDS) || 3600) * 1000;
const RESULT = process.env.QA_RESULT_PATH || 'result.json';
const only = (process.env.QA_ONLY || '').split(',').filter(Boolean);

// 第一批：伪时钟为主，可并发；第二批：真实时间（过渡、性能与延迟），逐个单独执行
const PARALLEL = {
  // 等待时间最长的放在最前，先占用并发槽
  campaign: ['TS-20'],
  powerup: ['TS-22', 'TS-23', 'TS-33', 'TS-24'],
  lives: ['TS-15', 'TS-17', 'TS-18'],
  visual: ['TS-29', 'TS-31', 'TS-32'],
  basic: ['TS-01', 'TS-02', 'TS-03', 'TS-04', 'TS-05', 'TS-06', 'TS-10', 'TS-21', 'TS-26', 'TS-38', 'TS-40', 'TS-41'],
  terrain: ['TS-07', 'TS-08', 'TS-09'],
  main: ['TS-11', 'TS-12', 'TS-13', 'TS-19', 'TS-25', 'TS-36'],
  base: ['TS-14', 'TS-16', 'TS-35'],
  persist: ['TS-27'],
};
const SERIAL = { base: ['TS-34'], perf: ['TS-42', 'TS-43', 'TS-44'] };
const PER_SCENARIO_MS = 15 * 60000;
// 测试计划写明更长等待上限的场景（TS-20 为 40 分钟；TS-22/23/33 同局等待道具并观察护盾与失去生命）
const SCENARIO_MS = { 'TS-20': 41 * 60000, 'TS-22': 32 * 60000, 'TS-23': 32 * 60000, 'TS-33': 32 * 60000 };

const results = new Map();
let written = false;
function write(note) {
  if (written) return; written = true;
  const scenarios = [...results.values()].map(sc => sc.toResult()).filter(Boolean);
  const failed = scenarios.filter(s => !s.passed).map(s => s.id);
  const out = {
    schemaVersion: 2,
    testedCommitSha: process.env.QA_CANDIDATE_SHA || '',
    summary: `执行 ${results.size} 个场景，报告 ${scenarios.length} 个，未通过 ${failed.length} 个${failed.length ? '（' + failed.join('、') + '）' : ''}${note ? '；' + note : ''}`,
    scenarios,
  };
  fs.writeFileSync(RESULT, JSON.stringify(out, null, 1));
  log('结果已写出', RESULT, out.summary);
}

async function runOne(browser, mod, id) {
  const t = Date.now();
  try {
    let timer;
    const sc = await Promise.race([
      mod.scenarios[id](browser),
      new Promise(r => { timer = setTimeout(() => { const s = new Scenario(id); s.unreachable('场景执行超时'); r(s); }, SCENARIO_MS[id] || PER_SCENARIO_MS); }),
    ]);
    clearTimeout(timer);
    results.set(id, sc);
  } catch (e) {
    const sc = new Scenario(id); sc.check('脚本执行', false, '执行异常：' + e.message); results.set(id, sc);
  }
  const r = results.get(id).toResult();
  log(id, r ? (r.passed ? '通过' : '未通过') : '不报告', `${((Date.now() - t) / 1000).toFixed(0)}s`);
}

async function pool(tasks, n) {
  const q = [...tasks];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await q.shift()(); }));
}

const want = id => !only.length || only.includes(id);
const watchdog = setTimeout(() => { write('部分场景因总时限未执行完'); process.exit(0); }, Math.max(60000, TIMEOUT_MS - 90000));

const browser = await chromium.launch();
try {
  const tasks = [];
  for (const [g, ids] of Object.entries(PARALLEL)) {
    const mod = await import(`./groups/${g}.mjs`);
    for (const id of ids.filter(want)) tasks.push(() => runOne(browser, mod, id));
  }
  // TS-20 与道具同局各长期占用一个并发槽，其余场景在剩余槽中执行，使并行段不超过 40 分钟
  await pool(tasks, 6);
  for (const [g, ids] of Object.entries(SERIAL)) {
    const mod = await import(`./groups/${g}.mjs`);
    for (const id of ids.filter(want)) await runOne(browser, mod, id);
  }
} catch (e) { log('执行异常', e.message); }
finally {
  clearTimeout(watchdog);
  write();
  await browser.close().catch(() => { });
}
process.exit(0);
