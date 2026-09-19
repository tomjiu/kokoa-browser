/* Kokoa 应用首页（随产品发布的内建页面，运行在 chrome 特权上下文）。 */
/* 数据来自两条管线：
 *   ① Kokoa 状态桥 127.0.0.1:8318 —— 与外壳控制条同一条（桥/模式/CPA）；
 *   ② 工作区列表 —— 由外壳（boot.js）持有并持久化，外壳每 500ms 推给本页。
 *
 * ★ 与外壳的通道形态是三条实测事实定下来的（都是踩出来的，别再改回去）：
 *   1. 本页是 about:kokoa 文档，**相对 URL 不解析**：原来写 <script src="home.js">，
 *      console 原文「'src' attribute of <script> element is not a valid URI: "home.js"」
 *      —— 脚本从来没执行过。资源一律用绝对 chrome:// URL。
 *   2. about: 文档的默认 CSP 是 script-src chrome: resource: moz-src:，**内联脚本被拦**
 *      （「blocked an inline script (script-src-elem)」），所以错误处理只能写在外部 js 里。
 *   3. 本页**读写文件都被拒**：页面的 Services/IOUtils/PathUtils 都在、
 *      nodePrincipal=System Principal、进程类型=父进程，但 IOUtils 写报
 *      OperationError: Could not write to E:/...。所以本页不碰 workspaces.json，
 *      也不写请求文件 —— 列表由外壳推、点击命令排队等外壳取。
 *   4. 反向的 Services.obs 通道也不行：跨 realm 传 JS 对象，外壳收到的 subject.cmd 恒为
 *      undefined（外壳证据里是 shell_call cmd= key=""）。所以只传 **JSON 字符串**。
 *
 * 页面暴露给外壳的三个函数（外壳 serviceHomeTabs 每 500ms 调一次）：
 *   window.__kokoaSetList(json)    外壳 -> 页面：工作区列表
 *   window.__kokoaTakeCommand()    页面 -> 外壳：取出页面排队的命令（点「切换/恢复」入队）
 *   window.__kokoaState()          页面 -> 外壳：本页自述状态（写进外壳的证据文件）
 */
/**
 * 状态桥基址。
 * ★ 2026-09-19（搬进本仓时修）：原先写死 8318，而 sidecar 端口可由
 *   KOKOA_BRIDGE_PORT 覆盖 —— 改了端口后首页整页「桥不可达」，且没有线索指向原因。
 *   规则与设置页的 cpaBridgeBase() 一致：读 env，非法值回落 8318。
 *   本页是 about: 文档（IS_SECURE_CHROME_UI + system principal）可以 importESModule，
 *   但仍整体 try/catch —— 拿不到就按默认端口走。
 */
function kokoaBridgeBase() {
  try {
    const { Services } = ChromeUtils.importESModule(
      "resource://gre/modules/Services.sys.mjs"
    );
    const n = parseInt(String(Services.env.get("KOKOA_BRIDGE_PORT") || ""), 10);
    if (Number.isInteger(n) && n > 0 && n <= 65535) {
      return "http://127.0.0.1:" + n;
    }
  } catch (e) {
    /* 拿不到 env（或本页未被授予 chrome 权限）→ 默认端口 */
  }
  return "http://127.0.0.1:8318";
}

const BRIDGE = kokoaBridgeBase();

const commands = [];      // 待外壳取走的命令（点按钮时入队）
let lastList = [];
let lastVia = "-";
let lastAt = 0;
let pushedOnce = false;
let fsPath = null;        // 文件树当前目录（null = 桥默认根）
let fsParent = null;

function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** 首页跑在另一个上下文：它的 console.* 不进外壳的 stdout（chrome 文档都这样）。
 *  所以把自身状态写进 document.title —— 外壳的 tabs-status 钩子读标签标题就能看到。 */
function mark(text) {
  try {
    document.title = "Kokoa·" + text;
  } catch (e) { /* ignore */ }
}

window.__kokoaHomeErr = null;
window.addEventListener("error", function (e) {
  window.__kokoaHomeErr = String((e && (e.message || e.type)) || "error");
  mark("ERR:" + window.__kokoaHomeErr);
});

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
         " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function stateText(ws) {
  if (ws.state === "open") return "打开";
  if (ws.closedReason === "shell-restart") return "上次退出时还开着";
  return "已关闭";
}

