# kokoa-browser

Kokoa 的浏览器分支试验田 —— 以 **Zen Browser**（`zen-browser/desktop`，`dev`）为基线的完整源码树。

## 这是什么

Kokoa 是一款「AI 工作区与网页同级」的桌面客户端。此前它靠**覆盖官方 Firefox 的
资源包（omni.ja）**实现，撞上了四个死结（布局对抗、观感外挂、主线程补偿定时器、
每版本回归税）。决策依据见主仓的 `docs/architecture.md` **ADR-017 / ADR-018**。

**结论：以 Zen Browser 为上游做源码级分支。** 本仓库是该分支的试验田，
做到约八成再迁回主仓，**不急于合并**。

- 主仓（私有）：https://github.com/tomjiu/kokoa
- 上游：https://github.com/zen-browser/desktop （MPL-2.0）

## 当前进度（先看这里）

> 仓库里有 50 份文档，但它们记录的是【不同时期】的状态，
> 有些已经过期。**这一节是唯一保证最新的入口。**

### 现在到哪了

```
✅ 品牌名 = Kokoa（brand.ftl 全 locale zen=0；关于对话框无 Zen）
✅ AI 工作区：6 个模块进包；单测对【产物模块】全过
✅ 欢迎页 / 新标签 logo / 主菜单 pref 默认隐藏 3 项
✅ 构建核对多轮全绿；设置面板 data-category 坑已修
✅ 实机验收第一轮 + dsh 0.1.5 接口查清（外壳不能遥控切会话）
✅ CI 基线 Firefox 156.0（PR #3 清完 155 时代 patch 债）
✅ Phase 0 迁移完成：start-kokoa 编排 + 产品 BRP MCP（cordis insert）
✅ M0 运行时自动化判据全过（acceptance-2026-09-18-phase0.md）
⏳ 纯 UI 人工点检 + BRP 扩展 tab-list 重连（不挡 Phase 1）
⏭  Phase 1：CPA/dsh 设置迁入本仓 → Phase 2 首页 → Phase 3 BRP 产品化
```

**详见 `docs/remaining-to-done.md` · `docs/dsh-cpa-brp-migration-plan.md`。**

### 几条重要的约定（踩过坑才有的）

| 想做什么 | 先读 |
|---|---|
| 核对构建产物 | `docs/artifact-verification.md` |
| 写测试 | `docs/testing-pitfalls.md` |
| 判断某段 AI 逻辑要不要构建才能测 | `docs/ai-unit-test-boundary.md` |
| 改 patch / png 等构建元数据 | `docs/build-metadata-conventions.md` |
| 实机验收 | `docs/manual-test-checklist.md` · `docs/acceptance-2026-09-18-phase0.md` |
| dsh/CPA/BRP 迁移 | `docs/dsh-cpa-brp-migration-plan.md` |

### 常用的两条命令

```bash
# 本地快速检查（不构建，秒级）
bash scripts/check.sh tests

# 核对某个构建产物的模块是否行为正确（下载产物后）
bash scripts/verify-artifact-modules.sh <产物目录>
```

---

## 当前状态（任务 1 之后）

本仓库**就是一棵完整的 Zen 源码树**，外加我们自己的 `.github/workflows/`。

CI workflow `probe-zen-cross-build.yml` 现在 **checkout 本仓库自己**，不再拉上游。
`engine/`（Firefox 引擎）仍在 CI 上由 `surfer download` 从 Mozilla 源码包生成 ——
那是构建流程的一部分，不进 git。

### 构建可行性探针仍在回答三个问题

1. **磁盘**：GitHub 标准 runner 是 14 GB SSD，而 Firefox 构建要 40 GB。
   加上 `free-disk-space` 腾出的约 30 GB，够不够？
2. **时间**：4 vCPU（Zen 的 CI 用 8 vCPU）能否在 GitHub 的 **6 小时**作业上限内编完？
3. **可复现性**：Zen 的 Linux→Windows 交叉编译链能否在我们自己的 workflow 里跑通？

> 注意：Zen 的 Windows 发布产物**本身就是交叉编译出来的**
> （其 CI 里 `ZEN_CROSS_COMPILING=1`，并把 Wine 与 VS 工具链下载到 Linux）。

## 失败也是结果

如果它跑不通，那说明我们必须走本地构建，或必须购买更大的 runner。
**两种结论都有价值，报清楚比跑通更重要。**

## 许可

本项目基于 Zen Browser 与 Firefox，二者均为 **MPL-2.0**。
我们修改过的 MPL 文件以同许可提供。保留上游署名与致谢。
