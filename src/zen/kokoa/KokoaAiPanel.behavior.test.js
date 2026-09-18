// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaAiPanel / KokoaAiSplit 的行为测试（用假窗口，不需要浏览器）。
 *
 * 【★ 为什么这个测试值得写】
 * 之前我以为「AI 逻辑必须等完整构建 + 实机测」—— 不对。
 * 实测：这两个模块的函数都【把 win 当参数传入】，
 * 浏览器 API（Services / ChromeUtils / window）只在【函数体内】用，
 * 所以 Node 里注入假的就能跑。
 *
 * 【注入了什么】
 *   globalThis.Services       —— Services.env / scriptSecurityManager
 *   globalThis.window         —— window.gZenViewSplitter（分屏用）
 *   win（参数）               —— gBrowser.tabs 等，测试自己造
 *
 * 【不测什么】
 *   · dsh 能否真被拉起（要真进程 —— 只能实机）
 *   · 模块能否被 resource:/// 导入（要真构建 —— 由产物核对覆盖）
 *   · 真实 UI 表现
 *
 * 【怎么跑】
 *   node src/zen/kokoa/KokoaAiPanel.behavior.test.js
 */

// ── 注入浏览器全局 ────────────────────────────────────────────────
// 【为什么必须在 import 之前】
//   这些是函数体内才用的，但 window 有个坑：
//   KokoaAiSplit 的 getSplitter() 读全局 window，
//   如果 window 未定义会 ReferenceError。所以先造好。
globalThis.Services = {
  env: { get: () => "" },
  scriptSecurityManager: { getSystemPrincipal: () => ({ SYS: true }) },
  prefs: {
    getIntPref: (name, def) => (name === "kokoa.ai.maxParallel" ? 4 : def),
  },
};
globalThis.ChromeUtils = { importESModule: () => ({ FileUtils: {} }) };

/** @type {{gZenViewSplitter: object|null}} */
globalThis.window = { gZenViewSplitter: null };

const {
  urlBase,
  hasToken,
  findAiTab,
  openAiTab,
  openAiSessionTab,
  tabIdentity,
  sessionFrag,
  listAiTabs,
} = await import("./KokoaAiPanel.mjs");
const {
  isSplitActive,
  isAiInSplit,
  splitAiWithCurrent,
  unsplitAi,
  toggleAiSplit,
} = await import("./KokoaAiSplit.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? "  -> " + extra : "")); }
}

/**
 * 造一个假窗口。
 * @param {Array<object>} tabs 每个形如 { url, splitView } 或原始 tab 对象
 */
function fakeWin(tabs) {
  const added = [];
  const gb = {
    tabs: tabs.map(t =>
      "linkedBrowser" in t ? t : {
        linkedBrowser: { currentURI: { spec: t.url } },
        splitView: t.splitView || null,
      }
    ),
    addTab(url, opts) {
      const t = { url, opts, linkedBrowser: { currentURI: { spec: url } } };
      added.push(t);
      gb.tabs.push(t);
      return t;
    },
    _added: added,
  };
  return { gBrowser: gb, _gb: gb };
}

console.log("=== 一、标签复用（主线踩过的坑）===");
console.log("");

// 面板 URL 是兜底的 127.0.0.1:3080（env 没注入时）
const PANEL = "http://127.0.0.1:3080/";

// ① 没有 AI 标签 -> 新建
{
  const w = fakeWin([{ url: "https://example.com/" }]);
  const r = openAiTab(w);
  ok("① 无 AI 标签时【新建】", r.reused === false);
  ok("① 新建时传给 addTab 的 URL 是面板地址", r.url.startsWith(PANEL));
  ok("① 新建的标签被选中", w._gb.selectedTab === r.tab);
}

// ② 已有 AI 标签（带 #kokoa-ws=）-> 打开 default 时回退复用已有 AI 标签
{
  const w = fakeWin([{ url: PANEL + "#kokoa-ws=abc" }]);
  const before = w._gb.tabs.length;
  const r = openAiTab(w);
  ok("② 已有 AI 标签时【复用】", r.reused === true);
  ok("② 复用时没有新增标签", w._gb.tabs.length === before);
}

