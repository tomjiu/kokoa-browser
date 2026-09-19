# 如何在 Kokoa（Zen 分支）里加自己的 UI

> 基线：`zen-browser/desktop@dev`，本仓库 surfer.json 已改名为 Kokoa Browser
> （`E:\Code\ai\zen-base\surfer.json` L2–L5：`name/vendor/appId/binaryName` = kokoa）。
>
> 铁律：**不要手改 `engine/`**。`engine/` 是 `surfer download` 生成的 Firefox 树，
> `npm run import`（= `surfer import`）会用 `src/` 把它覆盖/打补丁。
> 你在 `src/` 改，再 import，再 build。
>
> 文中所有「已验证」条目都来自本仓库文件内容或 surfer 源码；「推断」条目会显式标注。

---

## 0. 一张图看懂装配链

```
src/**  (你改这里)
  │
  ├─ 非 .patch 文件  ──copy/symlink──►  engine/<同相对路径>   【整文件覆盖】
  └─ *.patch 文件    ──git apply────►  engine/<patch 里写的路径> 【打补丁】
  │
  ▼
engine/  (Firefox 源码 + Zen 改动)
  │
  └─ mach build → omni.ja (chrome://browser/content/...)
```

入口命令（`E:\Code\ai\zen-base\package.json` L14）：

```json
"import": "npm run ffprefs && npm run import:dumps && surfer import"
```

---

## 1. Zen 自己的 UI 代码落在哪些路径

### 1.1 目录树（已验证）

```
E:\Code\ai\zen-base\
├── src\
│   ├── zen\                          ★ Zen 自己的功能代码（约 250+ 个非测试文件）
│   │   ├── moz.build                 把 DIRS 注册进构建（L9–L26）
│   │   ├── ZenComponents.manifest    XPCOM 组件 manifest
│   │   ├── zen.globals.mjs
│   │   ├── @types\                   Gecko/TS 类型
│   │   ├── boosts\                   站点样式注入（Boosts）
│   │   ├── common\                   ★ UI 骨架：ZenUIManager / ZenCustomizableUI / ZenStartup
│   │   │   ├── modules\              窗口级 .mjs（挂 window.gZen*）
│   │   │   ├── sys\                  进程级 .sys.mjs
│   │   │   ├── styles\               主 CSS
│   │   │   ├── zen-sets.js           command 分发
│   │   │   ├── ZenPreloadedScripts.js 组件装载清单
│   │   │   └── jar.inc.mn            chrome:// 映射
│   │   ├── compact-mode\             紧凑模式（含 C++ 鼠标跟踪）
│   │   ├── spaces\                   工作区
│   │   ├── tabs\                     垂直标签 / essentials
│   │   ├── split-view\  glance\  folders\  live-folders\
│   │   ├── media\  downloads\  share\  mods\  welcome\
│   │   ├── urlbar\                   地址栏扩展
│   │   ├── vendor\                   motion.min.mjs（动画库）
│   │   └── toolkit\                  原生 C++ 公共工具
│   │
│   ├── browser\
│   │   ├── base\content\
│   │   │   ├── zen-*.inc.xhtml       ★ 主窗口挂载用的 include 片段
│   │   │   ├── browser-xhtml.patch   ★ 给主窗口开洞
│   │   │   ├── browser-box-inc-xhtml.patch
│   │   │   └── navigator-toolbox-inc-xhtml.patch
│   │   ├── components\preferences\
│   │   │   ├── zen*.inc.xhtml        ★ 设置页自己的分类
│   │   │   ├── zen-settings.js
│   │   │   └── preferences-xhtml.patch / preferences-js.patch
│   │   ├── components\customizableui\
│   │   │   └── CustomizableUI-sys-mjs.patch  ★ 工具栏区域挂钩
│   │   └── themes\shared\
│   │       ├── zen-icons\icons.css   ★ 图标
│   │       └── zen-sources.inc.mn
│   │
│   ├── docshell\base\nsAboutRedirector-cpp.patch   about: 重定向
│   └── external-patches\             第三方补丁缓存
│
├── locales\<lang>\browser\browser\zen-*.ftl   Fluent 文案
├── prefs\zen\*.yaml                  默认偏好（经 tools/ffprefs 编译）
└── surfer.json                       构建配置 / 品牌
```

### 1.2 关键文件清单（已验证，给行号）

