// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaShellApi 的行为测试（零依赖 node 脚本，非 0 退出即失败）。
 *
 * 【测什么】设置页依赖的四个动作的**语义**，用注入的假依赖全跑一遍：
 *   openWorkspace = 打开/复用主工作台标签
 *   openHistory   = 打开会话历史页（缺省用构造时的窗口）
 *   toggleSplit   = 先确保 AI 标签在，再分屏（仅布局）
 *   newParallel   = dsh RPC 新建会话 -> 带 #kokoa-session= 的独立标签
 * 并且守 SHELL_API_METHODS 这份方法名契约（设置页按名字取用）。
 *
 * 【双向验证】把 buildShellApi 里 toggleSplit 的 no-ai-tab 分支删掉、
 * 或把 newParallel 的 openAiSessionTab(win, created.sessionId) 改成不带 id，
 * 本文件必须出现对应失败。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaShellApi.test.js
 */

import { SHELL_API_METHODS, buildShellApi } from "./KokoaShellApi.mjs";

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  [ok] " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra ? "  <- " + extra : "")); }
}

function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  ok(name, g === w, "期望 " + w + "，实际 " + g);
}

const WIN = { name: "win-A" };
const OTHER_WIN = { name: "win-B" };
const FAKE_TAB = { id: "tab-1" };
const SID = "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b";

function deps(over) {
  const calls = [];
  const d = {
    calls,
    openAiTab(win, frag, opts) {
      calls.push(["openAiTab", win && win.name, frag === undefined ? null : frag]);
      return { tab: FAKE_TAB, reused: false };
    },
    openAiSessionTab(win, sessionId) {
      calls.push(["openAiSessionTab", win && win.name, sessionId]);
      return { tab: FAKE_TAB, reused: false };
    },
    openSessionHistoryTab(win) {
      calls.push(["openSessionHistoryTab", win && win.name]);
      return { tab: FAKE_TAB, reused: false };
    },
    panelUrl() {
      calls.push(["panelUrl"]);
      return { url: "http://127.0.0.1:3081/?token=t", source: "test" };
    },
    toggleAiSplit(win, tab) {
      calls.push(["toggleAiSplit", win && win.name, tab && tab.id]);
      return { ok: true, action: "split" };
    },
    async createSession(url, opts) {
      calls.push(["createSession", url, JSON.stringify(opts || {})]);
      return { ok: true, sessionId: SID };
    },
  };
  return Object.assign(d, over || {});
}

// ═══ 1. 方法名契约 ══════════════════════════════════════════════════════
console.log("=== 方法名契约 ===");
eq("SHELL_API_METHODS", SHELL_API_METHODS,
   ["openWorkspace", "openHistory", "toggleSplit", "newParallel"]);
const api = buildShellApi(WIN, deps());
ok("四个方法都是函数",
   SHELL_API_METHODS.every((m) => typeof api[m] === "function"));

// ═══ 2. openWorkspace ══════════════════════════════════════════════════
console.log("=== openWorkspace ===");
{
  const d = deps();
  const a = buildShellApi(WIN, d);
  const r = a.openWorkspace();
  ok("返回 openAiTab 的结果", r && r.tab === FAKE_TAB);
  eq("不带任何 fragment（= 主工作台）", d.calls,
     [["openAiTab", "win-A", null]]);
}

// ═══ 3. openHistory ════════════════════════════════════════════════════
console.log("=== openHistory ===");
{
  const d = deps();
  const a = buildShellApi(WIN, d);
  a.openHistory();
  a.openHistory(OTHER_WIN);
  eq("缺省用构造窗口，显式传入优先", d.calls,
     [["openSessionHistoryTab", "win-A"], ["openSessionHistoryTab", "win-B"]]);
}

// ═══ 4. toggleSplit ════════════════════════════════════════════════════
console.log("=== toggleSplit ===");
{
  const d = deps();
  const a = buildShellApi(WIN, d);
  const r = a.toggleSplit();
  eq("先开标签再分屏，且用的是那个标签", d.calls,
     [["openAiTab", "win-A", null], ["toggleAiSplit", "win-A", "tab-1"]]);
  ok("透传分屏结果", r && r.ok === true && r.action === "split");
}
{
  const d = deps({ openAiTab() { d.calls.push(["openAiTab"]); return { tab: null }; } });
  const r = buildShellApi(WIN, d).toggleSplit();
  eq("没有 AI 标签时不静默成功", r, { ok: false, reason: "no-ai-tab" });
  eq("且不去分屏", d.calls.length, 1);
}

// ═══ 5. newParallel ════════════════════════════════════════════════════
console.log("=== newParallel ===");
{
  const d = deps();
  const r = await buildShellApi(WIN, d).newParallel({ cwd: "E:/x" });
  eq("新建会话 -> 打开带该 id 的标签", d.calls,
     [["panelUrl"],
      ["createSession", "http://127.0.0.1:3081/?token=t", "{\"cwd\":\"E:/x\"}"],
      ["openAiSessionTab", "win-A", SID]]);
  ok("返回 sessionId 与标签", r && r.ok === true && r.sessionId === SID && r.tab === FAKE_TAB);
}
{
  const d = deps({ panelUrl() { return { url: "" }; } });
  const r = await buildShellApi(WIN, d).newParallel();
  eq("没有 panel URL 时不新建", r, { ok: false, error: "no-panel-url" });
}
{
  const d = deps({ async createSession() { return { ok: false, error: "rpc-error" }; } });
  const a = buildShellApi(WIN, d);
  const r = await a.newParallel();
  eq("dsh 拒绝时透传错误", r, { ok: false, error: "rpc-error" });
  ok("失败时不开标签", !d.calls.some((c) => c[0] === "openAiSessionTab"));
}
{
  const d = deps({ panelUrl() { throw new Error("boom"); } });
  const r = await buildShellApi(WIN, d).newParallel();
  ok("panelUrl 抛错也返回对象（不炸设置页）", r && r.ok === false && /panel-url-error/.test(r.error));
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
