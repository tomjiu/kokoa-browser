// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaAiPanel 的纯函数测试。
 *
 * 【为什么写这个】
 * urlBase() 是【主线踩过坑】的地方（boot.js L1039-L1041 的实测教训）：
 *   AI 标签的 URL 形如 <base>/?token=xxx#kokoa-ws=<id>
 *   比较时要【同时切掉 ? 与 #】——
 *   漏切任一都会让 findAiTab 认不出标签（分屏/复用全部失配）。
 *
 * 那是【一个字符之差就坏】的逻辑，值得用测试固定住。
 *
 * 【怎么跑】
 *   node src/zen/kokoa/KokoaAiPanel.test.js
 *
 * 【零依赖】import 真模块（不是复制实现）。
 * 注意：KokoaAiPanel.mjs 里 getPanelUrl/findAiTab/openAiTab 依赖浏览器 API
 * （Services / ChromeUtils / gBrowser），但 urlBase/hasToken 是纯函数 ——
 * 而且浏览器 API 都在【函数体内】，不在顶层，所以 Node 能 import。
 */

import { urlBase, hasToken, tabIdentity, sessionFrag } from "./KokoaAiPanel.mjs";

let pass = 0;
let fail = 0;

function eq(name, got, expect) {
  const ok = got === expect;
  if (ok) { pass++; console.log("  ✅ " + name); }
  else {
    fail++;
    console.log("  ❌ " + name);
    console.log("       期望: " + JSON.stringify(expect));
    console.log("       实际: " + JSON.stringify(got));
  }
}

console.log("=== urlBase（同时切掉 ? 与 #）===");
console.log("");

// ① 基础
eq("普通 URL 不变", urlBase("http://127.0.0.1:3080/"), "http://127.0.0.1:3080/");

// ② ★ 切掉 query（token 会变）
eq("切掉 ?token=", urlBase("http://127.0.0.1:3080/?token=abc"), "http://127.0.0.1:3080/");

// ③ ★ 切掉 fragment（工作区标识会加）
eq("切掉 #kokoa-ws=", urlBase("http://127.0.0.1:3080/#kokoa-ws=uuid-1"), "http://127.0.0.1:3080/");

// ④ ★★ 两个都要切（这是坑的核心）
eq("同时切掉 ? 与 #（坑的核心）",
   urlBase("http://127.0.0.1:3080/?token=abc#kokoa-ws=uuid-1"),
   "http://127.0.0.1:3080/");

// ⑤ 只有 # 没有 ?
eq("只有 fragment",
   urlBase("http://127.0.0.1:3080/#kokoa-ws=x"),
   "http://127.0.0.1:3080/");

// ⑥ 顺序颠倒（# 在 ? 前 —— 不常见的畸形 URL，但不能崩）
eq("畸形 URL（# 在 ? 前）不崩",
   urlBase("http://a/#frag?q=1"),
   "http://a/");

// ⑦ 空值
eq("空字符串", urlBase(""), "");
eq("undefined", urlBase(undefined), "");
eq("null", urlBase(null), "");

console.log("");
console.log("=== hasToken（判断 URL 有没有 dsh 的 token）===");
console.log("");

eq("有 token（?token=）", hasToken("http://x/?token=abc"), true);
eq("有 token（&token=）", hasToken("http://x/?a=1&token=abc"), true);
eq("无 token", hasToken("http://x/"), false);
eq("假 token（tokenx=）", hasToken("http://x/?tokenx=1"), false);
eq("片段里有 token 字样但不带 =", hasToken("http://x/#token"), false);
eq("空字符串", hasToken(""), false);
eq("undefined", hasToken(undefined), false);

console.log("");
console.log("=== tabIdentity / sessionFrag ===");
console.log("");

eq("无 fragment → default", tabIdentity("http://x/"), "default");
eq("session 优先", tabIdentity("http://x/#kokoa-session=s1&kokoa-ws=w1"), "s1");
eq("仅有 ws", tabIdentity("http://x/#kokoa-ws=w1"), "w1");
eq("sessionFrag", sessionFrag("session-abc"), "#kokoa-session=session-abc");
eq("sessionFrag 空", sessionFrag(null), "");

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