| 角色 | 路径 | 关键行 |
|---|---|---|
| 窗口级 UI 总管 | `src\zen\common\modules\ZenUIManager.mjs` | L9 `window.gZenUIManager`；L977 `window.gZenVerticalTabsManager` |
| 工具栏区域注册 | `src\zen\common\sys\ZenCustomizableUI.sys.mjs` | L17 `startup()`；L40 `init()`；L201 `registerToolbarNodes()` |
| 启动顺序 | `src\zen\common\modules\ZenStartup.mjs` | L31 `#zenInitBrowserLayout`；L81 `delayedStartupFinished` |
| 组件装载清单 | `src\zen\common\ZenPreloadedScripts.js` | L15–L32 脚本列表；L38–L43 自定义元素 |
| command 分发 | `src\zen\common\zen-sets.js` | L12–L180 switch |
| command 声明 | `src\browser\base\content\zen-commands.inc.xhtml` | L5–L75 |
| 主窗口资源注入 | `src\browser\base\content\zen-assets.inc.xhtml` | L8–L31 CSS；L41 预载脚本 |
| 侧栏底部按钮 | `src\browser\base\content\zen-sidebar-icons.inc.xhtml` | L7–L19 |
| chrome 映射总入口 | `src\browser\base\content\zen-assets.jar.inc.mn` | L5–L24 include 各子模块 jar.inc.mn |
| 紧凑模式 | `src\zen\compact-mode\ZenCompactMode.mjs` | L64 `window.gZenCompactModeManager` |
| 设置页挂载 | `src\browser\components\preferences\preferences-xhtml.patch` | L18–L37 nav 按钮；L45–L48 include |
| 设置页注册 | `src\browser\components\preferences\preferences-js.patch` | L35–L38 `register_module` |
| 图标 CSS | `src\browser\themes\shared\zen-icons\icons.css` | L81 `#zen-toggle-compact-mode` |

---

## 2. 它用什么技术写 UI

### 结论：XUL + 原生 ES Module JS + CSS + Fluent。**没有 React / Lit / Vue。**

已验证证据：

1. **XUL 布局**
   - `src\browser\base\content\zen-sidebar-icons.inc.xhtml` L7–L19：
     `<toolbar id="zen-sidebar-foot-buttons" customizable="true" …>`
     内部是 `<toolbarbutton>` / 自定义元素 `<zen-workspace-icons>`。
   - `src\zen\common\sys\ZenCustomizableUI.sys.mjs` L58–L87：
     `MozXULElement.parseXULToFragment` 动态拼 `<toolbar id="zen-sidebar-top-buttons">`。

2. **原生 JS（无框架）**
   - 窗口级：`window.gZenUIManager = {…}`（`ZenUIManager.mjs` L9）、
     `window.gZenCompactModeManager = {…}`（`ZenCompactMode.mjs` L64）。
   - 进程级：ES module class，如
     `src\zen\common\sys\ZenCustomizableUI.sys.mjs` L7 `export const ZenCustomizableUI = new (class {…})()`。
   - 自定义元素继承 `MozXULElement`：
     `src\zen\spaces\ZenSpaceIcons.mjs` L5 `class nsZenWorkspaceIcons extends MozXULElement`。
   - UI 组件基类：`src\zen\common\sys\ui\ZenUIComponent.sys.mjs` L10 `export class ZenUIComponent`。

3. **CSS**
   - 主样式在 `src\zen\common\styles\`（zen-sidebar.css / zen-toolbar.css / zen-theme.css …），
     经 `src\zen\common\jar.inc.mn` L21–L37 映射为 `chrome://browser/content/zen-styles/…`，
     再由 `zen-assets.inc.xhtml` L9–L30 `<link>` 进主窗口。

4. **动画**
   - 第三方 motion 库：`src\zen\vendor\motion.min.mjs`，
     懒加载于 `ZenUIManager.mjs` L35–L43。

5. **文案**
   - Fluent `.ftl`：`locales\<lang>\browser\browser\zen-*.ftl`，
     由 `src\browser\base\content\zen-locales.inc.xhtml` L5–L16 `<link rel="localization">` 挂上。

6. **少量 C++**
   - 仅在需要 XPCOM/平台能力时：如 `src\zen\compact-mode\ZenMouseTrackerWin.cpp`、
     `src\zen\mods\nsZenModsBackend.cpp`。

**给 Kokoa 的建议（我认为）**：照抄 Zen 的「XUL + .mjs + CSS」模式，不要引入 React/Lit。
理由：Zen 已经把 CustomizableUI、垂直标签、compact mode 全部建立在 XUL toolbox 结构上，
引入现代框架只会增加一层与 gecko chrome 不兼容的适配成本。

---

## 3. 怎么给浏览器主窗口加新的界面区域

以「侧栏 / 紧凑模式」为例，完整调用链如下（全部已验证）。

### 3.1 入口文件：主窗口 XHTML 被打补丁开洞

`src\browser\base\content\browser-xhtml.patch`：

| 行 | 做了什么 |
|---|---|
| L9 | 给 `<window>` 加 `zen-before-loaded="true"`（启动水印用） |
| L17 | `#include zen-preloaded.inc.xhtml`（**在所有 Firefox 脚本之前**） |
| L20 | `#include zen-assets.inc.xhtml`（CSS + ZenPreloadedScripts.js） |
| L29 | 把 navigator-toolbox 包进 `<hbox id="zen-main-app-wrapper">` |

`src\browser\base\content\browser-box-inc-xhtml.patch`：

| 行 | 做了什么 |
|---|---|
| L9 | `#include navigator-toolbox.inc.xhtml` **移进** `#browser` 内部（原来是外层 sibling） |
| L10–L12 | 插入 `#zen-browser-background` 背景层 |
| L19–L23 | 插入 `#zen-appcontent-wrapper` / `#zen-appcontent-navbar-wrapper` / `#zen-tabbox-wrapper` |
| L33 | `#include zen-tabbrowser-elements.inc.xhtml` |

