// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa 画布的**场景级 API 契约**（人 + AI 协作白板的"AI 那一半"）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【为什么是场景级，而不是让 AI 点画布】
 *
 * 真机实测（2026-09-19，BRP Bridge v1.0.1 + AMO 扩展）：
 *   tab.list / page.screenshot        → 可用
 *   page.getInteractionTree           → BRP_CAPABILITY_NOT_SUPPORTED
 *   element.click / element.type      → 同上
 *   script.execute                    → 同上
 * 即「AI 通过 BRP 点画布」这条路**现在走不通**。而画布的价值恰恰在「AI 能改图」——
 * 所以画布必须自己暴露一条**受控**通道。
 *
 * 场景级还更准：AI 拿到的是元素结构（类型/坐标/文本），不是"某个像素位置有东西"；
 * 它可以**按意图**改（把这条线右移 40），而不是**按坐标**戳。
 *
 * 【契约（画布页与 AI 之间唯一的接口）】
 *   getScene()     → { version, mode, at, elements[], selectedIds[] }
 *   apply(ops)     → { ok, applied, undoUnit } | { ok:false, error, detail }
 *   setMode(mode)  → { ok, mode } | { ok:false, error, detail }
 *
 * 每条 op 都是**声明式**的（add / update / remove / clear）；未知 op 一律**整批拒绝**
 * （不部分应用 —— 半途状态最坑人）。
 *
 * 【安全默认】
 *   · 默认模式 user：人没允许之前，AI 的 apply 一律被拒（E_MODE）；
 *   · 每条 op 都要过校验，坏 op → 整批拒（E_BAD_OP + 下标）；
 *   · 一次 apply = 一个 undo 单元：人能一键回到自己认可的状态。
 *
 * 【可测性】不碰 DOM：纯函数 + 注入宿主（host）——Node 里可跑完整行为测试。
 * ═══════════════════════════════════════════════════════════════════════
 */

/** 三种模式（与产品面板的 data-agent-mode 词汇一致）。 */
export const CANVAS_MODES = ["user", "collaborative", "ai"];

/** 允许的 op 类型（白名单：未知一律拒）。 */
export const CANVAS_OPS = ["add", "update", "remove", "clear"];

/** 错误码（测试与 UI 都依赖这些字符串，别改）。 */
export const E_MODE = "E_MODE"; // 当前模式不允许 AI 改
export const E_BAD_OP = "E_BAD_OP"; // op 形状/类型不合法
export const E_BAD_ID = "E_BAD_ID"; // 引用了不存在的元素
export const E_NO_HOST = "E_NO_HOST"; // 宿主（画布）不可用

