# 真机验收记录 — Phase 0 / M0（2026-09-18）

> 产物：`manual-35173069555-191419`（omni.ja 2026-09-18 16:59:48）
> 启动：`scripts/start-kokoa.ps1`（含 BRP MCP 注入）
> 关联：`dsh-cpa-brp-migration-plan.md` Phase 0 · `manual-test-checklist.md`

## 一、运行时（M0 判据）

| 项 | 结果 | 证据 |
|---|---|---|
| 无 401 | ✅ | panel.url token HTTP **200**（`dsh_token=ok validate=http-ok`） |
| 8318 绿 | ✅ | `/kokoa/health` `{"ok":true,...}` |
| lockfile 在且 pid 活 | ✅ | pid=7980 port=9817 LISTENING |
| CPA 单一状态源 | ✅ | `/kokoa/cpa/status` `managed:true running:true`；消费方全指 8318 |
| dsh 已挂 brp MCP | ✅ | dsh 子进程 `brp-guarded.py` → `brp_mcp_adapter.py`；日志 `ListToolsRequest` |
| 端口 | ✅ | 3081 / 8318 / 9817 / 28317 均 LISTENING |
| 启动证据 | ✅ | `KOKOA-STARTUP.txt` 四行齐全 |

## 二、产物层（清单「零之二」）

| 项 | 结果 |
|---|---|
| `kokoa.menu.*` 5 条 pref | ✅ new-tab/new-window=true；print/fxa/save-file=false |
| Kokoa 模块进包 | ✅ 6 个 `modules/zen/Kokoa*.mjs` |
| brand.ftl | ✅ zen=0，kokoa=205（41 locale） |
| aboutDialog.xhtml | ✅ kokoa=2，zen=0 |
| `zen.welcome-screen.seen` | ✅ true（defaults） |
| `browser.newtabpage.activity-stream.hideLogo` | ✅ true |
| `kokoa.startup.homeFirst` | ✅ true（`defaults/preferences/kokoa.js` + user.js） |

## 三、GUI / 外壳（`KOKOA-GECKO-SHELL.txt`）

| 清单项 | 结果 | 证据 |
|---|---|---|
| 首屏 about:kokoa | ✅ | `home_tab_url=about:kokoa` `startup_facade=home-first` |
| AI 工作区按钮 | ✅ | `ai_button=existing@kokoa-open-ai-workspace-button@...` `ai_entry=button/key` |
| 设置 Kokoa 分类打开过 | ✅ | tabs 含 `about:preferences#kokoa` |
| 菜单绑定 | ✅ | `menu_init=ok` `menu_bound=toolbar-button` |
| product defaults | ✅ | `product_defaults=applied:54 skipped:2 failed:0` |
| Zen 底座 | ✅ | `body_class=kokoa-zen-base` `is_zen_base=true` |
| 欢迎页 | ✅ | `welcome_seen=true` `welcome=nostage/noel` |
| sidecar 复用 | ✅ | `sidecar_ready=true` health ok |
| 工作区列表 | ✅ | `ws_load=ok count=74` |

## 四、BRP / MCP 链路

| 项 | 结果 | 说明 |
|---|---|---|
| brp-bridge | ✅ | WS 9817，token 认证 ENABLED |
| guarded→adapter 冒烟 | ✅ | initialize OK + **21 tools**（`brp_tab_list` 等） |
| dsh 加载 mcp-brp | ✅ | insert 形态注入后重启 dsh，子进程在 |
| 扩展 tab.list | ⚠️ | `detail=tab-list-error` — **扩展未连上 bridge**（需在带 BRP 扩展的浏览器里完成授权/重连） |

## 五、仍需人工点的项（无法脚本化）

- [ ] 点「AI 工作区」→ 复用标签（1.2 / 1.3）
- [ ] 点「与网页并排」分屏（1.4）
- [ ] 设置页 Kokoa 内容切换/刷新仍在（1.5 部分已由 tabs 旁证）
- [ ] 三条杠菜单默认无打印/登录/保存；勾选后立刻出现（2.1 / 2.2）
- [ ] Ctrl+P 仍可打印（2.3）
- [ ] 关于对话框显示 Kokoa Browser（三）
- [ ] BRP 扩展重连后 navigate/snapshot（扩展侧）

## 六、结论

**M0 自动化判据全部通过**；BRP 扩展 `tab-list-error` 与若干纯 UI 点击项仍开放，不阻塞本次提交。