`src\browser\base\content\navigator-toolbox-inc-xhtml.patch`：

| 行 | 做了什么 |
|---|---|
| L10 | `navigator-toolbox` 加 `persist="width style"`（侧栏宽度可持久化） |
| L21–L25 | 插入 `<hbox id="titlebar">` + `#zen-toolbar-background` + `#zen-overflow-extensions-list` |
| L33–L34 | 插入 `#zen-essentials`、`#zen-tabs-wrapper` |
| L51 | `#include zen-sidebar-icons.inc.xhtml`（替换原来的 titlebar-items） |

### 3.2 脚本装载

1. `zen-preloaded.inc.xhtml` L8：`zen-sets.js` 最早加载（绑定 command）。
2. `zen-assets.inc.xhtml` L41：加载 `ZenPreloadedScripts.js`。
3. `ZenPreloadedScripts.js` L15–L32：批量 `ChromeUtils.importESModule` 约 16 个窗口级组件，
   其中 L18 就是 `ZenCompactMode.mjs`。

### 3.3 布局改写（侧栏怎么变成「垂直标签侧栏」）

`src\zen\common\modules\ZenStartup.mjs`：

- L31 `#zenInitBrowserLayout()`：
  - L38–L47 把 `#nav-bar`、`#PersonalToolbar` **搬进** `#zen-appcontent-navbar-container`；
  - L57–L61 `gZenWorkspaces.init().then(() => { gZenUIManager.init(); … })`。
- L81 `delayedStartupFinished()`：
  - L86 `gZenCompactModeManager.init()`（compact mode 在窗口真正画完后才 init）。

`ZenCustomizableUI.sys.mjs` `#addSidebarButtons`（L45–L127）：

- L51–L56 在 `gNavToolbox` 后插 `<splitter id="zen-sidebar-splitter">`；
- L58–L88 在 toolbox 前插侧栏顶部按钮区 `#zen-sidebar-top-buttons`；
- L46–L47 设置默认宽度（macOS 230px / 其它 186px）。

`ZenUIManager.mjs` 中 `gZenVerticalTabsManager`（L977 起）：

- L1044–L1048 `toggleExpand()`：切换 `zen.view.sidebar-expanded`；
- L1309 `_updateEvent()`：根据 pref 给 `navigator-toolbox` / `documentElement` 打
  `zen-right-side` / `zen-sidebar-expanded` / `zen-single-toolbar` 等 attribute，CSS 靠这些 attribute 切布局。

### 3.4 紧凑模式入口

- pref 定义：`prefs\zen\compact-mode.yaml` L5–L40。
- 逻辑：`src\zen\compact-mode\ZenCompactMode.mjs` L64 `gZenCompactModeManager`，
  L75 `preInit()`、L88 `init()`。
- 工具栏按钮：`ZenCustomizableUI.sys.mjs` L77–L83 的
  `<toolbaritem id="zen-toggle-compact-mode">`，command = `cmd_toggleCompactModeIgnoreHover`。
- command 声明：`zen-commands.inc.xhtml` L8。
- command 处理：`zen-sets.js` L17–L19 → `gZenCompactModeManager.toggle(true)`。
- 图标：`icons.css` L81–L87。

### 3.5 Kokoa 想加一块新区域的套路（我认为，但每一步都有现成例子可抄）

| 步骤 | 抄哪个 |
|---|---|
| 1. 新建 `src\kokoa\<feature>\` 目录 + `jar.inc.mn` + `.mjs`/`.css` | 抄 `src\zen\compact-mode\` |
| 2. 把 jar.inc.mn include 进 `zen-assets.jar.inc.mn`（或另开一条） | 抄 L5–L24 |
| 3. 组件加进 `ZenPreloadedScripts.js` 的 `scripts` 数组 | 抄 L15–L32 |
| 4. 需要 DOM 骨架就新建 `zen-*-like.inc.xhtml`，在对应 `.patch` 里 `#include` | 抄 `zen-sidebar-icons.inc.xhtml` + `navigator-toolbox-inc-xhtml.patch` L51 |
| 5. 需要 pref 就写 `prefs\zen\*.yaml` | 抄 `prefs\zen\compact-mode.yaml` |
| 6. `npm run import` → `npm run build` | — |

---

## 4. about: 页 & 设置页分类

### 4.1 about: 页

**已验证：Zen 没有新增任何 about: 页面。**

全仓库对 about: 的唯一改动是：

`src\docshell\base\nsAboutRedirector-cpp.patch` L9–L10：

```diff
-    {"credits", "https://www.mozilla.org/credits/",
+    {"credits", "https://zen-browser.app/about/",
```

只是把 `about:credits` 的目标 URL 换成 Zen 官网。

**所以：**
- Welcome 不是 `about:welcome`，而是 chrome 覆盖层：
  `src\zen\welcome\ZenWelcome.mjs` L81–L107 往 `#browser` 里 append XUL。
- Boost 编辑器是 `chrome://` 文档：`src\zen\boosts\zen-boost-editor.inc.xhtml`。
- Space Routing 对话框也是 chrome 文档：`src\zen\space-routing\zen-space-routing.inc.xhtml`。

