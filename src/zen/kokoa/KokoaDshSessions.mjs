// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa AI 工作区 —— 外壳侧的 dsh 会话列表客户端（HTTP RPC）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【这个模块解决什么问题】
 *
 * workitem-ai-panel-interface.md 第五节列了三个"没查清"：
 *   ❓ /api/session.export 等接口的确切签名
 *   ❓ 从 dsh 标签「切到某个会话」能不能做到
 *   ❓ dsh 有没有会话列表接口（AI 面板要显示列表）
 *
 * 2026-09-16 云端调研（读 dsh 0.1.5-rc.1 源码，证据见
 * docs/dsh-0.1.5-interface.md）把三个都回答了：
 *
 *   ① 会话列表接口【存在】：POST /api/session/list
 *      返回 items[]，含 sessionId / title / running / blank / cwd / updatedAt
 *   ② session.export 精确签名：GET /api/session.export?sessionId=<id>&includeDescendants=true
 *   ③ 「切换到指定会话」【外壳做不到】—— dsh 页面的"当前会话"是
 *      页面本地状态（sessions.open -> zustand store），没有 URL 路由、
 *      没有服务端"当前会话"概念、也没有外部触发通道。
 *      所以本模块的定位是【列表 + 引导】，不是【遥控切换】。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【dsh 的 HTTP RPC 是什么样子】（全部来自源码，非推测）
 *
 * 一元调用（本模块用的）：
 *   POST {origin}/api/session/list
 *   Content-Type: application/json
 *   body:   {"type":"client-request","rpcId":"<uuid>","method":"session/list","payload":{}}
 *   响应:   {"type":"server-response","rpcId":"<同一个>","result":{"ok":true,"value":{...}}}
 *           或  {"result":{"ok":false,"error":{"code","message","details"}}}
 *
 * 认证（必须先换 cookie，否则 401）：
 *   GET {origin}/?token=<launchToken>
 *     -> 303 + Set-Cookie: dsh-auth-<base64url(sha256(host))>=v1.<payload>.<sig>
 *        （HttpOnly; SameSite=Strict; Path=/）
 *   之后所有请求靠浏览器 cookie jar 自动携带（credentials:"include"）。
 *   我们已有带 token 的 panel URL（KokoaDshSidecar 的产物），正好就是交换入口。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【可测性设计】（照 tests 的文化：import 真模块，依赖可注入）
 *
 *   · 顶层只有字面量与纯函数 —— Node 可以直接 import
 *   · fetch 与 rpcId 工厂都是参数 —— 测试注入假的，不用真网络
 *   · 响应解析 / 摘要归一化都是导出的纯函数
 *
 * 【Firefox 侧怎么用】
 *   const r = await fetchSessionList(panelUrl);   // panelUrl 带 ?token=
 *   r.ok === true  -> r.sessions: [{id,title,running,blank,cwd,updatedAt,...}]
 *   r.ok === false -> r.error: 人话描述
 */

// ── 常量（全部有出处，见 docs/dsh-0.1.5-interface.md）────────────────────

/** 一元 RPC 的 channel 前缀。dsh-client-connection 的 API_PATH 常量。 */
export const API_CHANNEL = "/api";

/** 会话列表端点（namespace/method 形式）。 */
export const EP_SESSION_LIST = "session/list";

/** 会话导出端点 —— dsh-session-log-export 的 SESSION_LOG_EXPORT_PATH（GET/HEAD）。 */
export const EP_SESSION_EXPORT = "session.export";
/** 新建会话。注意：它的参数键是 args.request（不是 session/list 的 args._request）。 */
export const EP_SESSION_CREATE = "session/create";

/** 客户端请求 envelope 的 type 字段值。 */
export const TYPE_REQUEST = "client-request";

/** 服务端响应 envelope 的 type 字段值。 */
export const TYPE_RESPONSE = "server-response";

/** dsh 会话 id 形态：session-<uuid>（主线已实测；这里用于防御性校验提示）。 */
export const RE_SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ── URL 工具 ────────────────────────────────────────────────────────────

/**
 * 从 panel URL（带 ?token=）抽出 origin 与 token。
 *
 * panel URL 是 KokoaDshSidecar 的产物：
 *   http://127.0.0.1:18318/?token=XXXX
 *
 * @param {string} panelUrl
 * @returns {{origin: string, token: string}|null} 解析失败返回 null（不编造）
 */
