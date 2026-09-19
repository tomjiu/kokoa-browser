/* Kokoa 画布 —— 第 1+3 步：宿主页面 + 场景级 API 接线。
 *
 * 【本文件负责什么】把 KokoaCanvasScene（纯逻辑、已单测）接到真实页面上：
 *   · 元素存哪（本页用自己的数组；第 2 步换 Excalidraw 时只替换"存"与"画"）
 *   · 模式从哪来（默认 user —— 安全默认：人没允许前 AI 改不动）
 *   · 撤销单元怎么记（一次 apply = 一个单元，人可一键回退）
 *
 * 【对外契约（AI / 外壳 / 测试都走这个）】
 *   window.__kokoaCanvas.getScene() / apply(ops) / setMode(mode)
 *   window.__kokoaCanvasState()   —— 等价于 getScene() 的摘要（老接口，保留）
 *
 * 【为什么不走 BRP】真机实测：扩展只支持 tab.* + page.screenshot，
 *   element.click / script.execute / getInteractionTree 都被 BRP_CAPABILITY_NOT_SUPPORTED 拒。
 *   所以 AI 改画布**必须**走这条页面内通道。见 docs/canvas-plan.md。
 */
(function () {
  "use strict";

  const status = document.getElementById("status");
  const modeEl = document.getElementById("mode");
  const stage = document.getElementById("stage");

  const state = {
    elements: [],   // 第 2 步：这里换成 Excalidraw 的 scene
    mode: "user",   // 安全默认
    undo: [],       // 撤销单元（宿主侧）
  };

  function say(msg) {
    if (status) {
      status.textContent = msg;
    }
  }

  function render() {
    // 第 1 步：只把元素数量与来源画成极简方块，证明"场景真的存在"。
    // 第 2 步：换成 Excalidraw 的 <Excalidraw> 组件 + updateScene。
    if (!stage) {
      return;
    }
    const host = document.getElementById("placeholder");
    if (host) {
      host.style.display = state.elements.length ? "none" : "grid";
    }
    let layer = document.getElementById("layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "layer";
      stage.appendChild(layer);
    }
    layer.textContent = "";
    for (const el of state.elements) {
      const d = document.createElement("div");
      d.className = "shape";
      d.dataset.by = el.by || "user";
      d.style.left = (Number(el.x) || 0) + "px";
      d.style.top = (Number(el.y) || 0) + "px";
      d.style.width = (Number(el.w) || 60) + "px";
      d.style.height = (Number(el.h) || 40) + "px";
      d.textContent = el.text || "";
      layer.appendChild(d);
    }
  }

  function applyModeUi() {
    if (!modeEl) {
      return;
    }
    modeEl.dataset.agentMode = state.mode;
    modeEl.textContent =
      state.mode === "user" ? "人单独编辑" :
      state.mode === "collaborative" ? "人机协作" : "AI 绘制中";
  }

  /** 造场景（依赖 KokoaCanvasScene.mjs —— resource:// 模块，页面是 chrome 权限可 import）。 */
  function makeScene() {
    const { createCanvasScene } = ChromeUtils.importESModule(
      "resource:///modules/zen/KokoaCanvasScene.mjs",
      { global: "current" }
    );
    return createCanvasScene({
      getElements: () => state.elements,
      setElements: (list) => { state.elements = list; render(); },
      getMode: () => state.mode,
      setMode: (m) => {
        state.mode = m;
        applyModeUi();
        say("模式：" + m);
        return true;
      },
      onUndoUnit: (u) => { state.undo.push(u); },
    });
  }

  let scene = null;
  try {
    scene = makeScene();
  } catch (e) {
    say("场景模块加载失败：" + e);
  }

  // ── 对外接口 ─────────────────────────────────────────────────────────────
  window.__kokoaCanvas = scene;
  window.__kokoaCanvasState = function () {
    return {
      version: 1,
      step: 3,
      mode: state.mode,
      elements: state.elements.length,
      undoUnits: state.undo.length,
      hasScene: Boolean(scene),
    };
  };

  // 便于没有 AI 的情况下人工验证（也可以直接被测试脚本调用）
  window.__kokoaCanvasSetMode = function (m) {
    return scene ? scene.setMode(m) : { ok: false, error: "E_NO_HOST" };
  };

  applyModeUi();
  render();
  say(scene ? "就绪（场景 API 已接；Excalidraw 待第 2 步）" : "就绪（无场景模块）");
})();
