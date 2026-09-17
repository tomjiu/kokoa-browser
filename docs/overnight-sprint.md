# Kokoa 分支 · 今晚攻坚工单

> 对象：一个**没有上下文**的子代理。请完整读完再动手。
> 验收方不在线，**你今晚的产出明天会被逐条核实**。

---

# 一、今晚的唯一目标

把 `kokoa-browser` 从「**只跑上游探针的空壳**」变成「**能构建我们自己代码的真实分支**」，
并在源码层做出**第一个属于 Kokoa 的东西**。

一句话：**今晚结束时，CI 应该能编出「带着我们改动的 Kokoa」，而不是「原版 Zen」。**

---

# 二、背景（你没有上下文，这是全部）

**Kokoa** 是一款「**AI 工作区与网页同级**」的桌面客户端 —— AI 会话不是侧边栏里的附属品，
而是和网页平起平坐、可以原生分屏的一等公民。**这是本产品唯一不可替代的地方。**

此前它靠**覆盖官方 Firefox 的资源包（omni.ja）**实现，撞上四个死结：
布局一抖就要重对齐 / 观感像外挂 / 主线程堆满补偿定时器 / 每版本一次回归税。
四个是**同一个病：覆盖 ≠ 拥有**。

**决策（主仓 `docs/architecture.md` ADR-017 / ADR-018）**：
以 **Zen Browser** 为上游做**源码级分支**，把界面与能力**做进**浏览器。

**为什么是 Zen**：它已经用源码补丁实现了垂直标签 / 工作区(spaces) / 紧凑模式 /
分屏 / Glance / 设置页信息架构 —— 这些我们**直接继承**，把时间留给 AI 差异化。

**试验田**：https://github.com/tomjiu/kokoa-browser （**公开**，独立于主仓）
- 上游：https://github.com/zen-browser/desktop （MPL-2.0，默认分支 `dev`）
- 主仓（**2026-09-17 起可直接改**；原「绝对不要碰」随并行任务结束解除）：`E:\Code\ai\kokoa-workspace\kokoa`

**构建可行性已经验证过了**（今晚之前）：
```
磁盘   标准 runner 实际是 145 GB 的盘（官方文档写的 14 GB 是错的），装完所有依赖剩 96 GB
交叉链 apt 依赖 + Wine + VS 工具链 + 256 个 git 补丁全部成功
耗时   7 分 18 秒走到 bootstrap 步
```

---

# 三、铁律（**违反即今晚作废**）

```
1. 【已解除 · 2026-09-17】原文：绝对不要修改  E:\Code\ai\kokoa-workspace\kokoa  下的任何文件 ——
   那是产品主线，有别的 AI 在并行开发。该并行任务已结束，主仓现在可以直接改。
2. 绝对不要修改已安装的 Zen：C:\Program Files\Zen Browser\
3. 不要在本机安装任何构建工具链（MozillaBuild / VS 组件等）—— 构建全部在 CI 上做
4. 不要改 probe-zen-cross-build.yml 里的构建参数（PGO / LTO / 目标平台）
   —— 那会污染可行性实验。但【任务 1 要求的 checkout 改动是允许的】，见下
5. 【报错照抄原文】。不要转述、不要揣测原因、不要"顺手修一下"别的配置
6. 报告必须严格区分「我验证了」（附命令 + 原始输出）与「我认为/我推测」
7. 不要写多份互相矛盾的总结文档。一份就够，写清楚
8. 每完成一个任务就【提交并推送】，不要攒到最后一起提交
```

---

# 四、任务（**按顺序做。前面的没完成，不要跳到后面**）

## 任务 1（**最高优先级，今晚的地基**）

### 问题

现在 workflow 的 checkout 步骤拉的是**上游 Zen**：

```
      - name: Checkout Zen
        uses: actions/checkout@v4
        with:
          repository: zen-browser/desktop     ← 拉的是别人
          ref: ${{ inputs.zen_ref }}
          fetch-depth: 1
```

