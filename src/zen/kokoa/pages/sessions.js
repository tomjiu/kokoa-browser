/* 会话历史页。本页是 chrome/about 文档：相对 URL 不解析、内联脚本被 CSP 拦。
 * 与外壳通道：JSON 字符串 + 外壳轮询 __kokoaSessionsTakeCommand（与 home 同构）。
 * 本页不直连 gBrowser；「打开会话」只入队，由外壳 openAiSessionTab 执行。
 */
const commands = [];
let lastList = [];
let lastAt = 0;
let lastErr = null;

function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function mark(text) {
  try {
    document.title = "Kokoa·会话·" + text;
  } catch (e) { /* ignore */ }
}

window.__kokoaSessionsErr = null;
window.addEventListener("error", function (e) {
  window.__kokoaSessionsErr = String((e && (e.message || e.type)) || "error");
  mark("ERR:" + window.__kokoaSessionsErr);
});

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

function sessionLabel(s) {
  if (s && s.title) return s.title;
  return s && s.id ? s.id : "（未命名会话）";
}

function render(list) {
  const ul = document.getElementById("ses-list");
  const empty = document.getElementById("ses-empty");
  ul.textContent = "";
  if (!list || !list.length) {
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  for (const s of list) {
    const li = document.createElement("li");
    const grow = document.createElement("div");
    grow.className = "grow";

    const name = document.createElement("div");
    name.className = "name";
    const label = document.createElement("span");
    label.textContent = sessionLabel(s);
    const tag = document.createElement("span");
    tag.className = "tag" + (s.running ? " open" : "");
    tag.textContent = s.running ? "运行中" : s.blank ? "空白" : "历史";
    name.appendChild(label);
    name.appendChild(tag);

    const meta = document.createElement("div");
    meta.className = "meta";
    const idEl = document.createElement("span");
    idEl.className = "sid";
    idEl.textContent = s.id || "";
    meta.appendChild(idEl);
    if (s.cwd) {
      meta.appendChild(document.createTextNode(" · " + s.cwd));
    }
    meta.appendChild(document.createTextNode(" · " + fmtTime(s.updatedAt || s.lastPromptAt)));

    grow.appendChild(name);
    grow.appendChild(meta);

    const btn = document.createElement("button");
    btn.textContent = "打开";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      enqueueOpen(s);
    });

    li.appendChild(grow);
    li.appendChild(btn);
    if (s.cwd) {
      const cwdBtn = document.createElement("button");
      cwdBtn.textContent = "用此 cwd";
      cwdBtn.title = "把会话工作目录设为新会话的默认 cwd";
      cwdBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        commands.push({
          cmd: "fs-cwd",
          path: s.cwd,
          sessionId: s.id,
          at: Date.now(),
        });
        set("ses-msg", "已请求将 sessionCwd 设为 " + s.cwd);
        mark("queue-cwd=" + s.id);
      });
      li.appendChild(cwdBtn);
    }
    li.style.cursor = "pointer";
    li.addEventListener("click", function () {
      enqueueOpen(s);
    });
    ul.appendChild(li);
  }
}

function enqueueOpen(s) {
  if (!s || !s.id) return;
  commands.push({
    cmd: "open-session",
    sessionId: s.id,
    title: sessionLabel(s),
    cwd: s.cwd || "",
    at: Date.now(),
  });
  set("ses-msg", "已请求打开「" + sessionLabel(s) + "」，等待外壳执行…");
  mark("queue=" + commands.length + " id=" + s.id);
}

/** 外壳 -> 本页：会话列表 payload（JSON 字符串）。 */
window.__kokoaSessionsSetList = function (json) {
  try {
    const payload = JSON.parse(String(json || "{}"));
    lastAt = Date.now();
    if (!payload || !payload.ok) {
      lastErr = (payload && payload.error) || "list-failed";
      lastList = [];
      render([]);
      set("ses-src", "数据源：外壳（失败：" + lastErr + "）");
      mark("via=shell err=" + lastErr);
      return false;
    }
    lastErr = null;
    lastList = Array.isArray(payload.sessions) ? payload.sessions : [];
    render(lastList);
    set(
      "ses-src",
      "数据源：外壳 → dsh session/list（" + lastList.length + " 条）"
    );
    mark("via=shell n=" + lastList.length);
    return true;
  } catch (e) {
    lastErr = String(e);
    mark("ERR:" + lastErr);
    set("ses-src", "数据源：解析失败 " + lastErr);
    return false;
  }
};

/** 页面 -> 外壳：取出排队命令。 */
window.__kokoaSessionsTakeCommand = function () {
  if (!commands.length) {
    return "";
  }
  return JSON.stringify(commands.shift());
};

window.__kokoaSessionsState = function () {
  return JSON.stringify({
    count: lastList.length,
    pending: commands.length,
    lastAt: lastAt,
    err: window.__kokoaSessionsErr || lastErr || null,
  });
};

document.getElementById("ses-refresh").addEventListener("click", function () {
  set("ses-msg", "列表由外壳推送（约 4s 一次），请稍候…");
  mark("ask-refresh");
});

document.getElementById("ses-new-parallel").addEventListener("click", function () {
  commands.push({ cmd: "new-parallel-session", at: Date.now() });
  set("ses-msg", "已请求新建并行会话，等待外壳执行 dsh session/create…");
  mark("queue-new-parallel");
});

const sesOpenAll = document.getElementById("ses-open-all");
if (sesOpenAll) {
  sesOpenAll.addEventListener("click", function () {
    const ids = (lastList || [])
      .map(function (s) { return s && s.id; })
      .filter(Boolean);
    if (!ids.length) {
      set("ses-msg", "列表为空，无可打开的会话。可先「新建并行会话」。");
      return;
    }
    commands.push({ cmd: "open-all-sessions", sessionIds: ids, at: Date.now() });
    set("ses-msg", "已请求打开 " + ids.length + " 个会话标签（受并行上限约束）…");
    mark("queue-open-all n=" + ids.length);
  });
}

document.getElementById("ses-home").addEventListener("click", function () {
  location.href = "about:kokoa";
});

const sesSettings = document.getElementById("ses-settings");
if (sesSettings) {
  sesSettings.addEventListener("click", function () {
    location.href = "about:preferences#kokoa";
  });
}
const sesCpa = document.getElementById("ses-cpa");
if (sesCpa) {
  sesCpa.addEventListener("click", function () {
    location.href = "about:preferences#kokoaCpa";
  });
}

mark("via=wait n=0");
setInterval(function () {
  if (Date.now() - lastAt > 8000) {
    set("ses-src", "数据源：等待外壳推送…（外壳未运行或本页不在浏览器进程内）");
  }
}, 4000);
