# Phase 3 —— BRP 产品化 + AI 闭环（进行中）

> 计划出处：`dsh-cpa-brp-migration-plan.md` Phase 3（3.1–3.5）
> 前置：Phase 1（设置页归本仓）、Phase 2（about 页面 + 启动门面）已完成。

## 3.1 设置页「浏览器控制」区 ✅（2026-09-19）

**做了什么**：设置页新增独立一组 `kokoaBrowserGroup`（挂在 Kokoa 分类下）：

| 控件 | 数据源 | 说明 |
|---|---|---|
| 状态行 | `GET /kokoa/browser/status` | 可达 / 不可达**并带原因**（`detail`）；读取失败显示"正在检测"，**不默认成可用** |
| 活动标签行 | 同上 `target` | `#{tabId}：标题`（标题截断 80 字符）；没有活动标签时明说"没有"，不给空串 |
| 「截图当前标签」 | `GET /kokoa/browser/screenshot` | 成功把 `data_url` 开在**后台标签**（不抢用户当前页），本地渲染、不落盘、不外发 |
| 「允许 AI 操控当前标签」 | `POST /kokoa/browser/controllable` | **人工同意链**：桥绝不自动放宽权限（BRP 对未授权标签回 `BRP_TAB_NOT_CONTROLLABLE` / -32003），UI 只做"替人按一下" |
| 结果消息行 | — | 成功/失败如实显示，无消息时隐藏 |

**为什么独立成组**：BRP 管的是「AI 能不能看/点这个浏览器」，与 CPA（模型上游）、dsh（会话/工具）是三件事；混在一起会让人以为"配了上游就能操控"。

**安全约束（有测试守卫）**：
- 授权只走 `POST /kokoa/browser/controllable`；
- 静态哨兵：全文件**不得**出现"定时器里自动授权"的写法；
- 文案如实性：不可达/无标签不得显示成正常（单测覆盖 6 种状态）。

**顺手修的**：`locales/zh-CN/.../kokoa.ftl` 里 `kokoa-cpa-category` **定义了两次**（重复 message id，
Fluent 行为不可依赖）→ 删掉后一份。现在中英各 **81 键、零差集**。

**验证状态（2026-09-19 已上产物）**：构建 **35428923317** 的产物上核实：

| 核对项 | 结果 |
|---|---|
| `preferences.js` 里 `kokoaBrowserGroup` | ✅ 在（与 kokoaShellGroup 并列挂进 kokoa pane） |
| pane 里 `KOKOA_BROWSER_GROUP` / `brpRegisterSettings` / `brpGuidance` | ✅ 都在 |
| 中英文案 `kokoa-browser-*` | ✅ 21 条（含 3.2 的 6 条指引） |
| 设置页三点分类渲染 | ✅ 截图非空白；Kokoa 分类 417 色 / 49.5% 非白（含新加的「浏览器控制」组） |

（3.5 的 `tree` 相关键与 `brpSummarizeTree` 不在该产物里 —— 它们是更晚的提交，属预期。）

> ★ 踩坑（已修）：验收脚本截图时若窗口没真到前台，系统会给整幅图蒙灰
> （只有中性灰、颜色数骤降），**看起来像页面挂了**。已在截图前显式
> `SetForegroundWindow` 并延长等待；读到"灰图"时先怀疑采集时机，别急着改 UI。

**语法/单测/check.sh 全过**（桥回归 35 项、主线 36 套件全绿）。
「组真的出现在设置页」需要**下一次构建**的产物（本地那个产品的 `preferences.js`
来自 35420617352 的产物，那时还没有 `kokoaBrowserGroup`）—— 见构建 35428133433。

## 3.4 侧栏会话列表 —— 核对：**绑定已存在**（2026-09-19 结论）

计划里写「侧栏第 2/3 步：接 `KokoaDshSessions` 做会话列表（不遥控切换）」。
本轮核对源码后的结论：**这一层已经在主线面板包里实现了**，且正是计划要求的口径：

| 事实 | 证据 |
|---|---|
| 侧栏条目 | `packages/kokoa-browser-panel/lib/client.js` 注入 `sidebar.panellist`（id=`kokoa-browser`，文案「浏览器」） |
| 会话数据面 | 同文件 `installWorkspaceSessions()`：读 dsh 客户端的**公开** `ctx.sessions`（`list.getSnapshot` / `subscribe` / `open` / `create` / `clear`） |
| 「不遥控切换」 | 代码注释与实现都明确：`No remote calls, private stores, token reads, messages, or DOM-based session navigation` —— 只读 origin/hash，绝不读 `location.href/search`（那是启动凭据） |
| 会话身份 | `#kokoa-session=<id>` fragment（多会话并行）；面板负责 reconcile，不新建会话 |

