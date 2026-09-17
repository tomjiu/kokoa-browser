# ★★★ 构建成功进入界面（2026-09-15）

**这是真正的里程碑：我们自己的 Kokoa 浏览器能启动、能进主界面、能操作。**

用户确认：「**进去了完美**」。

## 关键：根因是【缺了欢迎页的下一步】

用户的判断是准的，代码里找到了确证。

### 机制（`src/zen/common/modules/ZenStartup.mjs` L170–L193）

```
#checkForWelcomePage() {
  const kWelcomeScreenSeenPref = "zen.welcome-screen.seen";
  if (Services.env.get("MOZ_HEADLESS")) { ...; return; }
  if (!Services.prefs.getBoolPref(kWelcomeScreenSeenPref, false)) {
    Services.prefs.setBoolPref(kWelcomeScreenSeenPref, true);
    ...
    Services.scriptloader.loadSubScript(
      "chrome://browser/content/zen-components/ZenWelcome.mjs", window);
  } else {
    this.#createUpdateAnimation();
  }
}
```

### 为什么会卡住（空白）

欢迎页会设 `zen-welcome-stage` 属性，而**两个核心组件会检查它并跳过自己的初始化**：

```
src/zen/common/modules/ZenUIManager.mjs:546   if (document.documentElement.hasAttribute("zen-welcome-stage")) {
src/zen/spaces/ZenSpaceManager.mjs:916        if (document.documentElement.hasAttribute("zen-welcome-stage")) {
```

因果链：

```
欢迎页被加载 -> zen-welcome-stage 属性设上
  -> 但欢迎页自身没渲染出来（资源/构建问题）
  -> UIManager 与 SpaceManager 都以为「欢迎流程进行中」，各自跳过初始化
  -> 属性在、UI 未建、欢迎页也没显示
  => 窗口一片空白/绿色渐变，卡住
```

## 临时解法（已验证有效）

在 profile 的 `user.js` 里：

```
user_pref("zen.welcome-screen.seen", true);
```

设了之后：**11 个进程、窗口正常、界面完整、可点击操作。**

## 正式解法（待做）

**不要靠 user.js**（那只对新 profile 有效）。要改到构建里：

| 方案 | 做法 | 评价 |
|---|---|---|
| **改源码**（推荐） | 改 `ZenStartup.mjs` L176，让默认就走 else 分支（把 `kWelcomeScreenSeenPref` 的默认值从 false 改成 true） | 源码级修改，可搬运性不受影响，正是分支路线该做的 |
| 写默认层 pref | `defaults/preferences/*.js` 里 `pref("zen.welcome-screen.seen", true)` | ⚠️ 当时记为「默认层静默失效」。**真因已查明（2026-09-17，见 `prefs-mechanism-CONFIRMED.md` 第六节）**：`prefs/zen/welcome.yaml` 里 Zen 自己也定义了同名 pref，而 ffprefs 对同名条目保持目录遍历序、prefs 引擎后定义覆盖前定义 —— `kokoa/` 在 `zen/` 之前，所以我们那条**必输**。已改成从权威位置（`prefs/zen/welcome.yaml`）无条件 `true`，并加守卫 `check.sh prefs-shadow` |
| 做自己的欢迎页 | 保留机制，换 Kokoa 首启页 | 工作量大，用户明确说「暂时不需要」 |

## ★ 另一个重要发现：之前「空白窗口」的测试是误判

我之前测试用的运行时**不完整** —— `E:\temp\kokoa-zip\kokoa\` 只剩 66 个文件，
`kokoa.exe` / `xul.dll` / `omni.ja` 都已不在（被之前的测试清理掉了）。

**用不完整运行时测出的「空白」，不能作为任何结论。**
重新解压完整运行时（151 MB zip -> 64 文件 400.9 MB）后才得到正确结果。

> 教训：**测试前先确认被测物完整**（关键文件存在性检查），不要拿残缺的副本下结论。

## 用户报告的三个待修问题

### 问题 1：点星星按钮 -> dsh 报 authentication required

**原因（已定位）**：我们硬编码的 URL **没有 token**。

`src/zen/common/zen-sets.js` L169–L180：

```
case "cmd_kokoaOpenAiWorkspace": {
  // Kokoa first-owned UI: open the local AI workspace as a tab.
  // URL is a constant on purpose — no config system yet.
  gBrowser.selectedTab = gBrowser.addTab("http://127.0.0.1:3080/", {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  break;
}
```

而 dsh 要求 token。证据：用户机器上跑着的火狐，命令行里就是带 token 的：

```
"C:\Program Files\Mozilla Firefox\firefox.exe" -osint -url http://127.0.0.1:3080/?token=FIQk6...
```

**修法**：不能硬编码常量。必须**运行时获得 dsh 的带 token URL**。
方向（待设计）：

```
a) 从别处读 token（dsh 的配置文件/环境变量/CLI 输出）
b) 调 dsh 的 CLI（用户提示语就是「reopen the URL printed by dsh web」）
c) 让 Kokoa 自己管一个 dsh 实例，启动时拿到 URL
```

### 问题 2：三个点的「更多」按钮字体全缺失

**未定位**。方向：

```
a) 那个按钮的 data-l10n-id 是什么？对应的 .ftl 在不在包里？
b) 我们覆盖了 l10n 文件但漏了键？
c) 中文语言包缺失，回退 en-US 也失败？
```

### 问题 3：页面不流畅、有点卡顿

**未验证的推测**（明确标为推测）：

```
a) 【最可能】我们的构建显式关掉了 PGO（ZEN_GA_DISABLE_PGO=1）
   官方 Zen 用三级 PGO（构建 -> 采 profile -> 带 profile 重建）
b) 交叉编译 + 无 LTO
c) 首次启动还在建索引，稳定后会好
```

> 验证办法：对比官方 Zen 在同一台机器上的顺滑度。若官方明显更顺，(a) 的可能性大幅上升。