**如果 Kokoa 真要加 `about:kokoa`（我认为，未在本仓库找到现成例子）：**

1. 仿照 Firefox 的 about 页：新建 C++/JS `nsIAboutModule` 实现，
   在 `docshell/base/nsAboutRedirector.cpp` 的 `kRedirMap[]` 加一行
   （打 patch：`src\docshell\base\nsAboutRedirector-cpp.patch` 再生，
   或 `surfer export docshell/base/nsAboutRedirector.cpp`）。
2. 页面本体放 `src\kokoa\about\`，走 jar.inc.mn 映射成 `chrome://browser/content/kokoa/about.html`。
3. 在 `components.conf` + `ZenComponents.manifest` 注册组件。

**Kokoa 的更低风险路径（我认为）**：先不碰 about:，像 Zen 一样做 chrome 覆盖层 /
`chrome://` 独立文档，用 `gZenUIManager.openAndChangeToTab` 打开
（`ZenUIManager.mjs` L302–L311）。

### 4.2 设置页（about:preferences）加自己的分类

**已验证，共 4 步、5 类文件：**

**A. 在 preferences.xhtml 里加 nav 按钮 + include 面板**

`src\browser\components\preferences\preferences-xhtml.patch`：

- L18–L37：加 4 个 `<html:moz-page-nav-button>`：
  - `category-zen-looks` → `view="paneZenLooks"`
  - `category-zen-tabs-management` → `view="paneZenTabManagement"`
  - `category-zen-CKS` → `view="paneZenCKS"`
  - `category-zen-marketplace` → `view="paneZenMarketplace"`
- L45–L48：`#include zenLooksAndFeel.inc.xhtml` 等 4 个面板。
- L9：`#include zen-preferences-links.xhtml`（stylesheet link）。

**B. 面板本体（新文件，整文件覆盖进 engine）**

| 文件 | 说明 |
|---|---|
| `src\browser\components\preferences\zenLooksAndFeel.inc.xhtml` | L5 加载 `zen-settings.js`；L6 起 `<html:template id="template-paneZenLooks">` |
| `zenTabsManagement.inc.xhtml` / `zenKeyboardShortcuts.inc.xhtml` / `zenMarketplace.inc.xhtml` | 同理 |

注意 template id 命名规则：`template-` + `pane***`，必须和 nav button 的 `view` 一致
（见 `preferences-js.patch` L25 `document.getElementById("template-" + categoryName)`）。

**C. 在 preferences.js 注册 module**

`src\browser\components\preferences\preferences-js.patch` L35–L38：

```js
register_module("paneZenLooks", gZenLooksAndFeel);
register_module("paneZenTabManagement", gZenWorkspacesSettings);
register_module("paneZenCKS", gZenCKSSettings);
register_module("paneZenMarketplace", gZenMarketplaceManager);
```

同文件 L27 还改了 template 展开条件，强制 `paneZen*` 走 template 路径。

**D. 逻辑脚本**

- `src\browser\components\preferences\zen-settings.js`（L18 `gZenMarketplaceManager` 等）。
- 通过 `jar-mn.patch` L10 映射为 `content/browser/preferences/zen-settings.js`。

**E. 样式 + 文案**

- 样式：`src\browser\themes\shared\preferences\zen-preferences.css`
  （经 `zen-sources.inc.mn` L5 映射，`preferences-js.patch` L9 注入）。
- 文案：`locales\<lang>\browser\browser\preferences\zen-preferences.ftl`，
  并在 `main-js.patch` L31 把 `browser/preferences/zen-preferences.ftl` 加进 Localization 列表。

**Kokoa 加设置分类的最小改动集：**

> ⚠️ **2026-09-19 起改用 config pane 体系**（下面第 1-4 步是旧 XUL 模板路线的记录，
> 只对「还要写 XUL 的自定义控件」有意义）。Kokoa 现有三个分类是**照着 Firefox 自己的
> `preferences/config/*.mjs` 体系**做的，加新分类请照抄这条路：
> `src/browser/components/preferences/config/<name>.mjs`（`SettingGroupManager` + `SettingPaneManager`）。

1. （旧路线）新建 `src\browser\components\preferences\kokoaFoo.inc.xhtml`（模板 id = `template-paneKokoaFoo`）。
2. 改 `preferences-xhtml.patch`：加 nav button +（新体系**不需要** `#include`，pane 由 JS 注册）。
3. 改 `preferences-js.patch`：`SettingPaneManager.registerPane("kokoaFoo", {...})`（旧写法是
   `register_module("paneKokoaFoo", gKokoaFoo)`）。
4. 写逻辑模块：**新体系** = `preferences/config/kokoaFoo.mjs`（登记进 `jar-mn.patch`，
   注意子目录必须写显式源路径 `(config/kokoaFoo.mjs)`）；旧体系才是 `kokoa-settings.js`。
5. l10n：新建 `locales/<locale>/browser/browser/preferences/kokoa.ftl` 并挂进
   `zen-preferences-links.xhtml`（`zen-preferences.ftl` 只放 Zen 自己的键）。