也就是说 `KokoaDshSessions`（本仓模块）与侧栏列表**不是同一条路**：前者是浏览器侧的
「开/建会话标签」能力（Phase 1 已用），后者由 dsh 客户端插件在面板里提供。
**3.4 剩下的只有真机点检**（列表能否显示、点条目是否只切面板不切会话）。

## 3.5 AI 的「手与眼」接出（2026-09-19，进行中）

**背景（调研结论）**：桥（BRP）本来就支持 `page.getInteractionTree` / `element.click` /
`element.type` / `element.fill` / `element.scroll` / `element.hover` /
`element.select` / `element.getAttribute` / `keyboard.press` / `script.execute` /
`page.navigate` 等（见 `vendor/brp-spec/adapter/brp_mcp_adapter.py:373-390` 的
`capabilities.actions`，那是权威清单）；但我们的 `brp-client.ts` 一直**只用了
`tab.list` + `page.screenshot`** —— 于是 AI「看得见、点不动」。

**已接出**：

| 层 | 内容 |
|---|---|
| `brp-client.ts` | `interactionTree()`（眼）+ `act(method, params)`（手）；`act` 只放行 `BRP_ACTIONS` **白名单（12 条，逐条校验参数）**，未知动作**本地即拒**（连 WS 都不开） |
| `bridge.ts` | `GET /kokoa/browser/tree`、`POST /kokoa/browser/act`；EINVAL 口径（未知动作/参数不合法）→ **400**，其余 200 如实透传 |
| 设置页 | 新增「查看 AI 看到的元素」（交互树摘要：label → selector）与「取消 AI 对当前标签的操控」（授权对称可撤销） |

**失败码分级（都来自真机实测）**：

| 桥返回 | 我们的 detail | 用户该做什么 |
|---|---|---|
| `BRP_TAB_NOT_CONTROLLABLE` | `not-controllable` | 去设置页按「允许 AI 操控当前标签」 |
| `BRP_CAPABILITY_NOT_SUPPORTED` | `capability-unsupported` | **升级浏览器扩展**（桥是通的，截图可用；不是重启能解决的） |
| `no-lockfile` / `no-websocket` / `auth` 等 | 同名 | 见设置页指引（跑启动编排 / 重启桥） |

> ★ **真机实测记录（2026-09-19，本机 = BRP Bridge v1.0.1 + AMO 扩展）**
>
> 桥与扩展都通（`status: available=true`，能读到活动标签 tabId=1、标题），
> 但**结构化交互一律被拒**：
>
> ```
> page.getInteractionTree → BRP_CAPABILITY_NOT_SUPPORTED
> element.getAttribute     → BRP_CAPABILITY_NOT_SUPPORTED
>   message: "Method not supported by negotiated capabilities: element.getAttribute"
>   recoveryHint: "Check initialize response for supported actions"
> ```
>
> **结论**：**当前可用的只有 `tab.*` + `page.screenshot`**（状态与截图都正常）。
> 「AI 的手」（element.* / script.execute）与「AI 的结构化眼」（interactionTree）
> 在这套扩展版本上**不可用** —— 这不是我们代码的问题（我们把能力声明补齐后仍被拒），
> 而是**扩展侧没实现/没协商**这些 action。
>
> **这对画布方案的影响（重要）**：
> · 「AI 用 BRP 点画布」这条路**现在走不通**，不要把画布设计压在它上面；
> · 画布应当走**场景级 API**（画布自身暴露 getScene/apply 的受控通道）—— 不依赖 BRP，
>   语义还更准（这正是 `canvas-plan.md` 里的"场景级（推荐）"那一档）；
> · 截图（`page.screenshot`，可用）仍可作为"AI 看一眼"的辅助。
>
> **待办（需要产品决策）**：是否推动扩展实现 `element.*` / `script.execute` /
> `page.getInteractionTree`。在扩展升级之前，本节的 UI 会如实显示
> `capability-unsupported` 并提示"升级扩展"（已实现并有单测）。

**验证**：BRP 客户端测试 **34 项全过**（新增 9 项，含 3 项安全关键：未知动作不得建会话、
参数不合法不得发帧、BRP 错误码必须原样透传；以及 tree 的两种失败分级）。

## 待办

| 步骤 | 做什么 |
|---|---|
| 3.2 | 启动自检：无 lockfile → 一键拉起（0.1 已做）；扩展未装 → 引导（未做） |
| 3.3 | `setControllable` 缺口的 UI 明示（已在本组体现）；AI `tab.open` 路径保持可用 |
| 3.4 | ~~接会话列表~~ → **已存在**（见上节）：只剩真机点检「点条目只切面板不切会话」 |
| 3.5 | 真机：navigate/snapshot/screenshot + 人工接管 |