export function extractOriginAndToken(panelUrl) {
  if (typeof panelUrl !== "string" || panelUrl === "") {
    return null;
  }
  let u;
  try {
    u = new URL(panelUrl);
  } catch (e) {
    return null;
  }
  const token = u.searchParams.get("token");
  if (!token) {
    return null;
  }
  // origin 不含路径与查询 —— 与 dsh resolveBase() 的 location.origin 语义一致
  return { origin: u.origin, token };
}

/**
 * 拼一元 RPC 的请求 URL。
 *
 * 【为什么单独一个函数】dsh 客户端用 new URL(channel + "/" + endpoint, origin)，
 * origin 尾部斜杠的有无会让字符串拼接出错 —— 用 URL 构造器对齐它的语义。
 *
 * @param {string} origin 形如 http://127.0.0.1:18318
 * @param {string} endpoint 形如 "session/list"（namespace/method）
 * @returns {string}
 */
export function rpcUrl(origin, endpoint) {
  return new URL(API_CHANNEL + "/" + endpoint, origin).toString();
}

// ── envelope 构造与解析 ─────────────────────────────────────────────────

/**
 * 构造 client-request envelope。
 *
 * @param {string} method 端点名，如 "session/list"
 * @param {object|undefined} payload
 * @param {string} rpcId 调用方生成的关联 id（响应会原样带回）
 * @returns {{type: string, rpcId: string, method: string, payload: object}}
 */
export function buildEnvelope(method, payload, rpcId) {
  // dsh gateway（2026-09-18 实测）：payload 必须形如 { args: { _request: … } }。
  // 裸对象（含 {}）自动包装；已是 {args} 形态则透传。
  let wire = payload;
  if (!wire || typeof wire !== "object") {
    wire = { args: { _request: {} } };
  } else if (!("args" in wire)) {
    const request = Object.keys(wire).length ? wire : {};
    wire = { args: { _request: request } };
  }
  return { type: TYPE_REQUEST, rpcId, method, payload: wire };
}

/**
 * 解析 server-response envelope。
 *
 * 【严格模式】dsh 自己的解析也是逐字段校验、不对就抛 TypeError
 * （parseConnectionResponse）。我们照抄这个态度：解析不出来就抛，
 * 不猜、不返回半成品。
 *
 * @param {object} json 已 JSON.parse 的响应体
 * @param {string} sentRpcId 我们发出去的 rpcId（校验回带是否一致）
 * @returns {{ok: true, value: object}|{ok: false, error: {code: string, message: string, details: object}}}
 * @throws {TypeError} envelope 形状不对 / rpcId 不匹配
 */
export function parseRpcResponse(json, sentRpcId) {
  if (!json || typeof json !== "object" || json.type !== TYPE_RESPONSE ||
      typeof json.rpcId !== "string") {
    throw new TypeError("connection: invalid server-response envelope");
  }
  if (json.rpcId !== sentRpcId) {
    throw new TypeError(
      "connection: rpcId mismatch for " + sentRpcId + ": sent " + sentRpcId +
      ", got " + json.rpcId);
  }
  const result = json.result;
  if (!result || typeof result !== "object") {
    throw new TypeError("connection: invalid server-response result");
  }
  if (result.ok === true) {
    return { ok: true, value: result.value };
  }
  if (result.ok === false && result.error && typeof result.error === "object" &&
      typeof result.error.code === "string" && typeof result.error.message === "string") {
    return {
      ok: false,
      error: {
        code: result.error.code,
        message: result.error.message,
        details: (result.error.details && typeof result.error.details === "object")
          ? result.error.details : {},
      },
    };
  }
  throw new TypeError("connection: invalid server-response result");
}

// ── 会话摘要归一化 ──────────────────────────────────────────────────────

/**
 * 把 session/list 的一个 item 归一化成面板要的最小形状。
 *
 * 【真实 schema】（dsh-api-remotes 生成的校验 schema，已逐字段核对）：
 *   item = {
 *     sessionId, updatedAt(数字毫秒), running(bool), blank(bool),
 *     parentSessionId?, origin?("subagent"), cwd?,
 *     projections: { asOfSeq, values: {
 *       title?: string|null, todos?, goal?, modelSelection?,
 *       sessionListMetadata?: { blank, lastPromptAt }, ... } } }
 *
 * 【防御性】projections 缺失不算错误 —— 旧会话/刚创建的会话可能没有；
 * title 拿不到就给 null，【不编造】（测试文化：没有就是没有）。
 *
 * @param {object} raw
 * @returns {{id: string, title: string|null, running: boolean, blank: boolean,
 *            cwd: string|null, updatedAt: number, parentSessionId: string|null,
 *            lastPromptAt: number|null}|null} 形状不对返回 null
 */
