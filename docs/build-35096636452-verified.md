# 构建 35096636452 核对结果（2026-09-16）

**状态**：success（约 3 小时：12:34:39 -> 15:31:39 UTC）
**headSha**：`d022d83`
**验证方式**：`scripts/check-artifact.py` + `scripts/verify-artifact-modules.sh`

---

# 一、核对前先确认（祖先检查）

9 个提交全部在构建里：
```
c5ec6bb  Merge PR#2: dsh 会话列表客户端
b0962e7  菜单隐藏的真修复（template 里，不在 document）
dfe54e1  启动跳 GitHub / 默认浏览器弹窗 / 检查脚本
bddb94a  「检查更新失败」-> app.update.*
8f63df8  贴牌 URL 3 处错误（模组 404 / 捐赠 / 卸载问卷）
a4d5333  去掉新标签页徽标 + 设置页分类图标
cbda640  去掉关于对话框 logo + 隐私浏览页 logo/字标
f71e4ed  彻底关掉「设为默认 + 固定任务栏」弹窗（cfr.features）
f61ed9e  去掉关于对话框字标 + 隐藏「更多来自 Mozilla」面板
```

**这是第一次「先做祖先确认再核对」之后全部通过的构建。**

# 二、产物核对：28 通过 / 0 失败

```
模块进包 6     KokoaAiPanel / KokoaAiSplit / KokoaDshSessions
               KokoaDshSidecar / KokoaWorkspaceSessions / KokoaMenubar

菜单 pref 5    new-tab=true, new-window=true,
               print=false, fxa=false, save-file=false

★ 默认浏览器/任务栏 5
               checkDefaultBrowser=false
               setDefaultBrowserUserChoice=false
               setDefaultGuidanceNotifications=false
               skipDefaultBrowserCheckOnFirstRun=true
               pinToTaskbar=false

★ 推荐消息总开关 2
               cfr.features=false, cfr.addons=false

★ 更新检查 2   app.update.enabled=false, app.update.auto=false

品牌 5         -brand-shorter/short/full/product-name、-vendor-short-name = Kokoa*
★ 欢迎页 URL 不指向外部站点（不打开 GitHub）
★ 欢迎页大标题已删
★ 新标签页 hideLogo = true
```

# 三、产物模块测试：202 用例全过

```
从 omni.ja 抽出 6 个 Kokoa*.mjs，跑单测：
  KokoaAiPanel.behavior           35
  KokoaAiPanel                    16
  KokoaDshFinder.behavior         14
  KokoaDshSessions.behavior       49
  KokoaDshSidecar.behavior        20
  KokoaDshSidecar                  9
  KokoaMenubar.behavior           20
  KokoaMenubar                    10
  KokoaMenuConsistency             5（在源码树跑，与本产物无关）
  KokoaWorkspaceSessions.behavior 24
                                 ───
                                 202 通过 / 0 失败
```

# 四、代码级修复核对（读产物源码）

| 修复 | 核对结果 |
|---|---|
| Zen 模组商店地址 | ✅ 唯一的 return 是 `zen-browser.github.io/theme-store/themes/...` |
| 捐赠按钮 | ✅ `notification-donate` 已不在 ZenUpdates.mjs |
| 关于对话框 logo | ✅ `#leftBox` 的 `background-image: none` |
| 关于对话框字标 | ✅ `#rightBox` 的 `background-image: none` |
| 隐私浏览页 logo/字标 | ✅ aboutPrivateBrowsing.css 里两个引用都没了 |
| moreFromMozilla 面板 | ✅ `visible: () => false` |

# 五、★ 核对脚本自己的一个 bug（已修）

第一次跑 `check-artifact.py` 报了 **24 通过 / 4 失败**：
```
FAIL pref app.update.enabled = false          <- 缺
FAIL pref app.update.auto = false             <- 缺
FAIL pref ...cfr.features = false             <- 缺
FAIL pref ...cfr.addons = false               <- 缺
```

**差点以为构建没生效。** 但直接搜产物发现它们【都在】：
```
  app.update.enabled  = false
  app.update.auto     = false
  cfr.features        = true, false, false   <- 最后一个是我们的，胜出
  cfr.addons          = true, false, false
```

根因：检查脚本的正则只收了 `kokoa.menu.*` 与 `browser.shell.*`，
**漏了 `app.update.*` 和 `browser.newtabpage...asrouter.userprefs.*`**。
已修（顺带把「同名多次定义取最后一次」的语义写进注释）。

**教训**：检查脚本自己也会撒谎。报 FAIL 时先直接搜一遍产物再下结论。

# 六、patch 修复的最终确认

上次构建（35093838416）在 **Import 步 7.5 分钟就挂了**，原因是我改的 patch：
  · hunk 头 `@@` 前面多了空行 -> `patch fragment without header`
  · 上下文行被截断（`we will` vs `we'll`、少了 ` center`）

这次：
```
[success] Import          <- 257 个 patch 全部应用成功
```
并新增了两层防护：
  · `check.sh` 第 3 道 patch 检查（@@ 前不能有空行）—— 离线、版本无关
  · `scripts/preflight-patches.py` —— 真实 `git apply --check`
    全量预检：83 通过 / 0 失败 / 174 跳过

# 七、还没有验证的（只有实机）

```
· 设置页「Kokoa」分类能否打开      <- 唯一未解决的功能问题
· 弹窗是否真的不弹了（pref 已在产物里，要实机确认行为）
· 菜单里打印/登录是真的不显示了
· AI 工作区能否拉起 dsh
```

实机清单见 `docs/manual-test-checklist.md`；可运行产物在
`E:\builds\run-35096636452`（未解压，需从 zip 解出）。
