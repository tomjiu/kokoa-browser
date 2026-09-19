/* Kokoa 画布 —— 挂载胶水：把 Excalidraw 挂到容器，并接上可测的纯逻辑桥。
 *
 * 【为什么这么薄】canvas.tsx 顶部 import Excalidraw（8.2MB），一引用就被打进任何
 * bundle —— 所以**能测的逻辑全在 scene-bridge.ts**（无 Excalidraw 依赖，可小 bundle 单测）。
 * 本文件只剩"渲染 + 挂载"。
 *
 * 【体积】产物约 8.4MB，**不进 omni.ja**，由 about:canvas 懒加载。见 README。
 */

import { Excalidraw } from "@excalidraw/excalidraw";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  createCanvasApp,
  type CanvasApp,
  type CanvasMode,
} from "./scene-bridge";

export { toExcalidraw, fromExcalidraw, createCanvasApp } from "./scene-bridge";
export type { SceneElement, CanvasMode } from "./scene-bridge";

/** 挂载 Excalidraw 到容器（about:canvas 调用）。 */
export function mount(container: HTMLElement, opts?: { mode?: CanvasMode }) {
  const root = createRoot(container);
  const app: CanvasApp = createCanvasApp({
    getMode: () => (opts && opts.mode) || "user",
    onElementsChanged: () => {
      /* 由调用方驱动 updateScene（第 2 步的后续接线） */
    },
  });
  root.render(createElement(Excalidraw, { initialData: { elements: [], appState: {} } }));
  return { root, app };
}

// 懒加载脚本的入口
declare global {
  interface Window {
    __kokoaCanvasMount?: typeof mount;
  }
}
if (typeof window !== "undefined") {
  window.__kokoaCanvasMount = mount;
}
