# 距「初步完成」还差多少（2026-09-18 更新）

> 之前几份文档的「待办」散落各处、部分已过期。
> 这一份是【重新核对过源码、产物与运行时】的现状。
> 迁移主线另见 `dsh-cpa-brp-migration-plan.md` · 验收见 `acceptance-2026-09-18-phase0.md`。

---

# 一、已经完成的（有证据）

| 项 | 证据 |
|---|---|
| 品牌名 = Kokoa | 产物 brand.ftl：41 locale，kokoa=205 / zen=0；aboutDialog.xhtml zen=0 |
| 6 个 AI 模块进包 | 产物 `modules/zen/Kokoa*.mjs`（35173069555 含 KokoaMenubar / KokoaDshSessions） |
| 设置页 Kokoa 分类 | 产物 41 个 ftl + kokoa-settings.js；面板空白根因已修（`data-category`） |
| AI 面板 / 分屏 / 会话绑定 | 源码已实现；设置页两按钮走同一路径 |
| 菜单可配置（默认隐藏 3 项） | 产物 5 条 `kokoa.menu.*` pref；实机验收已过（b0962e7） |
| 欢迎页 / 新标签 logo | `zen.welcome-screen.seen=true`；`activity-stream.hideLogo=true` |
| 单测 | 197+ 用例；产物上重跑全过（多轮构建） |
| pref 同名覆盖 | 已修 + `check.sh prefs-shadow` 守卫 |
| **Phase 0 启动编排** | 主线 `start-kokoa.ps1`：brp-bridge + sidecar + dsh token + 证据文件 |
| **产品 BRP MCP 注入** | `ensure-dsh-cpa-provider.ps1` cordis **insert** 形态；dsh 子进程 guarded→adapter 在 |
| **M0 运行时自动化判据** | 见 `acceptance-2026-09-18-phase0.md`：token 200 / 8318 / lock / CPA managed+running / mcp-brp |
| CPA 状态源统一 | 消费方全指 8318；旧双源控制条已删（`b92da05`） |

# 二、★ 还差什么才算「初步完成」

## 2.1 迁移主线（dsh/CPA/BRP → C 链）

按 `dsh-cpa-brp-migration-plan.md`：

| 阶段 | 状态 |
|---|---|
| **Phase 0** 一键起来 | ✅ 0.1–0.5、0.7 完成；0.6 纯 UI 点击项仍开放 |
| **Phase 1** CPA/dsh 设置原生 | ⬜ 下一阶段（本仓已有设置骨架 + 主线 `kokoa.mjs` 待迁） |
| Phase 2 首页/文件树 | ⬜ |
| Phase 3 BRP 产品化 | ⬜（扩展 `tab-list-error` 仍开放） |
| Phase 4 链收敛 | ⬜ |

**M0 自动化面已过**；扩展侧重连 + 人工点 UI 是收尾项。

## 2.2 只有人能做的（`manual-test-checklist.md`）

```
□ 点「AI 工作区」→ 复用标签
□ 点「与网页并排」→ 左右分屏
□ 设置 → Kokoa 切换/刷新内容仍在
□ 三条杠：打印/登录/保存 默认不在；勾选立刻出现
□ Ctrl+P 仍能打印
□ 关于对话框显示 Kokoa Browser
□ BRP 扩展重连后 navigate/snapshot
```

自动化已旁证：首屏 about:kokoa、AI 按钮在、设置#kokoa 打开过、menu_init=ok、dsh token 200。

## 2.3 已完成（有证据）— 历史项保留

| 项 | 证据 |
|---|---|
| dsh 接口三未知 | 已关闭（dsh-0.1.5-interface.md） |
| 实机验收第一轮 | 完成（dfe54e1 等 8 提交） |
| 品牌 logo 清理 | branding-removal.md + scan-branding-refs.py |
| 设置面板空白/闪烁 | settings-pane-mechanism.md；产物 35164347415 OK |
| 156.0 patch 债 | PR #3 已清；248 patch 离线探测全过 |

# 三、之后再说（不阻塞）

| 项 | 说明 |
|---|---|
| 侧栏第 2/3 步 | 第 1 步已过产物验证；接 KokoaDshSessions 做会话列表（Phase 3.4） |
| branding 图标 | 应用图标仍是 Zen/Firefox（需美术） |
| dsh 会话外部切换 | 做不到（无 deep-link）；列表展示 + 引导内切 |
| release 流水线 zen-browser/* | 真做发布时再清 |

# 四、一句话

**代码层与 M0 运行时自动化判据已闭环（Phase 0 完成 + BRP MCP 进 dsh）；
剩纯 UI 人工点检与 BRP 扩展重连，然后进 Phase 1（CPA/dsh 设置迁入本仓）。**

# 五、基线升级遗留：156.0 patch 债（PR #3 已清）

上游升级（改 candidate）后，先跑离线批量探测（248 patch × 原版 `git apply --check`），
再排构建。jar.mn 纯 CSS 条目不要加 `*` 前缀。

# 六、相关提交（2026-09-18 晚）

| 仓 | 提交 | 内容 |
|---|---|---|
| 主线 | `42e616c` | BRP MCP insert 注入 + 文档勘误 |
| 主线 | `8da8229` | Phase 0 启动编排 |
| 本仓 | `65ad421` | Phase 0 复核 + 验收记录 |
| 本仓 | `fd95bcb` | 迁移计划 |

两仓均 ahead 3，**未 push**。
