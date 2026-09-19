> ## ⛔ 本仓已停止构建（2026-09-19）—— 路线变了
>
> 本仓（Zen 源码分支）**不再是产品路线**。新路线：**官方 Firefox ESR 固定 runtime +
> `-app` 挂载自持 `app-shell`**，改 UI **零编译**。
> 本仓成果**已归档不删**：分支 + tag `archive/zen-fork-2026-09-19`（`0f3a69b`）。
>
> 完整方向与理由（在主仓 `tomjiu/kokoa`）：`docs/direction-2026-09-19.md`、ADR-020 / ADR-021。
> **本文保留作历史与对照，不要照它继续做。**

> ⚠️ 本文的实施对象（Firefox preferences 面板迁移）**整体作废**——它就是「改 Firefox 前端」的典型，新架构下不需要。

# Phase 1 —— 设置页所有权从主线 overlay 迁回本仓（2026-09-19）

> 关联：`dsh-cpa-brp-migration-plan.md` Phase 1 · `remaining-to-done.md` · 主线
> `apps/gecko-shell/README.md`（KOKOA_SETTINGS_PANE）· 主线 `docs/dsh-frontend-migration.md`

## 1. 迁的是什么（一句话）

设置页（Kokoa / Kokoa dsh / Kokoa CPA 三个分类）**此前只存在于主线 overlay**：
主线 `build.py` 把 `preferences/config/kokoa.mjs` 注入 `preferences.js`、注入三个导航项与
`kokoa.ftl` 链接，**并主动删掉本仓旧的 XUL 骨架 pane**（`template-paneKokoa` +
`kokoa-settings.js`），注释写着「产品 overlay 是 paneKokoa 的唯一所有者」。
本仓自己那份 `paneKokoa` 因此在产品里**从未出现过**。

本次把那套能力**搬进本仓源码**：本仓自己注册三个 config pane、自己挂导航项与文案、
自己提供设置页要的外壳动作。产品构建不再需要 overlay 注入这一段。

## 2. 本仓新增/改动

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/browser/components/preferences/config/kokoa.mjs` | 新增（迁自主线） | 三个 pane 的组注册与全部逻辑（外壳开关 / dsh 设置 12 行 / CPA 状态与上游表单） |
| `src/zen/kokoa/KokoaShellApi.mjs` | 新增 | 设置页要的四个外壳动作，用本仓模块实现：`openWorkspace`(KokoaAiPanel.openAiTab) / `openHistory`(KokoaAiPanel.openSessionHistoryTab) / `toggleSplit`(KokoaAiSplit.toggleAiSplit) / `newParallel`(KokoaDshSessions.createSession + openAiSessionTab) |
| `src/zen/kokoa/KokoaDshSessions.mjs` | 改 | 新增 `EP_SESSION_CREATE` + `createSession()`（**参数键是 `args.request`**，与 session/list 的 `args._request` 不同；用错会 gateway/arguments-invalid） |
| `src/browser/components/preferences/preferences-js.patch` | 改 | `register_module("paneKokoa", gKokoaSettings)` → `SettingPaneManager.registerPane` 三个 pane（kokoa / kokoaDsh / kokoaCpa） |
| `src/browser/components/preferences/preferences-xhtml.patch` | 改 | 一个导航项 → 三个（`category-kokoa` / `-dsh` / `-cpa`）；移除 `#include kokoaSettings.inc.xhtml` |
| `src/browser/components/preferences/jar-mn.patch` | 改 | 登记 `content/browser/preferences/config/kokoa.mjs (config/kokoa.mjs)`；移除 `kokoa-settings.js` |
| `src/browser/components/preferences/kokoa-settings.js`、`kokoaSettings.inc.xhtml` | **删除** | 旧 XUL 骨架 pane 退役（能力已由上面那份覆盖） |
| `locales/{en-US,zh-CN}/browser/browser/preferences/kokoa.ftl` | 新增 | 66 条文案（迁自主线 overlay 的 `localization/<locale>/browser/preferences/kokoa.ftl`） |
| `src/browser/components/preferences/zen-preferences-links.xhtml` | 改 | 挂 `browser/preferences/kokoa.ftl`（此前由 overlay 注入，本仓裸构建拿不到文案） |
| `prefs/kokoa/ui.yaml` | 新增 | `kokoa.ai.maxParallel` / `kokoa.ai.autoDiscardBackground` / `kokoa.dsh.sessionCwd` 的默认值（此前只在主线 overlay 的 `defaults/preferences/kokoa.js`） |
| `scripts/check-artifact.py` | 改 | 第 7 节判据换形态：查三个导航项 + `kokoa.ftl` 链接 + **旧骨架必须已退役** + 模块与两个 locale 文案进包 |
| `src/zen/kokoa/KokoaMenuConsistency.test.js` | 改 | 消费方从 XUL 模板换成 `config/kokoa.mjs`（pref 绑定） |
| `src/zen/kokoa/KokoaShellApi.test.js`、`KokoaDshSessions.create.test.js` | 新增 | 31 条断言（零依赖 node） |

