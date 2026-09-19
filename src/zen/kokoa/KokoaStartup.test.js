// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaStartup（启动门面）的行为测试（零依赖 node，非 0 退出即失败）。
 *
 * 【测什么】四条 pref 组合 + 三条刻意约束：
 *   · homeFirst 默认 true / workbench 默认 false → 开首页
 *   · workbench=true 且 homeFirst=false → 不开（用户要工作台）
 *   · 幂等：已有 about:kokoa → 只选中，不新开
 *   · 不抢标签：about:blank 之外（例如恢复的会话页）一个都不关
 *   · 只清空白：about:blank/about:newtab 才关
 *   · 失败软着陆：没有 gBrowser → ok:false 且不抛
 *
 * 【双向验证】把 shouldOpenHome 的 `|| !workbench` 去掉、或把 isUnusedBlankTab
 *   放宽成"任何标签"，本文件必须出现对应失败。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaStartup.test.js
 */

import { ensureHomeFirst, isUnusedBlankTab, shouldOpenHome } from "./KokoaStartup.mjs";

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

/** 造一个假窗口：gBrowser 上可观察 addTab/removeTab/selectedTab。 */
function fakeWin(specs) {
  const calls = [];
  const tabs = specs.map((spec, i) => ({
    id: "tab" + i,
    linkedBrowser: { currentURI: { spec } },
  }));
  const gb = {
    tabs,
    selectedTab: null,
    addTab(url, opts) {
      calls.push(["addTab", url, Boolean(opts && opts.inBackground === false), Boolean(opts && opts.triggeringPrincipal)]);
      const t = { id: "new" + tabs.length, linkedBrowser: { currentURI: { spec: url } } };
      tabs.push(t);
      return t;
    },
    removeTab(t) {
      calls.push(["removeTab", t.id]);
      const i = tabs.indexOf(t);
      if (i >= 0) tabs.splice(i, 1);
    },
  };
  return { win: { gBrowser: gb }, calls, gb };
}

function prefsWith(map) {
  return { getBool: (name, def) => (name in map ? map[name] : def) };
}
const LOGS = [];

// ═══ 1. 判据纯函数 ══════════════════════════════════════════════════════
console.log("=== shouldOpenHome（四条组合）===");
ok("默认（读不到默认层）→ 开首页", shouldOpenHome(prefsWith({})));
ok("homeFirst=true, workbench=false → 开", shouldOpenHome(prefsWith({ "kokoa.startup.homeFirst": true, "kokoa.startup.workbench": false })));
ok("homeFirst=false, workbench=true → 不开", !shouldOpenHome(prefsWith({ "kokoa.startup.homeFirst": false, "kokoa.startup.workbench": true })));
ok("homeFirst=false, workbench=false → 开（不要工作台=要首页）", shouldOpenHome(prefsWith({ "kokoa.startup.homeFirst": false, "kokoa.startup.workbench": false })));
ok("homeFirst=true, workbench=true → 开（显式要首页者赢）", shouldOpenHome(prefsWith({ "kokoa.startup.homeFirst": true, "kokoa.startup.workbench": true })));

console.log("=== isUnusedBlankTab ===");
ok("about:blank 算", isUnusedBlankTab("about:blank"));
ok("about:newtab 算", isUnusedBlankTab("about:newtab"));
ok("about:home 不算（用户可能在看它）", !isUnusedBlankTab("about:home"));
ok("恢复的网页不算", !isUnusedBlankTab("https://example.com/"));
ok("about:kokoa 不算", !isUnusedBlankTab("about:kokoa"));

// ═══ 2. 开首页 + 清空白 ═════════════════════════════════════════════════
console.log("=== 开首页 ===");
{
  const { win, calls } = fakeWin(["about:blank", "https://example.com/"]);
  const r = ensureHomeFirst(win, { prefs: prefsWith({}), systemPrincipal: "sys", log: (m) => LOGS.push(m) });
  eq("action=home-first", r.action, "home-first");
  ok("开了标签", r.opened === true);
  eq("addTab 用前台 + system principal", calls[0], ["addTab", "about:kokoa", true, true]);
  eq("关掉了那个空白标签", calls.filter((c) => c[0] === "removeTab").length, 1);
  ok("选了首页标签", win.gBrowser.selectedTab !== null);
  eq("closed=1", r.closed, 1);
}

console.log("=== 不抢用户的标签 ===");
{
  const { win, calls } = fakeWin(["https://a.example/", "https://b.example/", "about:blank"]);
  const r = ensureHomeFirst(win, { prefs: prefsWith({}), systemPrincipal: "sys" });
  eq("只关了空白那个", r.closed, 1);
  const removed = calls.filter((c) => c[0] === "removeTab");
  eq("被关的是 tab2（空白）", removed, [["removeTab", "tab2"]]);
  ok("两个真实网页都还在", win.gBrowser.tabs.filter((t) => t.linkedBrowser.currentURI.spec.startsWith("https://")).length === 2);
}

console.log("=== 幂等：已有 about:kokoa ===");
{
  const { win, calls } = fakeWin(["about:kokoa", "about:blank"]);
  const r = ensureHomeFirst(win, { prefs: prefsWith({}), systemPrincipal: "sys" });
  ok("没有新开标签", r.opened === false);
  ok("没有 addTab", !calls.some((c) => c[0] === "addTab"));
  eq("仍清理了空白", r.closed, 1);
}

// ═══ 3. workbench 模式：什么都不做 ══════════════════════════════════════
console.log("=== workbench 模式 ===");
{
  const { win, calls } = fakeWin(["about:blank"]);
  const r = ensureHomeFirst(win, {
    prefs: prefsWith({ "kokoa.startup.homeFirst": false, "kokoa.startup.workbench": true }),
    systemPrincipal: "sys",
  });
  eq("action=workbench-first", r.action, "workbench-first");
  eq("一个调用都没有", calls.length, 0);
}

// ═══ 4. 失败软着陆 ══════════════════════════════════════════════════════
console.log("=== 失败软着陆 ===");
{
  const r = ensureHomeFirst(null, { prefs: prefsWith({}) });
  eq("没有窗口 → no-gbrowser", r.action, "no-gbrowser");
  ok("不抛异常、返回 ok:false", r.ok === false);
}
{
  const win = { gBrowser: { get tabs() { throw new Error("boom"); }, addTab() { throw new Error("boom2"); } } };
  const r = ensureHomeFirst(win, { prefs: prefsWith({}), systemPrincipal: "sys", log: () => {} });
  ok("内部异常被吞掉并如实返回 ok:false", r.ok === false && r.action === "error");
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
