# 画布（人 + AI 协作白板）：方案决策（2026-09-19）

> 需求原话：**「画布是人和 AI 协作的自由白板，AI 可以画画，人也可以修改」**；
> 补充：**「希望能直接在会话之外像网页一样打开」**；
> 验收口径：**「AI 能直接看到画布并且能点、有视觉布点，识别才精准」**。

## 1. 一个必须先说的真机结论（它决定了方案）

**BRP 这条路现在走不通。** 实测（本机 BRP Bridge v1.0.1 + AMO 扩展）：

| 调用 | 结果 |
|---|---|
| `tab.list` / `page.screenshot` | ✅ 可用（状态能读到活动标签与标题，截图能出图） |
| `page.getInteractionTree` | ❌ `BRP_CAPABILITY_NOT_SUPPORTED` |
| `element.click` / `element.type` / `element.getAttribute` | ❌ 同上 |
| `script.execute` | ❌ 同上 |

message 明说 `Method not supported by negotiated capabilities`。**我们把客户端能力声明补齐后仍被拒**
→ 是**扩展侧没实现/没协商**这些 action（不是我们的 bug）。

**推论**：不能让画布的正确性依赖「AI 通过 BRP 点画布」。**画布必须自己暴露受控 API**。

## 2. 决策：画布 = 普通网页（React + Excalidraw）+ 场景级受控 API

| 维度 | 决定 | 理由 |
|---|---|---|
| 载体 | **本仓内建页**（`chrome://browser/content/kokoa/canvas/`） | 复用 Phase 2 已跑通的那套（`KokoaAboutPages.mjs` + `jar.inc.mn`）；**永不掉**、无端口/token |
| 库 | **Excalidraw**（MIT） | 场景 = JSON 元素数组 → **AI 好写、可 undo**；Mermaid 转结构化图（流程图/UML）先由 AI 生成、人再改 |
| 打开方式 | `about:canvas`，**普通标签**（像网页一样） | 满足「会话之外像网页一样打开」；与 dsh 会话解耦 |
| AI 的通道 | **场景级 API**（`window.__kokoaCanvas.getScene() / apply(ops)`） | 不依赖 BRP；语义精准、可回滚、可审计 |
| AI 的"看" | ① 场景 JSON（准）② `page.screenshot`（可用，作视觉辅助） | 双通道；截图还是"人看到的样子"的参照 |
| 构建 | **复用 `dsh-plugin-*` 的既有链路**（TypeScript + React + esbuild → `lib/client.js`） | 不必新造前端工具链；仓库已有先例与 CI 惯性 |

### 为什么不用 draw.io
draw.io 是**图编辑器**（mxGraph），不是自由白板；嵌 iframe 会变成"两个应用并存"，
AI 的交互面更窄（只能点它的 UI），而且它的数据模型对 AI 不友好。Excalidraw 的场景 JSON
才是"AI 直接写、人在同一场景里改"的正确形态。Mermaid→Excalidraw 已覆盖你问的
**流程图/UML 类结构化图**（AI 先出结构 → 转成真元素 → 人继续手改）。

### 为什么不做自绘 Canvas
笔迹平滑、命中测试、undo/redo、协作光标、文本编辑……全是几周的量，且没有一样是
这个产品的差异化价值。用现成的。

## 3. 协作模型：复用产品已有的「谁在驾驶」词汇

面板 CSS 里已经有 `data-agent-mode = ai | user | collaborative` 三态（见
`packages/kokoa-browser-panel/lib/client.js` 的注入样式）。画布应当直接沿用：

- `user`：人独占编辑（AI 只能看，不能改）——**默认要是这个**（安全默认）。
- `collaborative`：双方都能改（AI 的改动以"AI 笔迹色"标注，便于人识别并撤销）。
- `ai`：AI 绘制中（人可随时夺回）。

加上一条硬约束：**AI 的每次改动都是可撤销的单步**（一次 `apply(ops)` = 一个 undo 单元），
人永远能按 Ctrl+Z 回到自己认可的状态。

## 4. 落地顺序（每步都有可验收的最小切片）

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | `about:canvas` 空壳：协议注册 + 页面资产 + 打开的标签（复用 Phase 2 机制） | 地址栏输 `about:canvas` 能看到空白画布 |
| 2 | 接 Excalidraw（构建链路照抄 dsh 插件）+ 本地持久化（`/kokoa/fs/*` 或 sidecar 新端点） | 画几笔 → 关标签 → 重开还在 |
| 3 | 场景级 API + 设置页/命令面板入口（"把选中内容画到画布"） | AI 通过 API 加一个矩形，人 Ctrl+Z 能撤销 |
| 4 | 人机同屏标注（AI 用不同颜色/图层）+ 撤销单元化 | 人画 + AI 画交替进行，互不破坏 |
| 5 | Mermaid → Excalidraw（结构化图入口） | 说"画个登录流程图" → 生成 → 人手动调整箭头 |

## 4.5 进展（2026-09-19）

| 步 | 状态 |
|---|---|
| 1 空壳页 `about:canvas` | ✅ 资产（`pages/canvas.{html,css,js}`）+ 协议注册（`KOKOA_PAGES`）+ jar 打包 + 5 条产物判据 |
| 3 场景级 API | ✅ **契约与实现完成**：`src/zen/kokoa/KokoaCanvasScene.mjs`（`getScene`/`apply`/`setMode`），41 项行为测试全过 |
| 2 接 Excalidraw | ⬜ 未做（需引入 esbuild 前端链路，照抄 `dsh-plugin-*` 的做法） |
| 4 人机同屏标注 / 5 Mermaid | ⬜ 未做 |

**场景级 API 的硬约定**（已有测试钉住，别放松）：

| 约定 | 为什么 |
|---|---|
| 默认模式 `user`，AI 的 `apply` 一律被拒（`E_MODE`） | 安全默认：人没允许前 AI 改不动 |
| **一批 op 要么全成、要么全不成**（先全批校验再落地） | 部分应用会产生"半途状态"；人对画布的信任来自原子性 |
| 一次 `apply` = **一个撤销单元** | 人永远能一次 Ctrl+Z 回到自己认可的状态 |
| id 由**画布**分配（AI 不自己编） | 避免 AI 与人的 id 撞车 |
| 未知 op / 坏参数 / 坏 id → 整批拒且**带下标**说明 | 报错要能定位到"第几条" |
| `getScene()` 返回**拷贝** | 外部改不动画布内部状态 |

## 5. 现在就能做、且不依赖扩展升级的事

1. **本决策文档**（已写）。
2. `about:canvas` 的空壳页（第 4 节第 1 步） —— 纯复用 Phase 2 机制，风险极低。
3. AI 的通道**先做场景级 API**（不碰 BRP）。

> 另有一条**需要产品决策**：是否推动 BRP 扩展实现 `element.*` / `script.execute` /
> `page.getInteractionTree`。在扩展升级前，「AI 点任意网页」不可用（截图仍可用），
> 所以画布**不要**把设计压在它上面。
