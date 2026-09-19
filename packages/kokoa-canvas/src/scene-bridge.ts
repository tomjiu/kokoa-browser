/* Kokoa 画布 —— 渲染层与场景层之间的**纯逻辑桥**（不 import Excalidraw）。
 *
 * 【为什么单独一个文件】canvas.tsx 顶部 import 了 Excalidraw（8.2MB），
 * 任何引用它的模块都会被打包进去 → 纯逻辑就没法用小 bundle 单测了。
 * 拆出来之后：这份文件是**可测的核心**，canvas.tsx 只做"挂载 Excalidraw"的薄胶水。
 *
 * 【三条不变量（与 KokoaCanvasScene 契约一致）】
 *   1. 默认 user：AI 的 apply 被 E_MODE 拒（安全默认，由 KokoaCanvasScene 把关，
 *      本层只负责如实把 mode 传下去）。
 *   2. 一次 AI 的 apply = 一个撤销单元 → pushBatch() 快照 + undoLastAiBatch() 整批还原。
 *   3. AI 元素带 by:"ai" → 用不同描边色渲染（人一眼认得出）。
 */

/** 我们的场景元素（与 KokoaCanvasScene.mjs 契约字段一致）。 */
export interface SceneElement {
  id: string;
  type: "rect" | "ellipse" | "text";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  by?: "ai" | "user";
}

/** 画布模式（与产品 data-agent-mode 词汇一致）。 */
export type CanvasMode = "user" | "collaborative" | "ai";

/** AI 元素的描边色（人画的用另一个色，便于区分与撤销）。 */
export const AI_STROKE = "#2b6cb0";
export const USER_STROKE = "#8a6d1b";

/** Excalidraw 的最小元素形状（只声明我们读写到的字段，避免拖它整包类型）。 */
export interface XElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  [k: string]: unknown;
}

/** 我们的场景元素 → Excalidraw 元素。字段映射集中在这里，别散落。 */
export function toExcalidraw(el: SceneElement): XElement {
  const w = Number(el.w) || 120;
  const h = Number(el.h) || 60;
  const isAi = el.by === "ai";
  const base: XElement = {
    id: String(el.id),
    type: "rectangle",
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: w,
    height: h,
    angle: 0,
    strokeColor: isAi ? AI_STROKE : USER_STROKE,
    backgroundColor: isAi ? "rgba(43,108,176,.08)" : "rgba(138,109,27,.08)",
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
  if (el.type === "text") {
    return {
      ...base,
      type: "text",
      text: String(el.text || ""),
      fontSize: 16,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      lineHeight: 1.25,
      backgroundColor: "transparent",
    };
  }
  if (el.type === "ellipse") {
    return { ...base, type: "ellipse" };
  }
  return base;
}

/** Excalidraw 元素 → 我们的场景元素（只保留契约字段，渲染细节不往上传）。 */
export function fromExcalidraw(e: XElement): SceneElement {
  const type: SceneElement["type"] =
    e.type === "ellipse" ? "ellipse" : e.type === "text" ? "text" : "rect";
  const out: SceneElement = { id: e.id, type, x: e.x, y: e.y, w: e.width, h: e.height };
  if (type === "text") {
    out.text = e.text;
  }
  return out;
}

export interface CanvasAppDeps {
  getMode: () => CanvasMode;
  onElementsChanged: (list: SceneElement[]) => void;
}

export interface CanvasApp {
  state: { elements: SceneElement[]; mode: CanvasMode; aiBatches: SceneElement[][] };
  hostDeps: {
    getElements: () => SceneElement[];
    setElements: (list: SceneElement[]) => void;
    getMode: () => CanvasMode;
    setMode: (m: CanvasMode) => boolean;
    onUndoUnit: () => void;
  };
  /** AI 批次生效**前**调用：记一个撤销单元快照。 */
  pushBatch: () => void;
  /** 撤销最后一个 AI 批次（整批还原，而不是逐个元素撤销）。 */
  undoLastAiBatch: () => boolean;
}

/** 造画布 app 状态机（纯逻辑，不碰 DOM —— 可单测）。 */
export function createCanvasApp(deps: CanvasAppDeps): CanvasApp {
  const state: CanvasApp["state"] = {
    elements: [],
    mode: deps.getMode() || "user",
    aiBatches: [],
  };

  function pushBatch(): void {
    state.aiBatches.push(state.elements.map((e) => ({ ...e })));
  }

  function undoLastAiBatch(): boolean {
    const prev = state.aiBatches.pop();
    if (!prev) {
      return false;
    }
    state.elements = prev;
    deps.onElementsChanged(state.elements);
    return true;
  }

  const hostDeps: CanvasApp["hostDeps"] = {
    getElements: () => state.elements,
    setElements: (list: SceneElement[]) => {
      state.elements = list;
      deps.onElementsChanged(state.elements);
    },
    getMode: () => state.mode,
    setMode: (m: CanvasMode) => {
      state.mode = m;
      return true;
    },
    onUndoUnit: () => {
      /* 快照由 pushBatch 在 apply 之前记好 */
    },
  };

  return { state, hostDeps, pushBatch, undoLastAiBatch };
}
