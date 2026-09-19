// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kokoa 内建 about: 页面（about:kokoa 首页 / about:kokoases 会话历史）。
// ★ 2026-09-19 Phase 2.1/2.3：这两个页面原先由主线 overlay 的 boot.js 注册，
//   本仓构建里不存在。现在由本仓注册（模块 KokoaAboutPages.mjs，页面资产在
//   src/zen/kokoa/pages/，经 jar.inc.mn 打进 content/browser/kokoa/）。
// 【为什么在这里注册】about 协议是**进程级**注册且幂等；放在浏览器窗口启动的最早
//   时机（MozBeforeInitialXULLayout）即可覆盖后续所有窗口/标签。
// 【为什么不用 components.conf】那是构建期清单，omni.ja 覆盖不到；我们要在打包
//   出来的浏览器里动态生效（与 boot.js 当年的理由一致）。
// 【失败不致命】注册失败只意味着 about:kokoa 打不开，不该拖垮浏览器启动 ——
//   整体 try/catch 并打 console.error 留痕。
let gKokoaAboutPagesRegistered = false;
function kokoaRegisterAboutPages() {
  if (gKokoaAboutPagesRegistered) {
    return;
  }
  gKokoaAboutPagesRegistered = true;
  try {
    const { registerKokoaAboutPagesNow } = ChromeUtils.importESModule(
      "resource:///modules/zen/KokoaAboutPages.mjs"
    );
    const r = registerKokoaAboutPagesNow();
    if (!r.ok) {
      console.error("[Kokoa] about 页面注册失败: " + r.log.join(" / "));
    }
  } catch (e) {
    console.error("[Kokoa] about 页面注册抛错: " + e);
  }
}

