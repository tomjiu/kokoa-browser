// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaDshSessions 的行为测试。
 *
 * 【测的是什么】
 * dsh 0.1.5-rc.1 的 HTTP RPC 契约（见 docs/dsh-0.1.5-interface.md）：
 *   POST /api/session/list
 *     body  {"type":"client-request","rpcId","method","payload"}
 *     resp  {"type":"server-response","rpcId","result":{ok,value|error}}
 *
 * 【怎么测】
 *   · import【真模块】的导出（不复制实现 —— testing-pitfalls 第一节）
 *   · 高层 fetchSessionList 的 fetch 是【注入的假 fetch】（Node 无网络）
 *   · 假 fetch 按调用顺序返回：第 1 次=token 交换，第 2 次=RPC
 *
 * 【双向验证】（testing-pitfalls 第二节）：
 *   故意改坏 parseRpcResponse 的 rpcId 比对 / normalizeSessionItem 的
 *   title 提取，本文件必须出现对应失败。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaDshSessions.behavior.test.js
 */

import {
  API_CHANNEL, EP_SESSION_LIST, EP_SESSION_EXPORT,
  TYPE_REQUEST, TYPE_RESPONSE,
  RE_SESSION_ID,
  extractOriginAndToken, rpcUrl, buildEnvelope, parseRpcResponse,
  normalizeSessionItem, normalizeSessionItems, fetchSessionList, sessionExportUrl,
} from "./KokoaDshSessions.mjs";

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else {
    fail++;
    console.log("  ❌ " + name + (extra ? "  <- " + extra : ""));
  }
}

function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(name, g === w, "期望 " + w + "，实际 " + g);
}

const PANEL = "http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0";

// ═══ 1. extractOriginAndToken ═══════════════════════════════════════════
console.log("=== extractOriginAndToken ===");

eq("真实 panel URL", extractOriginAndToken(PANEL),
   { origin: "http://127.0.0.1:18318", token: "bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0" });

eq("带路径的 URL 也只取 origin", extractOriginAndToken("http://127.0.0.1:3080/app/?token=t1"),
   { origin: "http://127.0.0.1:3080", token: "t1" });

ok("无 token -> null", extractOriginAndToken("http://127.0.0.1:18318/") === null);
ok("空串 -> null", extractOriginAndToken("") === null);
ok("非字符串 -> null", extractOriginAndToken(null) === null && extractOriginAndToken(42) === null);
ok("不是 URL -> null", extractOriginAndToken("not a url") === null);

// ═══ 2. rpcUrl ══════════════════════════════════════════════════════════
console.log("=== rpcUrl ===");

eq("常规拼接", rpcUrl("http://127.0.0.1:18318", "session/list"),
   "http://127.0.0.1:18318/api/session/list");
eq("origin 带尾斜杠不出错", rpcUrl("http://127.0.0.1:18318/", "session/list"),
   "http://127.0.0.1:18318/api/session/list");
ok("channel 常量是 /api", API_CHANNEL === "/api");

// ═══ 3. buildEnvelope ═══════════════════════════════════════════════════
console.log("=== buildEnvelope ===");

eq("envelope 形状", buildEnvelope("session/list", {}, "rpc-1"),
   { type: "client-request", rpcId: "rpc-1", method: "session/list",
     payload: { args: { _request: {} } } });
eq("payload 缺省给 gateway 形态", buildEnvelope("session/list").payload,
   { args: { _request: {} } });

ok("端点常量", EP_SESSION_LIST === "session/list" && EP_SESSION_EXPORT === "session.export");
ok("type 常量", TYPE_REQUEST === "client-request" && TYPE_RESPONSE === "server-response");
ok("会话 id 正则接受真实形态", RE_SESSION_ID.test("session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b"));

// ═══ 4. parseRpcResponse ════════════════════════════════════════════════
console.log("=== parseRpcResponse ===");

const good = { type: "server-response", rpcId: "r1", result: { ok: true, value: { items: [] } } };
eq("成功路径", parseRpcResponse(good, "r1"), { ok: true, value: { items: [] } });

const bizErr = { type: "server-response", rpcId: "r1",
  result: { ok: false, error: { code: "x/y", message: "nope", details: {} } } };
