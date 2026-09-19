> ## ⛔ 本仓已停止构建（2026-09-19）—— 路线变了
>
> 本仓（Zen 源码分支）**不再是产品路线**。新路线：**官方 Firefox ESR 固定 runtime +
> `-app` 挂载自持 `app-shell`**，改 UI **零编译**。
> 本仓成果**已归档不删**：分支 + tag `archive/zen-fork-2026-09-19`（`0f3a69b`）。
>
> 完整方向与理由（在主仓 `tomjiu/kokoa`）：`docs/direction-2026-09-19.md`、ADR-020 / ADR-021。
> **本文保留作历史与对照，不要照它继续做。**

> ⚠️ 本文是交给分支线代理的简报，其前提（fork Zen 源码）**已作废**。

# 代理交接：Kokoa 定制化阶段的现状（2026-09-15）

> 给【两个代理】看的同一份现状说明。
> 请先读它，避免重复摸索已经查清的部分。

---

# 一、项目是什么

```
Kokoa Browser —— 基于 Zen（Zen 基于 Firefox）的浏览器产品。
仓库：https://github.com/tomjiu/kokoa-browser
  · 是【Zen 的 fork】，用 surfer 工具链（https://github.com/zen-browser/surfer）
  · src/** 是【源码级覆盖】—— surfer import 会把 src/ 覆盖到 engine/（Zen 源码树）
  · engine/ 是 Zen 源码（不入库，构建时下载）

构建：GitHub Actions 交叉编译到 Windows，一次约 3 小时。
  工作流：.github/workflows/probe-zen-cross-build.yml
  产物：kokoa-win64-build（约 495 MB）
```

# 二、已经完成的（**不要重复劳动**）

## 2.1 构建链已跑通

```
· 能构建出完整的 Windows 产物（已成功多次）
· 产物能启动进主界面
· 533 个 zen-*.ftl 文案已进入产物（之前缺失，因为跳过了 language packs 步骤）
```

## 2.2 贴牌：用户可见的部分基本改完

```
已改（全部实测过）：
  · 应用名 Name=Kokoa / CodeName=Kokoa Twilight / RemotingName=kokoa-twilight
  · Version=0.1.0t / SourceRepository=我们的仓库 / SourceStamp=我们的 commit
  · updater.ini 文案：Twilight Update -> Kokoa Twilight Update
  · 关于页 4 个 Zen 链接 -> 我们的（aboutDialog-xhtml.patch）
  · 主题市场 / 捐赠 / 分享 / 注入白名单 / 卸载调查 URL -> 我们的
  · 品牌残留 17 处 -> 0 处（check.sh brands 通过）
```

## 2.3 check.sh（静态检查，秒级）

```
scripts/check.sh，7 项检查：
  syntax / json / prefs / l10n / brands / patches / mozconfig
用法： bash scripts/check.sh all
【改动前先跑它】—— 它能拦住几类会让构建失败的问题。
```

# 三、当前未解决的（**这是要给代理做的**）

## 3.1 ★ Vendor / ID / Profile 的根因（**已查清，待验证与决策**）

```
根因（决定性证据）：
  Firefox 的 browser/moz.configure 第 14-15 行：
      imply_option("MOZ_APP_VENDOR", "Mozilla")
      imply_option("MOZ_APP_ID", "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}")

  imply_option 的优先级【高于】project_flag 的 default，
  且把来源限定为 implied —— 所以 env / mozconfig / default 全部无效。

  · MOZ_APP_VENDOR 被 imply  -> 产物 Vendor=Mozilla
  · MOZ_APP_ID 被 imply     -> 产物 ID={Firefox GUID}
  · MOZ_APP_PROFILE 没被 imply -> env 应该有效（【正在验证】）

  已知：Zen 官方【也没有】patch browser/moz.configure，
        所以 Zen 官方产物的 Vendor 也是 Mozilla。
```

## 3.2 其它未解决的

```
· 页面卡顿（用户报告）—— 推测是关了 PGO（ZEN_GA_DISABLE_PGO），【未验证】
· AI 工具栏按钮是否真的出现在界面里 —— 需要人眼看截图
· 全量测试（25 套件）在分支上跑过吗 —— 没跑过
```

# 四、已知的"不要做"（**踩过的坑**）

```
· 不要往 mozconfig 里 export MOZ_APP_VENDOR  -> mach 报错
· 不要往 CI env 里设 MOZ_APP_VENDOR        -> mach 报错（被 imply）
· 不要手写 patch 文件                       -> 会 corrupt
   正确流程：改 engine/ 里的原文件 -> npx surfer export <路径>
· 不要用「用 !important 才能不重叠」的方式做 UI
   -> 那说明 include 位置错了，应该挪容器（见 ADR-017）
```

# 五、几份必读的文档（在仓库 docs/ 下）

```
【先读这几份（按顺序）】
docs/remaining-to-done.md         ★ 距「初步完成」还差多少（最新盘点，先看这个）
docs/testing-pitfalls.md          ★ 写测试时我踩过的坑（10 条，写测试前先扫一眼）
docs/artifact-verification.md     ★ 核对产物的正确姿势（我在这上面错过一次）
docs/ai-unit-test-boundary.md     AI 模块哪些能 Node 单测、哪些必须实机
docs/manual-test-checklist.md     实机测试清单（构建出来后照着点）

【背景 / 机制】
docs/known-facts-from-mainline.md 从主线提取的实测结论（dsh / Subprocess / DOM）
docs/zen-code-map.md              Zen 代码掌控度地图（哪些模块摸清了）
docs/vendor-profile-unsolved.md   Vendor/Profile 的问题史（含我的错误）
docs/branding-residue-full.md     品牌残留清单
docs/build-metadata-conventions.md 构建元数据的约定（patch/png 等，踩过 5 次）

【工作项 workitem-*.md（6 份）】
  已完成：菜单可配置 / 会话绑定 / AI 移植 / 设置页
  未开始：AI 工作区侧栏（增强，不阻塞）
  AI 面板接口：dsh 会话切换怎么做的还没查清

【构建核对记录】
docs/build-35047911545-verified.md  最近一次成功构建的核对结果
docs/build-artifact-layout.md       产物存放约定（别再散落一地）
```

# 六、验收方（我）的已知弱点（**请据此设计你们的产出**）

```
我在这个项目里犯过 5 次同类错误，全是【读一点代码就推断】：
  1. 以为 MOZ_APP_VENDOR 的 default 管 Vendor      -> 实际被 imply_option 覆盖
  2. 以为 application.ini 来自 Firefox 模板        -> 实际是 Zen/surfer 的模板
  3. 以为 tools/ffprefs 不处理 prefs/*.yaml        -> 实际处理（我只读了文件头）
  4. 说 l10n-central 覆盖了我们的文案              -> 解析脚本 bug，误读产物
  5. 曲解 __init__.py 的一段，用来"验证"别人的结论  -> 一起错了

=> 所以我的产出要求是：
   · 【每条结论都要给可核验的证据】（文件路径 + 行号 + 片段）
   · 【严格区分】"我验证了" 与 "我认为"
   · 查不到就写"没查到"，不要猜
   · 如果你推翻了上面的某个结论，【直接说】—— 那比顺着我说更有价值
```