// ②b 不同会话身份 → 并行新标签，不复用
{
  const w = fakeWin([
    { url: PANEL + "#kokoa-session=session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  ]);
  const before = w._gb.tabs.length;
  const r = openAiSessionTab(w, "session-11111111-2222-3333-4444-555555555555");
  ok("②b 不同会话【新开标签】", r.reused === false);
  ok("②b 标签数 +1", w._gb.tabs.length === before + 1);
  ok("②b URL 带 kokoa-session", r.url.includes("#kokoa-session=session-11111111-2222-3333-4444-555555555555"), r.url);
}

// ②c 同一会话再次打开 → 复用
{
  const w = fakeWin([
    { url: PANEL + "#kokoa-session=session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    { url: PANEL + "#kokoa-session=session-11111111-2222-3333-4444-555555555555" },
  ]);
  const before = w._gb.tabs.length;
  const r = openAiSessionTab(w, "session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  ok("②c 同一会话【复用】", r.reused === true);
  ok("②c 不再新建", w._gb.tabs.length === before);
}

// ③ ★ 带 ?token= 的 URL 也要能认出是同一个面板（主线踩过）
{
  const w = fakeWin([{ url: PANEL + "?token=xyz#kokoa-ws=1" }]);
  ok("③ 带 ?token= 与 #fragment 也能复用", openAiTab(w).reused === true);
}

// ④ 不同域名不该被认成 AI 标签
{
  const w = fakeWin([{ url: "https://other.com/" }]);
  ok("④ 普通标签不算 AI", findAiTab(w) === null);
}

// ⑤ skipRoute（防止被 space-routing 挪走）
{
  const w = fakeWin([{ url: "https://example.com/" }]);
  openAiTab(w);
  ok("⑤ ★ addTab 传了 skipRoute:true", w._gb._added[0].opts.skipRoute === true);
  ok("⑤ addTab 传了 triggeringPrincipal",
     w._gb._added[0].opts.triggeringPrincipal != null);
}

// ⑥ wsFrag 拼到 URL 上
{
  const w = fakeWin([{ url: "https://example.com/" }]);
  const r = openAiTab(w, "#kokoa-ws=42");
  ok("⑥ wsFrag 拼进了 URL", r.url.endsWith("#kokoa-ws=42"), r.url);
}

// ⑦ gBrowser 缺失时不崩
ok("⑦ gBrowser 缺失时 findAiTab 返回 null", findAiTab({}) === null);

console.log("");
console.log("=== 二、URL 工具 ===");
console.log("");

ok("urlBase 切掉 ? 与 #", urlBase("http://a/?token=1#ws=2") === "http://a/");
ok("tabIdentity 默认 default", tabIdentity("http://a/?token=1") === "default");
ok("tabIdentity 认 kokoa-session",
   tabIdentity(PANEL + "#kokoa-session=session-xyz") === "session-xyz");
ok("tabIdentity 认 kokoa-ws", tabIdentity(PANEL + "#kokoa-ws=w1") === "w1");
ok("sessionFrag 空 id → 空串", sessionFrag("") === "");
ok("sessionFrag 形态", sessionFrag("session-a") === "#kokoa-session=session-a");
ok("listAiTabs 只收 panel origin",
   listAiTabs(fakeWin([{ url: PANEL }, { url: "https://x.com/" }])).length === 1);
ok("hasToken 认 ?token=", hasToken("http://a/?token=1") === true);
ok("hasToken 认 &token=", hasToken("http://a/?x=1&token=2") === true);
ok("hasToken 不认没有 token 的", hasToken("http://a/") === false);
ok("hasToken 空值不崩", hasToken(undefined) === false);

console.log("");
console.log("=== 三、分屏 ===");
console.log("");

// 造一个假 splitter，记录调用
function fakeSplitter() {
  const calls = [];
  return {
    splitViewActive: false,
    splitTabs(tabs, dir, idx) { calls.push(["split", tabs, dir, idx]); this.splitViewActive = true; return true; },
    unsplitCurrentView() { calls.push(["unsplit"]); this.splitViewActive = false; return true; },
    calls,
  };
}

// ⑧ 没有 splitter 时给出明确原因（不崩）
{
  globalThis.window.gZenViewSplitter = null;
  const w = fakeWin([{ url: "https://example.com/" }]);
  const r = splitAiWithCurrent(w, { id: "ai" });
  ok("⑧ 分屏不可用时返回 ok:false（不抛异常）", r.ok === false && typeof r.reason === "string");
}

// ⑨ 正常分屏
{
  const sp = fakeSplitter();
  globalThis.window.gZenViewSplitter = sp;
  const aiTab = { id: "ai" };
  const w = fakeWin([]);
  w._gb.selectedTab = { id: "page" };
  const r = splitAiWithCurrent(w, aiTab);
  ok("⑨ ★ 有 splitter 时分屏成功", r.ok === true, JSON.stringify(r));
  ok("⑨ 调用了 splitTabs", sp.calls.length === 1 && sp.calls[0][0] === "split");
  const tabsArg = sp.calls[0][1];
  ok("⑨ splitTabs 第一个参数是【标签数组】（AI + 当前页）",
     Array.isArray(tabsArg) && tabsArg.includes(aiTab) && tabsArg.includes(w._gb.selectedTab),
     JSON.stringify(tabsArg && tabsArg.map(t => t && t.id)));
  ok("⑨ 方向是 vsep（左右并排）", sp.calls[0][2] === "vsep");
  ok("⑨ initialIndex=1（AI 在右侧）", sp.calls[0][3] === 1);
}

// ⑩ 选中的就是 AI 标签 -> 不该分屏（没有并排对象）
{
  const sp = fakeSplitter();
  globalThis.window.gZenViewSplitter = sp;
  const aiTab = { id: "ai" };
  const w = fakeWin([]);
  w._gb.selectedTab = aiTab;
  const r = splitAiWithCurrent(w, aiTab);
  ok("⑩ ★ 选中的就是 AI 时拒绝分屏", r.ok === false, JSON.stringify(r));
  ok("⑩ 没有调用 splitTabs", sp.calls.length === 0);
}

// ⑪ aiTab 为 null -> 拒绝
{
  globalThis.window.gZenViewSplitter = fakeSplitter();
  const w = fakeWin([]);
  w._gb.selectedTab = { id: "page" };
  ok("⑪ AI 标签为 null 时拒绝", splitAiWithCurrent(w, null).ok === false);
}

// ⑫ isSplitActive / isAiInSplit
{
  globalThis.window.gZenViewSplitter = fakeSplitter();
  ok("⑫ isSplitActive：未激活时 false", isSplitActive() === false);
  globalThis.window.gZenViewSplitter.splitViewActive = true;
  ok("⑫ isSplitActive：激活后 true", isSplitActive() === true);
  ok("⑫ isAiInSplit：tab.splitView 为真时 true", isAiInSplit({}, { splitView: {} }) === true);
  ok("⑫ isAiInSplit：无 splitView 时 false", isAiInSplit({}, {}) === false);
  ok("⑫ isAiInSplit：aiTab 为 null 时 false", isAiInSplit({}, null) === false);
}

// ⑬ 取消分屏
{
  const sp = fakeSplitter();
  globalThis.window.gZenViewSplitter = sp;
  const aiTab = { id: "ai" };
  const w2 = fakeWin([]);
  const r = unsplitAi(w2, aiTab);
  ok("⑬ unsplitAi 返回 ok:true", r.ok === true, JSON.stringify(r));
  ok("⑬ ★ 用的真实 API unsplitCurrentView（不是不存在的 unsplitTabs）",
     sp.calls.some(c => c[0] === "unsplit"));
  ok("⑬ unsplit 前先选中了 AI 标签（否则拆的不是那个）",
     w2._gb.selectedTab === aiTab);
}

// ⑭ toggle 两侧
{
  globalThis.window.gZenViewSplitter = fakeSplitter();
  const aiTab = { id: "ai" };
  const w = fakeWin([]);
  w._gb.selectedTab = { id: "page" };
  // 当前没激活 -> toggle 应该去分屏
  ok("⑭ 未激活时 toggle 走分屏", toggleAiSplit(w, aiTab).ok === true);
  globalThis.window.gZenViewSplitter.splitViewActive = true;
  ok("⑭ 已激活时 toggle 走取消", toggleAiSplit(w, aiTab).ok === true);
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
