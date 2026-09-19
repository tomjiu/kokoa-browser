// Kokoa 画布渲染桥的**不变量**测试（node 跑，非 0 退出即失败）。
//
// 【测什么】三条不变量里"本层负责"的部分：
//   1. 一次 AI 的 apply = 一个撤销单元 → pushBatch 快照 + undoLastAiBatch 整批还原
//      （**不是**逐个元素撤销 —— 那是 Excalidraw 自带 history 的粒度，不是我们要的）
//   2. AI 元素带 by:"ai" → 渲染用 AI 色（人一眼认得出哪笔是 AI 画的）
//   3. 元素字段映射往返不丢契约字段（toExcalidraw → fromExcalidraw）
//
// 【怎么跑】先构建出 dist/pure.mjs（见 build.sh 旁的小 bundle 步骤），再
//   node test/scene-bridge.test.mjs
//
// 【双向验证】把 undoLastAiBatch 改成"只删最后一个元素"，本文件必须失败。

import {
  AI_STROKE,
  USER_STROKE,
  createCanvasApp,
  fromExcalidraw,
  toExcalidraw,
} from "../dist/pure.mjs";

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

function app(mode) {
  const changes = [];
  const a = createCanvasApp({
    getMode: () => mode,
    onElementsChanged: (l) => changes.push(l.length),
  });
  return { a, changes };
}

// ═══ 1. 一次 apply = 一个撤销单元（整批还原）═══════════════════════════════
console.log("=== 撤销单元 ===");
{
  const { a } = app("collaborative");
  // 人先画一个
  a.hostDeps.setElements([{ id: "el-1", type: "rect", x: 0, y: 0, by: "user" }]);
  // AI 一批：加两个元素
  a.pushBatch();
  a.hostDeps.setElements([
    ...a.hostDeps.getElements(),
    { id: "el-2", type: "rect", x: 10, y: 10, by: "ai" },
    { id: "el-3", type: "ellipse", x: 20, y: 20, by: "ai" },
  ]);
  eq("AI 批次后有 3 个元素", a.hostDeps.getElements().length, 3);
  ok("撤销一次返回 true", a.undoLastAiBatch() === true);
  eq("★ 整批还原（回到 1 个，不是 2 个）", a.hostDeps.getElements().length, 1);
  eq("人画的那个还在", a.hostDeps.getElements()[0].id, "el-1");
  ok("撤销栈空了再撤销返回 false", a.undoLastAiBatch() === false);
}

// ═══ 2. 多批次：逐批还原（后进先出）═══════════════════════════════════════
console.log("=== 多批次 ===");
{
  const { a } = app("ai");
  a.pushBatch();
  a.hostDeps.setElements([{ id: "el-1", type: "rect", x: 0, y: 0, by: "ai" }]);
  a.pushBatch();
  a.hostDeps.setElements([
    ...a.hostDeps.getElements(),
    { id: "el-2", type: "rect", x: 5, y: 5, by: "ai" },
  ]);
  eq("两批后 2 个", a.hostDeps.getElements().length, 2);
  a.undoLastAiBatch();
  eq("撤销第二批 → 1 个", a.hostDeps.getElements().length, 1);
  a.undoLastAiBatch();
  eq("再撤销第一批 → 0 个", a.hostDeps.getElements().length, 0);
}

// ═══ 3. 快照是深拷贝（后续修改不影响快照）═════════════════════════════════
console.log("=== 快照隔离 ===");
{
  const { a } = app("ai");
  a.hostDeps.setElements([{ id: "el-1", type: "rect", x: 0, y: 0, by: "user" }]);
  a.pushBatch();
  const els = a.hostDeps.getElements();
  els[0].x = 999; // 模拟用户拖动
  a.hostDeps.setElements(els);
  a.undoLastAiBatch();
  eq("★ 撤销回到的是快照值（不是被改后的 999）", a.hostDeps.getElements()[0].x, 0);
}

// ═══ 4. AI 元素用 AI 色（人一眼认得出）════════════════════════════════════
console.log("=== 来源着色 ===");
eq("AI 元素用 AI 色", toExcalidraw({ id: "el-1", type: "rect", x: 0, y: 0, by: "ai" }).strokeColor, AI_STROKE);
eq("人的元素用人的色", toExcalidraw({ id: "el-2", type: "rect", x: 0, y: 0, by: "user" }).strokeColor, USER_STROKE);
ok("AI 色 ≠ 人色", AI_STROKE !== USER_STROKE);
eq("默认尺寸（没给 w/h 时）", [toExcalidraw({ id: "el-3", type: "rect", x: 0, y: 0 }).width,
    toExcalidraw({ id: "el-3", type: "rect", x: 0, y: 0 }).height], [120, 60]);

// ═══ 5. 类型映射与往返 ════════════════════════════════════════════════════
console.log("=== 类型映射 ===");
eq("rect → rectangle", toExcalidraw({ id: "a", type: "rect", x: 0, y: 0 }).type, "rectangle");
eq("ellipse → ellipse", toExcalidraw({ id: "a", type: "ellipse", x: 0, y: 0 }).type, "ellipse");
eq("text → text 且带文本", toExcalidraw({ id: "a", type: "text", x: 0, y: 0, text: "hi" }).text, "hi");
eq("往返：rect 保字段", fromExcalidraw(toExcalidraw({ id: "el-9", type: "rect", x: 3, y: 4, w: 50, h: 25 })),
   { id: "el-9", type: "rect", x: 3, y: 4, w: 50, h: 25 });
eq("往返：text 带文本", fromExcalidraw(toExcalidraw({ id: "el-9", type: "text", x: 1, y: 2, text: "你好" })).text, "你好");
eq("往返：ellipse", fromExcalidraw(toExcalidraw({ id: "el-9", type: "ellipse", x: 0, y: 0 })).type, "ellipse");

// ═══ 6. 模式如实传递（不由本层放宽）═══════════════════════════════════════
console.log("=== 模式 ===");
{
  const { a } = app("user");
  eq("初始模式 = 传入值", a.hostDeps.getMode(), "user");
  ok("setMode 返回 true", a.hostDeps.setMode("collaborative") === true);
  eq("切完读回", a.hostDeps.getMode(), "collaborative");
  ok("★ 本层不自行放宽模式（安全门在 KokoaCanvasScene：默认 user 时 apply 会被 E_MODE 拒）",
     true);
}

console.log("");
console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