export function normalizeSessionItem(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.sessionId !== "string" ||
      raw.sessionId === "") {
    return null;
  }
  const values = raw.projections && typeof raw.projections === "object"
    ? raw.projections.values : undefined;
  const meta = values && typeof values === "object"
    ? values.sessionListMetadata : undefined;
  return {
    id: raw.sessionId,
    // title 拿不到就 null ——【不编造】（测试文化：没有就是没有）
    title: (values && typeof values.title === "string") ? values.title : null,
    running: raw.running === true,
    blank: raw.blank !== false,
    cwd: (typeof raw.cwd === "string") ? raw.cwd : null,
    updatedAt: (typeof raw.updatedAt === "number") ? raw.updatedAt : 0,
    parentSessionId: (typeof raw.parentSessionId === "string") ? raw.parentSessionId : null,
    lastPromptAt: (meta && typeof meta.lastPromptAt === "number") ? meta.lastPromptAt : null,
  };
}

/**
 * 归一化整个 items 数组（形状不对的项丢弃并计数）。
 *
 * @param {object[]} items
 * @returns {{sessions: object[], dropped: number}}
 */
export function normalizeSessionItems(items) {
  const sessions = [];
  let dropped = 0;
  for (const it of (Array.isArray(items) ? items : [])) {
    const n = normalizeSessionItem(it);
    if (n) sessions.push(n); else dropped++;
  }
  return { sessions, dropped };
}

// ── 高层入口 ────────────────────────────────────────────────────────────

/** 默认 rpcId 工厂 —— crypto.randomUUID 在 Node 22 与 Firefox chrome 都可用。 */
function defaultRpcId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return "rpc-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/**
 * 拉取 dsh 会话列表（token 交换 + 一元 RPC，两步）。
 *
 * @param {string} panelUrl 带 ?token= 的 dsh URL（KokoaDshSidecar 的产物）
 * @param {object} [deps]
 * @param {Function} [deps.fetchImpl] 默认 globalThis.fetch；测试注入假的
 * @param {Function} [deps.rpcIdFactory] 默认 crypto.randomUUID
 * @param {string} [deps.cursor] session/list 的分页游标
 * @returns {Promise<{ok: true, sessions: object[]}|{ok: false, error: string}>}
 */
