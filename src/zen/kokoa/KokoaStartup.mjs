// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa 启动门面（Phase 2.2）：首屏是「首页」还是「AI 工作台」。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【为什么需要】Zen 默认开自己的新标签页；Kokoa 的第一眼应该是 about:kokoa
 *   （工作区/状态/文件树/快捷入口）。这段行为原先在主线 overlay 的 boot.js
 *   （ensureWorkbenchFirst），本仓要自己拥有它 —— 设置页那两行
 *   （kokoaStartupHomeFirst / kokoaStartupWorkbench）才能真正生效。
 *
 * 【三条刻意的约束（别放松，都是踩过的）】
 *   1. 可控：pref 读不到默认层也要按默认值走 —— 曾出现「默认层没装载 → 读到 false
 *      → 门面整个不生效」，症状是"首屏空白页"，很难联想到 pref 默认层。
 *   2. 不抢用户的标签：会话恢复出来的标签一个都不动（只把首页选中）。
 *   3. 只清理"没被用过的空白标签"：否则第一眼看到的是空白页而不是首页。
 *      判定：URI 是 about:blank / about:newtab（恢复的会话标签不会是它）。
 *
 * 【幂等】已有 about:kokoa 标签就直接选中，不重复开。
 * 【顺序】必须先注册 about 协议（KokoaAboutPages），否则开不出 about:kokoa。
 * 【可测性】依赖全部注入（prefs / gBrowser / log），Node 里直接测 pref 组合与三条约束。
 * ═══════════════════════════════════════════════════════════════════════
 */

/** 门面判据：要开首页吗？（纯函数，规则钉在测试里） */
export function shouldOpenHome(prefs) {
  const homeFirst = prefs.getBool("kokoa.startup.homeFirst", true);
  const workbench = prefs.getBool("kokoa.startup.workbench", false);
  // homeFirst 优先；workbench=false 也开首页（「不要工作台」= 要首页）。
  return homeFirst || !workbench;
}

/** 这个 URI 是"没被用过的空白页"吗？（决定能不能关掉它） */
export function isUnusedBlankTab(uriSpec) {
  return uriSpec === "about:blank" || uriSpec === "about:newtab";
}

const HOME_URL = "about:kokoa";

/**
 * 在窗口里确保「首页优先」。
 * @param {object} win 浏览器窗口（需要 gBrowser）
 * @param {object} deps { prefs: {getBool}, systemPrincipal, log? }
 */
export function ensureHomeFirst(win, deps) {
  const log = deps.log || (() => {});
  try {
    if (!win || !win.gBrowser) {
      return { ok: false, action: "no-gbrowser" };
    }
    if (!shouldOpenHome(deps.prefs)) {
      log("startup_facade=workbench-first（按 pref 不开首页）");
      return { ok: true, action: "workbench-first" };
    }
    const gb = win.gBrowser;

    // ① 已有 about:kokoa 就选中它（幂等 + 不重复开）
    let homeTab = null;
    for (const t of gb.tabs) {
      const b = t.linkedBrowser;
      const spec = b && b.currentURI && b.currentURI.spec;
      if (spec && spec.split(/[?#]/)[0] === HOME_URL) {
        homeTab = t;
        break;
      }
    }
    let opened = false;
    if (!homeTab) {
      homeTab = gb.addTab(HOME_URL, {
        inBackground: false,
        triggeringPrincipal: deps.systemPrincipal,
      });
      opened = true;
    }
    try {
      gb.selectedTab = homeTab;
    } catch (e) {
      /* 选不中也别炸 */
    }

    // ② 只清理"没被用过的空白标签"——绝不碰会话恢复出来的标签
    let closed = 0;
    let tabs = [];
    try {
      tabs = [...gb.tabs];
    } catch (e) {
      tabs = [];
    }
    for (const other of tabs) {
      if (other === homeTab) {
        continue;
      }
      try {
        const b = other.linkedBrowser;
        const spec = b && b.currentURI && b.currentURI.spec;
        if (isUnusedBlankTab(spec)) {
          gb.removeTab(other);
          closed++;
        }
      } catch (e) {
        /* 单个标签失败不影响整体 */
      }
    }
    log("startup_facade=home-first opened=" + opened + " closed=" + closed);
    return { ok: true, action: "home-first", opened, selected: true, closed };
  } catch (e) {
    log("startup_facade ERR=" + e);
    return { ok: false, action: "error", error: String(e) };
  }
}

/** 浏览器里用的真实依赖。 */
export function realDeps() {
  const { Services } = ChromeUtils.importESModule(
    "resource://gre/modules/Services.sys.mjs"
  );
  return {
    prefs: { getBool: (name, def) => Services.prefs.getBoolPref(name, def) },
    systemPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    log: (m) => console.info("[Kokoa] " + m),
  };
}
