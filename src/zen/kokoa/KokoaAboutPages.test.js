// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaAboutPages 的行为契约（零依赖 node 脚本，非 0 退出即失败）。
 *
 * 【为什么单测这个】about: 页面的注册是「三件事必须同时成立」才能打开：
 *   CID 注册 + contractID 注册 + about 类别条目。少任何一件，about:kokoa
 *   就是「找不到页面」；而这类错误在浏览器里只表现为空白页，没有堆栈。
 *   本文件把三件事、幂等性、以及「两个页面各自指向正确 URI」钉死。
 *
 * 【双向验证】把 registerKokoaAboutPages 里的 addCategoryEntry 删掉、
 * 或把某个 page.uri 改错、或去掉 isCIDRegistered 的提前返回（幂等性），
 * 本文件必须出现对应失败。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaAboutPages.test.js
 */

import {
  KOKOA_PAGES,
  buildAboutModule,
  contractFor,
  registerKokoaAboutPages,
} from "./KokoaAboutPages.mjs";

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  [ok] " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra ? "  <- " + extra : "")); }
}
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(name, g === w, "期望 " + w + "，实际 " + g);
}

/** 假依赖：记录所有调用。 */
function deps() {
  const calls = [];
  const catEntries = new Map();
  const d = {
    calls,
    catEntries,
    registered: new Set(),
    ID: (cid) => ({ __cid: cid }),
    generateQI: (ifaces) => ({ __qi: ifaces }),
    io: {
      newURI: (uri) => ({ __uri: uri }),
      newChannelFromURIWithLoadInfo: (uri, loadInfo) => {
        calls.push(["newChannel", uri.__uri, Boolean(loadInfo)]);
        return { owner: null };
      },
    },
    scriptSecurityManager: { getSystemPrincipal: () => "system-principal" },
    registrar: {
      isCIDRegistered: (cid) => d.registered.has(cid.__cid),
      registerFactory: (cid, desc, contract, factory) => {
        calls.push(["registerFactory", cid.__cid, contract, typeof factory.createInstance]);
        d.registered.add(cid.__cid);
      },
    },
    catMan: {
      addCategoryEntry: (cat, name, contract, persist, replace) => {
        calls.push(["addCategoryEntry", cat, name, contract, persist, replace]);
        catEntries.set(cat + ":" + name, contract);
      },
      deleteCategoryEntry: (cat, name, persist) => {
        calls.push(["deleteCategoryEntry", cat, name, persist]);
        catEntries.delete(cat + ":" + name);
      },
    },
  };
  d.ci = {
    nsIAboutModule: { ALLOW_SCRIPT: 1, IS_SECURE_CHROME_UI: 4 },
    nsIFactory: {}, 
  };
  return d;
}

// ═══ 1. 页面契约 ════════════════════════════════════════════════════════
console.log("=== 页面契约 ===");
eq("两个页面", KOKOA_PAGES.map((p) => p.name), ["kokoa", "kokoases"]);
for (const p of KOKOA_PAGES) {
  ok("  " + p.name + " 的 URI 是本仓打包路径",
     p.uri.startsWith("chrome://browser/content/kokoa/") &&
     (p.uri.endsWith("home.html") || p.uri.endsWith("sessions.html")), p.uri);
  ok("  " + p.name + " 的 contract 正确", contractFor(p.name).endsWith("what=" + p.name));
  ok("  " + p.name + " 的 CID 是合法 GUID 形态",
     /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/.test(p.cid), p.cid);
}
ok("两个页面 CID 不重复", KOKOA_PAGES[0].cid !== KOKOA_PAGES[1].cid);

// ═══ 2. 注册：三件事都做 ════════════════════════════════════════════════
console.log("=== 注册 ===");
{
  const d = deps();
  const r = registerKokoaAboutPages(d);
  ok("返回 ok", r.ok === true, JSON.stringify(r.log));
  for (const p of KOKOA_PAGES) {
    const contract = contractFor(p.name);
    ok("  注册了 factory: " + p.name,
       d.calls.some((c) => c[0] === "registerFactory" && c[2] === contract));
    ok("  加了 about 类别条目: " + p.name,
       d.calls.some((c) => c[0] === "addCategoryEntry" && c[1] === "about" && c[2] === p.name && c[3] === contract),
       JSON.stringify(d.calls.filter((c) => c[0] === "addCategoryEntry")));
  }
  eq("registerFactory 次数 = 2", d.calls.filter((c) => c[0] === "registerFactory").length, 2);
}

// ═══ 3. 幂等：重复注册不重复注册 factory ═════════════════════════════════
console.log("=== 幂等 ===");
{
  const d = deps();
  registerKokoaAboutPages(d);
  const first = d.calls.filter((c) => c[0] === "registerFactory").length;
  const r2 = registerKokoaAboutPages(d);
  const second = d.calls.filter((c) => c[0] === "registerFactory").length;
  eq("第一次注册 2 个", first, 2);
  eq("第二次不再注册（already）", second, 2);
  ok("第二次日志含 already", r2.log.every((l) => l.includes("already")), JSON.stringify(r2.log));
  // 但类别条目仍应确保存在（浏览器重启后类别表可能被清）
  eq("第二次仍补类别条目",
     d.calls.filter((c) => c[0] === "addCategoryEntry").length, 4);
}

// ═══ 4. 模块实现 ════════════════════════════════════════════════════════
console.log("=== nsIAboutModule 实现 ===");
{
  const d = deps();
  const page = KOKOA_PAGES[0];
  const mod = buildAboutModule(page, d);
  eq("ALLOW_SCRIPT | IS_SECURE_CHROME_UI",
     mod.getURIFlags(), d.ci.nsIAboutModule.ALLOW_SCRIPT | d.ci.nsIAboutModule.IS_SECURE_CHROME_UI);
  eq("getChromeURI 指向本仓页面", mod.getChromeURI().__uri, page.uri);
  const chan = mod.newChannel({}, { __loadInfo: 1 });
  eq("通道 owner = system principal", chan.owner, "system-principal");
  ok("用 newChannelFromURIWithLoadInfo 并带 loadInfo",
     d.calls.some((c) => c[0] === "newChannel" && c[1] === page.uri && c[2] === true));
}

// ═══ 5. 失败要如实上报（不吞异常）═══════════════════════════════════════
console.log("=== 失败路径 ===");
{
  const d = deps();
  d.registrar.registerFactory = () => { throw new Error("boom"); };
  const r = registerKokoaAboutPages(d);
  ok("失败时 ok=false 且日志带 ERR", r.ok === false && r.log.join(" ").includes("ERR"), JSON.stringify(r.log));
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
