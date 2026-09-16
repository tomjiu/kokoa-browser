# 距「初步完成」还差多少（2026-09-16 晚 收尾盘点）

> 这份是【重新核对过源码与产物】的现状。上一版（等 35056127083）已过期。

---

# 一、已完成且有产物证据（构建 35056127083 = de4a478）

| 项 | 证据 |
|---|---|
| 品牌名 = Kokoa | 产物 brand.ftl：5 项全是 Kokoa |
| 5 个 AI 模块进包 | 产物 `modules/zen/Kokoa*.mjs` |
| 关于对话框无 Zen 残留 | 产物 aboutDialog.xhtml 里 zen 出现 **0** 次 |
| 欢迎页大标题已删 | 产物确认 |
| 菜单可配置（3 项默认隐藏） | 产物 firefox.js 里 5 条 kokoa.menu.* 默认值 |
| Zen 模组商店地址 | 已修 404 -> 真实 CDN（77 个模组可用） |
| 单测 | 10 个文件 / 197 用例全过；产物上重跑也全过 |

# 二、★ 已完成但【尚未构建验证】的（构建 35096636452 在跑）

```
de4a478（上次构建，上面那些）之后的 9 个提交：

  c5ec6bb  Merge PR#2: dsh 会话列表客户端
  b0962e7  菜单隐藏【实机不生效】的真正修复（template 里，不在 document）
  dfe54e1  启动跳 GitHub / 默认浏览器弹窗 / 检查脚本
  bddb94a  「检查更新失败」-> 关掉 app.update.*
  8f63df8  贴牌 URL 全局替换的 3 处错误（模组 404 / 捐赠 / 卸载问卷）
  a4d5333  去掉新标签页徽标 + 设置页分类图标
  cbda640  去掉关于对话框 logo + 隐私浏览页 logo/字标
  f71e4ed  彻底关掉「设为默认 + 固定任务栏」弹窗（cfr.features 总开关）
  f61ed9e  去掉关于对话框字标 + 隐藏「更多来自 Mozilla」面板
```

**构建 35096636452 在跑（基于 d022d83 —— 修了 patch 格式问题后重排）**。出来后：

```bash
gh run download 35096636452 --repo tomjiu/kokoa-browser --dir ./builds/35096636452
python scripts/check-artifact.py ./builds/35096636452    # 预期全绿（含新增 pref 检查）
bash scripts/verify-artifact-modules.sh ./builds/35096636452
```

# 三、★ 还没解决的（按重要性）

## 3.1 设置页「Kokoa」分类：进去只有搜索框 + 点它闪回默认页

**这是个真功能问题**（AI 设置页打不开），一直没定位。

已排除的（逐环核对过，每一环都对）：
```
✅ 导航按钮存在（view="paneKokoa"）
✅ preferences.js 里 register_module 有
✅ 模板展开条件加了 paneKokoa
✅ kokoa-settings.js 里 gKokoaSettings 有定义
✅ 脚本顺序（DOMContentLoaded 后才 init）
✅ 名称转换守恒（paneKokoa -> kokoa -> paneKokoa）
```

**下一步需要【运行时日志】**：
```bash
kokoa.exe -jsconsole -no-remote -profile <profile>
# 然后：设置 -> 点那个空白项 -> 看控制台红色错误
```
（试过 MOZ_LOG，日志为空；也试过临时改 omni.ja 注入诊断代码 —— 脚本似乎没执行，
 但那个结论受「注入方式」影响，不够确凿。）

## 3.2 少数位置的品牌 logo（用户可见性低）

| 位置 | 状态 |
|---|---|
| customkeys 侧栏顶部 logo | 该文件【不在我们树里】（来自上游），要改得新建 patch |
| profile-selector 窗口 logo | 只在多 profile 时出现 |
| QRCodeWorker 里的 logo | 「下载移动版」二维码，可整块去掉 |
| aboutwelcome.bundle.js | Firefox 欢迎页组件，Zen 不用 -> 用户看不到 |
| OnboardingMessageProvider / PanelTestProvider | 内部/测试用 |

## 3.3 其他（不阻塞）

```
· AI 工作区侧栏         未实现（是增强：现在「标签页+分屏」已能用）
· dsh 会话切换          接口没查清；代码【故意只记录状态】
· branding 应用图标     还是 Zen/Firefox 的图（surfer 要求文件必须存在）
· release 流水线的 zen-browser/* 引用
```

# 四、一句话

**代码层：品牌清理 + AI 工作区已基本做完，等 35093838416 验证。**
**唯一的功能缺口：设置页 Kokoa 分类打不开（需要一次带控制台的实机排查）。**

# 五、分类原则（用户明确过）

```
去掉：品牌标识（Zen 橙色圆、Firefox 字标、应用内推广）
保留：功能图标（隐私浏览标识、文件类型图标、Windows 磁贴、安装向导水印）
```