**后果：你写的任何代码都不会被构建、不会被测试。** 这一条不解决，今晚其余全是空转。

### 目标

让 `kokoa-browser` **本身就是一棵完整的、可构建的 Zen 源码树**，
并把 workflow 改成构建**它自己**。

### 推荐做法

```
1. 挑一个独立目录（例如 E:\Code\ai\zen-base），浅克隆上游：
   git clone --depth=1 --branch dev https://github.com/zen-browser/desktop zen-base
2. 把 kokoa-browser 里的 .github/ 与 README.md 拷进去（**覆盖 Zen 的 README**）
3. 在该目录提交：
   git add -A
   git commit -m "chore: 以 Zen dev 为基线建立 Kokoa 分支"
4. 【先保住历史再推】在 kokoa-browser 里，把当前的 main 存成一个分支：
   git branch probe-baseline && git push origin probe-baseline
   （这样前两次探针的记录不会丢）
5. 把新树推上去：
   git remote set-url origin https://github.com/tomjiu/kokoa-browser.git
   git push --force-with-lease origin HEAD:main
6. 改 workflow 的 checkout 步骤：删掉 repository / ref 两行，让它 checkout 本仓库，
   并保留 fetch-depth: 1
7. 触发一次，确认【编出来的是我们自己的仓库】
```

> **本机 `gh` 已登录 tomjiu，git 凭据已配好，push 可直接进行。**
> 【已解除 · 2026-09-17】原文：不要动主仓的任何 remote（随并行任务结束失效）。

### 验收标准（**缺一不可**）

```
- workflow 日志里的 checkout 步骤显示的是 tomjiu/kokoa-browser，不是 zen-browser/desktop
- CI 跑到最后一步，且【构建成功】
- 产物清点步骤里能看到可执行文件（zen.exe 之类）
- 报告里贴出：CI 运行链接、总耗时、磁盘峰值
```

### 如果构建失败

**把失败的步骤名 + 原始日志贴出来**，然后停下来写清楚你卡在哪。
**不要**去改构建参数、不要删步骤试图绕过。失败本身是有价值的结果。

---

## 任务 2（可与构建并行做）

### 把 Zen 贴牌成 Kokoa

改这些位置（已查明，不止一处）：

```
- surfer.json         name / vendor / appId / binaryName / brands.* / updateHostname
                      （Zen 自己就用这套产出了 release 与 twilight 两个品牌）
- configs/common/mozconfig   ← 【容易漏】这里硬编码了：
                      ac_add_options --with-app-basename=Zen
                      export MOZ_APP_BASENAME=Zen
                      ac_add_options --with-distribution-id=app.zen-browser
                      export MOZ_SOURCE_REPO=https://github.com/zen-browser/desktop
- configs/branding/   品牌资产（图标 / logo / 关于页文案）
```

### 验收标准

```
- 全树搜索 "Zen"（大小写不敏感），产出一份【残留清单】：
  文件路径 + 行号 + 原文 + 你判定【必须改/可以留/是上游署名必须留】及理由
- 注意：MPL-2.0 与体面都要求保留「基于 Zen Browser 与 Firefox」的致谢 —— 那些【要留】
- 不要为了"搜不到 Zen"而删掉许可声明与上游署名
```

---

## 任务 3（**长期价值最高的一步**）

### 回答：以后我们要给 Kokoa 加一个自己的界面组件，该往哪写、怎么写？

去读源码树里的 `src/`，重点 `src/zen/`，逐条回答（**每条都要给文件路径 + 行号为证**）：

