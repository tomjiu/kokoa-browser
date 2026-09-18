// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa AI 工作区 —— 面板 URL 与标签管理。
 *
 * 【多会话】2026-09 起：AI 标签按 **fragment 身份** 匹配，不再全局只认一个标签。
 *   · 无 fragment 或无 kokoa-session/kokoa-ws → 身份 default（主工作台）
 *   · #kokoa-session=<dsh sessionId>          → 该会话独立标签
 *   · #kokoa-ws=<workspace id>                → 该工作区标签
 * 同一身份复用；不同身份并行新开标签。资源：kokoa.ai.maxParallel 上限 + 后台 discard。
 */

const DEFAULT_DSH_URL = "http://127.0.0.1:3080/";

export const SESSION_KEY = "kokoa-session";
export const WORKSPACE_KEY = "kokoa-ws";
export const DEFAULT_TAB_IDENTITY = "default";

/** 从 hash 或完整 URL 解析标签身份。无 session/ws 标识 → default。 */
export function tabIdentity(hashLike) {
  const s = String(hashLike || "");
  const hash = s.indexOf("#") >= 0 ? s.slice(s.indexOf("#") + 1) : s;
  const params = new URLSearchParams(hash);
  const sess = params.get(SESSION_KEY);
  if (sess) {
    return sess;
  }
  const ws = params.get(WORKSPACE_KEY);
  if (ws) {
    return ws;
  }
  return DEFAULT_TAB_IDENTITY;
}

/** 构造打开某个会话的 fragment；sessionId 为空则不带 fragment。 */
export function sessionFrag(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return "";
  }
  return "#" + SESSION_KEY + "=" + encodeURIComponent(id);
}

/** 构造工作区 fragment。 */
export function workspaceFrag(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) {
    return "";
  }
  return "#" + WORKSPACE_KEY + "=" + encodeURIComponent(id);
}

export function getPanelUrl() {
  try {
    const injected = Services.env.get("KOKOA_DSH_URL") || "";
    if (injected) {
      return { url: injected, source: "env:KOKOA_DSH_URL" };
    }
  } catch (e) {
    // Services.env 不可用时继续回退
  }

  try {
    const stateDir = Services.env.get("KOKOA_STATE_DIR") || "";
    if (stateDir) {
      const { FileUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/FileUtils.sys.mjs"
      );
      const file = FileUtils.getFile("ProfD", []);
      file.initWithPath(stateDir);
      file.append("gecko-shell");
      file.append("kokoa-panel.url");
      if (file.exists()) {
        const stream = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        stream.init(file, -1, -1, 0);
        const raw = NetUtil.readInputStreamToString(stream, stream.available(), {
          charset: "UTF-8",
        });
        stream.close();
        if (raw && raw.trim()) {
          return { url: raw.trim(), source: "file:kokoa-panel.url" };
        }
      }
    }
  } catch (e) {
    // 文件不存在：继续回退
  }

  return { url: DEFAULT_DSH_URL, source: "hardcoded(no token)" };
}

/** 去掉 query 与 fragment。必须同时切 —— 漏切任一身份匹配会全失配。 */
export function urlBase(spec) {
  return String(spec || "")
    .split("?")[0]
    .split("#")[0];
}

function readTabSpec(tab) {
  try {
    return tab?.linkedBrowser?.currentURI?.spec || "";
  } catch (e) {
    return "";
  }
}

function isPanelSpec(spec) {
  if (!spec) {
    return false;
  }
  try {
    return urlBase(spec) === urlBase(getPanelUrl().url);
  } catch (e) {
    return false;
  }
}

/** 列出当前窗口所有 AI/工作台标签（同 panel origin）。 */
export function listAiTabs(win) {
  const gb = win?.gBrowser;
  const out = [];
  if (!gb || !gb.tabs) {
    return out;
  }
  for (const tab of gb.tabs) {
    try {
      if (isPanelSpec(readTabSpec(tab))) {
        out.push(tab);
      }
    } catch (e) {
      // 跳过未初始化标签
    }
  }
  return out;
}

/**
 * 按身份找 AI 标签。
 * @param {Window} win
 * @param {string} [identity] 省略 → default；传 sessionId/wsId → 精确身份
 */
