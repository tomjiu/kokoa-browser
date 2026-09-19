# 画布第 2 步：接 Excalidraw —— 实施规格（2026-09-19 拟定）

> 前置：第 1 步（`about:canvas` 空壳）+ 第 3 步（场景级 API 契约）**已完成**；
> 画布页已通过 `window.__kokoaCanvas` 暴露 `getScene/apply/setMode`，默认模式 `user`。
> 决策依据见 `canvas-plan.md`；本文件只写"怎么落地"。

## 0. 目标与不做的事

**目标**：把 Excalidraw 接成画布的**渲染层**，而 `KokoaCanvasScene` 继续做**语义层**。
人用 Excalidraw 的 UI 画；AI 走场景级 API 改；两边改的是**同一份场景**。

**不做**：不改 `KokoaCanvasScene` 的契约（41 项测试是护栏，不许为了让 Excalidraw 好用而放松）；
不引入新打包器（用仓里已有的 esbuild 姿势）。

## 1. 新增包（照抄 `packages/dsh-plugin-cpa-settings` 的形状）

    packages/kokoa-canvas/
      package.json         # private, MIT, type: module, devDeps: esbuild(钉版本) + typescript
      tsconfig.json        # 与 cpa-settings 同款（noEmitOnError）
      build.sh             # 照抄 cpa-settings 的 build.sh 骨架（见下）
      src/canvas.tsx       # 画布前端：Excalidraw + 与场景 API 的桥
      assemble.cjs         # 把 esbuild 的 CJS body 包成 factory 壳
      lib/canvas.js        # 构建产物（**提交入库** —— bootstrap 零工具链承诺）

**产物契约**（与 dsh client-modules 一致，见 cpa-settings 的 build.sh 注释）：

    window.__ModuleLoader__.load({ id: "kokoa-canvas", factory: (require) => exports })

**构建顺序约束**（照抄审查 14-b 的教训）：先 `tsc` 全量过检，再 esbuild；
任何失败路径下 `lib/canvas.js` 保持上一次的好状态。esbuild 版本钉死（产物字节稳定性）。

## 2. 依赖

    npm i -D esbuild@<与 cpa-settings 相同的版本> typescript
    npm i    @excalidraw/excalidraw   # MIT（已核）

### ⚠️ 体积与许可：**已实测**（2026-09-19，本机 npm + esbuild 0.28.2）

| 方案 | 打包后（minify，未 gzip） | 许可 | 说明 |
|---|---|---|---|
| **Excalidraw 0.18.1** | **8204 KB** | **MIT** ✅ | 装 45.3 MB；场景=JSON 元素数组；带 mermaid 转换 |
| tldraw 2.4.6 | 未量（依赖 `@tldraw/editor` 5.2 MB 等，量级相当） | ⚠️ **非 MIT**（`SEE LICENSE IN LICENSE.md`，含商业条款） | 先用许可这一条否掉 |
| 自绘 + `perfect-freehand` | 笔迹原语 **4 KB** | MIT | 只解决"笔迹平滑"，其余（选中/拖动/undo/文本/导出）都要自己写 |

**结论（改写了原计划）**：8.2 MB 打进浏览器包是**不可接受**的（fork 的 `omni.ja` 约 97 MB，
再加 8 MB ≈ +8%，且每次开画布都要解析这么大一坨）。
**所以第 2 步改为**：

1. **懒加载**：Excalidraw 产物**不进 `omni.ja`**，放在磁盘上（或由本地服务提供），
   首次打开 `about:canvas` 时才载入；之后走内存缓存。
2. 若懒加载仍不合适（例如要求"完全离线、单文件"），退到 **自绘 + `perfect-freehand`**：
   代价是要自己写 UI（选中/拖动/undo/文本/导出），但体积从 8.2 MB 降到 KB 级。
   **场景级 API（第 3 步）与选哪个渲染层无关** —— 这正是先把契约定下来的价值：
   换渲染层不影响 AI 通道。

> 决策建议：**先按懒加载做 Excalidraw**（MIT、功能全、AI 场景 JSON 友好），
> 把体积问题交给"不进包"解决；只有当"必须单文件离线"成为硬约束时，才考虑自绘。

## 3. 桥接：Excalidraw ⇄ KokoaCanvasScene

`KokoaCanvasScene` 要的宿主 deps，在 `canvas.tsx` 里这样实现：

| deps | 实现 |
|---|---|
| `getElements()` | 读 Excalidraw `appState.scene` 的元素数组，**映射**成我们的 `{id,type,x,y,w,h,text,by}` |
| `setElements(list)` | 反向映射回 Excalidraw 元素，调 `updateScene({ elements })` |
| `getMode()` / `setMode()` | 组件内部状态；同时驱动 `data-agent-mode`（user/collaborative/ai）与 UI 提示 |
| `onUndoUnit(u)` | 在 Excalidraw 的 history 上**插一个标记**（或维护我们自己的 undo 栈 + 一键回退） |

**关键不变量（必须保留）**：
1. 默认 `user`：AI 的 `apply` 被 `E_MODE` 拒（人没允许前改不动）。
2. 一次 `apply` = **一个撤销单元**：人按一次 Ctrl+Z 回到 apply 之前
   （Excalidraw 自己的 history 粒度是"每个元素操作"，与我们的"一次 AI 调用"不同 ——
   需要用 `history` 的 `capture`/`resume` API 或"AI 批次后插一个还原点"来实现）。
3. AI 提交的元素带 `by: "ai"` → 渲染时用不同描边色（人一眼能认出哪笔是 AI 画的）。

## 4. 页面接线（改 `src/zen/kokoa/pages/canvas.js`，小改）

现在：`makeScene()` 用页面自己的 `state.elements`。
第 2 步：改成先用 `__ModuleLoader__.load` 载入 `kokoa-canvas`，再由它创建 Excalidraw 实例，
并把**它的** `getElements/setElements` 传给 `createCanvasScene`。
对外接口（`window.__kokoaCanvas`）**形状不变** —— 这是这一步能小改的原因。

## 5. 验收（每步都要有机器判据）

| 项 | 判据 |
|---|---|
| 打包 | `check-artifact.py` 已有"画布资产进包/接了场景 API/默认 user"；新增一条"canvas 渲染库进包" |
| 协议 | `about:canvas` 能打开（跑 acceptance 脚本的兄弟项） |
| 人画 | 手工：画一个矩形 → `__kokoaCanvas.getScene()` 能看到它（且 `by:"user"`） |
| **AI 画** | 切 `collaborative` → `__kokoaCanvas.apply([{op:"add",...}])` → 画布上出现该矩形、且描边色是 AI 色 |
| **一键撤销** | 上一步之后按一次 Ctrl+Z → **整批**消失（回到 apply 之前），而不是逐个消失 |
| 安全默认 | 模式为 `user` 时 `apply` 返回 `E_MODE` 且画布无变化 |

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| Excalidraw 体积过大（几百 KB~1MB） | 先量再定；必要时懒加载 |
| Excalidraw 的 history 粒度与"一次 apply = 一个撤销单元"不一致 | 用 history API 插还原点；若做不到，退一步：AI 改动画布时**禁用**Excalidraw 自带 undo 并接我们自己的（并在文档里写明） |
| about: 文档的 CSP / 相对 URL 限制 | 第 1 步已确立：只用 chrome: 绝对引用 + 无内联脚本；打包产物是单文件，天然满足 |
| 上游升级 Excalidraw 导致产物字节漂移 | 版本钉死（与 esbuild 同一纪律），产物提交入库 |
