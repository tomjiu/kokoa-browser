# 工作项：Kokoa AI 工作区侧栏（TASK-04 落地）

> 依据：TASK-04（212 行，验收方自做，自检 28/28 命中）
> 这份比设置页更贴近产品核心 —— AI 工作区要住在哪里。

---

# 一、TASK-04 的核心结论（先说结论，再说怎么做）

**Zen 的侧栏不是「贴上去的 UI」，而是它【改写了 Firefox 的主窗口 DOM】之后的产物。**

出处：`src/browser/base/content/browser-box-inc-xhtml.patch`

```
<hbox flex="1" id="browser">
  #include navigator-toolbox.inc.xhtml     <- ★ Zen 把工具栏【移进】了 #browser（L9）
  <html:div id="zen-browser-background">  <- 自加背景层

  <box id="sidebar-container" class="chrome-block">      (L13)
    <html:sidebar-main flex="1">                          (L14)
      <box id="vertical-tabs" slot="tabstrip" .../>         (L15) <- 标签条
    </html:sidebar-main>
  </box>
  <splitter id="sidebar-launcher-splitter" .../>          (L18)

  <vbox flex="1" id="zen-appcontent-wrapper">             (L19)
    <html:div id="zen-appcontent-navbar-wrapper" ...>       (L20)
    <hbox id="zen-tabbox-wrapper" flex="1">                (L23)
      <tabbox id="tabbrowser-tabbox" ...>                    (L24)
        <vbox id="sidebar-box" ...>     <- 【火狐原生】书签/历史侧栏 (L25)
        <splitter id="sidebar-splitter" ...>                 (L31)
        #include zen-tabbrowser-elements.inc.xhtml           (L33)
        <tabpanels id="tabbrowser-tabpanels" .../>           (L34)
        <splitter id="ai-window-splitter" ...>               (L36)
```

**注意两层都有 sidebar：**

```
#sidebar-box        <- 火狐原生（书签/历史/GPT 侧栏），我们要【避让】它
#sidebar-container  <- Zen 自己包标签条的外壳，我们的侧栏应该与它并列
```

# 二、AI 工作区侧栏应该放哪

**结论：与 `#vertical-tabs` 并列（在 `html:sidebar-main` 内），不要套在 `#sidebar-container` 外。**

理由（TASK-04 给的）：

```
如果把侧栏套在 #sidebar-container 外面，会继承【标签条的折叠行为】——
标签条折叠时，我们的侧栏会跟着一起消失。
```

# 三、要新增的文件（都是源码文件）

| 路径 | 作用 |
|---|---|
| `src/zen/kokoa/kokoa-ai-sidebar.inc.xhtml` | 侧栏 XUL 骨架（照 `zen-splitview-overlay.inc.xhtml` 抄） |
| `src/zen/kokoa/KokoaAiSidebar.mjs` | 逻辑（若要自定义元素，照 `ZenSpaceIcons.mjs` 抄） |
| `src/zen/kokoa/kokoa-ai-sidebar.css` | 样式 |
| `src/zen/kokoa/jar.inc.mn` | chrome:// 路径映射 |
| `locales/{en-US,zh-CN}/browser/browser/kokoa.ftl` | 文案 |

# 四、要改的既有文件

| 文件 | 改什么 | 为什么 |
|---|---|---|
| `browser-box-inc-xhtml.patch` | 在 `html:sidebar-main` 内 `#include` 我们的片段 | 侧栏要与标签条并列 |
| `zen-assets.inc.xhtml` | `<linkset>` 加 `<link>` | 让样式进主窗口 |
| `zen-assets.jar.inc.mn` | 加 `#include kokoa/jar.inc.mn` | 汇总 chrome:// 映射 |
| `ZenPreloadedScripts.js` | 脚本清单加一行 | 让 .mjs 被加载 |

> ⚠️ `browser-box-inc-xhtml.patch` **也是 patch 文件** —— 同设置页那条，
> **要用 surfer export 生成，不要手写**（手写会 corrupt，已实际踩过）。

# 五、★ 判据：怎么知道侧栏做对了

TASK-04 给了一条可执行的判据，我认为这是整份文档最有价值的一句：

> **如果侧栏需要靠 `!important` 才能不重叠，说明 include 的位置选错了** ——
> 应该挪到正确的容器里，而不是加样式去压。

**这条直接对应 ADR-017 的核心论断**（拥有结构 vs 对抗结构）。

验证办法：

```
1. 构建后在窗口里看侧栏是否出现
2. 用 getComputedStyle 或类似探针，看它是否【自然参与布局】
3. 若发现需要 !important 才能不重叠 -> 位置错了，回第二节重选容器
```

# 六、MVP（按风险从低到高）

## 第 1 步：最小可见

```
1. 写 kokoa-ai-sidebar.inc.xhtml —— 只放一个写死的 <vbox> 与一行文字
2. 在 browser-box-inc-xhtml.patch 里 #include 它（在 html:sidebar-main 内）
3. 建 .css + jar.inc.mn + zen-assets 的 <link> —— 先只给背景色和固定宽度
4. bash scripts/check.sh  <- 必须过
5. 排 CI 构建
6. 【关键】看它是否【不用 !important 就不重叠】
```