function render(list) {
  const ul = document.getElementById("ws-list");
  const empty = document.getElementById("ws-empty");
  ul.textContent = "";
  if (!list.length) {
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  for (const ws of list) {
    const li = document.createElement("li");

    const grow = document.createElement("div");
    grow.className = "grow";

    const name = document.createElement("div");
    name.className = "name";
    const label = document.createElement("span");
    label.textContent = ws.label || ws.id;
    const tag = document.createElement("span");
    tag.className = "tag" + (ws.state === "open" ? " open" : "");
    tag.textContent = stateText(ws);
    name.appendChild(label);
    name.appendChild(tag);

    const meta = document.createElement("div");
    meta.className = "meta";
    const sid = document.createElement("span");
    sid.className = "sid";
    sid.textContent = ws.sessionId ? ws.sessionId : "未绑定会话 id";
    meta.appendChild(sid);
    if (ws.sessionTitle) {
      meta.appendChild(document.createTextNode(" · 会话「" + ws.sessionTitle + "」"));
    }
    meta.appendChild(document.createTextNode(" · 建于 " + fmtTime(ws.createdAt)));

    grow.appendChild(name);
    grow.appendChild(meta);

    const btn = document.createElement("button");
    btn.textContent = ws.state === "open" ? "切换" : "恢复";
    btn.addEventListener("click", (e) => { e.stopPropagation(); enqueue("switch", ws); });
    li.appendChild(grow);
    li.appendChild(btn);
    if (ws.sessionId) {
      const openBtn = document.createElement("button");
      openBtn.textContent = "开会话";
      openBtn.title = "以独立标签打开绑定的 dsh 会话";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        enqueue("open-session", { sessionId: ws.sessionId, id: ws.id, label: ws.label });
        setMsg("已请求打开会话 " + ws.sessionId);
      });
      li.appendChild(openBtn);
    }
    // 整行可点击（切换工作区）
    li.style.cursor = "pointer";
    li.addEventListener("click", () => enqueue("switch", ws));
    ul.appendChild(li);
  }
}

function setMsg(text) {
  set("ws-msg", text);
}

/** 点「切换/恢复」或文件树动作：命令入队，等外壳（每 500ms 轮询一次）取走执行。
 *  为什么是「排队等外壳取」而不是页面直接调外壳：见文件头的实测 3、4。
 *  data：工作区对象 {id,label} 或 {path,cwd,file,sessionId}。 */
function enqueue(cmd, data) {
  const d = data || {};
  const payload = { cmd: cmd, at: Date.now() };
  if (d.id) {
    payload.workspaceId = d.id;
    payload.label = d.label;
  }
  if (d.path) payload.path = d.path;
  if (d.file) payload.file = d.file;
  if (d.cwd) payload.cwd = d.cwd;
  if (d.sessionId) payload.sessionId = d.sessionId;
  commands.push(payload);
  pushedOnce = true;
  if (d.id) {
    setMsg("已请求" + (cmd === "switch" ? "切换" : cmd) + "「" + (d.label || d.id) + "」，等待外壳执行…");
  }
  mark("via=" + lastVia + " ws=" + lastList.length + " queued=" + commands.length + " " + cmd);
  return payload;
}

// ---------- 外壳调用的三个入口（参数/返回值一律 JSON 字符串） ----------

window.__kokoaSetList = function (json) {
  try {
    const payload = JSON.parse(String(json || "{}"));
    const list = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    lastList = list;
    lastVia = "shell";
    lastAt = Date.now();
    render(list);
    set("ws-src", "数据源：外壳（" + (payload.file || "workspaces.json") + "）");
    if (!pushedOnce) {
      mark("via=shell ws=" + list.length);
    }
    return true;
  } catch (e) {
    proof_err(e);
    return false;
  }
};

window.__kokoaTakeCommand = function () {
  if (!commands.length) {
    return "";
  }
  const c = commands.shift();
  return JSON.stringify(c);
};

window.__kokoaState = function () {
  return JSON.stringify({
    via: lastVia,
    count: lastList.length,
    pending: commands.length,
    lastAt: lastAt,
    err: window.__kokoaHomeErr || null,
    workspaces: lastList.map(function (w) {
      return { id: w.id, label: w.label, sessionId: w.sessionId, state: w.state };
    }),
  });
};

/** 开发期入口：外壳（boot.js 的 click-home 钩子）驱动一次**与点按钮完全相同**的路径。
 *  为什么需要它：headless 下没有点击手段，而 about:kokoa 不能带 query（带 query 的 about: URI
 *  加载失败），没法用 URL 参数传「切到哪个工作区」。 */
window.__kokoaClick = function (idOrLabel) {
  const key = String(idOrLabel || "");
  const target = lastList.find(function (w) {
    return w.id === key || (w.label || "") === key;
  });
  if (!target) {
    mark("click-miss:" + key);
    return false;
  }
  enqueue("switch", target);
  return true;
};

function proof_err(e) {
  window.__kokoaHomeErr = String(e);
  mark("ERR:" + String(e).slice(0, 60));
}