export function findAiTab(win, identity) {
  const gb = win?.gBrowser;
  if (!gb) {
    return null;
  }
  const want = identity || DEFAULT_TAB_IDENTITY;
  const base = urlBase(getPanelUrl().url);
  for (const tab of gb.tabs) {
    try {
      const spec = readTabSpec(tab);
      if (!spec || urlBase(spec) !== base) {
        continue;
      }
      if (tabIdentity(spec) === want) {
        return tab;
      }
    } catch (e) {
      // 标签尚未初始化
    }
  }
  // default 身份时：没有裸工作台标签则退回任意 AI 标签（避免按钮永远新开）
  if (want === DEFAULT_TAB_IDENTITY) {
    const first = listAiTabs(win)[0];
    return first || null;
  }
  return null;
}

function maxParallelAiTabs() {
  try {
    const n = Services.prefs.getIntPref("kokoa.ai.maxParallel", 4);
    return n > 0 ? n : 0;
  } catch (e) {
    return 4;
  }
}

function autoDiscardAiBackground() {
  try {
    return Services.prefs.getBoolPref("kokoa.ai.autoDiscardBackground", true);
  } catch (e) {
    return true;
  }
}

/**
 * 打开前把 AI 标签数压到 maxParallel 以下。
 * 优先 discard/移除「非选中、非 keep」的后台 AI 标签；主工作台（default）最后动。
 */
function makeRoomForAiTab(win, keepTab) {
  if (!autoDiscardAiBackground()) {
    return { discarded: 0, removed: 0 };
  }
  const cap = maxParallelAiTabs();
  if (!cap || !win?.gBrowser) {
    return { discarded: 0, removed: 0 };
  }
  const gb = win.gBrowser;
  let selected = null;
  try {
    selected = gb.selectedTab;
  } catch (e) {
    selected = null;
  }
  const ai = listAiTabs(win).filter(t => t !== keepTab);
  const victims = ai.filter(t => t !== selected && t !== keepTab);
  const stats = { discarded: 0, removed: 0 };
  while (victims.length && ai.length + 1 > cap) {
    const t = victims.shift();
    try {
      if (typeof gb.discardTab === "function") {
        gb.discardTab(t);
        stats.discarded++;
      } else if (typeof gb.removeTab === "function") {
        gb.removeTab(t);
        stats.removed++;
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }
  return stats;
}

/**
 * 打开（或复用）AI/会话标签。
 * @param {Window} win
 * @param {string} [wsFrag] "#kokoa-session=<id>" 或 "#kokoa-ws=<id>" 或空 = default
 * @param {{ background?: boolean, select?: boolean }} [opts]
 */
export function openAiTab(win, wsFrag, opts) {
  const { url: base, source } = getPanelUrl();
  const options = opts || {};
  const frag = String(wsFrag || "");
  const identity = tabIdentity(frag);

  const existing = findAiTab(win, identity);
  if (existing) {
    try {
      if (options.select !== false) {
        win.gBrowser.selectedTab = existing;
      }
    } catch (e) {
      // 选中失败不致命
    }
    return {
      tab: existing,
      reused: true,
      url: readTabSpec(existing) || base + frag,
      source,
      identity,
    };
  }

  const trimmedBase = base.split("#")[0];
  const url = trimmedBase + frag;
  try {
    makeRoomForAiTab(win, null);
  } catch (e) {
    // 资源回收失败不阻止打开
  }
  const tab = win.gBrowser.addTab(url, {
    inBackground: !!options.background,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    skipRoute: true,
  });
  try {
    if (options.select !== false) {
      win.gBrowser.selectedTab = tab;
    }
  } catch (e) {
    // 选中失败不致命
  }
  return { tab, reused: false, url, source, identity };
}

/** 打开（或复用）某个 dsh 会话的独立标签。 */
export function openAiSessionTab(win, sessionId, opts) {
  return openAiTab(win, sessionFrag(sessionId), opts);
}

/** 打开会话历史独立页（chrome 内建页）。 */
export function openSessionHistoryTab(win) {
  const gb = win?.gBrowser;
  if (!gb) {
    return { tab: null, error: "no-gbrowser" };
  }
  const uri = "chrome://browser/content/kokoa/sessions.html";
  const identity = "kokoa-session-history";
  for (const tab of gb.tabs) {
    try {
      const spec = readTabSpec(tab);
      if (spec === uri || spec === "about:kokoases") {
        try {
          gb.selectedTab = tab;
        } catch (e) {
          // 忽略
        }
        return { tab, reused: true };
      }
    } catch (e) {
      // 跳过
    }
  }
  const tab = gb.addTab(uri, {
    inBackground: false,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  try {
    gb.selectedTab = tab;
  } catch (e) {
    // 忽略
  }
  try {
    tab.setAttribute("kokoa-page", identity);
  } catch (e) {
    // 忽略
  }
  return { tab, reused: false };
}

export function hasToken(url) {
  return /[?&]token=/.test(String(url || ""));
}
