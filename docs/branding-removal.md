# 应用内品牌清理：去掉了哪些、故意保留哪些

（2026-09-17 整理。起因：用户「不喜欢应用内部的 logo」，
但明确说过「不是都去掉啊，只是去掉品牌图标，像是隐私浏览这种功能图标肯定要保留」。）

# 一、判据

一个长得像 logo 的引用，只有**同时**满足两条才算「装饰性品牌标记」：

1. **是品牌本身**（应用图标 / 字标），而不是**功能的图示**；
2. **用户在界面上真的能看见**（不是死代码、不是被我们关掉的面板）。

拿不准的一律**保留**。理由：误砍功能图标是 bug；留一个品牌标记只是不够干净。

# 二、这一轮去掉的（2026-09-17）

| 文件 | 去掉的 | 出现在哪 |
|---|---|---|
| `browser/components/customkeys/content/customkeys-sidebar.mjs` | `<img class="brand-logo" src="about-logo.png">` | `about:keyboard` 的左侧栏 |
| `browser/components/profiles/content/profile-selector.mjs` | `<img class="logo" src="about-logo.svg">` | 启动时的「选择配置文件」窗口 |

做法：删除那个 `<img>` 元素本身（而不是用 CSS 藏），并原地留一行注释说明原因。
两个 patch 都过了 `scripts/preflight-patches.py` 的**真 `git apply --check`**：
index 的 pre-image 哈希与 `FIREFOX_156_0_RELEASE` 的 blob 一致，说明拿到的确实是原始文件
（2 通过 / 0 失败 / 0 跳过）；且产物与上游**逐字节一致**，证明 Zen 没有改过这两个文件。

# 三、故意保留的（功能性图标）

| 位置 | 为什么保留 |
|---|---|
| 各 about: 页面的 `<link rel="icon" href="icon32.png">`（aboutlogins / aboutwelcome / opentabs / migration-dialog / firstrun / asrouter-admin / activity-stream 等） | 那是**页面图标（favicon）**，去掉只会变成默认图标 |
| `zen-icons/icons.css` 的 `icon48.png`、`.tab-icon-image[src=...icon32.png]` | 标签页图标 |
| `identity-block.css`、`controlcenter/panel.css` | 站点身份块 / 权限面板的图示 |
| `applications.css` 的 `--app-handler-icon` | 「应用程序」处理程序的默认图标 |
| `urlbar/view-nova.css`、`view-proton.css`、`UrlbarView.mjs` | 地址栏行的图示 / 默认搜索引擎图标兜底 |
| `FileMigrators.sys.mjs`、`PromptCollection.sys.mjs` | `document.ico` / `document_pdf.svg` 文件类型图标 |
| `FirefoxProfileMigrator.sys.mjs` 的 `icon128.png` | 导入数据时**表示「从 Firefox 导入」这一侧**，是信息不是装饰 |
| `browser.js` L750-753（about:home/newtab/opentabs/welcome 的页图标） | 同上，页面图标 |
| `BackupService.sys.mjs` 的 `LOGO = icon128.png` | 备份相关，需另查用途（未在界面上见到），**先不动** |
| `browser-shared.css` `#ai-window-toggle` / `#ai-window-switch-classic`（`about-logo.svg`） | Firefox「AI Window」**功能按钮**的图标；功能图标要留，且该功能在 Kokoa 默认不可见 |
| `toolbarbutton-icons.css` `#fxms-bmb-button`（`about-logo.png`） | 同上，某个工具栏按钮的功能图标 |
| `InfoBar.sys.mjs` 的默认 `icon64.png` | 通知条的兜底图标（消息自带图时不用它） |
| `downloads.mjs` `iconSrc: icon32.png` | 设置页下载分类的图标（功能性槽位） |

# 四、用「关掉」代替「删除」的

| 位置 | 做法 |
|---|---|
| 新标签页 `.logo` / `.wordmark`（`activity-stream.css` + nova 变体） | `browser.newtabpage.activity-stream.hideLogo=true`（元素不渲染） |
| `about:welcome` 的 logo（`aboutwelcome.bundle.js`、`OnboardingMessageProvider.sys.mjs` 的 `imageURL`） | `zen.welcome-screen.seen=true` + `browser.aboutwelcome.enabled=false`（整页不再出现） |
| `moreFromMozilla.mjs` 的 `iconSrc: about-logo.svg` | `visible: () => false`（面板本身关掉） |
| `PanelTestProvider.sys.mjs` / `asrouter-newtab-multistage.bundle.js` 的 logo | CFR / 推荐内容 pref 关闭 |

# 五、查过但**没改**的两处（附证据）

| 位置 | 为什么没改 |
|---|---|
| `preferences.xhtml` L1763 的 `<img class="qr-code-box-logo" src="about-logo.svg">` | 那段 markup 属于 **More from Mozilla** 面板的 template（`moreFromMozilla.js` L234 自己 `template.querySelector(".qr-code-box")`），而该面板已用 `visible: () => false` 关掉；且 redesign 模式下 Firefox 自家 template 不展开 → 用户看不见 |
| `qrcode/QRCodeWorker.worker.mjs`（把 logo 合成进二维码，L262） | 在产物里**没有任何调用方**（`qrcode-dialog.js` 的 data URI 是调用者传进来的参数），属死代码 |

# 六、复查方法

```bash
# 扫产物里所有品牌图片引用（按文件分组，带行号）
python scripts/scan-branding-refs.py <产物目录>       # 见下
# 产物级断言（2 项）：about:keyboard 侧栏 / 配置文件选择器 里应该【查不到】about-logo
python scripts/check-artifact.py <产物目录>
```
