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

**验证状态**：语法/单测/check.sh 全过（桥回归 12 项、主线 36 套件全绿）。
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

## 待办

| 步骤 | 做什么 |
|---|---|
| 3.2 | 启动自检：无 lockfile → 一键拉起（0.1 已做）；扩展未装 → 引导（未做） |
| 3.3 | `setControllable` 缺口的 UI 明示（已在本组体现）；AI `tab.open` 路径保持可用 |
| 3.4 | ~~接会话列表~~ → **已存在**（见上节）：只剩真机点检「点条目只切面板不切会话」 |
| 3.5 | 真机：navigate/snapshot/screenshot + 人工接管 |
