// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa 设置页要用的「外壳动作」接口 —— fork 侧实现。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【为什么需要这个模块】
 *
 * 设置页（paneKokoa / paneKokoaDsh / paneKokoaCpa）里的按钮要执行四个动作：
 *   打开 AI 工作区 / 打开会话历史 / 与网页并排（分屏） / 新建并行会话。
 *
 * 主线 overlay 时代，这四个动作挂在浏览器窗口的 window.kokoaShell（boot.js 注入）。
 * 设置页代码因此写成「先看 window.kokoaShell，拿不到就报 no-shell-api」。
 * 设置页搬进本仓后没有 boot.js —— 本模块用 fork 自己的模块提供**同名同语义**的接口，
 * 于是那份设置页代码一行都不用改（它先看 window.kokoaShell，再回退到这里）。
 *
 * 【与主线的语义对齐（别改）】
 *   openWorkspace  打开/复用**主工作台**标签（无 #kokoa-session / #kokoa-ws 片段）
 *   openHistory    打开会话历史页（fork 的 chrome 内建页）
 *   toggleSplit    **仅布局**：把 AI 标签与当前网页并排，不新建会话
 *   newParallel    dsh RPC session/create → 打开带 #kokoa-session= 的独立标签
 *                  （与 openWorkspace / toggleSplit 语义分离，三者不可互相替代）
 *
 * 【可测性】buildShellApi(win, deps) 是纯函数、依赖全部注入 ——
 *   Node 直接 import 本文件就能连行为一起测（不碰 ChromeUtils）。
 * ═══════════════════════════════════════════════════════════════════════
 */

const AI_PANEL = "resource:///modules/zen/KokoaAiPanel.mjs";
const AI_SPLIT = "resource:///modules/zen/KokoaAiSplit.mjs";
const DSH_SESSIONS = "resource:///modules/zen/KokoaDshSessions.mjs";

/** 接口契约：设置页依赖的四个方法名（KokoaShellApi.test.js 守着它）。 */
export const SHELL_API_METHODS = [
  "openWorkspace",
  "openHistory",
  "toggleSplit",
  "newParallel",
];

function importModule(path) {
  return ChromeUtils.importESModule(path, { global: "current" });
}

/** 真实依赖（浏览器里用）。每次调用现取，避免模块加载顺序问题。 */
export function realDeps() {
  return {
    openAiTab(win, frag, opts) {
      return importModule(AI_PANEL).openAiTab(win, frag, opts);
    },
    openAiSessionTab(win, sessionId, opts) {
      return importModule(AI_PANEL).openAiSessionTab(win, sessionId, opts);
    },
    openSessionHistoryTab(win) {
      return importModule(AI_PANEL).openSessionHistoryTab(win);
    },
    panelUrl() {
      return importModule(AI_PANEL).getPanelUrl();
    },
    toggleAiSplit(win, tab) {
      return importModule(AI_SPLIT).toggleAiSplit(win, tab);
    },
    createSession(panelUrl, opts) {
      return importModule(DSH_SESSIONS).createSession(panelUrl, opts);
    },
  };
}

/**
 * 用注入的依赖造一个 shell API。
 * @param {Window} win 浏览器窗口（分屏/建标签都在它上面做）
 * @param {object} deps realDeps() 的形状
 */
export function buildShellApi(win, deps) {
  return {
    /** 打开/复用主工作台标签。 */
    openWorkspace() {
      return deps.openAiTab(win);
    },

    /** 打开会话历史页（win 缺省用构造时的窗口）。 */
    openHistory(w) {
      return deps.openSessionHistoryTab(w || win);
    },

    /** 仅布局：与当前网页并排。先确保 AI 标签在，再分屏。 */
    toggleSplit() {
      const opened = deps.openAiTab(win);
      const tab = opened && opened.tab;
      if (!tab) {
        return { ok: false, reason: "no-ai-tab" };
      }
      return deps.toggleAiSplit(win, tab);
    },

    /** dsh RPC 新建会话 + 独立标签。 */
    async newParallel(opts) {
      let url = "";
      try {
        const panel = deps.panelUrl();
        url = (panel && panel.url) || "";
      } catch (e) {
        return { ok: false, error: "panel-url-error: " + e };
      }
      if (!url) {
        return { ok: false, error: "no-panel-url" };
      }
      const created = await deps.createSession(url, opts || {});
      if (!created || !created.ok) {
        return { ok: false, error: (created && created.error) || "create-failed" };
      }
      const opened = deps.openAiSessionTab(win, created.sessionId);
      return {
        ok: true,
        sessionId: created.sessionId,
        tab: opened && opened.tab,
        reused: Boolean(opened && opened.reused),
      };
    },
  };
}

/**
 * 取当前窗口的 shell API：优先 boot.js 注入的 window.kokoaShell（裸浏览器分支仍在），
 * 否则用 fork 自己这份。设置页只认这个入口。
 */
export function shellApiFor(win) {
  let w = win;
  try {
    w = (win && win.browsingContext && win.browsingContext.topChromeWindow) || win;
  } catch (e) {
    w = win;
  }
  if (w && w.kokoaShell) {
    return w.kokoaShell;
  }
  return buildShellApi(w || win, realDeps());
}
