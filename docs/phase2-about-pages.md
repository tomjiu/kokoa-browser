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

### 2.2 启动门面搬进本仓 ✅

| 件 | 位置 | 说明 |
|---|---|---|
| 模块 | `src/zen/kokoa/KokoaStartup.mjs` | `ensureHomeFirst(win, deps)`：按 `kokoa.startup.homeFirst`（默认 **true**）/ `kokoa.startup.workbench`（默认 **false**）决定首屏；三条约束照抄 boot.js 的教训（可控 / 不抢会话标签 / 只清"没用过的空白标签"） |
| 接线 | `src/zen/common/zen-sets.js` | **在 about 协议注册之后**调用（顺序错就开不出 about:kokoa）；窗口级只做一次 |
| 默认值 | `prefs/kokoa/ui.yaml` | `kokoa.startup.homeFirst=true` / `kokoa.startup.workbench=false` |
| 单测 | `src/zen/kokoa/KokoaStartup.test.js` | 27 条：四条 pref 组合、幂等、不抢标签、只清空白、失败软着陆 |

设置页 `kokoaStartupHomeFirst` / `kokoaStartupWorkbench` 两行**挂回组里** —— 至此设置页
不再有「注册了但不相干」的行。

### 2.4 文件树 ✅（页面侧无需改动）

`home.js` 的文件树走 `GET /kokoa/fs/list[?path=]`，实测该端点返回
`{ok:true, path, entries[]}`（本机取到 4 个条目）——即**不依赖 overlay glue**，
搬到本仓后直接可用。剩下的只是下一次产物上人工看一眼。

### 2.5 二级菜单显隐可配置 ✅（早已实现）

`KokoaMenubar.mjs` 的 `MENU_ITEMS` + `isVisible()`（读 `kokoa.menu.*.visible`）+
设置页勾选框 + `prefs/kokoa/menu.yaml` 默认值，三者由 `KokoaMenuConsistency.test.js`
钉住（5 项全过）。

## 未完成（下一步）

| 步骤 | 做什么 | 依赖 |
|---|---|---|
| 2.2 | `kokoa.startup.homeFirst=true` 产品默认 + 首屏门面（M4 切换放最后） | 需要把 boot.js 的启动门面搬进本仓（或由启动器设 pref） |
| 2.4 | 文件树：优先 sidecar `/kokoa/fs/list` | home.js 已有文件树 UI（`fsPath`），只需确认在无 overlay 的裸浏览器里可用 |
| 2.5 | 二级菜单显隐可配置（realtime #5） | `KokoaMenubar` 已有 MENU_ITEMS，缺 UI |

## ★ 踩坑记录：about: 页面的注册时机（2026-09-19 实测）

**症状**：产物里页面与模块**都在**（check-artifact 47/47 全过），但
`kokoa.exe -profile <p> about:kokoa` 得到「Problem loading page」。

**定位**：启动后在地址栏手输 `about:kokoa` → **能打开**（标题正常）。
即：注册**是成功的**，只是**太晚** —— 命令行给的启动 URL 在**窗口脚本执行之前**
就开始解析了（`zen-sets.js` 里那次是模块顶层，仍晚于首个标签的 URL 解析）。

**处置**（两层，都保留）：
1. `zen-sets.js` 模块顶层注册一次（窗口脚本最早时机）；
2. `src/zen/common/modules/ZenStartup.mjs` 的 `init()` 里再注册一次（Zen 的启动模块，
   早于标签加载），并整体 try/catch + console.error。

**产品路径本来就不依赖它**：启动门面（`KokoaStartup`）是在**注册之后**才开
`about:kokoa` 的 —— 所以「首屏是首页」不会踩到这个时序问题；两层注册是为了让
「用户手输」「启动 URL 直接是 about:kokoa」也稳。

**验收改法**：不要用 `about:kokoa` 当启动 URL（那是自找时序）；应
① 启动到 `about:blank`，检查启动门面是否把首页开出来并选中；
② 启动后再导航 `about:kokoa` / `about:kokoases` 看能否打开。

### 实测结论（2026-09-19，在 CI 产物上就地验证）

| 场景 | 结果 |
|---|---|
| 启动 URL = `about:blank` + 启动门面 | ✅ **首页被开出来并选中**（窗口标题 Kokoa Browser；截图量化 304 色 / 19.9% 非白，非空白页） |
| 启动后导航 `about:kokoa` | ✅ 打开（标题正常） |
| 启动后导航 `about:kokoases` | ✅ 打开（截图量化 410 色 / 44.6% 非白 = 有内容的页面，不是错误页） |
| 设置页三个分类 | ✅ 截图非空白（292-323 色 / 27-30% 非白） |
| 启动 URL 直接 = `about:kokoa` | ⚠️ **仍「Problem loading page」**（见下） |

**关于第三行（诚实记录）**：把 `about:kokoa` 当**命令行启动 URL** 时仍打不开 ——
首个标签的 URL 解析发生在 `ZenStartup.init()` 与窗口脚本**之前**，
而那两处已经是本仓能拿到的最早时机（再早就要动 Firefox 的 `BrowserGlue`/
`browser-startup`，超出「源码分支可搬运资产」的范围）。
**产品路径不依赖它**：启动器不会把 `about:kokoa` 当启动 URL（它开 dsh 工作台或空白），
首屏由**注册之后**才跑的启动门面负责 —— 所以用户可见行为是对的。
若将来真要让命令行 URL 也稳，正路是在 `components.conf` 里做**构建期** about 注册
（那是 Firefox 的原生机制，本仓构建时可用），代价是要维护一份构建期清单。

## 验收（Phase 2.1/2.3 的机器判据）

1. `scripts/check-artifact.py <产物>/browser` → 6 条新 ★ 全 OK（**需下一次构建的产物**）。
2. 真机：地址栏输 `about:kokoa` → 首页渲染（状态桥数字、文件树、快捷入口）；
   `about:kokoases` → 会话历史页渲染。
3. 设置页「打开首页」「会话历史」两个按钮能打开上述页面。