### 本仓**没有**、因此不出现在组里的四行（Setting 注册保留，等页面到位再接）

`kokoaDshOpenSessions`（会话历史页）/ `kokoaOpenHome`（about:kokoa）/
`kokoaStartupHomeFirst`、`kokoaStartupWorkbench`（主线 boot.js 的启动门面）。
原因：`about:kokoa`、`about:kokoases`、`sessions.html` 都还是主线 overlay 的资产（Phase 2 搬）。

## 3. 顺带修掉的主线缺陷（迁移过程中读代码 + 桥实测发现）

| # | 缺陷 | 证据 | 修法 |
|---|---|---|---|
| ★1 | **dsh 设置 12 个字段一个都存不进去**：`dshPrefSaveField` 传 `{body: ...}`，而 `cpaApi` 只读 `opts.json` → 不发请求体 → 桥 `JSON.parse("")` → **400 `Unexpected end of JSON input`** | `kokoa.mjs:1621` vs `:447-450`；桥实测：空体 400 / 合法体 200 + 落盘 | 改传 `json`（`kokoa.mjs:1643`） |
| ★6 | `POST /kokoa/cpa/restart` 在 CPA 未托管时**仍 200 + `{ok:false}`**，UI 忽略响应体 → 谎报「已请求重启」 | `cpa-lifecycle.ts` 返回体 | 按 `r.ok` 分流 |
| ★12 | `kokoaOpenDshPage` 只在组里、**从未注册 Setting** → 该行渲染为空 | `tools/test-native-settings-groups.cjs:74` 要求保留该按钮 | 补上注册（打开 dsh 内核原生界面） |
| ★13 | `kokoaAiMaxParallel`/`kokoaAiAutoDiscard` **各注册两次**（pref 版 + 自定义版），谁后注册谁生效 | `kokoa.mjs:392-393` 与 `:1185-1213` | 删掉 pref 版注册 |
| ★19 | `kokoa.dsh.sessionCwd` 在设置页按钮路径上是**死设置**（`newParallel()` 不带参数） | `kokoa.mjs:325` | 传 `{cwd}` 下去 |
| ★10 | 短密钥（<12）掩码是 `'*'.repeat(n)`，**不含 U+2026** → 绕过前端 `MASK_RE` 与服务端脱敏守卫，可能被当**新密钥**写回 | `cpa-config.ts:367` | 掩码恒含 `…` |
| ★3/★4 | 「语言＝默认」与「联网搜索地址」**清空永远存不进去**（400 `xxx empty`） | `dsh-settings.ts:99` | 新增 `allowEmpty`，语义 = **删除该键**（回 dsh 默认） |

## 4. 验证状态（截至 2026-09-19）

| 项 | 结论 |
|---|---|
| 本仓 `scripts/check.sh` | **全绿**（语法 716/716、10 个模块测试、jar.mn、moz.build、pref 同名、patch hunk 自洽） |
| 新增单测 | `KokoaShellApi.test.js` 15/15、`KokoaDshSessions.create.test.js` 16/16 |
| `check-artifact.py`（对**现有产品产物**跑） | **38 通过 / 0 失败** —— 新判据对「新形态」正确，对当前 overlay 形态也成立 |
| 主线 `scripts/test.sh` | 见提交时的记录（本轮同时修好了 `native-settings-groups`；`browser-panel-smoke` 的陈旧断言也一并纠正） |
| **未验证** | 本仓**尚未排过构建**（CI ~2–3h）。两个 patch（`preferences-js` / `preferences-xhtml`）只做了 hunk 行数自洽校验，**没有**对真上游树 `git apply --check`（本地无 engine 树）。 |