```
1. Zen 自己的 UI 代码落在源码树的哪些路径？给目录树 + 关键文件清单
2. 它用什么技术写 UI？XUL？Lit web component？React？原生 JS + CSS？
   （要给实际文件为证，不要猜）
3. 它怎么给浏览器主窗口【加一个新的界面区域】？
   以它的侧栏 / 紧凑模式为例，指出入口文件与挂载方式
4. 它怎么注册 about: 页？怎么往设置页里加自己的分类？给具体文件路径
5. src/ 的改动是怎么被组装进 engine/ 的？surfer import 到底做了什么 —— 覆盖还是打补丁？
6. external-patches/ 是干什么的？什么情况该用补丁、什么情况该直接覆盖文件？
7. 【关键】如果我要加一个自己的工具栏按钮，最小改动集是哪几个文件？照哪个现成例子抄？
```

### 交付

一份 `docs/how-to-add-kokoa-ui.md`，**要具体到"改哪个文件、照着哪个现成例子抄"**。
**这份文档主线会直接用，所以证据比结论重要。**

---

## 任务 4（**争取，时间够才做**）

### 在源码层做出第一个 Kokoa 自有 UI 组件

**目标组件**：浏览器主窗口上一个**「打开 AI 工作区」的工具栏按钮**。

选它的理由：最小、可见（能截图）、直接踩在产品主路径上，且能证明任务 3 的结论是对的。

- 它要打开的 URL：先做成一个常量（例如 `http://127.0.0.1:3080/`），**不要**现在做配置系统
- 先只要"点了能打开一个标签页"，**不要**做分屏、不要做会话绑定 —— 那些是后面的事
- **照任务 3 找到的 Zen 现成例子来写**，不要自己发明一套

### 验收标准

```
- 代码进了源码树，且【CI 构建通过】
- 【截图】证明按钮出现在主窗口上（普通截图 PrintScreen，headless 截图截不到浏览器 chrome）
- 明确标注哪些是【我验证了】（构建通过 / 截图）与哪些是【我没验证】（点击行为是否真的工作）
```

> 如果 CI 一次构建要一两个小时，任务 4 今晚可能只能做一轮 —— **那就把一轮做扎实**，
> 不要为了"多做点"而提交没验证过的东西。

---

# 五、**明确不要做的事**

```
- ~~❌ 不要碰主仓 E:\Code\ai\kokoa-workspace\kokoa~~ 【已解除 · 2026-09-17】
- ❌ 不要改构建参数（PGO / LTO / 目标平台）去"让它编过"
- ❌ 不要在本机装构建工具链 —— 构建只在 CI 上
- ❌ 不要动 dsh（AI 内核）那边的东西 —— 它跑在独立进程里，今晚完全无关
- ❌ 不要做"把旧外壳的功能迁移过来" —— 那是主线的活
- ❌ 不要为了让报告好看而隐瞒失败。**这条线是独立探索，失败不算失败，报不清楚才算**
```

---

# 六、报告格式（**每个任务都用这个格式**）

```
## 任务 N
1. 我做了什么：逐条命令 + 原始输出
2. 结果：成功 / 失败 / 卡在哪一步
3. 【我验证了】：附证据（CI 链接、命令输出、截图）
4. 【我认为/我推测】：明确标出来
5. 我没做到的，以及为什么
6. 踩到的坑（供后来者）
```

---

# 七、环境提示（能省你大量时间）

```
- Windows + 中文区域：Python 输出前设 PYTHONUTF8=1
  用 python 【不要用 python3】（本机 python3 是 Microsoft Store 应用执行别名，exit 49 零输出）
- 解压用 7z：C:\Program Files\7-Zip\7z.exe
- PowerShell 没有 heredoc；【不要把 $(...) 嵌在双引号里】（内层双引号会截断外层字符串）
- 看 CI：gh run list / gh run view <id> / gh run watch <id>
  【作业日志要等作业结束才能拿到】—— 跑的过程中 gh run view --log 是空的
- 触发 CI：gh workflow run probe-zen-cross-build.yml -f zen_ref=dev -f through=build
- 上游 Zen 仓库很大（GitHub 计约 5.9 GB），【一定要用 --depth=1 浅克隆】
- 截图：headless 模式只能截网页内容，【截不到浏览器 chrome（工具栏/标签栏）】，
  要证明界面改动请用普通截图
```
