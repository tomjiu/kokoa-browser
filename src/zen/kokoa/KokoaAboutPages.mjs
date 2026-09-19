// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa 内建 about: 页面注册（Phase 2.1/2.3）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【背景：为什么会有这个模块】
 *
 * 这两个页面（about:kokoa 首页 / about:kokoases 会话历史）原先由**主线 overlay 的
 * boot.js** 在运行时注册，页面资产也由 overlay 打包。本仓构建里既没有页面、
 * 也没有注册 —— 设置页里那四行（打开首页 / 会话历史 / 启动门面两条）因此一直
 * 「本仓无对应物」，只能等这一搬。
 *
 * 【注册机制（照抄 Firefox 的做法，别改成 components.conf）】
 *   about 协议通过「CID + contractID + about 类别条目」三件事注册：
 *     1. nsIComponentRegistrar.registerFactory(cid, desc, contract, factory)
 *     2. Services.catMan.addCategoryEntry("about", "<name>", contract, false, true)
 *   其中 contract = @mozilla.org/network/protocol/about;1?what=<name>。
 *   **运行时注册即可** —— components.conf 是构建期清单，omni.ja 覆盖不到它，
 *   而我们要在打包出来的浏览器里动态生效。
 *
 * 【权限】页面走 chrome:// URI，并以 system principal 取通道；
 *   getURIFlags 返回 ALLOW_SCRIPT | IS_SECURE_CHROME_UI ——
 *   about: 文档默认 CSP 禁内联脚本，所以页面必须用外部 chrome: 脚本（页面已满足）。
 *
 * 【可测性】registrar 与 uri 均从 deps 注入；Node 里可以直接 import 本文件测注册次序、
 *   幂等、以及「两个页面各自指向正确的 chrome URI」。
 * ═══════════════════════════════════════════════════════════════════════
 */

/** 页面契约（测试与本模块共用）。改这里就要同步 jar.inc.mn 的打包路径。 */
export const KOKOA_PAGES = [
  {
    name: "kokoa",
    cid: "{8f3a1c62-5b0e-4a7d-9c11-2d6e5f8a0b34}",
    uri: "chrome://browser/content/kokoa/home.html",
    description: "about:kokoa",
  },
  {
    name: "kokoases",
    cid: "{b7e2c4d1-9f3a-4e8b-a21c-7d6e5f8a9b01}",
    uri: "chrome://browser/content/kokoa/sessions.html",
    description: "about:kokoases",
  },
  {
    // 画布（人 + AI 协作白板）。决策见 docs/canvas-plan.md：
    // 它是**普通 about 页**；AI 走**场景级 API** 而不是 BRP
    // （实测扩展只支持 tab.* + page.screenshot，element.* 会被拒）。
    name: "canvas",
    cid: "{c4d5e6f7-1a2b-4c3d-9e8f-0a1b2c3d4e5f}",
    uri: "chrome://browser/content/kokoa/canvas/canvas.html",
    description: "about:canvas",
  },
];

/** contractID：about 协议按 what=<name> 派发。 */
export function contractFor(name) {
  return "@mozilla.org/network/protocol/about;1?what=" + name;
}

/**
 * 造一个 about 模块实现（nsIAboutModule）。
 * @param {{name: string, cid: string, uri: string, description: string}} page
 * @param {object} deps {io, scriptSecurityManager,generateQI,AboutModuleFlags}
 */
export function buildAboutModule(page, deps) {
  const contract = contractFor(page.name);
  return {
    classDescription: page.description,
    classID: deps.ID(page.cid),
    contractID: contract,
    QueryInterface: deps.generateQI([deps.ci.nsIAboutModule]),
    newChannel(_uri, loadInfo) {
      const chan = deps.io.newChannelFromURIWithLoadInfo(
        deps.io.newURI(page.uri),
        loadInfo
      );
      chan.owner = deps.scriptSecurityManager.getSystemPrincipal();
      return chan;
    },
    getURIFlags() {
      return (
        deps.ci.nsIAboutModule.ALLOW_SCRIPT |
        deps.ci.nsIAboutModule.IS_SECURE_CHROME_UI
      );
    },
    getChromeURI() {
      return deps.io.newURI(page.uri);
    },
  };
}

/**
 * 注册全部 Kokoa about 页面（幂等：已注册的跳过）。
 *
 * @param {object} deps
 *   registrar   nsIComponentRegistrar（Components.manager.QueryInterface(Ci.nsIComponentRegistrar)）
 *   catMan      Services.catMan（category manager）
 *   io          Services.io
 *   scriptSecurityManager
 *   generateQI  ChromeUtils.generateQI
 *   ID          Components.ID
 *   ci          Components.interfaces / Ci
 * @returns {{ok: boolean, log: string[]}}
 */
export function registerKokoaAboutPages(deps) {
  const log = [];
  try {
    for (const page of KOKOA_PAGES) {
      const cid = deps.ID(page.cid);
      const contract = contractFor(page.name);
      if (deps.registrar.isCIDRegistered(cid)) {
        log.push("about_" + page.name + "=already");
        // 已注册也要确保类别条目在（浏览器重启后类别表可能被清）
        deps.catMan.addCategoryEntry("about", page.name, contract, false, true);
        continue;
      }
      const mod = buildAboutModule(page, deps);
      const factory = {
        createInstance(iid) {
          return mod.QueryInterface(iid);
        },
        QueryInterface: deps.generateQI([deps.ci.nsIFactory]),
      };
      deps.registrar.registerFactory(cid, page.description, contract, factory);
      // 先删再加：避免旧条目残留（Firefox 自身注册同名时也更干净）
      try {
        deps.catMan.deleteCategoryEntry("about", page.name, false);
      } catch (e) {
        /* 本来就不存在 */
      }
      deps.catMan.addCategoryEntry("about", page.name, contract, false, true);
      log.push("about_" + page.name + "=registered");
    }
    return { ok: true, log };
  } catch (e) {
    log.push("ERR=" + e);
    return { ok: false, log };
  }
}

/** 浏览器里用的真实依赖。 */
export function realDeps() {
  const { Services } = ChromeUtils.importESModule(
    "resource://gre/modules/Services.sys.mjs"
  );
  return {
    registrar: Components.manager.QueryInterface(Ci.nsIComponentRegistrar),
    catMan: Services.catMan,
    io: Services.io,
    scriptSecurityManager: Services.scriptSecurityManager,
    generateQI: ChromeUtils.generateQI,
    ID: Components.ID,
    ci: Ci,
  };
}

/** 启动时调用一次即可（幂等）。 */
export function registerKokoaAboutPagesNow() {
  try {
    return registerKokoaAboutPages(realDeps());
  } catch (e) {
    return { ok: false, log: ["ERR=" + e] };
  }
}