---

## 5. src/ 的改动是怎么被组装进 engine/ 的

### 5.1 命令链（已验证）

`package.json`：

| script | 命令 | 作用 |
|---|---|---|
| L14 `import` | `ffprefs` + `import:dumps` + `surfer import` | 把 src 灌进 engine |
| L16 `export` | `surfer export` | 把 engine 里某个文件的 diff 写回 src 的 .patch |
| L18 `download` | `surfer download` | 下载 Firefox 源码包 → engine/ |
| L10 `build` | `surfer build` | 编译 |

### 5.2 surfer import = 「整文件覆盖」+「git 打补丁」两者并用

**已验证**（surfer 源码 `src/commands/patches/command.ts`，函数 `applyPatches`）：

执行顺序：

1. **surfer 内部补丁**（`patches/*.patch`，不在本仓库）
2. **品牌补丁**（branding）
3. **folder copy patches** ← 就是「覆盖」
4. **git patches** ← 就是「打补丁」
5. **证书名替换**

关键逻辑在 `copy-patches.ts`：

```
get():
  glob('**/*', cwd=SRC_DIR)
  filter: 排除 *.patch 和 node_modules
  按第一级目录分组

apply():
  对每个非 patch 文件调用 copyManual()
```

`copyManual()` 的行为（已验证）：

- 目标路径：`ENGINE_DIR/<src 里的相对路径>`（tests 特殊）。
- 若目标已存在且不是 symlink → 先 `remove`。
- **Windows**（`process.platform == 'win32'` 且未开 `windowsUseSymbolicLinks`）：
  **直接 `copyFile` 复制**。
- 其它平台：`ensureSymlink` 建符号链接。
- 往 `engine/.gitignore` 追加该路径（让 engine 的 git 不追踪这些覆盖文件）。

`git-patch.ts` + `export-file.ts` 的行为（已验证）：

- import：对 `src/**/*.patch` 执行 `git apply`（在 engine/ 里）。
- export：在 engine/ 里 `git diff --src-prefix=a/ --dst-prefix=b/ --full-index <file>`，
  写到 `src/<把文件名里的 . 换成 - 后的路径>/<basename-dots-replaced>.patch`。
  - 例：`browser/base/content/browser.xhtml` →
    `src/browser/base/content/browser-xhtml.patch`。
- export 超过 8000 字符会 warning，建议改小补丁。

### 5.3 本仓库的实测数据（已验证）

| 项 | 数量 |
|---|---|
| `src/**/*.patch` | **256** |
| `src/` 非 patch 文件（会被复制/覆盖进 engine） | **1347** |

**所以结论不是「覆盖还是打补丁」二选一，而是：**

| 场景 | 用哪种 | 例子 |
|---|---|---|
| Zen 全新文件（Firefox 里没有） | **整文件覆盖**（其实是新增） | `src\zen\**`、`zen-*.inc.xhtml`、`zen-settings.js` |
| 改动 Firefox 已有文件 | **.patch**（推荐） | `browser-xhtml.patch`、`CustomizableUI-sys-mjs.patch` |
| 极端情况：整个替换一个 Firefox 文件 | 整文件覆盖 | （本仓库未发现这种用法；都是 patch） |

`recalculate-patches.sh` L21–L32 会遍历所有 .patch，对每个 patch 的目标文件跑
`npm run export`，用于上游升级后重算补丁。

### 5.4 Windows 注意（我认为 + 已验证代码路径）

已验证：`copy-patches.ts` 在 win32 默认 **copy 而不是 symlink**。
所以你在 Windows 上改完 `src/zen/foo.mjs`，**必须重新跑 `npm run import`**，
否则 engine 里的副本不会更新。开 `surfer.json` 的 `buildOptions.windowsUseSymbolicLinks`
可以改成 symlink（需管理员/开发者模式），但 Zen 默认没开。

---

## 6. external-patches/ 是干什么的

### 6.1 定位（已验证）

`src\external-patches\` **不是** Zen 自己写的补丁，而是**从上游抓下来的第三方补丁缓存**。

- 下载器：`scripts\update_external_patches.py`
  - L11 `BASE_URI = "https://phabricator.services.mozilla.com"`
  - L12 `OUTPUT_DIR = src/external-patches`
  - L50–L110 读 `manifest.json`，按 type 下载/登记，并删掉 manifest 里没有的多余 .patch。
- 清单：`src\external-patches\manifest.json`（L4–L58）。

manifest 支持 3 种 type（已验证 `update_external_patches.py` L56–L100）：

| type | 含义 | 例子 |
|---|---|---|
| `phabricator` | 从 Mozilla Phabricator 下 Dxxxxx | L6–L9 `"id": "D299584"` Native MacOS popovers fix |
| `local` | 手写、放在本目录的补丁 | L15–L20 `firefox/allow_backdrop_to_work_on_transparency.patch` |
| `patch` | 从任意 URL 下载 | L25–L34 LibreWolf 的 `firefox-in-ua.patch` |

当前内容（已验证目录）：

```
src\external-patches\
├── manifest.json
├── firefox\
│   ├── native_macos_popovers_fix.patch
│   ├── issue_15123.patch / issue_14990.patch / issue_14710.patch
│   ├── allow_backdrop_to_work_on_transparency.patch
│   ├── no_liquid_glass_icon.patch
│   ├── expose_tiled_attribute_to_all_platforms.patch
│   └── override_cert_checks_temp.patch
└── librewolf\
    └── firefox-in-ua.patch
