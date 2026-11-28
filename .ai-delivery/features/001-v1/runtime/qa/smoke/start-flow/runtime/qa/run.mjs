// 冒烟用例：开始画面 → 关卡开场 → 第 1 关游戏进行中（来自 TS-02，电脑与手机各一次）
import fs from 'node:fs';
import { chromium } from 'playwright';
import { Scenario, log } from './lib.mjs';
import { scenarios } from './groups/basic.mjs';

const RESULT = process.env.QA_RESULT_PATH || 'result.json';
const limitMs = (Number(process.env.QA_TIMEOUT_SECONDS) || 600) * 1000;
let sc = null;
function write() {
  const r = sc && sc.toResult();
  const out = { schemaVersion: 2, testedCommitSha: process.env.QA_CANDIDATE_SHA || '', summary: r ? (r.passed ? '冒烟：开始游戏进入第 1 关通过' : '冒烟：开始游戏进入第 1 关未通过') : '冒烟：未能完成', scenarios: r ? [r] : [] };
  fs.writeFileSync(RESULT, JSON.stringify(out, null, 1));
  log(out.summary);
}
const watchdog = setTimeout(() => { write(); process.exit(0); }, Math.max(20000, limitMs - 20000));
const browser = await chromium.launch();
try { sc = await scenarios['TS-02'](browser); }
catch (e) { sc = new Scenario('SMOKE-start-flow'); sc.check('脚本执行', false, '执行异常：' + e.message); }
finally { clearTimeout(watchdog); write(); await browser.close().catch(() => { }); }
process.exit(0);
