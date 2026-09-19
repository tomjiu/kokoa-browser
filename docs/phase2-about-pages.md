# Phase 2 —— 门面与首页（进行中，2026-09-19 起）

> 计划出处：`dsh-cpa-brp-migration-plan.md` Phase 2（2.1–2.5）
> 前置：Phase 1（设置页所有权迁回本仓）**已完成**，见 `phase1-settings-pane-migration.md`

## 已完成

### 2.1 / 2.3 内建 about: 页面搬进本仓 ✅

**问题**：`about:kokoa`（首页/工作台）与 `about:kokoases`（会话历史）原先**只存在于主线
overlay** —— 页面资产（`home.html/css/js`、`sessions.html/css/js`）由 overlay 打包，
协议由 overlay 的 `boot.js` 运行时注册。本仓构建里这两个页面**根本不存在**，
于是设置页里「打开首页」「会话历史」两行只能被移出组（Phase 1 时留的坑）。

**做法**（照 Firefox 的 about 协议做法，不用 components.conf）：

| 件 | 位置 | 说明 |
|---|---|---|
| 页面资产 | `src/zen/kokoa/pages/{home,sessions}.{html,css,js}` | 从主线 overlay 搬入；打包路径仍是 `content/browser/kokoa/`（HTML 里的 `chrome://browser/content/kokoa/...` 引用与协议 URI 都写死了这个路径，不必改） |
| 打包 | `src/zen/kokoa/jar.inc.mn` | 6 条 `content/browser/kokoa/*`，带显式源路径 |
| 协议注册 | `src/zen/kokoa/KokoaAboutPages.mjs` | 三件事：`registerFactory(CID, desc, contract, factory)` + `catMan.addCategoryEntry("about", name, contract)`；contract = `@mozilla.org/network/protocol/about;1?what=<name>`。幂等（已注册则跳过 factory，但仍补类别条目） |
| 启动接线 | `src/zen/common/zen-sets.js` | 浏览器窗口最早时机（`MozBeforeInitialXULLayout`）调用一次；整体 try/catch + console.error（注册失败只影响 about 页，不该拖垮启动） |
| 判据 | `scripts/check-artifact.py` 第 7 节 | 6 个页面文件进包 + `KokoaAboutPages.mjs` 进包 + 首页脚本「桥端口可覆盖」 |
| 单测 | `src/zen/kokoa/KokoaAboutPages.test.js` | 23 条：页面契约（URI/CID/contract）、三件事都做、幂等、`nsIAboutModule` 实现（URIFlags/owner/channel 带 loadInfo）、失败如实上报 |

**顺手修的**：`home.js` 把桥基址写死 `8318`（与设置页 ★8 同类缺陷）→ 改为
`kokoaBridgeBase()`：读 `Services.env.KOKOA_BRIDGE_PORT`，非法值回落 8318。

**设置页影响**：`kokoaOpenHome` / `kokoaDshOpenSessions` 两行**挂回组里**；
`kokoaStartupHomeFirst` / `kokoaStartupWorkbench` 仍不挂（属于 2.2 的启动门面）。

## 未完成（下一步）

| 步骤 | 做什么 | 依赖 |
|---|---|---|
| 2.2 | `kokoa.startup.homeFirst=true` 产品默认 + 首屏门面（M4 切换放最后） | 需要把 boot.js 的启动门面搬进本仓（或由启动器设 pref） |
| 2.4 | 文件树：优先 sidecar `/kokoa/fs/list` | home.js 已有文件树 UI（`fsPath`），只需确认在无 overlay 的裸浏览器里可用 |
| 2.5 | 二级菜单显隐可配置（realtime #5） | `KokoaMenubar` 已有 MENU_ITEMS，缺 UI |

## 验收（Phase 2.1/2.3 的机器判据）

1. `scripts/check-artifact.py <产物>/browser` → 6 条新 ★ 全 OK（**需下一次构建的产物**）。
2. 真机：地址栏输 `about:kokoa` → 首页渲染（状态桥数字、文件树、快捷入口）；
   `about:kokoases` → 会话历史页渲染。
3. 设置页「打开首页」「会话历史」两个按钮能打开上述页面。
