# 实机测试清单（构建出来后照这个点）

> 单测覆盖了 94 个用例，但以下这些**测不了**（要真进程 / 真 UI）。
> 构建产物出来后，照这份清单逐条点，记录结果。
>
> **2026-09-18 自动化旁证**见 `acceptance-2026-09-18-phase0.md`：
> 运行时 M0 判据、产物 pref/模块/品牌、GUI shell 证据已勾；
> 下列纯 UI 点击项仍需人眼确认。

---

# 零、前提：先确认这次构建【包含】要验的改动

```bash
sha=$(gh api repos/tomjiu/kokoa-browser/actions/runs/<id> --jq '.head_sha')
git merge-base --is-ancestor <commit> $sha && echo "在构建里" || echo "不在"
```

**不要跳过这步** —— 我上次的教训（`docs/artifact-verification.md`）。

---

# 零之二、【产物层面】先查 pref 默认值（实机前就能验）

菜单功能依赖 pref 的【默认值】。默认值来自 `prefs/kokoa/menu.yaml`，
经 `npm run ffprefs` 编译，最后【内联进 `defaults/preferences/firefox.js`】。

（已验证机制：构建 35047911545 的产物 firefox.js 里有 140 条 zen.* pref，
说明 dynamic prefs 确实走这条路；当时 kokoa.menu.* 有 0 条，
因为菜单功能还没进那次构建。）

验证办法（python）：
```
import zipfile, re
zf = zipfile.ZipFile(omni_ja_path)
t = zf.read('defaults/preferences/firefox.js').decode('utf-8','replace')
for m in re.finditer(r'pref\(\s*["](kokoa\.menu\.[^"]+)["]\s*,\s*([^)]{0,20})\)', t):
    print(m.group(1), '=', m.group(2).strip())
```

预期（菜单功能那次构建 35056127083）：
```
kokoa.menu.new-tab.visible     = true
kokoa.menu.new-window.visible  = true
kokoa.menu.print.visible       = false    <- 默认隐藏
kokoa.menu.fxa.visible         = false    <- 默认隐藏
kokoa.menu.save-file.visible   = false    <- 默认隐藏
```

**若这里缺项或值不对** -> 是 `prefs/kokoa/menu.yaml` 没被 ffprefs 收进去，
先别急着实机，回到那一步查。

（ffprefs 是递归扫 `prefs/` 下所有 yaml 的 ——
见 tools/ffprefs/src/main.rs L139 get_prefs_files_recursively，
所以新建 `prefs/kokoa/` 子目录【不需要】额外登记。）

---

# 一、AI 工作区（主线功能）

## 1.1 入口在哪
左侧边栏【顶部】有两个按钮（`ZenCustomizableUI.sys.mjs` L84/L92）：
- 「AI 工作区」（`cmd_kokoaOpenAiWorkspace`）
- 「与网页并排」（`cmd_kokoaToggleAiSplit`）

## 1.2 点「AI 工作区」
```
预期：
  □ 若 dsh 没在跑 -> 自动拉起（dsh web --no-open）
  □ 打开一个标签页，URL 是 http://127.0.0.1:3080/ 且【带 token】
  □ 页面显示 dsh 界面（不是 "web authentication required"）

若失败，看控制台：
  · "[Kokoa/sidecar] 找不到 dsh 或 node"  -> Node/dsh 没装或不在标准位置
  · "web authentication required"         -> URL 缺 token（getPanelUrl 兜底了）
  · 标签没打开                              -> 看 [Kokoa] 前缀的错误
```

## 1.3 点第二次「AI 工作区」
```
预期：□ 【复用】已打开的那个标签，不再新开一个
（这是从主线移植来的改进 —— 原实现每次都 addTab）
```

## 1.4 点「与网页并排」
```
预期：□ AI 面板与当前网页【左右并排】（AI 在右侧）
若失败，看 reason：
  · "Zen 分屏不可用"        -> gZenViewSplitter 没加载
  · "当前选中的就是 AI 面板" -> 先切到别的网页再点
  · "splitTabs 调用了但分屏没激活" -> 底层拒了（参数不合法会静默 return）
```

## 1.5 设置页能正常打开（★ 2026-09-16 修过"空白 + 闪烁"）
```
设置 -> Kokoa
预期：□ 右侧【有内容】：AI 工作区那节（2 个按钮 + dsh 状态）+ 菜单那节（5 个复选框）
      □ 不再空白、不再"闪一下就没"
      □ 内容【不会】出现在「账户与同步」那一栏里
      □ 切到别的分类再切回来，内容还在（不是只在第一次点的时候出现）
      □ Ctrl+R 刷新后点 Kokoa 依然有内容

设置 -> Kokoa -> AI 工作区 那节
预期：□ "dsh 状态" 那行显示 running/stopped（不是一直"正在检查"）
```
原理与两个坑见 docs/settings-pane-mechanism.md。

---

# 二、菜单（本轮新做的）

## 2.1 点右上角三条杠
```
预期：□ 【打印】不在菜单里
      □ 【登录 Firefox】不在菜单里
      □ 【保存页面为…】不在菜单里
      □ 新建标签页 / 新建窗口 仍在
```

## 2.2 打开开关
```
设置 -> Kokoa -> 菜单
预期：□ 勾选「打印」后，菜单里【立刻】出现打印
      □ 取消勾选后消失
```

## 2.3 ★ 功能还在（不是砍掉）
```
预期：□ Ctrl+P 仍能打印（隐藏的是入口，不是能力）
      □ 同步功能仍能工作
（这符合产品原则 —— 见 workitem-menubar-configurable.md 第 24 节）
```

---

# 三、贴牌（前几轮做的，顺带确认）

```
□ 关于对话框显示 "Kokoa Browser"（不是 Zen）
□ 欢迎页【没有】大标题 slogan（本轮构建验证）
□ 新标签页【没有】Zen logo（本轮构建验证）
```

---

# 四、怎么记录

每条目打勾或写「失败 + 控制台原文」。
**失败时不要猜** —— 把 `[Kokoa` 开头的日志原样贴出来。

**2026-09-18 部分结果**（详见 `acceptance-2026-09-18-phase0.md`）：

```
[x] 零之二 menu pref 5 条（产物）
[x] dsh 带 token HTTP 200（非 authentication required）
[x] 首屏 about:kokoa；AI 按钮在侧栏顶；设置#kokoa 打开过
[x] menu_init=ok；product_defaults applied；welcome_seen=true
[ ] 1.2/1.3 点 AI 工作区复用标签（人点）
[ ] 1.4 分屏（人点）
[ ] 2.1–2.3 菜单勾选 / Ctrl+P（人点）
[ ] 三 关于对话框文案（人点）
[ ] BRP 扩展 tab.list（扩展侧重连后）
```

---

# 五、如果 AI 工作区打不开 —— 排查顺序

```
1. Node 装了吗？            node --version
2. dsh 装了吗？             npm ls -g @deepseek-ai/dsh
3. 环境变量注入了吗？       KOKOA_DSH_URL / KOKOA_STATE_DIR
   （没注入就走兜底 http://127.0.0.1:3080/，可能缺 token）
4. 控制台有没有 [Kokoa/sidecar] 的日志
5. dsh 能不能手动跑起来？   dsh web --no-open --port 3080
```

**第 5 步最关键** —— 如果手动都起不来，问题不在我们这边。
