// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaCanvasScene 的行为测试（零依赖 node，非 0 退出即失败）。
 *
 * 【测什么】画布与 AI 之间的契约（AI 唯一被允许的改图通道）：
 *   · 默认 user 模式下 AI 改不动（安全默认）
 *   · 切到 collaborative/ai 后能改，且 unknown op / 坏参数 / 坏 id **整批拒**
 *   · **原子性**：一批里有一条坏 → 整体不动（不产生半途状态）
 *   · 一次 apply = **一个撤销单元**（人能一键回到认可状态）
 *   · id 由画布分配（AI 不自己编，避免撞车）
 *
 * 【双向验证】把 apply 里"先全批校验"改成边校验边落地、或去掉 E_MODE 那道门，
 *   本文件必须出现对应失败。
 *
 * 【怎么跑】node src/zen/kokoa/KokoaCanvasScene.test.js
 */

import {
  CANVAS_MODES,
  E_BAD_ID,
  E_BAD_OP,
  E_MODE,
  checkOp,
  createCanvasScene,
  nextElementId,
} from "./KokoaCanvasScene.mjs";

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

/** 假宿主：内存里存元素 + 记撤销单元。 */
function host(initial, mode) {
  const h = {
    els: (initial || []).map((e) => ({ ...e })),
    mode: mode || "user",
    undo: [],
    sets: 0,
  };
  return {
    h,
    deps: {
      getElements: () => h.els,
      setElements: (l) => { h.els = l; h.sets += 1; },
      getMode: () => h.mode,
      setMode: (m) => { h.mode = m; return true; },
      onUndoUnit: (u) => h.undo.push(u),
      now: () => 1000,
    },
  };
}

// ═══ 1. 词汇与常量 ══════════════════════════════════════════════════════
console.log("=== 词汇 ===");
eq("三种模式与产品面板一致", CANVAS_MODES, ["user", "collaborative", "ai"]);

// ═══ 2. 安全默认：user 模式下 AI 改不动 ══════════════════════════════════
console.log("=== 安全默认 ===");
{
  const { h, deps } = host([], "user");
  const s = createCanvasScene(deps);
  const r = s.apply([{ op: "add", element: { type: "rect", x: 1, y: 2 } }]);
  eq("user 模式被拒 + 错误码", [r.ok, r.error], [false, E_MODE]);
  eq("且**没有写任何元素**", h.els.length, 0);
  eq("也没有记撤销单元", h.undo.length, 0);
  ok("错误详情里点明怎么解决", /collaborative|ai/.test(r.detail), r.detail);
}

// ═══ 3. collaborative / ai 下能改 ═══════════════════════════════════════
console.log("=== 允许改动 ===");
{
  const { h, deps } = host([], "collaborative");
  const s = createCanvasScene(deps);
  const r = s.apply([
    { op: "add", element: { type: "rect", x: 10, y: 20, w: 30, h: 40 } },
    { op: "add", element: { type: "text", x: 5, y: 5, text: "你好" } },
  ]);
  ok("成功", r.ok === true, JSON.stringify(r));
  eq("applied=2", r.applied, 2);
  eq("元素真的进去了", h.els.length, 2);
  eq("id 由画布分配", [h.els[0].id, h.els[1].id], ["el-1", "el-2"]);
  eq("标注来源 = ai", h.els[0].by, "ai");
  eq("一次 apply = 一个撤销单元", h.undo.length, 1);
  eq("撤销单元记了 op 数", h.undo[0].ops, 2);
}

