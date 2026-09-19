# ⛔ 本仓路线已变更（2026-09-19）

**本仓（Zen Browser 源码分支）不再是产品路线，已归档保留。**

| 项 | 内容 |
|---|---|
| 新路线 | **官方 Firefox ESR 固定 runtime + `-app` 挂载自持 `app-shell` + Rust host**（改 UI **零编译**） |
| 为什么换 | 改一次 UI 要云端交叉编译 **≈3 小时**；且「覆盖 / 改别人的前端」都不如「拥有自己的 app-shell」 |
| 依据 | 四个盲点实测：WebExtensions（含 **MV3** blocking webRequest）、企业策略、profile 单实例锁、窗口控制 |
| 归档 | 分支 + tag `archive/zen-fork-2026-09-19`（`0f3a69b`）。**不删除**，作对照与回退 |
| 停构建 | 三个定时 workflow 已 `disabled_manually`：Check Firefox Candidate Release / Zen Twilight Scheduled Releases / Monthly issue metrics |
| 完整方向 | 主仓 `tomjiu/kokoa` 的 `docs/direction-2026-09-19.md`、`docs/architecture.md` 的 **ADR-020 / ADR-021** |
| 保留资产 | 纯网页类（home / sessions / canvas 页面）与场景契约；canvas 已搬入主仓 `packages/kokoa-canvas/` |

## 如果你是被派来做这个仓的代理

**停手，先读主仓的方向通知。** 本仓 `src/` 里的源码补丁、`about:` 页注册、preferences 面板迁移
**都不是当前路线**。本仓其余文档只作历史与对照。

---