## 4.5 ★ Step B 的前置条件（2026-09-19 实测踩到）

**结论：在本仓新产物**成为产品的基础 zip **之前**，不能删主线的注入段。**

实测过程：fork 的 CI 交叉构建已绿（run 35410121003，产物 39/39 判据全过、三个分类都在），
于是我在主线 `build.py` 里把 `patch_preferences_js` / `patch_preferences_xhtml` 退役并重建
本地产品 —— 结果本地产物**只剩一个分类**，且 `template-paneKokoa` 又出现了。原因：
本地产品的基础 zip 还是 **2026-09-17 那次交叉构建**，里面装的是 fork **旧的 XUL 骨架**
（`paneKokoa` + `kokoaSettings.inc.xhtml`），而 overlay 的注入段正是「提供三个新分类 +
删掉那个旧骨架」的那一步。把注入段退掉，就回到"旧骨架 + 无新分类"。

顺序必须是：

1. 本仓构建绿 → 产物判据过（本轮已达成：`39 通过 / 0 失败`）。
2. **把产品的基础 zip 换成这个新产物**（或重跑一次产品编排让它更新基础 zip）。
3. 再删主线的注入段（`build.py` 两个函数 + `KOKOA_SETTINGS_PANE`）并重建验证三分类仍在。

我按这个顺序回退了 Step B 的改动（`git checkout -- build.py README.md`），产品恢复
`38 通过 / 0 失败`。**Step B 未做完，是刻意停在安全点**，不是遗漏。

## 4.6 ✅ Step B 已完成（2026-09-19，主线 45ad88f）

按 §4.5 的顺序做完：

1. 本仓 CI 产物绿（run 35410121003）→ 判据 39/39。
2. 以该产物为**新基础**复制一份（`.kokoa-product/stepb-35410121003`），在它上面跑主线 overlay 构建。
3. 退役 `build.py` 的 `patch_preferences_js` / `patch_preferences_xhtml`（改为 no-op，
   保留函数名与退役前实现留档），README 的 `KOKOA_SETTINGS_PANE` 标注退役。
   **保留** `KOKOA_SETTINGS_PANE_DIAG` 探针注入（产品侧取证唯一手段）。
4. 重建 → 产物判据 **38/38**、一键验收三个分类截图非空白（89-314 色 / 20-28% 非白）。
5. 主线套件按新契约同步：`native-settings-composition` 改为「overlay 不得再碰
   preferences.js/xhtml」+「DIAG 探针仍可注入且幂等」，两条旧契约测试显式 skip。**36 套件全绿。**

> ✅ **本地产物已切到新架构（2026-09-19）**：新建 `.kokoa-product/manual-stepb-20260919`
> （新架构 `kokoa/` + 沿用 `dsh-home`/`profile`），启动器自动挑最新的那份，因此
> `start-kokoa.cmd` 现在起的就是新架构。验证：产物判据 38/38、三个分类截图非空白
> （291-327 色）、桥往返（写 `ui-theme.preference=dark` 再读回）通过。
> 旧的 `.kokoa-product/manual-35173069555-191419` 仍在盘上作为回退。

## 5. 收口顺序（Step B，等本仓构建绿了再做）

1. 本仓排一次构建 → 产物上跑 `check-artifact.py`（应全绿）→ 真机打开 `about:preferences#kokoa`，
   确认三个分类、CPA 上游可保存、dsh 主题/语言保存后 ~100ms 生效（**★1 修好后才可能通过**）。
2. 主线 `build.py` 删掉 `patch_preferences_js` / `patch_preferences_xhtml` 的注入段
   （含「删掉本仓 pane」的正则）与 `KOKOA_SETTINGS_PANE` 开关，README 同步。
3. `docs/remaining-to-done.md` 把 Phase 1 标完成，Phase 2 接首页/文件树。