eq("业务错误路径", parseRpcResponse(bizErr, "r1"),
   { ok: false, error: { code: "x/y", message: "nope", details: {} } });

let threw = "";
try { parseRpcResponse({ type: "wrong", rpcId: "r1" }, "r1"); }
catch (e) { threw = e.constructor.name; }
ok("type 不对 -> TypeError", threw === "TypeError");

threw = "";
try { parseRpcResponse({ type: "server-response", rpcId: "OTHER",
  result: { ok: true, value: {} } }, "r1"); }
catch (e) { threw = e.constructor.name; }
ok("rpcId 不匹配 -> TypeError", threw === "TypeError");

threw = "";
try { parseRpcResponse(null, "r1"); }
catch (e) { threw = e.constructor.name; }
ok("null -> TypeError", threw === "TypeError");

threw = "";
try { parseRpcResponse({ type: "server-response", rpcId: "r1", result: { ok: 1 } }, "r1"); }
catch (e) { threw = e.constructor.name; }
ok("result.ok 非法 -> TypeError", threw === "TypeError");

// ═══ 5. normalizeSessionItem ════════════════════════════════════════════
console.log("=== normalizeSessionItem ===");

// 按 dsh-api-remotes 的真实 schema 构造（字段名逐个对过）
const REAL_ITEM = {
  sessionId: "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b",
  updatedAt: 1726460000000,
  running: true,
  blank: false,
  cwd: "E:/Code/kokoa",
  projections: {
    asOfSeq: 42,
    values: {
      title: "修 ffprefs 的递归扫描",
      sessionListMetadata: { blank: false, lastPromptAt: 1726459990000 },
    },
  },
};
eq("完整 item", normalizeSessionItem(REAL_ITEM), {
  id: "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b",
  title: "修 ffprefs 的递归扫描",
  running: true,
  blank: false,
  cwd: "E:/Code/kokoa",
  updatedAt: 1726460000000,
  parentSessionId: null,
  lastPromptAt: 1726459990000,
});

const bare = { sessionId: "session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  updatedAt: 1, running: false, blank: true };
const bareN = normalizeSessionItem(bare);
ok("无 projections 不算错，title=null", bareN.title === null);
ok("缺 cwd -> null", bareN.cwd === null);
ok("缺 lastPromptAt -> null", bareN.lastPromptAt === null);
ok("缺 parentSessionId -> null", bareN.parentSessionId === null);

ok("缺 sessionId -> null", normalizeSessionItem({ updatedAt: 1 }) === null);
ok("null -> null", normalizeSessionItem(null) === null);
ok("空字符串 sessionId -> null", normalizeSessionItem({ sessionId: "", updatedAt: 1 }) === null);

const dropped = normalizeSessionItems([REAL_ITEM, bare, { bad: 1 }, null, "x"]);
eq("归一化数组：好的保留、坏的丢弃并计数",
   { sessions: dropped.sessions.length, dropped: dropped.dropped }, { sessions: 2, dropped: 3 });
eq("空/非数组输入", normalizeSessionItems(undefined), { sessions: [], dropped: 0 });

// ═══ 6. fetchSessionList（注入假 fetch）════════════════════════════════
console.log("=== fetchSessionList ===");

/** 造一个假 fetch：记录调用，按脚本返回。 */
function fakeFetch(script) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (input, init) => {
      const url = String(input instanceof URL ? input : input);
      calls.push({ url, init: init || {} });
      return script[calls.length - 1]();
    },
  };
}