// ═══ 4. 原子性：一条坏 → 整批不动 ═══════════════════════════════════════
console.log("=== 原子性 ===");
{
  const { h, deps } = host([{ id: "el-1", type: "rect", x: 0, y: 0 }], "collaborative");
  const s = createCanvasScene(deps);
  const r = s.apply([
    { op: "add", element: { type: "rect", x: 1, y: 1 } },
    { op: "bogus", element: { type: "rect" } },
  ]);
  eq("整批拒（坏 op）", [r.ok, r.error], [false, E_BAD_OP]);
  ok("详情带下标", /第 1 条/.test(r.detail), r.detail);
  eq("已存在的元素没被动", h.els.length, 1);
  eq("没有写盘", h.sets, 0);
  eq("没有撤销单元", h.undo.length, 0);
}
{
  const { h, deps } = host([{ id: "el-1", type: "rect", x: 0, y: 0 }], "collaborative");
  const s = createCanvasScene(deps);
  const r = s.apply([
    { op: "update", id: "el-1", patch: { x: 99 } },
    { op: "remove", id: "el-404" },
  ]);
  eq("坏 id 也整批拒", [r.ok, r.error], [false, E_BAD_ID]);
  eq("★ 前面的 update 不能已经生效（半途状态）", h.els[0].x, 0);
  eq("没有写盘", h.sets, 0);
}

// ═══ 5. 各类 op 的行为 ══════════════════════════════════════════════════
console.log("=== op 行为 ===");
{
  const { h, deps } = host([
    { id: "el-1", type: "rect", x: 0, y: 0 },
    { id: "el-2", type: "text", x: 1, y: 1, text: "a" },
  ], "ai");
  const s = createCanvasScene(deps);
  const r = s.apply([
    { op: "update", id: "el-2", patch: { text: "改过了", x: 42 } },
    { op: "remove", id: "el-1" },
  ]);
  ok("成功", r.ok === true);
  eq("update 合并（没写到的字段保留）", [h.els[0].text, h.els[0].x, h.els[0].type], ["改过了", 42, "text"]);
  eq("remove 生效", h.els.length, 1);
}
{
  const { h, deps } = host([{ id: "el-1", type: "rect", x: 0, y: 0 }], "ai");
  const s = createCanvasScene(deps);
  const r = s.apply([{ op: "clear" }]);
  ok("clear 成功", r.ok === true);
  eq("清空", h.els.length, 0);
}

// ═══ 6. id 分配不与既有撞车 ═════════════════════════════════════════════
console.log("=== id 分配 ===");
eq("空画布从 el-1 开始", nextElementId([]), "el-1");
eq("接最大值 +1", nextElementId([{ id: "el-7" }, { id: "el-3" }]), "el-8");
eq("不认识的名字忽略", nextElementId([{ id: "custom" }, { id: "el-2" }]), "el-3");

// ═══ 7. 校验函数本身 ════════════════════════════════════════════════════
console.log("=== checkOp ===");
ok("add 合法", checkOp({ op: "add", element: { type: "rect", x: 1, y: 2 } }) === null);
ok("NaN 坐标非法", checkOp({ op: "add", element: { x: NaN } }) !== null);
ok("字符串坐标非法", checkOp({ op: "add", element: { x: "1" } }) !== null);
ok("未知 op 非法", checkOp({ op: "destroy" }) !== null);
ok("remove 缺 id 非法", checkOp({ op: "remove" }) !== null);
ok("update 缺 id 非法", checkOp({ op: "update", patch: { x: 1 } }) !== null);
ok("clear 合法", checkOp({ op: "clear" }) === null);

// ═══ 8. 模式切换 + 场景读取 ═════════════════════════════════════════════
console.log("=== 模式与场景读取 ===");
{
  const { h, deps } = host([{ id: "el-1", type: "rect", x: 1, y: 1, selected: true }], "user");
  const s = createCanvasScene(deps);
  eq("非法模式被拒", s.setMode("godmode").ok, false);
  eq("合法模式生效", s.setMode("collaborative").mode, "collaborative");
  eq("宿主模式也变了", h.mode, "collaborative");
  const sc = s.getScene();
  eq("场景带版本/模式/元素", [sc.version, sc.mode, sc.elements.length], [1, "collaborative", 1]);
  eq("selectedIds 单独给", sc.selectedIds, ["el-1"]);
  ok("getScene 返回的是拷贝（外部改不动内部）", sc.elements[0] !== h.els[0]);
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
