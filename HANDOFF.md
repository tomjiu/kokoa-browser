> ## ⛔ 本仓已停止构建（2026-09-19）—— 路线变了
>
> 本仓（Zen 源码分支）**不再是产品路线**。新路线：**官方 Firefox ESR 固定 runtime +
> `-app` 挂载自持 `app-shell`**，改 UI **零编译**。
> 本仓成果**已归档不删**：分支 + tag `archive/zen-fork-2026-09-19`（`0f3a69b`）。
>
> 完整方向与理由（在主仓 `tomjiu/kokoa`）：`docs/direction-2026-09-19.md`、ADR-020 / ADR-021。
> **本文保留作历史与对照，不要照它继续做。**

> ⚠️ 本文写于 2026-09-16，其任务前提已被 2026-09-19 的转向取代。

# 交接说明（本机关机，云端接手）

**时间**：2026-09-16 13:5x
**交接方**：本机 AI（E:\Code\ai\kokoa-browser）
**接手方**：云端 AI

---

# 一、先读这几份（按顺序）

```
1. README.md                      当前进度入口（先看这个）
2. docs/remaining-to-done.md      还差多少、已完成什么
3. docs/manual-test-checklist.md  实机测试清单（构建出来后照着点）
4. docs/artifact-verification.md  ★ 核对产物的正确姿势（我在这上面错过）
5. docs/testing-pitfalls.md        写测试时我踩过的 10 个坑
6. docs/AGENT-BRIEFING.md          必读文档索引 + 已知的"不要做"
```

# 二、当前状态（已核实）

## 已完成（有产物证据）

| 项 | 证据 |
|---|---|
| 品牌名 = Kokoa | 产物 brand.ftl 五项全对 |
| 4 个 AI 模块进包 | 构建 35032271818 / 35047911545 确认 |
| 关于对话框无 Zen 残留 | 产物里 zen 出现 0 次 |
| 欢迎页大标题已删 | 35047911545 确认 |
| 新标签页 hideLogo | = true，已确认 |
| 菜单可配置 | 已实现，25 个用例 |
| 单测 | 148 个用例 / 9 文件 / 1380 行，全过 |

## 唯一阻塞项

**构建 35056127083**（验证菜单功能），约 2 小时一轮。
交接时它【正在编译中】，已跑约 1.3 小时。

**它验证的是**：菜单功能（0487ff1）——
上一轮构建 35047911545 里没有它（提交晚 15 分钟）。

# 三、接手后第一步（按顺序）

```bash
# 0) 确认状态
git log --oneline -5
git status

# 1) 看构建是否完成
gh run view 35056127083 --repo tomjiu/kokoa-browser --json status,conclusion

# 2) 若完成且 success -> 下载并核对（不用实机）
gh run download 35056127083 --repo tomjiu/kokoa-browser --dir ./builds/35056127083
python scripts/check-artifact.py ./builds/35056127083
#    预期 17 项全绿（模块 5 + pref 5 + 品牌 5 + 欢迎页 + hideLogo）

# 3) 对着产物跑单测（验证打包没改变行为）
bash scripts/verify-artifact-modules.sh ./builds/35056127083

# 4) ★ 若构建失败 -> 看日志定位，不要盲目重跑（一轮 2 小时）
gh run view --log-failed --job <job-id> --repo tomjiu/kokoa-browser
```

**若 2/3 全绿** -> 代码层验证完毕，剩下【实机点一遍】
（那部分只有人能做：点 AI 工作区、看 dsh 起来、看分屏、看菜单）。

# 四、★ 三条硬约束（踩过坑，别犯）

```
1. 不要手写 patch 文件 -> 会 corrupt
   正确流程：改 engine/ 的原文件 -> npx surfer export <路径>
   （注意：本地没有 engine/，所以改 patch 类需求要先下载源码树）

2. 不要用「!important 才能不重叠」的方式做 UI
   那说明 include 位置错了，应该挪容器（ADR-017）

3. 核对产物前【必须】先确认改动在那次构建里：
   sha=$(gh api repos/tomjiu/kokoa-browser/actions/runs/<id> --jq '.head_sha')
   git merge-base --is-ancestor <commit> $sha   # 0 = 在构建里
   我错过一次：拿旧产物找新代码，误判"三个改动没生效"
```

# 五、环境要求

```
node    22    (见 .nvmrc)
python  3.11  (见 .python-version)
```

**测试是零依赖的** —— 只用 node 内置模块（`node:fs` 等）和相对路径 import，
**不需要 npm install**。同理 `check-artifact.py` 只用标准库。

```bash
bash scripts/check.sh tests    # 9 个测试文件，秒级
```

# 六、还没做（不阻塞"初步完成"）

```
· AI 工作区侧栏     未实现（是增强：现在"标签页+分屏"已能用）
· branding 图标     还是 Zen/Firefox 的图
· dsh 会话切换      接口没查清，代码【故意只记录状态】
· release 流水线的 zen-browser/* 引用   真做发布时才需要
```

# 七、一个提醒

`docs/` 下 49 份文档是【不同时期】写的，**有些已过期**。
以 `README.md` 和 `docs/remaining-to-done.md` 为准（这两份最后更新过）。
若发现某份文档与实际不符，**更新它**，别照着做。

---

# 八、云端接手结果（2026-09-16 追加）

按本文档第三节执行完毕：

```
· 构建 35056127083 = success（1h44m，headSha=de4a478）
· 四个待验改动（0487ff1 / 1fa8bc5 / 04f1189 / 59fc304）均确认在构建里
· check-artifact.py        17/17 全绿
· verify-artifact-modules  148/148 全过（9 个文件，跑的是产物里的模块）
· 详见 docs/build-35056127083-verified.md
```

**代码层验证完毕。** 剩下【实机点一遍】（第三节"若 2/3 全绿"分支），
照 `docs/manual-test-checklist.md` 执行 —— 只有人能做。

新坑一条：REST API 下载产物是双层 zip，脚本会报「找不到 omni.ja」，
先解开外层再跑（`builds/` 已进 .gitignore）。
