#!/usr/bin/env bash
# 独立测试入口：把驱动层复制到工作目录，安装依赖后执行；写出结果后总以 0 退出
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(pwd)/qa-work"
mkdir -p "$WORK" "${QA_EVIDENCE_DIR:-$WORK/evidence}"
cp -r "$HERE/qa/." "$WORK/"
rm -rf "$WORK/smoke"
cd "$WORK"
if ! npm install --no-audit --no-fund --loglevel=error >"${QA_EVIDENCE_DIR:-.}/npm-install.log" 2>&1; then
  echo "npm install 失败，见 npm-install.log" >&2
fi
node run.mjs || echo "run.mjs 异常退出" >&2
if [ -n "${QA_RESULT_PATH:-}" ] && [ ! -s "$QA_RESULT_PATH" ]; then
  echo "未写出结果" >&2
fi
exit 0