async function json(path, opts) {
  const r = await fetch(BRIDGE + path, opts);
  if (!r.ok) throw new Error(path + " -> " + r.status);
  return r.json();
}

async function refresh() {
  try {
    const h = await json("/kokoa/health");
    set("k-bridge", "正常（" + (h.version || "?") + "）");
  } catch (e) {
    set("k-bridge", "不可达");
  }
  try {
    const m = await json("/kokoa/browser-mode");
    set("k-mode", m.mode || "—");
  } catch (e) { set("k-mode", "—"); }
  try {
    const c = await json("/kokoa/cpa/status");
    const models = c.models && c.models.length ? c.models.length + " 个模型" : "无模型";
    set("k-cpa", (c.running ? "有应答" : "未应答") + " · " + models + (c.port ? " · :" + c.port : " · 点我开 CPA 设置"));
  } catch (e) { set("k-cpa", "桥不可达 · 点我开 CPA 设置"); }
  // CPA 状态行可点 → CPA 设置分类
  const kCpa = document.getElementById("k-cpa");
  if (kCpa && !kCpa.dataset.bound) {
    kCpa.dataset.bound = "1";
    kCpa.style.cursor = "pointer";
    kCpa.addEventListener("click", function () {
      enqueue("open-cpa-settings", {});
      try { location.href = "about:preferences#kokoaCpa"; } catch (e) { /* ignore */ }
    });
  }
  try {
    const a = await json("/kokoa/agents");
    if (!a.available) {
      set("k-agents", "不可用" + (a.reason ? "（" + a.reason + "）" : ""));
    } else {
      const agents = a.agents || [];
      const running = agents.filter(x => x.status === "running").length;
      const idle = agents.filter(x => x.status === "idle").length;
      let text = agents.length + " 个";
      if (running) text += " · " + running + " 运行中";
      if (idle) text += " · " + idle + " 空闲";
      if (a.stale) text += " · 已过期";
      set("k-agents", text);
      renderClickable("rt-agents", agents, function (r) {
        return (r.id || "?") + " · " + (r.status || "?") +
          (r.model ? " · " + r.model : "") +
          (r.cwd ? " · " + r.cwd : "");
      }, function (r) {
        const sid = r.id || "";
        if (!sid) return;
        enqueue("open-session", { sessionId: sid });
        set("rt-src", "已请求打开会话 " + sid);
      });
    }
  } catch (e) { set("k-agents", "—"); }
  try {
    const j = await json("/kokoa/jobs");
    if (!j.available) {
      set("k-jobs", "不可用" + (j.reason ? "（" + j.reason + "）" : ""));
    } else {
      const jobs = j.jobs || [];
      const run = jobs.filter(x => x.status === "running").length;
      set("k-jobs", jobs.length + " 个" + (run ? " · " + run + " 运行中" : "") + (j.stale ? " · 已过期" : ""));
      renderClickable("rt-jobs", jobs, function (r) {
        return (r.label || r.id || "?") + " · " + (r.status || "?") +
          (r.owner ? " · " + r.owner : "");
      }, function (r) {
        const sid = r.owner || r.sessionId || "";
        if (!sid) {
          set("rt-src", "任务 " + (r.id || "?") + " 无归属会话 id");
          return;
        }
        enqueue("open-session", { sessionId: sid });
        set("rt-src", "已请求打开归属会话 " + sid);
      });
    }
  } catch (e) { set("k-jobs", "—"); }
  try {
    const s = await json("/kokoa/subagents");
    if (!s.available) {
      set("k-subagents", "不可用");
    } else {
      const list = s.subagents || [];
      set("k-subagents", list.length + " 个" + (s.stale ? " · 已过期" : ""));
      renderClickable("rt-subagents", list, function (r) {
        return (r.id || "?") + " · " + (r.status || "?") +
          (r.parent ? " ← " + r.parent : "");
      }, function (r) {
        const sid = r.id || "";
        if (!sid) return;
        enqueue("open-session", { sessionId: sid });
        set("rt-src", "已请求打开子代理会话 " + sid);
      });
    }
  } catch (e) { set("k-subagents", "—"); }
  set("rt-src", "数据源：外壳/桥（" + new Date().toLocaleTimeString() + "）");
  try {
    const qs = fsPath ? "?path=" + encodeURIComponent(fsPath) : "";
    const f = await json("/kokoa/fs/list" + qs);
    if (!f.ok) {
      set("fs-path", "路径：" + (f.path || "—") + "（" + (f.error || "fail") + "）");
      renderFs([], null);
    } else {
      fsPath = f.path;
      fsParent = f.parent || null;
      set("fs-path", "路径：" + f.path);
      renderFs(f.entries || [], f.path);
      set("fs-src", "根白名单 " + (f.allowedRoots || []).length + " · " + (f.entries || []).length + " 条 · 点目录可下钻");
    }
  } catch (e) {
    set("fs-path", "路径：桥不可达");
  }
}