```

### 6.2 它怎么进 engine/

**已验证**：这些文件后缀是 `.patch` 且位于 `src/` 之下，所以
`surfer import` 的 `importGitPatch()`（`glob('**/*.patch', cwd=SRC_DIR)`）会**一并 git apply**。
它没有特殊通道，就是普通的 src 补丁，只是「来源是外部」。

### 6.3 什么时候用补丁、什么时候直接覆盖文件

| 用整文件覆盖（放 `src/**` 非 patch） | 用 .patch |
|---|---|
| 文件是**你新增的**（Firefox 里不存在） | 文件是 **Firefox 已有的**，你只改几行 |
| 文件虽是 Firefox 的，但你**重写到面目全非**、维护整文件更省事 | 你希望上游升级时能 `git apply` 三方合并 / 至少看出冲突点 |
| 例：`src\zen\common\styles\zen-sidebar.css` | 例：`src\browser\base\content\browser-xhtml.patch` |

**经验法则（我认为）：**

- Kokoa 自己的代码 → 全放 `src\kokoa\`，走整文件覆盖。**不要**为自己的新文件写 patch。
- 必须钩进 Firefox 现有文件（如 `browser.xhtml`、`CustomizableUI.sys.mjs`）→ 用 patch。
  流程：在 engine 里手改 → `npx surfer export <相对路径>` → patch 落到 `src/`。
- 不要手写 patch 的 index/hash；一律用 export 生成，否则 import 时 `git apply` 会因上下文对不上而失败。

---

## 7. 【关键】加一个自己的工具栏按钮：最小改动集

### 7.1 先认清 Zen 的两种按钮模式

**已验证：Zen 全仓库没有调用 `CustomizableUI.createWidget`。**
（`grep createWidget` 在 `src/` 无命中。）

Zen 的做法是：**静态 XUL + CustomizableUI.registerArea / registerToolbarNode**。

#### 模式 B（推荐）：可定制工具栏按钮 —— 照抄 `zen-toggle-compact-mode`

这是唯一一个「用户能在 Customize Toolbar 里拖动」的 Zen 按钮，**这就是你要抄的模板**。

#### 模式 A：固定侧栏按钮（不可拖走）—— 照抄 `zen-expand-sidebar-button`

适合「必须钉死在某处」的按钮。

#### 模式 C：地址栏 page-action —— 照抄 `zen-copy-url-button`

适合「跟随当前站点显示」的按钮。

---

### 7.2 模式 B 最小改动集（已验证每个文件的行）

假设按钮 id = `kokoa-my-button`，command = `cmd_kokoaMyButton`。

#### 文件 1 — 声明 CustomizableUI 区域 + 默认放置

`src\zen\common\sys\ZenCustomizableUI.sys.mjs`

抄 L17–L37 的 `startup()`：

```js
startup(CustomizableUIInternal) {
  CustomizableUIInternal.registerArea(
    "zen-sidebar-top-buttons",
    {
      type: this.TYPE_TOOLBAR,
      defaultPlacements: [
        "zen-toggle-compact-mode",
        "kokoa-my-button",          // ← 加这一行
      ],
      defaultCollapsed: null,
      overflowable: true,
    },
    true
  );
  // … zen-sidebar-foot-buttons 不变
}
```

#### 文件 2 — 注入 XUL 节点

同文件，抄 L58–L87 的 `#addSidebarButtons` 里 `parseXULToFragment`：

```xml
<toolbaritem id="kokoa-my-button" removable="true"
             data-l10n-id="kokoa-my-button">
  <toolbarbutton class="toolbarbutton-1"
                 command="cmd_kokoaMyButton"
                 data-l10n-id="kokoa-my-button"
                 flex="1" />
</toolbaritem>
```

放到 `#zen-sidebar-top-buttons-customization-target` 里
（参考 L77–L83 `zen-toggle-compact-mode` 的写法；它在 L84 separator 之前）。

> 备选：若按钮要出现在**侧栏底部**（固定区），直接写进
> `src\browser\base\content\zen-sidebar-icons.inc.xhtml` L16–L18，
> 抄 `zen-expand-sidebar-button`：
> ```xml
> <toolbarbutton removable="true"
>   class="chromeclass-toolbar-additional toolbarbutton-1 zen-sidebar-action-button"
>   id="kokoa-my-button" command="cmd_kokoaMyButton"
>   data-l10n-id="kokoa-my-button"></toolbarbutton>
> ```
> 注意 foot-buttons 区（L7–L15）`customizable="true"`，但没有进
> `ZenCustomizableUI.startup` 的 registerArea，属于「半定制」区。

#### 文件 3 — 声明 command

`src\browser\base\content\zen-commands.inc.xhtml`

抄 L8 附近：

```xml
<command id="cmd_kokoaMyButton" />
```

（该文件经 `zen-keysets.inc.xhtml` L5 include，再由
`browser-sets-inc-xhtml.patch` L9 挂进主窗口 commandset。）

#### 文件 4 — 处理 command

`src\zen\common\zen-sets.js`

抄 L14–L19 的 case：

```js
case "cmd_kokoaMyButton":
  // 你的逻辑
  break;
```

#### 文件 5 — 图标

`src\browser\themes\shared\zen-icons\icons.css`

抄 L81–L87：

```css
#kokoa-my-button {
  list-style-image: url("kokoa-my-button.svg") !important;
}
```

图标 SVG 放到 `src\browser\themes\shared\zen-icons\`（该目录经
`src\browser\themes\shared\zen-sources.inc.mn` L7 `#include zen-icons/jar.inc.mn` 打包；
`jar-inc-mn.patch` L10 挂进 themes）。

#### 文件 6 — 文案

- 新 key 写进 `locales\en-US\browser\browser\zen-vertical-tabs.ftl` 或
  `zen-general.ftl`（已验证 `zen-locales.inc.xhtml` L6–L15 已挂这些 ftl）。
- 若新建 ftl，必须同步改 `src\browser\base\content\zen-locales.inc.xhtml`
  加 `<link rel="localization" href="browser/….ftl"/>`。
- 自己 fork 的其它语言目录同理（`locales\<lang>\browser\browser\`）。

#### 文件 7（可选）— 老配置迁移 / 强制归位

抄 `ZenUIManager.mjs` L149–L172 `_addNewCustomizableButtonsIfNeeded()`：

```js
const kPref = "kokoa.ui.migration.my-button-added";
let placements = CustomizableUI.getWidgetIdsInArea("zen-sidebar-top-buttons");
if (!placements.length && !Services.prefs.getBoolPref(kPref, false)) {
  CustomizableUI.addWidgetToArea("kokoa-my-button", "zen-sidebar-top-buttons", 0);
}
Services.prefs.setBoolPref(kPref, true);
```

这段在 `gZenUIManager.init()` L75 被调用。用户已有 xulstore 时，
`defaultPlacements` 不会生效，必须靠 `addWidgetToArea` 兜底。

#### 为什么不需要改 CustomizableUI.sys.mjs 的 patch？

已验证：`src\browser\components\customizableui\CustomizableUI-sys-mjs.patch`
已经完成了所有挂钩：

| 行 | 做了什么 |
|---|---|
| L9 | import `ZenCustomizableUI` |
| L40 | 在 navbar register 前调 `ZenCustomizableUI.startup(this)` |
| L70 | 把 `"zen-sidebar-top-buttons"` 加进 toolbars 集合 |
| L106 | 每窗口 `ZenCustomizableUI.init(aWindow)` |
| L111 | `area.startsWith("zen-")` 时跳过 Firefox 默认 registerToolbarNode |
| L117 | 改调 `ZenCustomizableUI.registerToolbarNodes(aWindow)`（L201–L208） |
| L125–L128 | single-toolbar 模式下把 nav-bar 的 widget 插到 zen 侧栏区 |

**你的新按钮只要落在 `zen-sidebar-top-buttons` 这个已注册 area 里就会自动工作。**

---

### 7.3 模式 C：地址栏按钮（已验证）

抄 `src\zen\urlbar\ZenSiteDataPanel.sys.mjs` L150–L185 `#initCopyUrlButton()`：

```js
const container = this.document.getElementById("page-action-buttons");
const fragment = this.window.MozXULElement.parseXULToFragment(`
  <hbox id="kokoa-url-action" class="urlbar-page-action" role="button"
        data-l10n-id="kokoa-url-action" disabled="true">
    <image class="urlbar-icon"/>
  </hbox>
`);
container.after(fragment);
```

图标 CSS 抄 `icons.css` L1012（`#zen-copy-url-button image`）。

---

### 7.4 落地步骤清单（Kokoa 实操）

```
1. 在 src\zen\ 或新建 src\kokoa\ 写功能代码（.mjs / .css / .inc.xhtml）
2. 按上面 6–7 个文件改齐
3. npm run import          # 把 src 灌进 engine（Windows 上是复制，必须跑）
4. npm run build           # 或 cd engine && ./mach build
5. npm start               # cd engine && python3 ./mach run --noprofile
```

若你改的是 Firefox 已有文件（比如想动 `browser.xhtml` 本体）：

```
1. 直接改 engine/browser/base/content/browser.xhtml（临时）
2. npx surfer export browser/base/content/browser.xhtml
   → 生成 src\browser\base\content\browser-xhtml.patch
3. 之后一律改 patch 或重复 1–2，不要把 engine 当版本库
```

---

## 附录 A：完整「已验证 / 我认为」对照

### 已验证（文件 + 行号可查）

| 结论 | 证据 |
|---|---|
| UI 主体在 `src/zen/` | 目录列表；`src\zen\moz.build` L9–L26 |
| 主窗口挂载靠 3 个 xhtml patch | `browser-xhtml.patch`；`browser-box-inc-xhtml.patch`；`navigator-toolbox-inc-xhtml.patch` |
| 技术栈是 XUL + 原生 mjs + CSS + Fluent | `zen-sidebar-icons.inc.xhtml` L7–L19；`ZenUIManager.mjs` L9；`zen-locales.inc.xhtml` L5–L16 |
| 组件装载入口 | `ZenPreloadedScripts.js` L15–L32 |
| 布局改写入口 | `ZenStartup.mjs` L31–L70 |
| compact mode init 时机 | `ZenStartup.mjs` L86 |
| CustomizableUI 挂钩 | `CustomizableUI-sys-mjs.patch` L9/L40/L70/L106/L117 |
| `zen-toggle-compact-mode` 定义 | `ZenCustomizableUI.sys.mjs` L22/L77–L83 |
| 设置页 4 个分类 | `preferences-xhtml.patch` L18–L37；`preferences-js.patch` L35–L38 |
| 无新增 about: 页 | 全库 grep 仅命中 `nsAboutRedirector-cpp.patch` L9–L10 |
| surfer import = copy + patch | surfer `copy-patches.ts` / `command.ts` `applyPatches` |
| Windows 默认 copy 不 symlink | surfer `copy-patches.ts` win32 分支 |
| src patch 数 256 / 非 patch 1347 | 目录统计 |
| external-patches 由 manifest 驱动下载 | `update_external_patches.py` L50–L110；`manifest.json` |
| external-patches 靠 `.patch` 后缀自动进 import | surfer `command.ts` `importGitPatch` glob `**/*.patch` |
| Zen 不用 `CustomizableUI.createWidget` | 全库 grep 无命中 |
| `zen-copy-url-button` 动态创建 | `ZenSiteDataPanel.sys.mjs` L150–L185 |

### 我认为（推断 / 建议，未直接验证）

| 结论 | 依据 |
|---|---|
| Kokoa 应沿用 XUL+mjs 而非引 React/Lit | Zen 全部 UI 基础设施建立在 XUL toolbox/CustomizableUI 上 |
| 加自己的 UI 建议新开 `src\kokoa\` 而非混进 `src\zen\` | 便于日后 rebase 上游；但本仓库尚无先例 |
| 加 nav-bar 按钮也可用 Firefox 原生 `CustomizableUI.createWidget` | Firefox 自家 widgets 就这么写，Zen 只是没用；**未在本仓库验证可用性** |
| 加 about: 页需改 nsAboutRedirector + 新建 nsIAboutModule | 依 Firefox 通用做法；Zen 未示范 |
| `surfer.json` 的 `buildOptions.windowsUseSymbolicLinks` 可开 symlink | surfer `copy-patches.ts` 读该配置；本仓库未开、未测 |
| 超 8000 字符的 patch 难维护 | surfer `export-file.ts` 明确 warning |
| 老用户 xulstore 会让 defaultPlacements 失效，需 addWidgetToArea 兜底 | 由 `ZenUIManager.mjs` L149–L172 的迁移代码反推 |

---

## 附录 B：常用命令速查

| 命令 | 作用 |
|---|---|
| `npm run download` | 下载 Firefox → `engine/` |
| `npm run import` | prefs + dumps + `surfer import`（copy + apply patches） |
| `npm run build` / `npm run build:ui` | 全量 / 仅 UI 编译 |
| `npm start` | `cd engine && ./mach run --noprofile` |
| `npx surfer export <engine相对路径>` | 把 engine 里该文件的 diff 写成 `src/**/**.patch` |
| `bash scripts/recalculate-patches.sh` | 上游升级后重算全部 patch |
| `python scripts/update_external_patches.py` | 按 manifest 刷新 external-patches |
| `npm run lint` | `cd engine && ./mach lint zen` |

---

## 附录 C：照抄模板速查表

| 你要加的东西 | 照抄这个 | 路径 |
|---|---|---|
| 可定制工具栏按钮 | `zen-toggle-compact-mode` | `src\zen\common\sys\ZenCustomizableUI.sys.mjs` L22, L77–L83 |
| 固定侧栏按钮 | `zen-expand-sidebar-button` | `src\browser\base\content\zen-sidebar-icons.inc.xhtml` L16 |
| command + 快捷键 | `cmd_zenToggleSidebar` | `zen-commands.inc.xhtml` L56；`zen-sets.js` L59–L61 |
| 地址栏按钮 | `zen-copy-url-button` | `src\zen\urlbar\ZenSiteDataPanel.sys.mjs` L150–L185 |
| 主窗口新区域 | compact-mode 整目录 | `src\zen\compact-mode\` |
| 设置页新分类 | `paneZenLooks` | `preferences-xhtml.patch` L18–L22；`zenLooksAndFeel.inc.xhtml` |
| 自定义 XUL 元素 | `zen-workspace-icons` | `src\zen\spaces\ZenSpaceIcons.mjs` L5；`ZenPreloadedScripts.js` L42 |
| Toast 通知 | `gZenUIManager.showToast` | `ZenUIManager.mjs` L810 |
| 新 pref | — | `prefs\zen\*.yaml`（参考 `compact-mode.yaml`） |