document.addEventListener(
  "MozBeforeInitialXULLayout",
  () => {
    kokoaRegisterAboutPages();
    // <commandset id="mainCommandSet"> defined in browser-sets.inc
    document
      .getElementById("zenCommandSet")
      // eslint-disable-next-line complexity
      .addEventListener("command", event => {
        switch (event.target.id) {
          case "cmd_zenCompactModeToggle":
            gZenCompactModeManager.toggle();
            break;
          case "cmd_toggleCompactModeIgnoreHover":
            gZenCompactModeManager.toggle(true);
            break;
          case "cmd_zenCompactModeShowSidebar":
            gZenCompactModeManager.toggleSidebar();
            break;
          case "cmd_zenWorkspaceForward":
            gZenWorkspaces.changeWorkspaceShortcut();
            break;
          case "cmd_zenWorkspaceBackward":
            gZenWorkspaces.changeWorkspaceShortcut(-1);
            break;
          case "cmd_zenSplitViewGrid":
            gZenViewSplitter.toggleShortcut("grid");
            break;
          case "cmd_zenSplitViewVertical":
            gZenViewSplitter.toggleShortcut("vsep");
            break;
          case "cmd_zenSplitViewHorizontal":
            gZenViewSplitter.toggleShortcut("hsep");
            break;
          case "cmd_zenSplitViewUnsplit":
            gZenViewSplitter.toggleShortcut("unsplit");
            break;
          case "cmd_zenSplitViewContextMenu":
            gZenViewSplitter.contextSplitTabs();
            break;
          case "cmd_zenCtxShareSplitView":
            gZenViewSplitter.contextShareSplitView();
            break;
          case "cmd_zenCopyCurrentURLMarkdown":
            gZenCommonActions.copyCurrentURLAsMarkdownToClipboard();
            break;
          case "cmd_zenCopyCurrentURL":
            gZenCommonActions.copyCurrentURLToClipboard();
            break;
          case "cmd_zenPinnedTabReset":
            gZenPinnedTabManager.resetPinnedTab(gBrowser.selectedTab);
            break;
          case "cmd_zenPinnedTabResetNoTab":
            gZenPinnedTabManager.resetPinnedTab();
            break;
          case "cmd_zenToggleSidebar":
            gZenVerticalTabsManager.toggleExpand();
            break;
          case "cmd_zenOpenZenThemePicker":
            gZenThemePicker.openThemePicker(event);
            break;
          case "cmd_zenChangeWorkspaceTab":
            gZenWorkspaces.changeTabWorkspace(
              event.sourceEvent.target.getAttribute("zen-workspace-id")
            );
            break;
          case "cmd_zenToggleTabsOnRight":
            gZenVerticalTabsManager.toggleTabsOnRight();
            break;
          case "cmd_zenSplitViewLinkInNewTab":
            gZenViewSplitter.splitLinkInNewTab();
            break;
          case "cmd_zenNewEmptySplit":
            setTimeout(() => {
              gZenViewSplitter.createEmptySplit();
            }, 0);
            break;
          case "cmd_zenReplacePinnedUrlWithCurrent":
            gZenPinnedTabManager.replacePinnedUrlWithCurrent();
            break;
          case "cmd_zenEditPinnedUrl":
            gZenPinnedTabManager.editPinnedUrl();
            break;
          case "cmd_contextZenAddToEssentials":
            gZenPinnedTabManager.addToEssentials();
            break;
          case "cmd_contextZenRemoveFromEssentials":
            gZenPinnedTabManager.removeEssentials();
            break;
          case "cmd_zenCtxDeleteWorkspace":
            gZenWorkspaces.contextDeleteWorkspace(event);
            break;
          case "cmd_zenCtxShareWorkspace":
            gZenWorkspaces.contextShareWorkspace();
            break;
          case "cmd_zenChangeWorkspaceName":
            gZenVerticalTabsManager.renameTabStart({
              target: gZenWorkspaces.activeWorkspaceIndicator.querySelector(
                ".zen-current-workspace-indicator-name"
              ),
            });
            break;
          case "cmd_zenChangeWorkspaceIcon":
            gZenWorkspaces.changeWorkspaceIcon();
            break;
          case "cmd_zenReorderWorkspaces":
            gZenUIManager.showToast("zen-workspaces-how-to-reorder-title", {
              timeout: 9000,
              descriptionId: "zen-workspaces-how-to-reorder-desc",
            });
            break;
          case "cmd_zenOpenWorkspaceCreation":
            gZenWorkspaces.openWorkspaceCreation(event);
            break;
          case "cmd_zenOpenFolderCreation":
            gZenFolders.createFolder([], {
              renameFolder: true,
            });
            break;
          case "cmd_zenTogglePinTab": {
            const currentTab = gZenGlanceManager.getTabOrGlanceParent(
              gBrowser.selectedTab
            );
            if (currentTab && !currentTab.hasAttribute("zen-empty-tab")) {
              if (currentTab.pinned) {
                gBrowser.unpinTab(currentTab);
              } else {
                gBrowser.pinTab(currentTab);
              }
            }
            break;
          }
          case "cmd_zenCloseUnpinnedTabs":
            gZenWorkspaces.closeAllUnpinnedTabs();
            break;
          case "cmd_zenUnloadWorkspace": {
            gZenWorkspaces.unloadWorkspace();
            break;
          }
          case "cmd_zenUnloadAllOtherWorkspace": {
            gZenWorkspaces.unloadAllOtherWorkspaces();
            break;
          }
          case "cmd_zenOpenSpaceRoutingSettings": {
            gZenSpaceRoutingManager.openSpaceRoutingDialog(window);
            break;
          }
          case "cmd_zenNewNavigatorUnsynced":
            OpenBrowserWindow({ zenSyncedWindow: false });
            break;
          case "cmd_zenNewLiveFolder": {
            const { ZenLiveFoldersManager } = ChromeUtils.importESModule(
              "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs"
            );
            ZenLiveFoldersManager.handleEvent(event);
            break;
          }
          case "cmd_zenDuplicateTab": {
            const selectedTabs = gBrowser.selectedTabs;
            let insertAt = selectedTabs.at(-1).index + 1;
            for (const tab of selectedTabs) {
              gBrowser.duplicateTab(tab, true, { tabIndex: insertAt++ });
            }
            break;
          }
          case "cmd_kokoaOpenAiWorkspace": {
            // Kokoa AI 工作区：确保 dsh 在跑 -> 打开带 token 的面板。
            //
            // 【2026-09-15 移植】逻辑来自主线旧外壳 boot.js（3036 行）：
            //   startSidecar L504 / stopSidecar L627 / ensure 语义
            //   模块：src/zen/kokoa/KokoaDshSidecar.mjs
            //
            // 【这一步解决什么】用户之前看到的：
            //   "dsh web authentication required; reopen the URL printed by dsh web."
            // 原因是 dsh 没在跑，我们却直接开了一个连不上的 URL。
            // 现在会先拉起 dsh（dsh web --no-open），从它的 stdout 拿到
            // 带 token 的 URL，再打开 —— 见 KokoaDshSidecar.mjs 的详细说明。
            //
            // 路径说明：src/zen/kokoa/moz.build 的 EXTRA_JS_MODULES.zen
            // 把模块注册到 resource:///modules/zen/<名字>（Zen 的惯例）。
            const { openAiTab, hasToken } = ChromeUtils.importESModule(
              "resource:///modules/zen/KokoaAiPanel.mjs"
            );
            const { ensureDshUrl } = ChromeUtils.importESModule(
              "resource:///modules/zen/KokoaDshSidecar.mjs"
            );

            // 【为什么用 async IIFE】
            //   · 拉起 dsh 是异步的（spawn + 等它打印 URL，可能几秒）
            //   · 而 addEventListener 的 command 回调不是 async 上下文，
            //     直接写 await 会让整个 handler 变成 Promise —— 之后
            //     其它 case 的逻辑会被跳过（那是隐性 bug）。
            //   · 用 IIFE 把它包住，主流程立刻返回。
            (async () => {
              // ① 先看有没有已经打开的 AI 标签 —— 有就直接切过去，不重复拉起
              const existing = openAiTab(window);
              if (existing.reused) {
                console.info("[Kokoa] AI workspace reused");
                return;
              }

              // ② 确保 dsh 在跑（若没跑会拉起，等它给出带 token 的 URL）
              const { url, error, reused } = await ensureDshUrl();
              if (error) {
                console.warn("[Kokoa] " + error);
                // 拉起失败时，退回用配置里的 URL 打开（可能是用户在别处起的 dsh）
                const fallback = openAiTab(window);
                if (!hasToken(fallback.url)) {
                  console.warn(
                    "[Kokoa] 面板 URL 没有 token，dsh 会显示 " +
                      "\u0027web authentication required\u0027。" +
                      "请手动执行 dsh web，或设置 KOKOA_DSH_URL。"
                  );
                }
                return;
              }

              console.info(
                "[Kokoa] dsh " + (reused ? "已复用" : "已拉起") +
                  "，打开面板（token 已隐藏）"
              );

              // ③ 用带 token 的 URL 打开（覆盖掉 ① 里可能已开的无 token 标签）
              const { tab } = openAiTab(window);
              void tab;
            })().catch(e => {
              console.error("[Kokoa] 打开 AI 工作区失败: " + e);
            });
            break;
          }
          default:
          case "cmd_kokoaToggleAiSplit": {
            // Kokoa：把 AI 工作区与当前网页【并排】。
            //
            // 【设计原则：用 Zen 的原生机制】
            //   主线旧外壳（boot.js L1075 toggleAiSplit）自己算坐标 + force() 定位，
            //   那是注入式外壳的无奈之举。
            //   我们有 Zen 的原生分屏，而且 AI 面板本来就是个普通 tab，
            //   所以直接调 gZenViewSplitter.splitTabs ——
            //   这是 ADR-017「拥有结构 vs 对抗结构」的直接应用。
            //
            // 【注意】splitTabs 参数不合法时【静默 return，不报错】
            //   （ZenViewSplitter L1440），所以 KokoaAiSplit 里自己做了断言。
            const { openAiTab } = ChromeUtils.importESModule(
              "resource:///modules/zen/KokoaAiPanel.mjs"
            );
            const { toggleAiSplit } = ChromeUtils.importESModule(
              "resource:///modules/zen/KokoaAiSplit.mjs"
            );

            const splitTab = openAiTab(window);
            const r = toggleAiSplit(window, splitTab.tab);
            if (r.ok) {
              console.info("[Kokoa] AI 分屏: " + r.action);
            } else {
              console.warn("[Kokoa] AI 分屏失败: " + r.reason);
            }
            break;
          }
            gZenGlanceManager.handleMainCommandSet(event);
            if (event.target.id.startsWith("cmd_zenWorkspaceSwitch")) {
              const index =
                parseInt(
                  event.target.id.replace("cmd_zenWorkspaceSwitch", ""),
                  10
                ) - 1;
              gZenWorkspaces.shortcutSwitchTo(index);
            }
            break;
        }
      });
  },
  { once: true }
);
