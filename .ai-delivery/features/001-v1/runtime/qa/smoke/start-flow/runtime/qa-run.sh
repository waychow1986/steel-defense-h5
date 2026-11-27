#!/usr/bin/env bash
# 冒烟用例入口：开始游戏并进入第 1 关
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(pwd)/smoke-work"
mkdir -p "$WORK" "${QA_EVIDENCE_DIR:-$WORK/evidence}"
cp -r "$HERE/qa/." "$WORK/"
cd "$WORK"
npm install --no-audit --no-fund --loglevel=error >"${QA_EVIDENCE_DIR:-.}/npm-install.log" 2>&1 || echo "npm install 失败" >&2
node run.mjs || echo "run.mjs 异常退出" >&2
exit 0