## 第 2 步：加自定义元素与逻辑（这一步才需要 .mjs）

## 第 3 步：接 AI 工作区内容

**注意**：接内容这一步现在有把握多了 —— 因为 `docs/known-facts-from-mainline.md`
已经把 dsh 的 URL 行为、会话 id 格式、可观测信号全部记下来了。

# 七、风险

| 风险 | 应对 |
|---|---|
| include 位置选错 -> 需要 !important | 用第五节的判据自检；错了就换容器 |
| patch 手写 corrupt | 用 surfer export；check.sh patches 拦 |
| 侧栏影响现有布局（它是窗口级改动） | 第 1 步只放最小的东西，先确认不破坏别的 |
| `#sidebar-box`（火狐原生）与我们的侧栏冲突 | TASK-04 说两者在同一层级共存，**谁控制谁未查清** |

# 八、我没查清的（继承自 TASK-04）

```
❓ 有没有免改源码的插槽机制（类似 Firefox 的 slot）—— TASK-04 说没找到，
   但没穷尽搜索，不能断言「没有」
❓ #sidebar-container 与火狐原生 #sidebar-box 的共存细节（谁控制谁）
❓ 侧栏折叠/展开的完整状态机（只读了宽度常量与 compact-mode 入口）
❓ 【如果侧栏宽度需要用户可调】状态存哪（kDefaultSidebarWidth 只是默认值）
```

---

# 九、落地记录：MVP 第 1 步（2026-09-16 云端）

## 交付物

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/browser/base/content/kokoa-ai-sidebar.inc.xhtml` | 新增 | DOM 骨架：`<vbox id="kokoa-ai-sidebar">` + 一行 `data-l10n-id` 标题 |
| `src/zen/kokoa/kokoa-ai-sidebar.css` | 新增 | 240px 定宽 + flex-shrink:0 + 边框，**零 !important** |
| `src/zen/kokoa/jar.inc.mn` | 新增 | CSS 映射为 `chrome://browser/content/zen-styles/kokoa-ai-sidebar.css` |
| `locales/{en-US,zh-CN}/browser/browser/kokoa-ai-sidebar.ftl` | 新增 | `kokoa-ai-sidebar-title`（两语言，check.sh l10n 校验一致性） |
| `src/browser/base/content/browser-box-inc-xhtml.patch` | 手改 | 在 `html:sidebar-main` 内、`#vertical-tabs` 之后插 1 行 `#include`；hunk 头 new-count 22→23 |
| `src/browser/base/content/zen-assets.jar.inc.mn` | 改 | include kokoa 的 jar.inc.mn |
| `src/browser/base/content/zen-assets.inc.xhtml` | 改 | `<link>` 挂 CSS |
| `src/browser/base/content/zen-locales.inc.xhtml` | 改 | 挂 ftl |

## patch 手改的安全性论证（为什么这次敢手写）

「不要手写 patch」的原始风险 = **上下文对不上 / index hash 错**。逐条排除：

1. 读 surfer 源码（zen-browser/surfer `src/commands/patches/git-patch.ts`）：
   实际调用是 `git apply --ignore-space-change --ignore-whitespace --verbose`，
   **非 --3way、不带 --index** → index/hash 行被完全忽略；
2. 本次改动 = 在既有 hunk 内部插 1 条纯新增 `+` 行，**不碰任何上下文行与旧侧行号**，
   仅 hunk 头 new-count 22→23（check.sh patches 的 awk 校验兜底行数）；
3. 实测：取 Firefox 155.0.1（FIREFOX_155_0_1_RELEASE）原版 browser-box.inc.xhtml，
   在临时 git 仓库用 surfer 同参数 apply —— **cleanly applied**，
   include 落在第 13 行（sidebar-main 内，与 TASK-04 第二节要求一致）。

## 产物层验证（不用实机）

check-artifact.py 新增 3 项（当前全套 31 项）：
- AI 侧栏 css 进包（jar.mn 直打包）
- AI 侧栏文案进包（ftl）
- AI 侧栏挂载进 browser.xhtml（include 经预处理展开；用 zen-appcontent-wrapper 做
  「形态 sanity」—— 若连 Zen 标记都查不到，先怀疑检查自身假设）

分支行为已用假 omni.ja 双向验证：无侧栏恰 3 FAIL（含「include 未生效」文案）、有侧栏全 OK。

## 待实机（只有人能做）

```
· 开启 Zen 侧栏（垂直标签条可见）→ 标签条右侧应出现「AI 工作区」窄栏（240px）
· 判据：不需要 !important 也不与标签条/网页区重叠
· 若重叠 → 位置错了，回本文档第二节重选容器（不要加样式去压）
· 侧栏收起时我们的窄栏应跟着容器一起隐藏（预期行为：与标签条同显隐）
```

## 下一步（MVP 第 2/3 步，等第 1 步实机确认后）

- 第 2 步：自定义元素 + 接 `KokoaDshSessions`（已在 main，49 用例），
  `ZenPreloadedScripts.js` 加装载行
- 第 3 步：会话列表 UI（session/list → 列表渲染；dsh 内切换，外壳不遥控 —— 已证边界）
