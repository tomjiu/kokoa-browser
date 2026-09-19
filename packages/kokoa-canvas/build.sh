#!/usr/bin/env bash
# 构建 @kokoa/kokoa-canvas —— 画布前端（渲染层）。
#
# 【与 dsh 插件包的区别（重要）】
#   dsh 插件的产物是 __ModuleLoader__ 模块（进 dsh 模块表）；
#   本包产物是**独立页面 bundle**，由 about:canvas 懒加载 —— 因为实测 Excalidraw
#   打包 8.4MB，不能进 omni.ja（fork 的包才约 97MB）。见 README。
#
# 【顺序纪律（照抄 dsh-plugin-cpa-settings 的审查教训 14-b）】
#   1) 先 tsc 全量过检（noEmitOnError）—— esbuild 不做类型检查；
#   2) esbuild 版本钉死 —— 产物要可检，构建器漂移 = 字节漂移；
#   3) 任何失败路径下 dist/ 保持上一次的好状态（原子替换）。
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Windows 版 node 无法解析 Git Bash 的 /e/... 路径，需转成 E:/...
node_p() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf "%s" "$1"; fi; }
DIR_NODE="$(node_p "$DIR")"

ESBUILD_VERSION="$(node -e "console.log(require('$DIR_NODE/package.json').devDependencies.esbuild.replace(/[\\^~]/g,''))")"

if [ ! -x "$DIR/node_modules/.bin/tsc" ]; then
  echo "[build] 装依赖（首次）..."
  (cd "$DIR" && npm install --no-audit --no-fund --loglevel=error)
fi

echo "[build] 1/3 tsc 全量过检（noEmitOnError）"
"$DIR/node_modules/.bin/tsc" -p "$DIR/tsconfig.json"

if [ -x "$DIR/node_modules/.bin/esbuild" ]; then
  ESBUILD_BIN=("$DIR/node_modules/.bin/esbuild")
else
  ESBUILD_BIN=(npx -y "esbuild@$ESBUILD_VERSION")
fi
ACTUAL="$("${ESBUILD_BIN[@]}" --version 2>/dev/null || true)"
if [ "$ACTUAL" != "$ESBUILD_VERSION" ]; then
  echo "[build] ★ esbuild 版本不符：期望 $ESBUILD_VERSION，实际 ${ACTUAL:-<拿不到>}" >&2
  exit 1
fi

echo "[build] 2/3 esbuild 打包 dist/canvas.js（esbuild $ACTUAL）"
mkdir -p "$DIR/dist"
TMP_OUT="$DIR/dist/.canvas.js.tmp"
"${ESBUILD_BIN[@]}" \
  "$DIR_NODE/src/canvas.tsx" \
  --bundle --minify --format=iife --target=es2020 --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' \
  --outfile="$TMP_OUT" --log-level=warning
# 原子替换：失败/中断都不留半成品
mv -f "$TMP_OUT" "$DIR/dist/canvas.js"
echo "[build] 产物: dist/canvas.js ($(wc -c < "$DIR/dist/canvas.js") 字节)"

# ---- 3) 纯逻辑小包（供 node 单测；不含 Excalidraw，KB 级）----
# 【为什么需要】canvas.tsx 顶部 import Excalidraw（8.4MB），引用它的模块都会被
# 打进 bundle → 纯逻辑没法用小包单测。逻辑都在 src/scene-bridge.ts，这里单独打一份。
echo "[build] 3/3 打纯逻辑小包 dist/pure.mjs（供 node 单测）"
cat > "$DIR/pure-entry.ts" <<'EOF'
export { toExcalidraw, fromExcalidraw, createCanvasApp, AI_STROKE, USER_STROKE } from "./src/scene-bridge";
EOF
"${ESBUILD_BIN[@]}" "$DIR_NODE/pure-entry.ts" \
  --bundle --format=esm --platform=node --outfile="$DIR/dist/pure.mjs" --log-level=warning
echo "[build] 纯净小包: dist/pure.mjs ($(wc -c < "$DIR/dist/pure.mjs") 字节)"
