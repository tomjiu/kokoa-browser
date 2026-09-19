// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * createSession（dsh RPC session/create）的行为测试。
 *
 * 【为什么单独一个文件】fetchSessionList 的测试守着 session/list 的 args._request；
 * session/create 用的是 args.request —— 两者**键不同**，用错会 gateway/arguments-invalid。
 * 本文件就是这条差异的守卫（改坏 payload 键 -> 必须失败）。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaDshSessions.create.test.js
 */

import {
  EP_SESSION_CREATE, TYPE_RESPONSE, createSession,
} from "./KokoaDshSessions.mjs";

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

const PANEL = "http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0";
const SID = "session-1b3f8a2c-4d5e-4f60-9a7b-8c9d0e1f2a3b";

/** 假 fetch：按调用顺序返回预设响应，并记录每次调用的入参。 */
function fakeFetch(responses) {
  const calls = [];
  const f = async (input, init) => {
    calls.push({ url: String(input), init: init || {} });
    if (!responses.length) {
      throw new Error("没有预设响应了: " + input);
    }
    return responses.shift();
  };
  f.calls = calls;
  return f;
}

function http(obj, status) {
  const s = status === undefined ? 200 : status;
  return {
    status: s,
    ok: s >= 200 && s < 300,
    json: async () => obj,
  };
}

function rpcOk(value, rpcId) {
  return http({ type: TYPE_RESPONSE, rpcId, result: { ok: true, value } });
}

function rpcErr(code, message, rpcId) {
  return http({ type: TYPE_RESPONSE, rpcId, result: { ok: false, error: { code, message } } });
}

const RID = () => "rpc-fixed";

// ═══ 1. 端点常量 ════════════════════════════════════════════════════════
console.log("=== 端点常量 ===");
ok("EP_SESSION_CREATE = session/create", EP_SESSION_CREATE === "session/create");

// ═══ 2. 成功路径：两步 fetch + 参数键 args.request ═══════════════════════
console.log("=== 成功路径 ===");
{
  const f = fakeFetch([http({}, 303), rpcOk({ sessionId: SID }, "rpc-fixed")]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  eq("返回新建的会话 id", r, { ok: true, sessionId: SID });
  eq("两次调用", f.calls.length, 2);
  ok("① 先做 token 交换（GET，带 credentials）",
     f.calls[0].url === "http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0" &&
     f.calls[0].init.method === "GET" && f.calls[0].init.credentials === "include");
  ok("② 再 POST /api/session/create",
     f.calls[1].url === "http://127.0.0.1:18318/api/session/create" &&
     f.calls[1].init.method === "POST" &&
     f.calls[1].init.credentials === "include" &&
     f.calls[1].init.headers["content-type"] === "application/json");
  const body = JSON.parse(f.calls[1].init.body);
  eq("envelope 形状",
     { type: body.type, rpcId: body.rpcId, method: body.method },
     { type: "client-request", rpcId: "rpc-fixed", method: "session/create" });
  eq("★ payload.args.request（不是 _request）", body.payload, { args: { request: {} } });
  ok("★ 不得出现 args._request", body.payload.args._request === undefined);
}

// ═══ 3. cwd / workspaceId 透传 ══════════════════════════════════════════
console.log("=== 参数透传 ===");
{
  const f = fakeFetch([http({}, 303), rpcOk({ sessionId: SID }, "rpc-fixed")]);
  await createSession(PANEL, { cwd: "E:/proj", workspaceId: "ws-1" },
                      { fetchImpl: f, rpcIdFactory: RID });
  const body = JSON.parse(f.calls[1].init.body);
  eq("request 带 cwd 与 workspaceId", body.payload.args.request,
     { cwd: "E:/proj", workspaceId: "ws-1" });
}

// ═══ 4. 失败路径 ════════════════════════════════════════════════════════
console.log("=== 失败路径 ===");
{
  const r = await createSession("http://127.0.0.1:18318/", {}, { fetchImpl: fakeFetch([]) });
  ok("无 token：人话报错且不发请求", r.ok === false && /token/.test(r.error));
}
{
  const f = fakeFetch([http({}, 401)]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  ok("token 被拒 -> 401 文案", r.ok === false && /401|拒绝/.test(r.error));
  eq("401 后不再发 RPC", f.calls.length, 1);
}
{
  const f = fakeFetch([http({}, 303), http({}, 500)]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  ok("HTTP 500 -> 带上状态码", r.ok === false && /500/.test(r.error));
}
{
  const f = fakeFetch([http({}, 303), rpcErr("EBUSY", "too many sessions", "rpc-fixed")]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  ok("RPC 业务错误 -> code: message",
     r.ok === false && r.error === "dsh 返回错误 EBUSY: too many sessions");
}
{
  const f = fakeFetch([http({}, 303), rpcOk({ sessionId: "session-nope" }, "rpc-fixed")]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  ok("id 形状不对 -> bad-session-id", r.ok === false && /bad-session-id/.test(r.error));
}
{
  const f = fakeFetch([http({}, 303), rpcOk({ sessionId: SID }, "rpc-OTHER")]);
  const r = await createSession(PANEL, {}, { fetchImpl: f, rpcIdFactory: RID });
  ok("rpcId 不匹配 -> envelope 报错（不静默接受）",
     r.ok === false && /envelope/.test(r.error));
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
