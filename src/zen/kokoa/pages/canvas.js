/* Kokoa 画布 —— 第 1 步（占位 + 自述状态）。
 *
 * 【为什么先只有这些】画布的价值在"人 + AI 协作"，而那需要先有一个**宿主页面**。
 *   本步只证明三件事：① about:canvas 协议注册生效 ② 资产打进包了 ③ 页面能自述状态
 *   （外壳/测试可以读它，不必截图猜）。
 *
 * 【下一步接什么】Excalidraw + 场景级 API：
 *   window.__kokoaCanvas = { getScene(), apply(ops), mode }
 *   —— AI 走这条受控通道（**不是 BRP**：实测扩展不支持 element.*）。
 */
(function () {
  "use strict";
  const status = document.getElementById("status");
  const modeEl = document.getElementById("mode");

  // 自述状态：给外壳/测试一个稳定的读取点（避免只能靠截图判断）。
  window.__kokoaCanvasState = function () {
    return { version: 1, step: 1, mode: modeEl.dataset.agentMode, hasScene: false };
  };

  // 三方模式词汇与产品面板一致：user（默认，安全）| collaborative | ai
  window.__kokoaCanvasSetMode = function (m) {
    const ok = ["user", "collaborative", "ai"];
    if (!ok.includes(m)) {
      return false;
    }
    modeEl.dataset.agentMode = m;
    modeEl.textContent = m === "user" ? "人单独编辑" : m === "collaborative" ? "人机协作" : "AI 绘制中";
    if (status) {
      status.textContent = "模式：" + m;
    }
    return true;
  };

  if (status) {
    status.textContent = "就绪（第 1 步：画布占位；Excalidraw 待接入）";
  }
})();