function renderFs(entries, basePath) {
  const ul = document.getElementById("fs-list");
  if (!ul) return;
  ul.textContent = "";
  const up = document.createElement("li");
  const upBtn = document.createElement("button");
  upBtn.textContent = fsParent ? "⬆ 上级：" + fsParent : "（已是允许根）";
  upBtn.disabled = !fsParent;
  upBtn.addEventListener("click", function () {
    if (!fsParent) return;
    fsPath = fsParent;
    refresh();
  });
  up.appendChild(upBtn);
  ul.appendChild(up);
  for (const r of entries || []) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = (r.dir ? "📁 " : "📄 ") + r.name + (r.dir ? "" : " · " + (r.size || 0) + "B");
    btn.addEventListener("click", function () {
      if (r.dir) {
        fsPath = (basePath || fsPath || "").replace(/[\\/]+$/, "") + "\\" + r.name;
        refresh();
        return;
      }
      // 文件：把所在目录设为新会话 cwd（壳侧写 pref）
      const dir = (basePath || fsPath || "").replace(/[\\/]+$/, "");
      enqueue("fs-cwd", { path: dir, file: r.name });
      set("fs-msg", "已请求将会话 cwd 设为 " + dir);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function renderRows(id, items, fmt) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.textContent = "";
  if (!items || !items.length) return;
  for (const it of items) {
    const li = document.createElement("li");
    li.textContent = fmt ? fmt(it) : String(it);
    ul.appendChild(li);
  }
}

/** 可点击行：外壳打开会话标签（A 类：运行时列表 → 会话）。 */
function renderClickable(id, items, fmt, onClick) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.textContent = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = id === "rt-agents"
      ? "（暂无 Agents —— 在 dsh 会话中运行后会出现；可先「新建并行会话」）"
      : id === "rt-jobs"
        ? "（暂无 Jobs —— 后台任务出现后可点行打开归属会话）"
        : "（暂无 Subagents）";
    ul.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = (fmt ? fmt(it) : String(it)) + " →";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (onClick) onClick(it);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

document.getElementById("go-settings").addEventListener("click", () => {
  location.href = "about:preferences#kokoa";
});
document.getElementById("go-cpa").addEventListener("click", () => {
  // CPA 独立设置分类
  enqueue("open-cpa-settings", {});
  try {
    location.href = "about:preferences#kokoaCpa";
  } catch (e) { /* ignore */ }
});
document.getElementById("go-sessions").addEventListener("click", () => {
  location.href = "about:kokoases";
});
document.getElementById("ws-refresh").addEventListener("click", () => {
  setMsg("列表由外壳推送（每 500ms 一次），无需手动刷新");
});
const rtRefresh = document.getElementById("rt-refresh");
if (rtRefresh) {
  rtRefresh.addEventListener("click", () => { refresh(); });
}
const rtNew = document.getElementById("rt-new-session");
if (rtNew) {
  rtNew.addEventListener("click", () => {
    enqueue("new-parallel-session", { cwd: "" });
    set("rt-src", "已请求新建并行会话…");
  });
}
const rtSess = document.getElementById("rt-open-sessions");
if (rtSess) {
  rtSess.addEventListener("click", () => {
    enqueue("open-sessions-history", {});
    location.href = "about:kokoases";
  });
}
const fsRefresh = document.getElementById("fs-refresh");
if (fsRefresh) {
  fsRefresh.addEventListener("click", () => {
    refresh();
  });
}
const fsUse = document.getElementById("fs-use-cwd");
if (fsUse) {
  fsUse.addEventListener("click", () => {
    if (!fsPath) return;
    enqueue("fs-cwd", { path: fsPath });
    const msg = document.getElementById("fs-msg");
    if (msg) msg.textContent = "已请求将 sessionCwd 设为 " + fsPath;
  });
}
const fsNewSess = document.getElementById("fs-new-session");
if (fsNewSess) {
  fsNewSess.addEventListener("click", () => {
    enqueue("new-parallel-session", { cwd: fsPath || "" });
    const msg = document.getElementById("fs-msg");
    if (msg) msg.textContent = "已请求在此目录新建并行会话…";
  });
}

mark("via=wait ws=0");
refresh();
setInterval(refresh, 3000);
setInterval(function () {
  // 外壳长时间没推列表时，把状态显示出来（页面自己读不了文件）
  if (Date.now() - lastAt > 5000) {
    set("ws-src", "数据源：等待外壳推送…（外壳未运行或首页不在浏览器进程内）");
  }
}, 5000);
