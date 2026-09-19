# @kokoa/kokoa-canvas —— 画布前端（人 + AI 协作白板）

## 这是什么

`about:canvas` 页面里那层**渲染 + 交互**（Excalidraw）。它**不是** AI 的通道 ——
AI 走的是 `src/zen/kokoa/KokoaCanvasScene.mjs` 的场景级 API（`getScene/apply/setMode`，
41 项测试）。两者职责：

| 层 | 在哪 | 谁用 |
|---|---|---|
| 语义层（**契约**） | `src/zen/kokoa/KokoaCanvasScene.mjs` | AI / 外壳 / 测试 |
| 渲染层（本包） | `packages/kokoa-canvas` | 人（鼠标键盘） |

> **为什么分开**：真机实测 BRP 扩展不支持 `element.*`，所以"AI 点画布"不可用；
> 场景级 API 是唯一可靠通道。渲染层可以换（Excalidraw → 自绘），**契约不用动**。

## ★ 产物不进 omni.ja（实测驱动）

量过：Excalidraw 打包 **8204 KB**（minify，未 gzip），而 fork 的 `omni.ja` 约 97 MB。
再塞 8 MB 进包 ≈ +8%，每次开画布还要解析这么大一坨 —— **不可接受**。

所以：本包产物**不打进浏览器包**，由 `about:canvas` 首次打开时**懒加载**。
（若将来"必须单文件离线"成为硬约束，备选是自绘 + `perfect-freehand`（笔迹原语仅 4 KB），
代价是 UI 全要自己写。场景级 API 不变。）

## 构建

    npm install          # 装 excalidraw + esbuild + typescript
    npm run typecheck    # tsc 全量过检（noEmitOnError）
    npm run build        # esbuild 出 dist/canvas.js

构建纪律（照抄 `packages/dsh-plugin-cpa-settings/build.sh` 的教训）：
1. **tsc 前置**：esbuild 不做类型检查，先全量过检再打包，失败不产任何产物；
2. **esbuild 版本钉死**：构建器漂移 = 产物字节漂移，产物要可检；
3. 任何失败路径下保持上一次的好产物（不留半成品）。
