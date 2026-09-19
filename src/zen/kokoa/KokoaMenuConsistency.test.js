// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * ★ 跨文件一致性测试：菜单的三处契约必须同步。
 *
 * 【为什么要这个测试】
 *   菜单功能有【三处】描述同一件事，它们是【人工保持同步】的：
 *     ① src/zen/kokoa/KokoaMenubar.mjs        的 MENU_ITEMS（实现）
 *     ② src/browser/components/preferences/config/kokoa.mjs  的勾选框
 *        （2026-09-19 前是 kokoaSettings.inc.xhtml 的 XUL 模板；设置页迁到
 *          config pane 体系后，勾选框变成 kokoaSafeAddSetting 的 pref 绑定）
 *     ③ prefs/kokoa/menu.yaml                 的默认值
 *
 *   我在写这个功能时就犯过一次：设置页里加了 ai-workspace 勾选框，
 *   但模块里根本没有对应项 —— 那是个【死开关】（用户勾了没反应）。
 *   这类不一致【人眼很难发现】，所以让机器来查。
 *
 * 【查什么】
 *   · 设置页里每个 preference="..." 都要在模块契约里有对应项
 *   · 模块契约里每项都要在设置页有勾选框（否则用户改不了）
 *   · prefs yaml 里的默认值要与模块的 def 一致
 *   · prefs yaml 里没有【多余】的项（否则是死 pref）
 *
 * 【怎么跑】
 *   node src/zen/kokoa/KokoaMenuConsistency.test.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

const { MENU_CONTRACT } = await import("./KokoaMenubar.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "\n       " + extra : "")); }
}

// ── 读三个文件 ──────────────────────────────────────────────────
const panePath = join(repoRoot, "src", "browser", "components", "preferences", "config", "kokoa.mjs");
const yamlPath = join(repoRoot, "prefs", "kokoa", "menu.yaml");

let pane = "";
let yaml = "";
try {
  pane = readFileSync(panePath, "utf8");
} catch (e) {
  console.log("  FAIL 读不到设置页模块: " + panePath);
  process.exit(1);
}
try {
  yaml = readFileSync(yamlPath, "utf8");
} catch (e) {
  console.log("  FAIL 读不到 prefs: " + yamlPath);
  process.exit(1);
}

// ── 提取设置页里的菜单 pref 名（pref 绑定）──────────────────────
// 【注意】必须先剥注释 —— 文件里有示例与解释文字，不剥会被当成真实绑定
//         （上一版 XUL 时代就被注释里的示例 <checkbox preference=...> 骗过）。
//         行注释只在「不是 ://」时切，免得把 "http://127.0.0.1:8318" 截断。
// 只收 kokoa.menu.* —— 同文件还有 CPA/dsh 的绑定，它们不属于本测试的契约。
const panePrefs = [];
{
  // 【★ 踩坑记录（2026-09-19）】不要用「整段正则剥注释」：
  //   kokoa.mjs:403 的行注释里出现 defaults/preferences/*.js —— 那个 "/*"
  //   会让 /\/\*[\s\S]*?\*\//g 从那里起配到下一个 "*/" 为止，
  //   把中间所有真实代码（包括全部菜单 pref 绑定）整段吃掉
  //   → 本测试静默变成「设置页 0 项」（假绿/假红）。
  //   改成逐行状态机：只认【整行】的注释起止，代码行原样匹配。
  let inBlock = false;
  for (const raw of pane.split(/\r?\n/)) {
    const t = raw.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    const re = /pref:\s*"(kokoa\.menu\.[^"]+)"/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      panePrefs.push(m[1]);
    }
  }
}
const xhtmlPrefs = panePrefs;

// ── 提取 yaml 里的 name / value ─────────────────────────────────
const yamlPrefs = new Map();
{
  // 逐行扫：遇到 "- name: X" 就开一项，之后遇到的第一个 "value: Y" 是它的默认值。
  // 【为什么不用大正则】跨块的 [\s\S]*? 在文件末尾容易漏（我第一版漏了最后一项）。
  let cur = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#")) { continue; }
    const nm = /^-\s*name:\s*(\S+)$/.exec(line);
    if (nm) { cur = nm[1]; yamlPrefs.set(cur, undefined); continue; }
    const vm = /^value:\s*(true|false)$/.exec(line);
    if (vm && cur) { yamlPrefs.set(cur, vm[1] === "true"); }
  }
}

const contractPrefs = new Map(MENU_CONTRACT.map(e => [e.pref, e.defaultVisible]));

console.log("=== 三处契约 ===");
console.log("");
console.log("  模块(实现):   " + contractPrefs.size + " 项");
console.log("  设置页(勾选框): " + panePrefs.length + " 项");
console.log("  prefs(默认值):  " + yamlPrefs.size + " 项");
console.log("");

// ★ ① 设置页里【每个】勾选框都要在模块里有实现（否则是死开关）
{
  const dead = xhtmlPrefs.filter(p => !contractPrefs.has(p));
  ok("① ★ 设置页没有【死开关】（每个勾选框模块都认）",
     dead.length === 0, dead.length ? "模块里没有: " + dead.join(", ") : "");
}

// ★ ② 模块里每项都要在设置页有勾选框（否则用户改不了）
{
  const missing = [...contractPrefs.keys()].filter(p => xhtmlPrefs.indexOf(p) < 0);
  ok("② ★ 模块每项都能在设置页里改（没有用户够不着的）",
     missing.length === 0, missing.length ? "设置页缺: " + missing.join(", ") : "");
}

// ★ ③ prefs 的默认值要与模块的 def 一致
{
  const mismatched = [];
  for (const [p, def] of contractPrefs) {
    if (!yamlPrefs.has(p)) {
      mismatched.push(p + " (prefs 里没有)");
    } else if (yamlPrefs.get(p) !== def) {
      mismatched.push(p + " prefs=" + yamlPrefs.get(p) + " 模块=" + def);
    }
  }
  ok("③ ★ prefs 默认值与模块一致",
     mismatched.length === 0, mismatched.join("; "));
}

// ★ ④ prefs 里没有多余项（否则是死 pref）
{
  const extra = [...yamlPrefs.keys()].filter(p => !contractPrefs.has(p));
  ok("④ prefs 里没有【多余的】项",
     extra.length === 0, extra.length ? "模块不认: " + extra.join(", ") : "");
}

// ⑤ 数量一致（三个都是同一个集合）
ok("⑤ 三处数量一致",
   contractPrefs.size === xhtmlPrefs.length && contractPrefs.size === yamlPrefs.size,
   "模块=" + contractPrefs.size + " 设置页=" + xhtmlPrefs.length + " prefs=" + yamlPrefs.size);

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);