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

## 待办

| 步骤 | 做什么 |
|---|---|
| 3.2 | 启动自检：无 lockfile → 一键拉起（0.1 已做）；扩展未装 → 引导（未做） |
| 3.3 | `setControllable` 缺口的 UI 明示（已在本组体现）；AI `tab.open` 路径保持可用 |
| 3.4 | 侧栏第 2/3 步：接 `KokoaDshSessions` 会话列表（不遥控切换） |
| 3.5 | 真机：navigate/snapshot/screenshot + 人工接管 |