function jsonResp(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// 6.1 成功路径：交换 303 + RPC 200 + 正确 envelope
{
  const f = fakeFetch([
    () => jsonResp(303, ""),
    () => jsonResp(200, { type: "server-response", rpcId: "RID", result: {
      ok: true, value: { items: [REAL_ITEM, bare] } } }),
  ]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl, rpcIdFactory: () => "RID" });

  ok("成功路径 ok=true", r.ok === true, JSON.stringify(r).slice(0, 120));
  if (r.ok) {
    eq("两个会话都归一化", r.sessions.length, 2);
    eq("第一个的 title", r.sessions[0].title, "修 ffprefs 的递归扫描");
    eq("服务端顺序保留（不重排）", r.sessions[1].id, "session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  }
  eq("调用次数 = 2（交换 + RPC）", f.calls.length, 2);
  eq("第 1 次是 token 交换（GET ?token=）",
     { url: f.calls[0].url, method: f.calls[0].init.method },
     { url: "http://127.0.0.1:18318/?token=" + encodeURIComponent("bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0"),
       method: "GET" });
  ok("交换带 credentials:include", f.calls[0].init.credentials === "include");
  eq("第 2 次是 POST /api/session/list",
     { url: f.calls[1].url, method: f.calls[1].init.method },
     { url: "http://127.0.0.1:18318/api/session/list", method: "POST" });
  const sent = JSON.parse(f.calls[1].init.body);
  eq("发出去的 envelope", sent,
     { type: "client-request", rpcId: "RID", method: "session/list",
       payload: { args: { _request: { cursor: undefined } } } });
  ok("content-type 是 json", f.calls[1].init.headers["content-type"] === "application/json");
}

// 6.2 带 cursor 的分页
{
  const f = fakeFetch([
    () => jsonResp(303, ""),
    () => jsonResp(200, { type: "server-response", rpcId: "R", result: { ok: true, value: { items: [] } } }),
  ]);
  await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl, rpcIdFactory: () => "R", cursor: "off-10" });
  eq("cursor 进 payload", JSON.parse(f.calls[1].init.body).payload,
     { args: { _request: { cursor: "off-10" } } });
}

// 6.3 交换 401 -> 人话错误
{
  const f = fakeFetch([() => jsonResp(401, "")]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl });
  ok("交换 401 -> ok=false", r.ok === false && /token/.test(r.error), r.error);
}

// 6.4 RPC 401
{
  const f = fakeFetch([() => jsonResp(303, ""), () => jsonResp(401, "")]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl });
  ok("RPC 401 -> 提示 cookie", r.ok === false && /401/.test(r.error), r.error);
}

// 6.5 RPC 500
{
  const f = fakeFetch([() => jsonResp(303, ""), () => jsonResp(500, "")]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl });
  ok("RPC 500 -> HTTP 500", r.ok === false && /500/.test(r.error), r.error);
}

// 6.6 rpcId 不匹配 -> envelope 错误（不抛出到调用方，转人话）
{
  const f = fakeFetch([
    () => jsonResp(303, ""),
    () => jsonResp(200, { type: "server-response", rpcId: "WRONG", result: { ok: true, value: {} } }),
  ]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl, rpcIdFactory: () => "RIGHT" });
  ok("rpcId 不匹配 -> ok=false 不抛出", r.ok === false && /envelope/.test(r.error), r.error);
}

// 6.7 网络错误
{
  const f = fakeFetch([() => { throw new Error("ECONNREFUSED"); }]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl });
  ok("连不上 -> 人话错误", r.ok === false && /连不上/.test(r.error), r.error);
}

// 6.8 panel URL 没 token
{
  const f = fakeFetch([]);
  const r = await fetchSessionList("http://127.0.0.1:18318/", { fetchImpl: f.fetchImpl });
  ok("无 token 不发请求", r.ok === false && /token/.test(r.error) && f.calls.length === 0, r.error);
}

// 6.9 业务错误（result.ok=false）原样透出 code
{
  const f = fakeFetch([
    () => jsonResp(303, ""),
    () => jsonResp(200, { type: "server-response", rpcId: "R",
      result: { ok: false, error: { code: "gateway/internal", message: "boom", details: {} } } }),
  ]);
  const r = await fetchSessionList(PANEL, { fetchImpl: f.fetchImpl, rpcIdFactory: () => "R" });
  ok("业务错误透出 code+message", r.ok === false && /gateway\/internal: boom/.test(r.error), r.error);
}

// ═══ 7. sessionExportUrl ════════════════════════════════════════════════
console.log("=== sessionExportUrl ===");

eq("导出 URL（含 sessionId 与 includeDescendants）",
   sessionExportUrl("http://127.0.0.1:18318", "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b"),
   "http://127.0.0.1:18318/api/session.export?sessionId=" +
   "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b&includeDescendants=true");

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