/** 元素 id 规则：el-<n>（画布分配；AI 不自己编 id，避免撞车）。 */
export function nextElementId(elements) {
  let max = 0;
  for (const e of elements || []) {
    // 元素 id 形如 el-<数字>；写正则时小心：源码里要**单个**反斜杠（\d）。
    const m = /^el-(\d+)$/.exec(String((e && e.id) || ""));
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return "el-" + (max + 1);
}

/** 数值校验：必须是有限数（NaN/Infinity/字符串都拒）。 */
function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 校验单条 op。
 * @returns {string|null} null = 合法；否则是"为什么不合法"（人话）
 */
export function checkOp(op) {
  if (!op || typeof op !== "object") {
    return "op 必须是对象";
  }
  if (!CANVAS_OPS.includes(op.op)) {
    return "未知 op 类型: " + String(op.op);
  }
  if (op.op === "clear") {
    return null;
  }
  if (op.op === "remove") {
    return typeof op.id === "string" && op.id ? null : "remove 需要 id";
  }
  if (op.op === "update" && (typeof op.id !== "string" || !op.id)) {
    return "update 需要 id";
  }
  if (op.op === "add" && op.element === undefined) {
    return "add 需要 element";
  }
  const el = op.op === "add" ? op.element : op.patch;
  if (!el || typeof el !== "object") {
    return op.op + " 的 " + (op.op === "add" ? "element" : "patch") + " 必须是对象";
  }
  for (const k of ["x", "y", "w", "h"]) {
    if (el[k] !== undefined && !isNum(el[k])) {
      return k + " 必须是有限数";
    }
  }
  if (el.type !== undefined && typeof el.type !== "string") {
    return "type 必须是字符串";
  }
  return null;
}

/**
 * 造一个画布场景宿主（画布页用它；测试注入假宿主）。
 *
 * @param {object} deps
 *   getElements() → 元素数组    setElements(list) → 整体替换（宿主重绘）
 *   getMode()     → 当前模式    setMode(mode)     → 返回 boolean
 *   onUndoUnit(u) → 记一个撤销单元    now() → 时间戳（测试可注入）
 */
export function createCanvasScene(deps) {
  const now = deps.now || (() => Date.now());

  return {
    /** 读场景（AI 的"眼"）。 */
    getScene() {
      const els = deps.getElements() || [];
      return {
        version: 1,
        mode: deps.getMode(),
        at: now(),
        elements: els.map((e) => ({ ...e })),
        selectedIds: els.filter((e) => e && e.selected).map((e) => e.id),
      };
    },

    /** 设模式。非法模式拒绝（人能在任意时刻夺回：user）。 */
    setMode(mode) {
      if (!CANVAS_MODES.includes(mode)) {
        return { ok: false, error: E_BAD_OP, detail: "未知模式: " + String(mode) };
      }
      const ok = deps.setMode(mode);
      return ok === false
        ? { ok: false, error: E_NO_HOST, detail: "宿主拒绝了模式切换" }
        : { ok: true, mode };
    },

    /**
     * 应用一批 op（AI 的"手"）。
     *
     * 【原子性】先全批校验，再落地 —— 任何一条不合法就**整批不动**。
     *   部分应用会产生"半途状态"，而人对画布的信任来自"要么全成要么全不成"。
     */
    apply(ops) {
      const mode = deps.getMode();
      if (mode !== "collaborative" && mode !== "ai") {
        return {
          ok: false,
          error: E_MODE,
          detail: "当前模式是 " + mode + "（AI 不能改；请先切到 collaborative 或 ai）",
        };
      }
      if (!Array.isArray(ops) || ops.length === 0) {
        return { ok: false, error: E_BAD_OP, detail: "ops 必须是非空数组" };
      }
      for (let i = 0; i < ops.length; i++) {
        const bad = checkOp(ops[i]);
        if (bad) {
          return { ok: false, error: E_BAD_OP, detail: "第 " + i + " 条: " + bad };
        }
      }

      let els = (deps.getElements() || []).map((e) => ({ ...e }));
      const known = new Set(els.map((e) => e && e.id));
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if ((op.op === "update" || op.op === "remove") && !known.has(op.id)) {
          return {
            ok: false,
            error: E_BAD_ID,
            detail: "第 " + i + " 条引用了不存在的元素: " + op.id,
          };
        }
      }

      let applied = 0;
      for (const op of ops) {
        if (op.op === "clear") {
          applied += els.length;
          els = [];
        } else if (op.op === "add") {
          const id = op.id || nextElementId(els);
          els.push({ ...op.element, id, by: op.by || "ai" });
          known.add(id);
          applied += 1;
        } else if (op.op === "update") {
          const i = els.findIndex((e) => e.id === op.id);
          els[i] = { ...els[i], ...op.patch };
          applied += 1;
        } else if (op.op === "remove") {
          els = els.filter((e) => e.id !== op.id);
          applied += 1;
        }
      }
      deps.setElements(els);
      const undoUnit = { at: now(), ops: ops.length, applied, by: "ai" };
      deps.onUndoUnit(undoUnit);
      return { ok: true, applied, undoUnit };
    },
  };
}