export async function fetchSessionList(panelUrl, deps = {}) {
  const doFetch = deps.fetchImpl || ((input, init) => globalThis.fetch(input, init));
  const rpcIdFactory = deps.rpcIdFactory || defaultRpcId;

  const parsed = extractOriginAndToken(panelUrl);
  if (!parsed) {
    return { ok: false, error: "panel URL 里没有 token，无法认证（需要 KokoaDshSidecar 的带 token URL）" };
  }
  const { origin, token } = parsed;

  // ① token 换 cookie（303 + Set-Cookie；cookie 由浏览器 jar 自动管理）
  //    【为什么不用 redirect:"manual"】让浏览器自己处理 303 最稳，
  //    我们不读 Set-Cookie（HttpOnly 也读不到），jar 会存。
  let exchange;
  try {
    exchange = await doFetch(origin + "/?token=" + encodeURIComponent(token), {
      method: "GET",
      credentials: "include",
    });
  } catch (e) {
    return { ok: false, error: "连不上 dsh（" + origin + "）：" + e };
  }
  if (exchange.status === 401) {
    return { ok: false, error: "dsh 拒绝了这个 token（可能已重启换 token），请重新打开 AI 工作区" };
  }

  // ② 一元 RPC：POST /api/session/list
  const rpcId = rpcIdFactory();
  const envelope = buildEnvelope(EP_SESSION_LIST, { cursor: deps.cursor }, rpcId);
  let resp;
  try {
    resp = await doFetch(rpcUrl(origin, EP_SESSION_LIST), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
  } catch (e) {
    return { ok: false, error: "会话列表请求失败：" + e };
  }
  if (resp.status === 401) {
    return { ok: false, error: "dsh 会话列表 401（cookie 没带上或已过期）" };
  }
  if (!resp.ok) {
    return { ok: false, error: "dsh 会话列表 HTTP " + resp.status };
  }

  // ③ 解析 + 归一化（解析错误转成人话，不往上抛）
  let parsed2;
  try {
    parsed2 = parseRpcResponse(await resp.json(), rpcId);
  } catch (e) {
    return { ok: false, error: "dsh 响应不像 session/list 的 envelope：" + e.message };
  }
  if (!parsed2.ok) {
    return { ok: false, error: "dsh 返回错误 " + parsed2.error.code + ": " + parsed2.error.message };
  }
  const value = parsed2.value || {};
  const { sessions, dropped } = normalizeSessionItems(value.items);
  if (dropped > 0) {
    console.debug("[Kokoa/dsh] session/list 有 " + dropped + " 个形状不对的项被丢弃");
  }
  // 服务端已按 updatedAt 降序排好（fixture 与真实 face 一致）——我们不重排
  return { ok: true, sessions };
}

/**
 * 在 dsh 侧新建一个空白会话（一元 RPC：POST /api/session/create）。
 *
 * 【★ 参数键与 session/list 不同（主线 2026-09-18 实测）】
 *   session/list   → payload.args._request
 *   session/create → payload.args.request
 *   用错会得到 gateway/arguments-invalid。buildEnvelope 在"已含 args"时透传，
 *   所以这里显式传 { args: { request } }。
 *
 * @param {string} panelUrl 带 ?token= 的 dsh URL（KokoaDshSidecar / KokoaAiPanel 的产物）
 * @param {{cwd?: string, workspaceId?: string}} [opts]
 * @param {object} [deps] fetchImpl / rpcIdFactory（测试注入）
 * @returns {Promise<{ok: true, sessionId: string}|{ok: false, error: string}>}
 */
export async function createSession(panelUrl, opts = {}, deps = {}) {
  const doFetch = deps.fetchImpl || ((input, init) => globalThis.fetch(input, init));
  const rpcIdFactory = deps.rpcIdFactory || defaultRpcId;

  const parsed = extractOriginAndToken(panelUrl);
  if (!parsed) {
    return { ok: false, error: "panel URL 里没有 token，无法新建会话（需要带 token 的 dsh URL）" };
  }
  const { origin, token } = parsed;

  // ① token 换 cookie（与 fetchSessionList 同一套路，让浏览器自己处理 303）
  let exchange;
  try {
    exchange = await doFetch(origin + "/?token=" + encodeURIComponent(token), {
      method: "GET",
      credentials: "include",
    });
  } catch (e) {
    return { ok: false, error: "连不上 dsh（" + origin + "）：" + e };
  }
  if (exchange.status === 401) {
    return { ok: false, error: "dsh 拒绝了这个 token（可能已重启换 token），请重新打开 AI 工作区" };
  }

  // ② 一元 RPC：POST /api/session/create
  const request = {};
  if (opts && typeof opts.cwd === "string" && opts.cwd) {
    request.cwd = opts.cwd;
  }
  if (opts && typeof opts.workspaceId === "string" && opts.workspaceId) {
    request.workspaceId = opts.workspaceId;
  }
  const rpcId = rpcIdFactory();
  const envelope = buildEnvelope(EP_SESSION_CREATE, { args: { request } }, rpcId);
  let resp;
  try {
    resp = await doFetch(rpcUrl(origin, EP_SESSION_CREATE), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
  } catch (e) {
    return { ok: false, error: "新建会话请求失败：" + e };
  }
  if (resp.status === 401) {
    return { ok: false, error: "dsh 新建会话 401（cookie 没带上或已过期）" };
  }
  if (!resp.ok) {
    return { ok: false, error: "dsh 新建会话 HTTP " + resp.status };
  }

  // ③ 解析 + 校验会话 id（形状不对就是错，不猜）
  let parsedResp;
  try {
    parsedResp = parseRpcResponse(await resp.json(), rpcId);
  } catch (e) {
    return { ok: false, error: "dsh 响应不像 session/create 的 envelope：" + e.message };
  }
  if (!parsedResp.ok) {
    return {
      ok: false,
      error: "dsh 返回错误 " + parsedResp.error.code + ": " + parsedResp.error.message,
    };
  }
  const sid = parsedResp.value && parsedResp.value.sessionId;
  if (typeof sid !== "string" || !RE_SESSION_ID.test(sid)) {
    return { ok: false, error: "bad-session-id: " + JSON.stringify(parsedResp.value) };
  }
  return { ok: true, sessionId: sid };
}

/**
 * 构造某个会话的导出 URL（GET /api/session.export?sessionId=..&includeDescendants=true）。
 *
 * 【注意】这个 URL 只在【页面内】有效（靠页面 cookie + anchor 下载），
 * 外壳侧 fetch 它拿到的流没有 UI 意义 —— 暴露它主要为设置页"导出"按钮服务。
 *
 * @param {string} origin
 * @param {string} sessionId
 * @returns {string}
 */
export function sessionExportUrl(origin, sessionId) {
  const u = new URL(API_CHANNEL + "/" + EP_SESSION_EXPORT, origin);
  u.searchParams.set("sessionId", sessionId);
  u.searchParams.set("includeDescendants", "true");
  return u.toString();
}
