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

## 5. 收口顺序（Step B，等本仓构建绿了再做）

1. 本仓排一次构建 → 产物上跑 `check-artifact.py`（应全绿）→ 真机打开 `about:preferences#kokoa`，
   确认三个分类、CPA 上游可保存、dsh 主题/语言保存后 ~100ms 生效（**★1 修好后才可能通过**）。
2. 主线 `build.py` 删掉 `patch_preferences_js` / `patch_preferences_xhtml` 的注入段
   （含「删掉本仓 pane」的正则）与 `KOKOA_SETTINGS_PANE` 开关，README 同步。
3. `docs/remaining-to-done.md` 把 Phase 1 标完成，Phase 2 接首页/文件树。
