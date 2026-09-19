/* Kokoa 设置页 —— 组注册（外壳层）。
 *
 * 【★ 本仓归属（2026-09-19 迁移）】本文件原先是**主线 overlay 的资产**
 * （kokoa/apps/gecko-shell/omni-overlay/.../preferences/config/kokoa.mjs），
 * 靠主线 build.py 注入 preferences.js 才存在；产品构建时它还会**删掉本仓旧的
 * XUL 骨架 pane**（template-paneKokoa + kokoa-settings.js），因为「overlay 是
 * paneKokoa 的唯一所有者」。现已搬进本仓：注册改由 preferences-js.patch 承担、
 * 导航项由 preferences-xhtml.patch 承担、文案在 locales/<locale>/browser/browser/preferences/kokoa.ftl。
 *
 * 【与主线的差异 —— 本仓没有的东西，改代码时别照抄主线】
 *   · 没有 boot.js / window.kokoaShell → kokoaShellApi() 回退到本仓
 *     resource:///modules/zen/KokoaShellApi.mjs（四个动作同名同语义）。
 *   · 没有 about:kokoa / about:kokoases / sessions.html → 「打开首页」「会话历史」
 *     两行**不在本仓的组里**（其 Setting 注册保留，等 Phase 2 随首页一起搬）。
 *   · 没有 kokoa.startup.* 启动门面（那是主线 boot.js 的行为）→ 启动两行同样移出组。
 *   · 数据面（CPA 桥 127.0.0.1:8318、dsh settings.yaml）由主线的 sidecar 提供，
 *     启动器负责把它拉起来（scripts/start-kokoa.ps1）；本仓不实现 sidecar。
 *
 * 由 preferences.js 的构建期注入段登记为 pane 的 \`module\`。
 *
 * 路径映射：chrome://browser/content/preferences/config/kokoa.mjs
 *          = 包内 chrome/browser/content/browser/preferences/config/kokoa.mjs
 *
 * ⚠️ 本地化约定（踩过的坑，别改回去）：Fluent 消息的形态由**消费它的元素**决定 ——
 *   设置条目 → moz-checkbox 的 label 属性      => \`id =\` 换行 + \`.label = …\`
 *   组       → moz-fieldset 的 label 属性      => \`id =\` 换行 + \`.label = …\`
 *   pane 标题 → moz-page-header 的 heading 属性 => \`id =\` 换行 + \`.heading = …\`
 *   导航项    → moz-page-nav-button 读消息**值**  => \`id = 文字\`（唯一用裸值的一处）
 * 写成裸值而元素要的是属性时，Fluent 会把消息的 value 直接写进元素 textContent，
 * 从而**抹掉该元素的全部子节点**（组里的 setting-control 就是这样消失的，且不报任何错）。
 *
 * 本文件包含两块：
 *   1. \`kokoaShellGroup\`（外壳开关）—— 2026-09-13 已实测通过，形态勿动；
 *   2. Kokoa CPA 模型路由（状态摘要 / 上游 base-url 与 api-key 列表 / 4 个逻辑别名 /
 *      保存 + 重启）—— **本页是 CPA / dsh 模型路由的唯一管理入口**（2026-09-18 收口）。
 *      dsh「设置 → 模型」里的 Kokoa CPA 卡片只做只读状态 + 跳转（packages/dsh-plugin-cpa-settings）。
 *      字段语义与该插件历史实现对齐（已收口为只读，能力迁到本页）。
 *
 * CPA 数据层走已有的 sidecar 状态桥 http://127.0.0.1:8318：
 *   GET  /kokoa/cpa/status    → 是否在跑 / 实际端口（含顺延）/ 上游是否配置 / 可用模型
 *   GET  /kokoa/cpa/config    → 面板视图（api-key 已脱敏）
 *   PUT  /kokoa/cpa/config    → 保存（整份重生成 config.yaml，未修改行以 {keepAt:n} 提交）
 *   POST /kokoa/cpa/restart   → 重启 cpa-embed（保存后生效）
 * 路由与守门见 apps/sidecar/src/bridge.ts、apps/sidecar/src/cpa-config.ts。
 *
 * 为什么设置页必须自带健康状态：上游不可用时 dsh 只报 \`TRANSPORT: Connection error.\`，
 * **不指明是哪个路由**，用户无法自行诊断（docs/cpa.md「让 CPA 接管 dsh 的全部模型调用」）。
 */
/**
 * 与 preferences.js / main.js **同一** Preferences / SettingGroupManager 实例。
 * 历史坑：本文件若 `import { SettingGroupManager } from "...mjs"`，importESModule
 * {global:current} 与 classic script 的全局可能不是同一模块实例 —— 组注册在 A，
 * initSettingGroup 从 B.get() 读 → 永远 has=false → **设置页空白**。
 */
const Preferences =
  (typeof window !== "undefined" && window.Preferences) ||
  ChromeUtils.importESModule(
    "chrome://global/content/preferences/Preferences.mjs",
    { global: "current" }
  ).Preferences;

const SettingGroupManager =
  (typeof window !== "undefined" && window.SettingGroupManager) ||
  ChromeUtils.importESModule(
    "chrome://browser/content/preferences/config/SettingGroupManager.mjs",
    { global: "current" }
  ).SettingGroupManager;

// 桥调用走 chrome 原生 channel（理由见 cpaApi 注释）：NetUtil 是系统模块，与本模块
// 所在的 window global 无关。
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs",
  { global: "current" }
);

/* ------------------------------------------------------------------ *
 * 诊断钩子（默认完全惰性：kokoa.diag.enabled 不为 true 时一个字节都不写）
 *
 * 为什么需要它：chrome 模块里的 console.* 不进 stdout/stderr，Lit/Fluent 又会把
 * 渲染异常吞成未处理的 promise rejection —— 面板「静默空白」时没有任何可用信号。
 * 这里用 Services.prefs 作通道：**同步**、失败可见（写不进就抛，不吞），
 * 落盘在 <profile>/prefs.js。构建时 KOKOA_SETTINGS_PANE_DIAG=1 会打开它。
 * ------------------------------------------------------------------ */
const kokoaDiag = {
  get enabled() {
    try {
      return Services.prefs.getBoolPref("kokoa.diag.enabled", false);
    } catch (e) {
      return false;
    }
  },
  mark(key, val) {
    if (!this.enabled) {
      return;
    }
    try {
      Services.prefs.setStringPref("kokoa.diag." + key, String(val));
      Services.prefs.savePrefFile(null);
    } catch (e) {
      // 诊断写不进去必须**看得见**，不能像 IOUtils + .catch(()=>{}) 那样静默。
      dump("KOKOA-DIAG-WRITE-FAIL " + key + " :: " + e + "\n");
    }
  },
};

/** 把诊断挂到 window 上：捕获被吞掉的异常 + 记录组子树的 DOM 变化。 */
export function installKokoaDiag() {
  const mark = (k, v) => kokoaDiag.mark(k, v);
  const GROUP = "kokoaShellGroup";

  window.addEventListener("unhandledrejection", ev => {
    let r = ev.reason;
    mark(
      "90.unhandledrejection",
      (r && r.name) + ": " + (r && r.message) + " | " + (r && r.stack)
    );
  });
  window.addEventListener("error", ev => {
    mark("91.window-error", ev.message + " @ " + ev.filename + ":" + ev.lineno);
  });

  const describe = g => {
    let fieldset = g.querySelector("moz-fieldset");
    return JSON.stringify({
      hasConfig: !!g.config,
      getSetting: typeof g.getSetting,
      setting: typeof g.getSetting === "function" ? !!g.getSetting("kokoaMenuPrint") : "n/a",
      groupChildren: g.childNodes.length,
      fieldsetChildren: fieldset ? fieldset.childElementCount : -1,
      fieldsetText: fieldset ? (fieldset.textContent || "").trim().slice(0, 40) : "n/a",
      controls: document.querySelectorAll("setting-control").length,
      checkboxes: document.querySelectorAll("moz-checkbox").length,
    });
  };
  const snapshot = tag => {
    let g = document.querySelector("setting-group[groupid=" + GROUP + "]");
    mark(tag, g ? describe(g) : "group-element=MISSING");
  };

  // 包住 Firefox 自己的 initSettingGroup，记录「组初始化那一刻」的三个取值。
  let orig = window.initSettingGroup;
  if (typeof orig === "function" && !orig.__kokoaWrapped) {
    let wrapped = function (id) {
      if (id === GROUP) {
        mark("40.initSettingGroup.in", "has=" + SettingGroupManager.has(id));
      }
      let r = orig.apply(this, arguments);
      if (id === GROUP) {
        snapshot("41.initSettingGroup.out");
      }
      return r;
    };
    wrapped.__kokoaWrapped = true;
    window.initSettingGroup = wrapped;
  }

  // 记录组子树的 childList 变化 —— 表头文字「吃掉」条目时会表现为
  // removed=[setting-control,…] / added=[#text]，这是决定性证据。
  let budget = 25;
  let obs = new MutationObserver(records => {
    for (let r of records) {
      if (budget <= 0) {
        return;
      }
      let el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!el || !el.closest("setting-group[groupid=" + GROUP + "]")) {
        continue;
      }
      budget--;
      let names = list => [...list].map(n => n.nodeName.toLowerCase()).join(",");
      mark(
        "50.mutation." + String(25 - budget).padStart(2, "0"),
        r.target.nodeName.toLowerCase() +
          "." + (r.type === "characterData" ? "charData" : "childList") +
          " +[" + names(r.addedNodes) + "] -[" + names(r.removedNodes) + "]"
      );
      if (r.removedNodes.length) {
        snapshot("51.after-removal");
      }
    }
    snapshot("60.snapshot");
  });
  obs.observe(document.getElementById("mainPrefPane") || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  mark("01.diag-installed", "initSettingGroup=" + typeof window.initSettingGroup);
}

/* ---------------------------- 外壳组 ---------------------------- */

kokoaDiag.mark("10.module-evaluated", "document.URL=" + document.URL);
kokoaDiag.mark(
  "11.realm-identity",
  "window.Preferences===Preferences " +
    (window.Preferences === Preferences) +
    " ; window.SettingGroupManager===SettingGroupManager " +
    (window.SettingGroupManager === SettingGroupManager)
);

/* ================================================================== *
 * dsh sidecar 状态（从被删的旧 pane 迁移；能力来源 browser fork 的
 * kokoa-settings.js _refreshDshStatus —— 用 KokoaDshSidecar.getDshState()。
 * 注：fork 里还开着 getDshState，这里是等价读取，不复制实现。
 * ================================================================== */

/**
 * dsh 运行状态 Setting。不绑 pref（真值在 sidecar 侧，绑定 prefs.js 等于
 * 第二份真相）；首次 Setting 渲染即读取，打开 AI 工作区后手动刷新。
 */
let gKokoaDshStatusText = null;
const dshEmit = Object.create(null);

function kokoaDshStatusView() {
  // 产品 omni 不含 fork 模块。只读 KOKOA_DSH_URL（由 start-kokoa 注入），**绝不打印 token**。
  try {
    let hasUrl = false;
    let port = 3081;
    try {
      const panel = String(Services.env.get('KOKOA_DSH_URL') || '');
      if (/token=/.test(panel)) {
        hasUrl = true;
        const m = panel.match(/:(\d{2,5})\//);
        if (m) {
          port = parseInt(m[1], 10);
        }
      }
    } catch (e) {
      hasUrl = false;
    }
    if (hasUrl) {
      return {
        text:
          'dsh 已配置（端口 ' +
          port +
          '，已拿到 token）—— 会话请用本页按钮；模型出口见 CPA 栏目',
      };
    }
    return {
      text: 'dsh 状态：本环境未注入 token —— 用 scripts/start-kokoa.ps1 启动，或点「打开 AI 工作区」',
    };
  } catch (e) {
    return { text: 'dsh 状态不可用：' + e, error: true };
  }
}

function kokoaDshEmit(ids) {
  for (const id of ids) {
    if (dshEmit[id]) {
      dshEmit[id]("");
    }
  }
}

function kokoaDshRefreshStatus() {
  const view = kokoaDshStatusView();
  gKokoaDshStatusText = view.text;
  kokoaDshEmit(["kokoaDshStatus", "kokoaDshOpenWorkspace"]);
  kokoaDiag.mark("dsh.status", view.text);
  return view;
}

/** 把侧车动作挂到打开 AI 工作区（复用 resource:///modules 的现有模块，不重复实现）。 */
function kokoaBrowserWin() {
  try {
    return window.browsingContext?.topChromeWindow || window;
  } catch (e) {
    return window;
  }
}

function kokoaShellApi() {
  const win = kokoaBrowserWin();
  if (win && win.kokoaShell) {
    // 裸浏览器分支（主线 overlay 仍在时）优先用它注入的那份。
    return win.kokoaShell;
  }
  // ★ 本仓没有 boot.js：用本仓自己的等价实现（四个动作同名同语义）。
  try {
    return ChromeUtils.importESModule(
      "resource:///modules/zen/KokoaShellApi.mjs",
      { global: "current" }
    ).shellApiFor(win);
  } catch (e) {
    kokoaDiag.mark("dsh.shell-api.ERR", String(e));
    return null;
  }
}

/**
 * 打开 AI 工作区 = 打开/复用**主工作台**标签（dsh 主页，无 #kokoa-session）。
 * 不做分屏、不新建会话 —— 与「AI 分屏」「新建并行会话」语义分离。
 */
async function kokoaOpenAiWorkspaceAction() {
  const api = kokoaShellApi();
  if (!api || typeof api.openWorkspace !== "function") {
    kokoaDiag.mark("dsh.open-workspace", "no-shell-api");
    return { error: "no-shell-api" };
  }
  const r = api.openWorkspace();
  kokoaDiag.mark("dsh.open-workspace", (r && r.reused ? "reused" : "opened"));
  kokoaDshRefreshStatus();
  return r;
}

/** 会话历史独立页。 */
function kokoaOpenSessionsHistoryAction() {
  const win = kokoaBrowserWin();
  const api = kokoaShellApi();
  if (api && typeof api.openHistory === "function") {
    return api.openHistory(win);
  }
  // ★ 本仓没有 about:kokoases，也没有 chrome://browser/content/kokoa/sessions.html
  //   （会话历史页是主线 overlay 的资产）。这里如实返回失败，**不**去开一个
  //   不存在的 URL —— 等 Phase 2 把首页/历史页一起搬过来再接上。
  return { error: "no-history-page-in-fork" };
  /* eslint-disable no-unreachable */
  try {
    const gb = win.gBrowser;
    if (gb) {
      const tab = gb.addTab("about:kokoases", {
        inBackground: false,
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      gb.selectedTab = tab;
      return { tab, reused: false };
    }
  } catch (e) {
    return { error: String(e) };
  }
  return { error: "no-gbrowser" };
}

/**
 * AI 分屏 = **仅布局**（与当前网页并排）。不新建会话。
 * 新建独立会话请用「新建并行 AI 会话」。
 */
async function kokoaToggleAiSplitAction() {
  const api = kokoaShellApi();
  if (!api || typeof api.toggleSplit !== "function") {
    kokoaDiag.mark("dsh.toggle-split", "no-shell-api");
    return { ok: false, reason: "no-shell-api" };
  }
  const r = api.toggleSplit();
  kokoaDiag.mark("dsh.toggle-split", (r && (r.ok ? r.action : r.reason)) || "?");
  kokoaDshRefreshStatus();
  return r;
}

/** 新建并行 AI 会话：dsh RPC session/create + 独立标签（#kokoa-session=）。 */
async function kokoaNewParallelSessionAction() {
  const api = kokoaShellApi();
  if (!api || typeof api.newParallel !== "function") {
    kokoaDiag.mark("dsh.new-parallel", "no-shell-api");
    return { ok: false, error: "no-shell-api" };
  }
  // ★ 2026-09-19：把设置页的「默认工作目录」真正传下去 —— 原实现 newParallel() 不带参数，
  //   导致 kokoa.dsh.sessionCwd 在这条路径上是死设置（只有工具栏路径读它）。
  let cwd = "";
  try {
    cwd = String(Services.prefs.getStringPref("kokoa.dsh.sessionCwd", "") || "").trim();
  } catch (e) {
    /* pref 未定义 → 不传 cwd，用 dsh 默认 */
  }
  const r = await api.newParallel(cwd ? { cwd } : undefined);
  kokoaDiag.mark("dsh.new-parallel", (r && r.ok ? String(r.sessionId) : String(r && r.error)));
  kokoaDshRefreshStatus();
  return r;
}

kokoaDiag.mark("12.dsh-status-module", "ok");

// 第一步：声明 Preference。addSetting 只是把 Setting 绑到一个 Preference 上，
// Preference 本身必须先由 addAll 登记 —— 否则渲染时报
// PreferenceNotAddedError: Setting "x" was unable to find Preference "y"。
// ★ 2026-09-17：原先这里声明的是 kokoa.panel.enabled / kokoa.statusbar.enabled
//   （右侧小窗 + 状态条的开合）。那个面板已按用户要求整体删除，两个开关失去对象，
//   故移除；改为**二级菜单项的显隐开关**（用户诉求 #5：设置里能选哪些项出现）。
//   这些 pref 的名字必须与 KokoaMenubar.mjs 的 PREF_PREFIX + 后缀一致：
//     KokoaMenubar.mjs: const PREF_PREFIX = "kokoa.menu.";
//     MENU_ITEMS[].pref 形如 "print.visible" => pref 全名 kokoa.menu.print.visible
Preferences.addAll([
  { id: "kokoa.menu.new-tab.visible", type: "bool" },
  { id: "kokoa.menu.new-window.visible", type: "bool" },
  { id: "kokoa.menu.print.visible", type: "bool" },
  { id: "kokoa.menu.fxa.visible", type: "bool" },
  { id: "kokoa.menu.save-file.visible", type: "bool" },
  { id: "kokoa.ai.maxParallel", type: "int" },
  { id: "kokoa.ai.autoDiscardBackground", type: "bool" },
  // 下列 pref 必须先 addAll，否则后续 addSetting 抛 PreferenceNotAddedError
  // 会中断整个模块 → 组永不注册 → 设置页空白（2026-09-18 实测）。
  { id: "kokoa.dsh.sessionCwd", type: "string" },
  { id: "kokoa.startup.homeFirst", type: "bool" },
  { id: "kokoa.startup.workbench", type: "bool" },
]);
kokoaDiag.mark(
  "12.addAll",
  "ok; get(kokoa.menu.print.visible)=" + !!Preferences.get("kokoa.menu.print.visible")
);

// 默认值走 default branch：不覆盖用户已设的值，也不依赖 defaults/preferences/*.js 的装载机制。
// 默认值与 KokoaMenubar.mjs 的 MENU_ITEMS[].def 保持一致（改一处要改两处）：
//   new-tab / new-window 默认显示；print / fxa / save-file 默认隐藏。
const kokoaDefaults = Services.prefs.getDefaultBranch("kokoa.");
kokoaDefaults.setBoolPref("menu.new-tab.visible", true);
kokoaDefaults.setBoolPref("menu.new-window.visible", true);
kokoaDefaults.setBoolPref("menu.print.visible", false);
kokoaDefaults.setBoolPref("menu.fxa.visible", false);
kokoaDefaults.setBoolPref("menu.save-file.visible", false);
// 多会话资源：并行 AI 标签上限；打开新会话时后台 AI 标签会 discard。
kokoaDefaults.setIntPref("ai.maxParallel", 4);
kokoaDefaults.setBoolPref("ai.autoDiscardBackground", true);
kokoaDefaults.setStringPref("dsh.sessionCwd", "");
// M4 启动门面：默认首屏 about:kokoa，而不是 dsh 主页。
kokoaDefaults.setBoolPref("startup.homeFirst", true);
kokoaDefaults.setBoolPref("startup.workbench", false);

// 第二步：把 Setting 绑到已声明的 Preference。
// 逐条 try：单条失败不得中断后续（否则面板空白）。
function kokoaSafeAddSetting(config) {
  try {
    Preferences.addSetting(config);
  } catch (e) {
    kokoaDiag.mark("addSetting-fail:" + config.id, String(e));
  }
}
kokoaSafeAddSetting({ id: "kokoaMenuNewTab", pref: "kokoa.menu.new-tab.visible" });
kokoaSafeAddSetting({ id: "kokoaMenuNewWindow", pref: "kokoa.menu.new-window.visible" });
kokoaSafeAddSetting({ id: "kokoaMenuPrint", pref: "kokoa.menu.print.visible" });
kokoaSafeAddSetting({ id: "kokoaMenuFxa", pref: "kokoa.menu.fxa.visible" });
kokoaSafeAddSetting({ id: "kokoaMenuSaveFile", pref: "kokoa.menu.save-file.visible" });
// ★ 2026-09-19：kokoaAiMaxParallel / kokoaAiAutoDiscard 的**pref 绑定版注册已删** ——
//   它们在下面还有一份自定义 get/set 版（带 0..32 夹取），重复注册同一 id 是隐患
//   （谁最后注册谁生效，改错一处不报错）。pref 本身仍在 Preferences.addAll 里。
kokoaSafeAddSetting({ id: "kokoaDshSessionCwd", pref: "kokoa.dsh.sessionCwd" });
kokoaSafeAddSetting({ id: "kokoaStartupHomeFirst", pref: "kokoa.startup.homeFirst" });
kokoaSafeAddSetting({ id: "kokoaStartupWorkbench", pref: "kokoa.startup.workbench" });
kokoaDiag.mark(
  "13.addSetting",
  "ok; getSetting(kokoaMenuPrint)=" +
    (Preferences.getSetting("kokoaMenuPrint") ? "found" : "MISSING")
);

/* ================================================================== *
 * Kokoa CPA 模型路由
 * ================================================================== */

/**
 * CPA / dsh 的唯一管理入口说明（2026-09-18 设置入口收口）。
 * dsh「设置 → 模型」页的 Kokoa CPA 卡片已改为只读（见
 * packages/dsh-plugin-cpa-settings/src/client.tsx），编辑/保存/重启只在本页。
 */
const CPA_BRIDGE = "http://127.0.0.1:8318";
/** 逻辑别名集合（与 cpa-config.ts / cpa-embed 模板一致）。 */
const CPA_ALIASES = ["code", "cheap", "strong", "vision"];
/** 脱敏值形态（cpa-config.ts maskKey：前 4 … 后 4；碰撞占位含 #n 后缀仍命中）。 */
const CPA_MASK_RE = /.+….+/;
const CPA_ICON = {
  info: "chrome://global/skin/icons/info-filled.svg",
  warning: "chrome://global/skin/icons/warning.svg",
  error: "chrome://global/skin/icons/error.svg",
  success: "chrome://global/skin/icons/check-filled.svg",
};

/** 单次桥调用超时（ms）：桥卡死时不能让设置页一直等（源实现用 fetch，同样没有超时）。 */
const CPA_TIMEOUT_MS = 8000;

/**
 * 桥调用（chrome 原生 channel，**不是 fetch**）。
 *
 * ⚠️ 为什么不能用 fetch：about:preferences 的 CSP 是 `default-src chrome:;`，
 * 全文没有 `connect-src` → fetch 到 http://127.0.0.1:8318 会被 CSP 直接拦掉。
 * 实测证据（KOKOA_SETTINGS_PANE_DIAG=1 构建）：同一时刻
 * `Invoke-WebRequest http://127.0.0.1:8318/kokoa/cpa/status` 正常返回 JSON，
 * 而 pane 里的 fetch 抛 TypeError（见 `kokoa.diag.cpa.fetch-probe`），状态行据此
 * 显示「状态桥不可达」—— 一个用肉眼无法与「桥没起」区分的假象。
 * 这里改走 system principal 的 channel：NetUtil.newChannel(loadUsingSystemPrincipal)
 * 生成的 loadInfo **不挂文档 CSP**，是 chrome 代码访问本机 HTTP 的常规做法
 * （外壳 boot.js 在 browser.xhtml 里能用 fetch，只是因为那份 CSP 没有 default-src）。
 *
 * 语义与 dsh 侧 client.tsx 的 api() 一一对应：
 *   · 传输层失败（连不上/超时/CSP 之类）→ 抛 **TypeError**
 *     → cpaBridgeErrorText 返回 null → 状态行回落「状态桥不可达」
 *   · 桥应答非 2xx → 抛 Error(桥给的 error 文本 / "HTTP <status>")
 *     → 原样上屏（源实现 15-b 审查：一律吞成「未连接」会把「cpa-panel.json
 *       损坏待修复」误诊成「桥不可达」）
 */
function cpaApi(path, options) {
  const opts = options || {};
  const method = opts.method || "GET";
  const payload = opts.json === undefined ? null : opts.json;
  return new Promise((resolve, reject) => {
    let channel;
    try {
      channel = NetUtil.newChannel({
        uri: Services.io.newURI(CPA_BRIDGE + path),
        loadUsingSystemPrincipal: true,
        contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
      });
      channel.QueryInterface(Ci.nsIHttpChannel);
      channel.setRequestHeader("accept", "application/json", false);
      if (payload !== null) {
        // nsIStringInputStream 收的是**字节串**，必须自己把 UTF-8 字节摊成 latin1
        // 字符（setData 不做编码转换，直接塞非 ASCII 会坏掉）。
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        let bin = "";
        for (const b of bytes) {
          bin += String.fromCharCode(b);
        }
        const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
          Ci.nsIStringInputStream
        );
        // 只有 `data` 属性对 JS 可见（setData/setUTF8Data 是 [noscript]）——
        // 实测踩中："stream.setData is not a function"。Firefox 自己的
        // E10SUtils.sys.mjs 同样写法：string-input-stream + `stream.data = <latin1 字节串>`。
        stream.data = bin;
        channel
          .QueryInterface(Ci.nsIUploadChannel)
          .setUploadStream(stream, "application/json", bin.length, false);
      }
      // requestMethod 必须在 setUploadStream **之后**设置（setUploadStream 会把 GET 改成 POST）。
      channel.requestMethod = method;
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      try {
        channel.cancel(Cr.NS_ERROR_ABORT);
      } catch (e) {
        /* 已经结束 */
      }
      reject(new TypeError("timeout after " + CPA_TIMEOUT_MS + "ms: " + path));
    }, CPA_TIMEOUT_MS);
    NetUtil.asyncFetch(channel, (stream, status) => {
      clearTimeout(timer);
      if (!Components.isSuccessCode(status)) {
        reject(new TypeError("channel failed (0x" + status.toString(16) + "): " + path));
        return;
      }
      let text = "";
      try {
        text = NetUtil.readInputStreamToString(stream, stream.available(), {
          charset: "utf-8",
          replacement: 0xfffd,
        });
      } catch (e) {
        text = "";
      }
      let body = null;
      try {
        body = JSON.parse(text);
      } catch (e) {
        body = null;
      }
      const code = channel.responseStatus;
      if (code < 200 || code >= 300) {
        reject(new Error((body && body.error) || "HTTP " + code));
        return;
      }
      resolve(body);
    });
  });
}

/** 业务错误文本；传输层失败（TypeError）返回 null，交由状态行用默认文案。 */
function cpaBridgeErrorText(e) {
  return e instanceof TypeError ? null : String((e && e.message) || e);
}

/**
 * 诊断对照探针（只有 kokoa.diag.enabled 为 true 才跑）：用 fetch 打一次同样的桥，
 * 把结果与 channel 的结果并排留在 prefs.js 里 —— 这是「fetch 被 about:preferences
 * 的 CSP 拦掉」这一结论的**可复现证据**，也顺便把 chrome console 里看不到的
 * CSP 违规文本捞出来（Services.console.getMessageArray）。
 */
function cpaDiagFetchProbe() {
  if (!kokoaDiag.enabled || cpaState.fetchProbeDone) {
    return;
  }
  cpaState.fetchProbeDone = true;
  fetch(CPA_BRIDGE + "/kokoa/health", { cache: "no-store" }).then(
    r => kokoaDiag.mark("cpa.fetch-probe", "ok status=" + r.status),
    e => {
      kokoaDiag.mark("cpa.fetch-probe", "THREW " + (e && e.name) + ": " + (e && e.message));
      try {
        const msgs = (Services.console.getMessageArray() || []).map(
          m => (m && (m.message || m.errorMessage)) || String(m)
        );
        const tail = msgs.slice(-3).map(t => String(t).slice(0, 220));
        kokoaDiag.mark("cpa.console-tail", tail.join(" || ") || "(empty)");
      } catch (err) {
        kokoaDiag.mark("cpa.console-tail", "dump failed: " + err);
      }
    }
  );
}

/** 桥侧全部可渲染状态（模块单例：设置页每窗口一份）。 */
const cpaState = {
  attempted: false,   // 至少发起过一次状态读取
  ok: false,          // 最近一次状态读取成功
  err: null,          // 桥应答的业务错误（传输失败 = null）
  status: null,       // /kokoa/cpa/status 应答
  view: null,         // /kokoa/cpa/config 视图（api-key 已脱敏）
  form: null,         // { baseUrl, keysText, aliases }；null = 尚未读到配置
  managed: true,      // config.yaml 是否仍由 Kokoa 托管
  busy: false,        // 保存/重启进行中
  msg: null,          // { l10nId, l10nArgs?, iconSrc? }
  loading: false,
  lastLoadTry: 0,
  fetchProbeDone: false,
  diagSelfTestDone: false,
  timer: null,
  observer: null,
};

/** 每个 Setting 的 emitChange（setup 时捕获）—— 只刷新需要重绘的那一条。 */
const cpaEmit = Object.create(null);

const CPA_FORM_IDS = [
  "kokoaCpaUnmanaged",
  "kokoaCpaBaseUrl",
  "kokoaCpaApiKeys",
  "kokoaCpaAliasCode",
  "kokoaCpaAliasCheap",
  "kokoaCpaAliasStrong",
  "kokoaCpaAliasVision",
];
const CPA_ACTION_IDS = ["kokoaCpaSave", "kokoaCpaRestart", "kokoaCpaMessage", "kokoaCpaUnmanaged"];

/**
 * 只对指定 id 的 Setting 发 change。
 *
 * 为什么不用一个 emit 刷全部：status 轮询（8s）会重绘它绑定的条目，而
 * SettingControl 每次重绘都会把 setting.value 写回控件（setting-control.mjs 的
 * updated()）—— 若顺手刷了输入框，用户正在编辑的 base-url/密钥就会被拉回旧值。
 * 表单条目只在「首次读到配置 / 保存成功重拉」这两个**确实要覆盖**的时机刷新。
 */
function cpaEmitIds(ids) {
  for (const id of ids) {
    const emit = cpaEmit[id];
    if (!emit) {
      continue;
    }
    try {
      emit();
    } catch (e) {
      kokoaDiag.mark("cpa.emit-fail." + id, String((e && e.stack) || e));
    }
  }
}

// ---------------------------- 展示模型 ----------------------------

function cpaStatusView() {
  if (!cpaState.attempted) {
    return { l10nId: "kokoa-cpa-status-checking", iconSrc: CPA_ICON.info };
  }
  if (!cpaState.ok) {
    return cpaState.err
      ? {
          l10nId: "kokoa-cpa-status-bridge-error",
          l10nArgs: { detail: cpaState.err },
          iconSrc: CPA_ICON.error,
        }
      : {
          l10nId: "kokoa-cpa-status-bridge-down",
          l10nArgs: { bridge: CPA_BRIDGE },
          iconSrc: CPA_ICON.error,
        };
  }
  const s = cpaState.status || {};
  if (!s.running) {
    return {
      l10nId: "kokoa-cpa-status-stopped",
      l10nArgs: { port: String(s.port == null ? "?" : s.port) },
      iconSrc: CPA_ICON.warning,
    };
  }
  if (!s.upstreamConfigured) {
    return {
      l10nId: "kokoa-cpa-status-running-no-upstream",
      l10nArgs: { port: String(s.port) },
      iconSrc: CPA_ICON.warning,
    };
  }
  return {
    l10nId: "kokoa-cpa-status-running",
    l10nArgs: { port: String(s.port), keys: String(s.keysCount == null ? 0 : s.keysCount) },
    iconSrc: CPA_ICON.info,
  };
}

function cpaModelsView() {
  if (!cpaState.ok) {
    return { visible: true, l10nId: "kokoa-cpa-models-unknown", iconSrc: CPA_ICON.error };
  }
  const s = cpaState.status || {};
  if (!s.running) {
    // CPA 没在跑时状态行已经说了；这里不再重复一行 0。
    return { visible: false };
  }
  const models = Array.isArray(s.models) ? s.models : [];
  if (!models.length) {
    return { visible: true, l10nId: "kokoa-cpa-models-none", iconSrc: CPA_ICON.warning };
  }
  return {
    visible: true,
    l10nId: "kokoa-cpa-models-count",
    l10nArgs: { count: String(models.length), list: models.join(", ") },
    iconSrc: CPA_ICON.info,
  };
}

// ---------------------------- 桥侧动作 ----------------------------

async function cpaRefreshStatus() {
  cpaDiagFetchProbe();
  try {
    const s = await cpaApi("/kokoa/cpa/status");
    cpaState.attempted = true;
    cpaState.ok = true;
    cpaState.status = s;
    cpaState.err = null;
    kokoaDiag.mark(
      "cpa.status.ok",
      JSON.stringify({
        port: s && s.port,
        running: !!(s && s.running),
        upstream: !!(s && s.upstreamConfigured),
        keys: (s && s.keysCount) || 0,
        models: ((s && s.models) || []).length,
        pid: s && s.pid,
        managed_bin: s && s.managed_bin,
      })
    );
  } catch (e) {
    cpaState.attempted = true;
    cpaState.ok = false;
    cpaState.status = null;
    cpaState.err = cpaBridgeErrorText(e);
    // 传输层失败也留痕：CSP 拦截与「桥没起」在 fetch 层都是 TypeError，
    // 只能靠这条原文区分（chrome 模块的 console 不进 stderr）。
    kokoaDiag.mark("cpa.status.err", (e && e.name) + ": " + (e && e.message));
  }
  cpaEmitIds(["kokoaCpaStatus", "kokoaCpaModels"]);
  if (dshEmit.kokoaCpaSummary) {
    try { dshEmit.kokoaCpaSummary(""); } catch (e) { /* ignore */ }
  }

  // 桥恢复后补读配置（失败有 30s 退避，不刷屏）；组由原生 pane 声明。
  if (cpaPanesMounted()) {
    if (!cpaState.form) {
      cpaLoadConfig(false);
    }
  }
}

function cpaPanesMounted() {
  // 本仓注册三个 pane（kokoa / kokoaDsh / kokoaCpa）—— 任一挂载即认为设置页已就绪。
  return !!document.querySelector(
    'setting-pane[data-category="paneKokoa"], ' +
      'setting-pane[data-category="paneKokoaDsh"], ' +
      'setting-pane[data-category="paneKokoaCpa"]'
  );
}

async function cpaLoadConfig(force) {
  if (cpaState.loading) {
    return;
  }
  const now = Date.now();
  if (!force && now - cpaState.lastLoadTry < 30000) {
    return;
  }
  cpaState.loading = true;
  cpaState.lastLoadTry = now;
  try {
    const v = await cpaApi("/kokoa/cpa/config");
    cpaState.view = v;
    cpaState.managed = !(v && v.meta && v.meta.managed === false);
    cpaState.form = {
      baseUrl: (v && v.upstream && v.upstream.baseUrl) || "",
      keysText: ((v && v.upstream && v.upstream.apiKeys) || []).join("\n"),
      aliases: Object.assign({}, (v && v.aliases) || {}),
    };
    // 上一次的「读配置失败」提示到此为止（成功即清）。
    if (cpaState.msg && cpaState.msg.fromConfigLoad) {
      cpaState.msg = null;
    }
    kokoaDiag.mark(
      "cpa.config.ok",
      JSON.stringify({
        managed: cpaState.managed,
        baseUrl: cpaState.form.baseUrl,
        keys: ((v && v.upstream && v.upstream.apiKeys) || []).length,
        aliases: Object.keys((v && v.aliases) || {}).join(","),
      })
    );
  } catch (e) {
    const detail = cpaBridgeErrorText(e);
    kokoaDiag.mark("cpa.config.err", (e && e.name) + ": " + (e && e.message));
    // 传输层失败已由状态行表达；桥应答的业务错误（如 cpa-panel.json 损坏 500）必须上屏。
    if (detail) {
      cpaState.msg = {
        l10nId: "kokoa-cpa-msg-error",
        l10nArgs: { detail },
        iconSrc: CPA_ICON.error,
        fromConfigLoad: true,
      };
    }
  }
  cpaState.loading = false;
  cpaEmitIds(CPA_FORM_IDS.concat(CPA_ACTION_IDS));
  cpaMaybeDiagSelfTest();
}

/**
 * 诊断自检（**只有 kokoa.diag.enabled 为 true 才跑**，即 KOKOA_SETTINGS_PANE_DIAG=1 的
 * 构建；普通构建里整个函数体被 pref 挡在门外）：读到配置后**真的去点**两个按钮
 * （#setting-control-kokoaCpaSave / …Restart 里的 moz-button，点它的影子按钮，
 * 与 Firefox 自带探针在 build.py 里点复选框是同一手法），从而端到端验证
 *   组渲染 → setting-control → moz-button → Setting.userClick → cpaSave/cpaRestart
 * 整条线；保存走的是「原样提交」——未修改的行全部以 {keepAt:n} 意图提交，写回同一份
 * 内容，因此对真实配置无副作用。
 *
 * 为什么需要它：headless 的 --screenshot 拍完就退出，人点不了按钮；chrome 模块的
 * console 又不进 stderr，链路断了没有任何信号（这条坑在 docs/t5 里记着）。
 */
function cpaMaybeDiagSelfTest() {
  if (!kokoaDiag.enabled || cpaState.diagSelfTestDone || !cpaState.form || !cpaState.view) {
    return;
  }
  cpaState.diagSelfTestDone = true;
  const clickControl = (id, what) => {
    const host = document.querySelector("#setting-control-" + id);
    if (!host) {
      kokoaDiag.mark("cpa.diag-click", what + "=setting-control-MISSING");
      return false;
    }
    const btn = host.querySelector("moz-button");
    if (!btn) {
      kokoaDiag.mark("cpa.diag-click", what + "=moz-button-MISSING");
      return false;
    }
    const inner = btn.shadowRoot && btn.shadowRoot.querySelector("#main-button");
    (inner || btn).click();
    kokoaDiag.mark("cpa.diag-click", what + "=clicked label=" + btn.label);
    return true;
  };
  // 尽早触发（+50ms）：--screenshot 在 load 之后不久就拍并退出，晚了异步结果就没了。
  // 顺序：先重启后保存 —— 重启的 POST 很短，放前面才来得及；保存放后面，最后一次
  // 渲染停留下的就是「✓ 已保存 —— 点「重启 CPA」生效」这条消息（截图里看得见）。
  setTimeout(() => {
    if (!clickControl("kokoaCpaRestart", "restart")) {
      return;
    }
    setTimeout(() => clickControl("kokoaCpaSave", "save"), 250);
  }, 50);
}

/**
 * 多行密钥文本 → 保存意图：与初始视图一致的行 → {keepAt: i}；其余非空行 → 新字符串；
 * 空行跳过。行号按 textarea 原始行号计（源实现审查 L12：按已收集 intent 计数会在
 * 前面有空行时定位错位）。像脱敏值但不在初始视图里的行**拒之门外** —— 宁可丢一次
 * 保存也不把截断的假密钥写回上游。
 */
function cpaKeysToIntents(text, originalMasked) {
  const lines = String(text || "").split("\n");
  const intents = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    const kept = originalMasked.findIndex(m => m === line);
    if (kept >= 0) {
      intents.push({ keepAt: kept });
    } else if (CPA_MASK_RE.test(line)) {
      const err = new Error("truncated key at line " + (i + 1));
      err.code = "ETRUNCATED";
      err.line = i + 1;
      throw err;
    } else {
      intents.push(line);
    }
  }
  return intents;
}

async function cpaSave() {
  if (cpaState.busy) {
    return;
  }
  // 源实现里「保存」只在 openForm 成功后才可点（view/form 必非空）。本页表单一进来
  // 就在，所以必须自己守住这条不变量：没读到配置就保存 = 拿空表单覆盖上游密钥。
  if (!cpaState.form || !cpaState.view) {
    cpaState.msg = { l10nId: "kokoa-cpa-msg-not-loaded", iconSrc: CPA_ICON.error };
    cpaEmitIds(["kokoaCpaMessage"]);
    return;
  }
  cpaState.busy = true;
  cpaState.msg = null;
  cpaEmitIds(CPA_ACTION_IDS);

  let putErr = null;
  let refreshErr = null;
  try {
    const original = (cpaState.view.upstream && cpaState.view.upstream.apiKeys) || [];
    const intents = cpaKeysToIntents(cpaState.form.keysText, original);
    // 只记形态不记原文（诊断落盘在 <profile>/prefs.js）：新密钥只记长度。
    kokoaDiag.mark(
      "cpa.save.intents",
      JSON.stringify(
        intents.map(i => (i && typeof i === "object" ? "keepAt:" + i.keepAt : "new:" + String(i).length + "chars"))
      )
    );
    await cpaApi("/kokoa/cpa/config", {
      method: "PUT",
      json: {
        upstream: { baseUrl: cpaState.form.baseUrl.trim(), apiKeys: intents },
        aliases: cpaState.form.aliases,
      },
    });
  } catch (e) {
    putErr = e;
  }
  // 保存与重拉分两段 try（源实现审查 12-c①）：PUT 失败才是「保存失败」；PUT 成功后
  // 刷新失败仍是 ✓ 语义并明示视图未刷新，不再冒充保存失败。
  if (!putErr) {
    try {
      const v2 = await cpaApi("/kokoa/cpa/config");
      cpaState.view = v2;
      cpaState.managed = !(v2 && v2.meta && v2.meta.managed === false);
      cpaState.form = {
        baseUrl: (v2 && v2.upstream && v2.upstream.baseUrl) || "",
        keysText: ((v2 && v2.upstream && v2.upstream.apiKeys) || []).join("\n"),
        aliases: Object.assign({}, (v2 && v2.aliases) || {}),
      };
    } catch (e) {
      refreshErr = e;
    }
  }

  if (putErr) {
    cpaState.msg =
      putErr.code === "ETRUNCATED"
        ? {
            l10nId: "kokoa-cpa-msg-truncated-key",
            l10nArgs: { line: String(putErr.line) },
            iconSrc: CPA_ICON.error,
          }
        : {
            l10nId: "kokoa-cpa-msg-error",
            l10nArgs: { detail: String((putErr && putErr.message) || putErr) },
            iconSrc: CPA_ICON.error,
          };
    kokoaDiag.mark("cpa.save.err", String((putErr && putErr.message) || putErr));
  } else {
    cpaState.msg = {
      l10nId: refreshErr ? "kokoa-cpa-msg-saved-stale" : "kokoa-cpa-msg-saved",
      iconSrc: CPA_ICON.success,
    };
    kokoaDiag.mark("cpa.save.ok", JSON.stringify({ refreshFailed: !!refreshErr }));
  }
  cpaState.busy = false;
  cpaEmitIds(CPA_FORM_IDS.concat(CPA_ACTION_IDS));
  cpaRefreshStatus();
}

async function cpaRestart() {
  if (cpaState.busy) {
    return;
  }
  cpaState.busy = true;
  cpaState.msg = null;
  cpaEmitIds(CPA_ACTION_IDS);
  try {
    // ★ 2026-09-19 修复：桥在 CPA 未托管/二进制缺失时**仍是 HTTP 200**，响应体
    //   {ok:false,restarted:false}。原实现忽略响应体 → UI 谎报「已请求重启」。
    const r = await cpaApi("/kokoa/cpa/restart", { method: "POST" });
    if (r && r.ok === false) {
      cpaState.msg = {
        l10nId: "kokoa-cpa-msg-error",
        l10nArgs: { detail: "restart 未生效（CPA 未托管或二进制缺失）" },
        iconSrc: CPA_ICON.error,
      };
      kokoaDiag.mark("cpa.restart.noop", JSON.stringify(r));
    } else {
      cpaState.msg = { l10nId: "kokoa-cpa-msg-restarting", iconSrc: CPA_ICON.success };
      kokoaDiag.mark("cpa.restart.ok", "requested");
      setTimeout(() => {
        cpaRefreshStatus();
      }, 2000);
    }
  } catch (e) {
    cpaState.msg = {
      l10nId: "kokoa-cpa-msg-error",
      l10nArgs: { detail: String((e && e.message) || e) },
      iconSrc: CPA_ICON.error,
    };
    kokoaDiag.mark("cpa.restart.err", String((e && e.message) || e));
  }
  cpaState.busy = false;
  cpaEmitIds(CPA_ACTION_IDS);
}

// ---------------------------- Setting 注册 ----------------------------

/**
 * 与 \`Preferences.addSetting\` 同款，只多一件事：把 Firefox 交给 setup 的 emitChange
 * 记下来，供「只刷新这一条」使用（见 cpaEmitIds 的注释）。
 *
 * ⚠️ CPA 的 Setting 一律**不绑 pref**（config.js 里的 pref 只服务外壳开关）：
 * 它们的真值在 CPA 的 config.yaml / sidecar 桥侧，绑 pref 等于造第二份真相，
 * 还会把脱敏后的密钥串写进 <profile>/prefs.js。Setting 无 pref 时 set/get 全部
 * 走 config.set/get，行为与源实现的 React state 一一对应。
 */
function cpaAddSetting(config) {
  const id = config.id;
  const setup = config.setup;
  config.setup = function (emitChange, deps, setting) {
    cpaEmit[id] = emitChange;
    return setup ? setup.call(this, emitChange, deps, setting) : undefined;
  };
  Preferences.addSetting(config);
}

/**
 * 与 cpaAddSetting 同款：不绑 pref 的「真值在桥/侧车侧」Setting。
 * emitChange 也记下来，供「只刷新这几条」使用（见 kokoaDshEmit）。
 */
function kokoaAddSetting(config) {
  const id = config.id;
  const setup = config.setup;
  config.setup = function (emitChange, deps, setting) {
    dshEmit[id] = emitChange;
    return setup ? setup.call(this, emitChange, deps, setting) : undefined;
  };
  Preferences.addSetting(config);
}

function cpaFormDisabled() {
  return cpaState.busy || !cpaState.form || !cpaState.managed;
}

function cpaRegisterSettings() {
  // 0) dsh sidecar 状态 + 打开 AI 工作区（从被删的旧 pane 迁移）
  kokoaAddSetting({
    id: "kokoaDshStatus",
    setup() {
      // 首次渲染即读状态；之后由动作/打开工作区后的手动刷新更新。
      kokoaDshRefreshStatus();
    },
    get() {
      return "";
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-status-dynamic";
      config.l10nArgs = { text: gKokoaDshStatusText || "" };
      return config;
    },
  });

  kokoaAddSetting({
    id: "kokoaDshOpenWorkspace",
    get() {
      return "";
    },
    onUserClick() {
      kokoaOpenAiWorkspaceAction();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-open-workspace";
      return config;
    },
  });

  kokoaAddSetting({
    id: "kokoaDshToggleSplit",
    get() {
      return "";
    },
    onUserClick() {
      kokoaToggleAiSplitAction();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-toggle-split";
      return config;
    },
  });

  /** 主设置页 CPA 只读摘要（真正管理在「Kokoa CPA」独立分类）。 */
function kokoaCpaSummaryText() {
  const s = cpaState && cpaState.status;
  if (!cpaState || !cpaState.attempted) {
    return "CPA 摘要：检测中…（管理请打开 CPA 设置页）";
  }
  if (!cpaState.ok || !s) {
    return "CPA 摘要：状态桥不可达 —— 请打开 CPA 设置页查看降级信息";
  }
  const models = Array.isArray(s.models) ? s.models.length : s.keysCount;
  return (
    "CPA 摘要：" +
    (s.running ? "运行中" : "未运行") +
    " · 端口 " +
    (s.port != null ? s.port : "?") +
    (s.upstreamConfigured ? " · 上游已配置" : " · 上游未配置") +
    (models != null ? " · 模型/密钥 " + models : "") +
    " → 打开 CPA 设置页"
  );
}

kokoaAddSetting({
  id: "kokoaCpaSummary",
  setup() {
    dshEmit.kokoaCpaSummary = null;
    const self = Preferences.getSetting("kokoaCpaSummary");
    dshEmit.kokoaCpaSummary = (v) => {
      try {
        if (self && self.emitChange) self.emitChange(v);
      } catch (e) { /* ignore */ }
    };
    void cpaRefreshStatus();
  },
  get() {
    return "";
  },
  onUserClick() {
    try {
      const win = kokoaBrowserWin();
      if (win && typeof win.openPreferences === "function") {
        win.openPreferences("kokoaCpa");
      }
    } catch (e) {
      kokoaDiag.mark("open.cpa-from-summary.ERR", String(e));
    }
  },
  getControlConfig(config) {
    config.l10nId = "kokoa-cpa-summary";
    config.l10nArgs = { text: kokoaCpaSummaryText() };
    return config;
  },
});

kokoaAddSetting({
  id: "kokoaOpenHome",
  get() {
    return "";
  },
  onUserClick() {
    try {
      const win = kokoaBrowserWin();
      const api = win && win.kokoaShell;
      if (api && typeof api.openHome === "function") {
        api.openHome();
        return;
      }
      if (win && win.gBrowser) {
        const gb = win.gBrowser;
        for (const t of gb.tabs) {
          try {
            const spec = t.linkedBrowser && t.linkedBrowser.currentURI && t.linkedBrowser.currentURI.spec;
            if (spec && spec.split(/[?#]/)[0] === "about:kokoa") {
              gb.selectedTab = t;
              return;
            }
          } catch (e) { /* ignore */ }
        }
        const tab = gb.addTab("about:kokoa", {
          inBackground: false,
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        gb.selectedTab = tab;
      }
    } catch (e) {
      kokoaDiag.mark("open.home.ERR", String(e));
    }
  },
  getControlConfig(config) {
    config.l10nId = "kokoa-open-home";
    return config;
  },
});

kokoaAddSetting({
  id: "kokoaOpenCpaPage",
  get() {
    return "";
  },
  onUserClick() {
    try {
      const win = kokoaBrowserWin();
      const api = win && win.kokoaShell;
      if (api && typeof api.openCpaSettings === "function") {
        api.openCpaSettings();
        return;
      }
      if (win && typeof win.openPreferences === "function") {
        win.openPreferences("kokoaCpa");
      }
    } catch (e) {
      kokoaDiag.mark("open.cpa-page.ERR", String(e));
    }
  },
  getControlConfig(config) {
    config.l10nId = "kokoa-open-cpa-page";
    return config;
  },
});

  kokoaAddSetting({
    id: "kokoaDshNewParallel",
    get() {
      return "";
    },
    onUserClick() {
      kokoaNewParallelSessionAction();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-new-parallel";
      return config;
    },
  });

  kokoaAddSetting({
    id: "kokoaDshOpenSessions",
    get() {
      return "";
    },
    onUserClick() {
      kokoaOpenSessionsHistoryAction();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-open-sessions";
      return config;
    },
  });

  kokoaAddSetting({
    id: "kokoaAiMaxParallel",
    get() {
      return String(Services.prefs.getIntPref("kokoa.ai.maxParallel", 4));
    },
    set(val) {
      const n = parseInt(String(val), 10);
      if (Number.isFinite(n) && n >= 0 && n <= 32) {
        Services.prefs.setIntPref("kokoa.ai.maxParallel", n);
      }
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-ai-max-parallel";
      return config;
    },
  });

  kokoaAddSetting({
    id: "kokoaAiAutoDiscard",
    get() {
      return Services.prefs.getBoolPref("kokoa.ai.autoDiscardBackground", true);
    },
    set(val) {
      Services.prefs.setBoolPref("kokoa.ai.autoDiscardBackground", !!val);
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-ai-auto-discard";
      return config;
    },
  });

  // ---- Kokoa dsh 设置（完整迁移：下拉选择，直写 settings.yaml）----
  function dshPrefSetting(id, key, l10nId, control, options) {
    kokoaAddSetting({
      id,
      setup() {
        dshPrefEmit[id] = null;
        const self = Preferences.getSetting(id);
        dshPrefEmit[id] = (v) => {
          try {
            if (self && self.emitChange) self.emitChange(v);
          } catch (e) { /* ignore */ }
        };
        void dshPrefRefresh();
      },
      get() {
        return gDshPref.values[key] != null ? String(gDshPref.values[key]) : "";
      },
      set(val) {
        void dshPrefSaveField(key, val);
      },
      getControlConfig(config) {
        config.l10nId = l10nId;
        if (control) config.control = control;
        if (options) config.options = options;
        return config;
      },
    });
  }
  const DSH_OPT_THEME = [
    { value: "system", label: "跟随系统" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];
  const DSH_OPT_PERM = [
    { value: "read-only", label: "只读" },
    { value: "workspace-write", label: "工作区可写" },
    { value: "danger-full-access", label: "完全访问" },
  ];
  const DSH_OPT_BUSY = [
    { value: "queue", label: "排队" },
    { value: "steer", label: "转向插话" },
  ];
  const DSH_OPT_TRANSCRIPT = [
    { value: "normal", label: "完整" },
    { value: "compact", label: "紧凑" },
  ];
  const DSH_OPT_LOCALE = [
    { value: "", label: "默认" },
    { value: "zh-CN", label: "简体中文" },
    { value: "en-US", label: "English" },
  ];
  dshPrefSetting("kokoaDshTheme", "ui-theme.preference", "kokoa-dsh-theme", "moz-select", DSH_OPT_THEME);
  dshPrefSetting("kokoaDshFontSize", "ui-theme.fontSize", "kokoa-dsh-font-size", "moz-input-text");
  dshPrefSetting("kokoaDshLocale", "locale.preference", "kokoa-dsh-locale", "moz-select", DSH_OPT_LOCALE);
  dshPrefSetting("kokoaDshPermission", "permission.defaultPreset", "kokoa-dsh-permission", "moz-select", DSH_OPT_PERM);
  dshPrefSetting("kokoaDshAgentPreset", "agent-presets.default", "kokoa-dsh-agent-preset", "moz-input-text");
  dshPrefSetting("kokoaDshBusyEnter", "ui-conversation.busyEnter", "kokoa-dsh-busy-enter", "moz-select", DSH_OPT_BUSY);
  dshPrefSetting("kokoaDshTranscript", "ui-chat.transcriptView", "kokoa-dsh-transcript", "moz-select", DSH_OPT_TRANSCRIPT);
  dshPrefSetting("kokoaDshToolParallel", "agent-loop.maxParallelToolCalls", "kokoa-dsh-tool-parallel", "moz-input-text");
  dshPrefSetting("kokoaDshShellTimeout", "shell.timeoutMs", "kokoa-dsh-shell-timeout", "moz-input-text");
  dshPrefSetting("kokoaDshShellMaxOut", "shell.maxOutputBytes", "kokoa-dsh-shell-maxout", "moz-input-text");
  dshPrefSetting("kokoaDshWebMaxUses", "web-search-deepseek.maxUses", "kokoa-dsh-web-maxuses", "moz-input-text");
  dshPrefSetting("kokoaDshWebBaseUrl", "web-search-deepseek.baseURL", "kokoa-dsh-web-baseurl", "moz-input-text");
  // sessionCwd：pref 绑定已在上方 Preferences.addSetting 完成，此处不再 addSetting（避免重复注册）。
  kokoaAddSetting({
    id: "kokoaDshPrefMessage",
    setup() {
      dshPrefEmit.kokoaDshPrefMessage = null;
      const self = Preferences.getSetting("kokoaDshPrefMessage");
      dshPrefEmit.kokoaDshPrefMessage = (v) => {
        try {
          if (self && self.emitChange) self.emitChange(v);
        } catch (e) { /* ignore */ }
      };
    },
    get() {
      return "";
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-dsh-pref-msg";
      config.l10nArgs = { text: gDshPref.msg || "" };
      return config;
    },
  });

  // 1) 上游状态摘要 + 唯一管理入口说明
  cpaAddSetting({
    id: "kokoaCpaStatus",
    setup() {
      cpaStartPolling();
      cpaInstallPaneHook();
      cpaRefreshStatus();
      // 窗口卸载时 Preferences.onUnload → Setting.destroy() 会调用它，停掉定时器与观察者。
      return cpaStopPolling;
    },
    get() {
      return "";
    },
    getControlConfig(config) {
      const v = cpaStatusView();
      config.l10nId = v.l10nId;
      config.l10nArgs = v.l10nArgs || {};
      config.iconSrc = v.iconSrc;
      return config;
    },
  });

  // 2) 可用上游模型数（status.models 来自 CPA 的 /v1/models 就活探测）
  cpaAddSetting({
    id: "kokoaCpaModels",
    get() {
      return "";
    },
    visible() {
      return cpaModelsView().visible;
    },
    getControlConfig(config) {
      const v = cpaModelsView();
      if (v.l10nId) {
        config.l10nId = v.l10nId;
      }
      config.l10nArgs = v.l10nArgs || {};
      config.iconSrc = v.iconSrc;
      return config;
    },
  });

  // 3) 手工接管告警（config.yaml 无托管标记 → 表单只读）
  cpaAddSetting({
    id: "kokoaCpaUnmanaged",
    get() {
      return "";
    },
    visible() {
      return !cpaState.managed && !!cpaState.form;
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-cpa-unmanaged";
      config.l10nArgs = {};
      return config;
    },
  });

  // 4) 上游 base-url
  cpaAddSetting({
    id: "kokoaCpaBaseUrl",
    get() {
      return (cpaState.form && cpaState.form.baseUrl) || "";
    },
    set(val) {
      if (cpaState.form) {
        cpaState.form.baseUrl = String(val == null ? "" : val);
      }
    },
    disabled: cpaFormDisabled,
    getControlConfig(config) {
      config.l10nId = "kokoa-cpa-baseurl";
      return config;
    },
  });

  // 5) 上游 api-key 列表（多行；脱敏往返）
  cpaAddSetting({
    id: "kokoaCpaApiKeys",
    get() {
      return (cpaState.form && cpaState.form.keysText) || "";
    },
    set(val) {
      if (cpaState.form) {
        cpaState.form.keysText = String(val == null ? "" : val);
      }
    },
    disabled: cpaFormDisabled,
    getControlConfig(config) {
      config.l10nId = "kokoa-cpa-apikeys";
      config.controlAttrs = { rows: 6 };
      return config;
    },
  });

  // 6) 4 个逻辑别名映射（dsh 只看得到这 4 个名字）
  const aliasIds = {
    code: "kokoaCpaAliasCode",
    cheap: "kokoaCpaAliasCheap",
    strong: "kokoaCpaAliasStrong",
    vision: "kokoaCpaAliasVision",
  };
  for (const alias of CPA_ALIASES) {
    cpaAddSetting({
      id: aliasIds[alias],
      get() {
        return (cpaState.form && cpaState.form.aliases && cpaState.form.aliases[alias]) || "";
      },
      set(val) {
        if (cpaState.form) {
          cpaState.form.aliases[alias] = String(val == null ? "" : val);
        }
      },
      disabled: cpaFormDisabled,
      getControlConfig(config) {
        config.l10nId = "kokoa-cpa-alias-" + alias;
        return config;
      },
    });
  }

  // 7) 保存（整份重生成 config.yaml）
  cpaAddSetting({
    id: "kokoaCpaSave",
    get() {
      return "";
    },
    disabled() {
      return cpaFormDisabled();
    },
    onUserClick() {
      cpaSave();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-cpa-save";
      return config;
    },
  });

  // 8) 重启 CPA（保存后生效；手工接管态也允许 —— 与源实现同一 disabled 条件）
  cpaAddSetting({
    id: "kokoaCpaRestart",
    get() {
      return "";
    },
    disabled() {
      return cpaState.busy;
    },
    onUserClick() {
      cpaRestart();
    },
    getControlConfig(config) {
      config.l10nId = "kokoa-cpa-restart";
      return config;
    },
  });

  // 9) 保存/重启结果（无消息时整行隐藏）
  cpaAddSetting({
    id: "kokoaCpaMessage",
    get() {
      return "";
    },
    visible() {
      return !!cpaState.msg;
    },
    getControlConfig(config) {
      const m = cpaState.msg;
      if (m) {
        config.l10nId = m.l10nId;
        config.l10nArgs = m.l10nArgs || {};
        config.iconSrc = m.iconSrc;
      }
      return config;
    },
  });
}

const KOKOA_SHELL_GROUP = {
  l10nId: "kokoa-shell-group",
  headingLevel: 2,
  items: [
    { id: "kokoaDshStatus", control: "moz-box-item", l10nId: "kokoa-dsh-status-dynamic" },
    { id: "kokoaDshOpenWorkspace", control: "moz-button", l10nId: "kokoa-dsh-open-workspace" },
    { id: "kokoaDshToggleSplit", control: "moz-button", l10nId: "kokoa-dsh-toggle-split" },
    { id: "kokoaDshNewParallel", control: "moz-button", l10nId: "kokoa-dsh-new-parallel" },
    // ★ 本仓无对应页面（见文件头「与主线的差异」）：
    //   kokoaDshOpenSessions（会话历史页）/ kokoaOpenHome（about:kokoa）
    //   / kokoaStartupHomeFirst / kokoaStartupWorkbench（主线 boot.js 的启动门面）
    //   四行的 Setting 注册保留（同文件下方），但**不挂进组**，故本仓设置页不显示。
    { id: "kokoaCpaSummary", control: "moz-button", l10nId: "kokoa-cpa-summary" },
    { id: "kokoaOpenCpaPage", control: "moz-button", l10nId: "kokoa-open-cpa-page" },
    { id: "kokoaAiMaxParallel", control: "moz-input-text", l10nId: "kokoa-ai-max-parallel" },
    { id: "kokoaAiAutoDiscard", l10nId: "kokoa-ai-auto-discard" },
    { id: "kokoaMenuNewTab", l10nId: "kokoa-menu-new-tab" },
    { id: "kokoaMenuNewWindow", l10nId: "kokoa-menu-new-window" },
    { id: "kokoaMenuPrint", l10nId: "kokoa-menu-print" },
    { id: "kokoaMenuFxa", l10nId: "kokoa-menu-fxa" },
    { id: "kokoaMenuSaveFile", l10nId: "kokoa-menu-save-file" },
  ],
};

const KOKOA_CPA_STATUS_GROUP = {
  l10nId: "kokoa-cpa-status-group",
  headingLevel: 2,
  items: [
    { id: "kokoaCpaStatus", control: "moz-box-item", l10nId: "kokoa-cpa-status-checking" },
    { id: "kokoaCpaModels", control: "moz-box-item", l10nId: "kokoa-cpa-models-unknown" },
  ],
};

const KOKOA_CPA_UPSTREAM_GROUP = {
  l10nId: "kokoa-cpa-upstream-group",
  headingLevel: 2,
  items: [
    {
      id: "kokoaCpaUnmanaged",
      control: "moz-box-item",
      l10nId: "kokoa-cpa-unmanaged",
      iconSrc: CPA_ICON.warning,
    },
    { id: "kokoaCpaBaseUrl", control: "moz-input-text", l10nId: "kokoa-cpa-baseurl" },
    { id: "kokoaCpaApiKeys", control: "moz-textarea", l10nId: "kokoa-cpa-apikeys" },
    { id: "kokoaCpaAliasCode", control: "moz-input-text", l10nId: "kokoa-cpa-alias-code" },
    { id: "kokoaCpaAliasCheap", control: "moz-input-text", l10nId: "kokoa-cpa-alias-cheap" },
    { id: "kokoaCpaAliasStrong", control: "moz-input-text", l10nId: "kokoa-cpa-alias-strong" },
    { id: "kokoaCpaAliasVision", control: "moz-input-text", l10nId: "kokoa-cpa-alias-vision" },
    { id: "kokoaCpaSave", control: "moz-button", l10nId: "kokoa-cpa-save" },
    { id: "kokoaCpaRestart", control: "moz-button", l10nId: "kokoa-cpa-restart" },
    { id: "kokoaCpaMessage", control: "moz-box-item", l10nId: "kokoa-cpa-msg-saved" },
  ],
};

// ---------------------------- 组注册与挂载 ----------------------------

// ★ 2026-09-17：原先这两项是「Kokoa 面板」「状态条」开关 —— 面板已删，改为
//   **二级菜单项的显隐开关**（用户诉求 #5）。id 与上面的 addSetting 一一对应。
//   注：默认显示的两项（新标签页/新窗口）也列进来 —— 用户要的是「可配置」，
//   默认显示不等于不能关（与 KokoaMenubar.mjs 的注释一致）。



/**
 * dsh 通用设置（M2 拆分：主题 / 语言 / 默认权限 / 默认 agent preset）。
 * 真值在 $DSH_HOME/settings.yaml，经桥 /kokoa/dsh/settings 白名单读写（产品 Q1）。
 */
/**
 * dsh 通用设置（M2 拆分）—— 真值写 $DSH_HOME/settings.yaml（桥白名单）。
 * 这些是 **dsh 运行时偏好**，不是浏览器外观；浏览器主题在 Zen/外观设置里。
 */


const gDshPref = {
  values: {
    "ui-theme.preference": "system",
    "ui-theme.fontSize": "14",
    "locale.preference": "",
    "permission.defaultPreset": "workspace-write",
    "agent-presets.default": "standard",
    "ui-conversation.busyEnter": "queue",
    "ui-chat.transcriptView": "compact",
    "agent-loop.maxParallelToolCalls": "4",
    "shell.timeoutMs": "120000",
    "shell.maxOutputBytes": "1048576",
    "web-search-deepseek.maxUses": "5",
    "web-search-deepseek.baseURL": "",
  },
  msg: "",
  loaded: false,
};

const dshPrefEmit = Object.create(null);


const DSH_EMIT_ALL = [
  "kokoaDshTheme","kokoaDshFontSize","kokoaDshLocale","kokoaDshPermission","kokoaDshAgentPreset",
  "kokoaDshBusyEnter","kokoaDshTranscript","kokoaDshToolParallel","kokoaDshShellTimeout",
  "kokoaDshShellMaxOut","kokoaDshWebMaxUses","kokoaDshWebBaseUrl","kokoaDshPrefMessage",
  "kokoaDshSessionCwd",
];

function dshPrefEmitIds(ids) {
  for (const id of ids) {
    if (dshPrefEmit[id]) {
      try { dshPrefEmit[id](""); } catch (e) { /* ignore */ }
    }
  }
}


async function dshPrefRefresh() {
  try {
    const r = await cpaApi("/kokoa/dsh/settings", { method: "GET" });
    if (r && r.values) {
      for (const k of Object.keys(gDshPref.values)) {
        if (r.values[k] !== undefined && r.values[k] !== null) {
          gDshPref.values[k] = String(r.values[k]);
        }
      }
      if (!gDshPref.values["locale.preference"] && r.values["locale.language"]) {
        gDshPref.values["locale.preference"] = String(r.values["locale.language"]);
      }
      gDshPref.loaded = true;
      gDshPref.msg = r.ok ? "已读取 dsh settings.yaml" : String(r.error || "read-failed");
    } else {
      gDshPref.msg = "状态桥不可达 —— 无法读写 dsh 设置";
    }
  } catch (e) {
    gDshPref.msg = String((e && e.message) || e);
  }
  dshPrefEmitIds(DSH_EMIT_ALL);
  return gDshPref;
}


async function dshPrefSaveField(key, raw) {
  const val = String(raw ?? "").trim();
  const isInt = /fontSize|maxParallel|timeoutMs|maxOutput|maxUses/.test(key);
  try {
    const body = isInt ? { values: { [key]: parseInt(val, 10) } } : { values: { [key]: val } };
    // ★ 2026-09-19 修复：参数名必须是 json —— cpaApi 只读 opts.json。
    //   原写 opts.body 被静默忽略 → payload=null → **不发请求体** → 桥 JSON.parse("")
    //   抛 SyntaxError → 400 "Unexpected end of JSON input"：12 个 dsh 字段一个都存不进去。
    const r = await cpaApi("/kokoa/dsh/settings", { method: "PUT", json: body });
    if (r && r.ok) {
      gDshPref.values[key] = val;
      gDshPref.msg = "✓ 已保存到 dsh settings.yaml（约 100ms 生效）";
    } else {
      gDshPref.msg = "✗ " + String((r && r.error) || "save-failed");
    }
  } catch (e) {
    gDshPref.msg = "✗ " + String((e && e.message) || e);
  }
  kokoaDiag.mark("dsh.pref." + key, gDshPref.msg);
  dshPrefEmitIds(DSH_EMIT_ALL);
}


/** dsh 外观与语言 */
const KOKOA_DSH_PREF_GROUP = {
  l10nId: "kokoa-dsh-pref-group",
  headingLevel: 2,
  items: [
    { id: "kokoaDshTheme", control: "moz-select", l10nId: "kokoa-dsh-theme" },
    { id: "kokoaDshFontSize", control: "moz-input-text", l10nId: "kokoa-dsh-font-size" },
    { id: "kokoaDshLocale", control: "moz-select", l10nId: "kokoa-dsh-locale" },
    { id: "kokoaDshPrefMessage", control: "moz-box-item", l10nId: "kokoa-dsh-pref-msg" },
  ],
};

/** dsh 会话与对话默认 */
const KOKOA_DSH_SESSION_GROUP = {
  l10nId: "kokoa-dsh-session-group",
  headingLevel: 2,
  items: [
    { id: "kokoaDshPermission", control: "moz-select", l10nId: "kokoa-dsh-permission" },
    { id: "kokoaDshAgentPreset", control: "moz-input-text", l10nId: "kokoa-dsh-agent-preset" },
    { id: "kokoaDshBusyEnter", control: "moz-select", l10nId: "kokoa-dsh-busy-enter" },
    { id: "kokoaDshTranscript", control: "moz-select", l10nId: "kokoa-dsh-transcript" },
    { id: "kokoaDshSessionCwd", control: "moz-input-text", l10nId: "kokoa-dsh-session-cwd" },
  ],
};

/** dsh 工具 / Agent / 搜索 */
const KOKOA_DSH_TOOL_GROUP = {
  l10nId: "kokoa-dsh-tool-group",
  headingLevel: 2,
  items: [
    { id: "kokoaDshToolParallel", control: "moz-input-text", l10nId: "kokoa-dsh-tool-parallel" },
    { id: "kokoaDshShellTimeout", control: "moz-input-text", l10nId: "kokoa-dsh-shell-timeout" },
    { id: "kokoaDshShellMaxOut", control: "moz-input-text", l10nId: "kokoa-dsh-shell-maxout" },
    { id: "kokoaDshWebMaxUses", control: "moz-input-text", l10nId: "kokoa-dsh-web-maxuses" },
    { id: "kokoaDshWebBaseUrl", control: "moz-input-text", l10nId: "kokoa-dsh-web-baseurl" },
  ],
};

// ---------------------------- 组注册与挂载 ----------------------------

// ★ 2026-09-17：原先这两项是「Kokoa 面板」「状态条」开关 —— 面板已删，改为
//   **二级菜单项的显隐开关**（用户诉求 #5）。id 与上面的 addSetting 一一对应。
//   注：默认显示的两项（新标签页/新窗口）也列进来 —— 用户要的是「可配置」，
//   默认显示不等于不能关（与 KokoaMenubar.mjs 的注释一致）。



/**
 * dsh 通用设置（M2 拆分：主题 / 语言 / 默认权限 / 默认 agent preset）。
 * 真值在 $DSH_HOME/settings.yaml，经桥 /kokoa/dsh/settings 白名单读写（产品 Q1）。
 */
/**
 * dsh 通用设置（M2 拆分）—— 真值写 $DSH_HOME/settings.yaml（桥白名单）。
 * 这些是 **dsh 运行时偏好**，不是浏览器外观；浏览器主题在 Zen/外观设置里。
 */

/** dsh settings 白名单字段缓存（桥 GET / PUT）。 */




// Group DOM and initialization are owned by SettingPane.groupIds in build.py.
// This module registers settings/data only; it never appends setting-group nodes.

function cpaStartPolling() {
  if (cpaState.timer) {
    return;
  }
  // pane 每次被打开都会走 SettingPane.init() → notifyObservers("kokoa-pane-loaded")，
  // 观察者负责刷新；定时器兜底「观察者漏掉」与「桥晚于页面起来」，
  // 周期与 dsh 卡片一致（8s）。
  cpaState.timer = setInterval(() => {
    if (!cpaPanesMounted()) {
      return;
    }
    cpaRefreshStatus();
  }, 8000);
}

function cpaStopPolling() {
  if (cpaState.timer) {
    clearInterval(cpaState.timer);
    cpaState.timer = null;
  }
  if (cpaState.observer) {
    try {
      Services.obs.removeObserver(cpaState.observer, "kokoa-pane-loaded");
    } catch (e) {
      /* 观察者已不在也无需处理 */
    }
    cpaState.observer = null;
  }
}

/**
 * pane 装载钩子。\`SettingPane.init()\` 在 importPane 之后、groupIds 循环之前发
 * \`<paneId>-pane-loaded\`（setting-pane.mjs），此刻 pane 元素已在 #mainPrefPane 里
 * 此处只刷新数据；组元素和初始化顺序均由原生 SettingPane 管理。
 */
function cpaInstallPaneHook() {
  if (cpaState.observer) {
    return;
  }
  const observer = (subject, topic) => {
    try {
      // SettingPane owns group creation/init through its declared groupIds.
      cpaRefreshStatus();
      if (!cpaState.form) {
        cpaLoadConfig(false);
      }
      // 组 DOM 在 pane-loaded 之后才由 SettingPane.init 的 groupIds 循环建出，
      // 延迟一拍快照，作为「原生分组真实渲染」的落盘证据（kokoa.diag.enabled 时）。
      setTimeout(() => {
        try {
          const pane = document.querySelector('setting-pane[data-category="paneKokoa"]');
          const groups = pane
            ? [...pane.querySelectorAll("setting-group")].map(g => g.getAttribute("groupid")).join(",")
            : "";
          kokoaDiag.mark(
            "cpa.groups-dom",
            "groups=" + groups +
              " controls=" + (pane ? pane.querySelectorAll("setting-control").length : 0) +
              " dshStatus=" + (gKokoaDshStatusText || "")
          );
        } catch (e) { /* 证据失败不影响功能 */ }
      }, 300);
      kokoaDiag.mark("cpa.pane-loaded", "native-groups");
    } catch (e) {
      kokoaDiag.mark("cpa.pane-hook-fail", String((e && e.stack) || e));
    }
  };
  try {
    Services.obs.addObserver(observer, "kokoa-pane-loaded");
    cpaState.observer = observer;
  } catch (e) {
    kokoaDiag.mark("cpa.observer-fail", String(e));
  }
}

/* ---------------------------- 主体 ---------------------------- */

try {
  cpaRegisterSettings();
  kokoaDiag.mark(
    "15.cpa-settings",
    "ok; getSetting(kokoaCpaStatus)=" +
      (Preferences.getSetting("kokoaCpaStatus") ? "found" : "MISSING") +
      " getSetting(kokoaShellGroup-item)=" +
      (Preferences.getSetting("kokoaDshStatus") ? "found" : "MISSING")
  );
} catch (e) {
  kokoaDiag.mark("16.cpa-settings-fail", String((e && e.stack) || e));
}

// 幂等注册：必须写在 **window.SettingGroupManager**（main.js 的 initSettingGroup 用的
// 同一实例）。无论上面 Setting 注册是否成功，组都要挂上，否则 pane 为空。
(function registerKokoaGroupsOnce() {
  const groups = {
    kokoaShellGroup: KOKOA_SHELL_GROUP,
    kokoaDshPrefGroup: KOKOA_DSH_PREF_GROUP,
    kokoaDshSessionGroup: KOKOA_DSH_SESSION_GROUP,
    kokoaDshToolGroup: KOKOA_DSH_TOOL_GROUP,
    kokoaCpaStatusGroup: KOKOA_CPA_STATUS_GROUP,
    kokoaCpaUpstreamGroup: KOKOA_CPA_UPSTREAM_GROUP,
  };
  for (const id of Object.keys(groups)) {
    try {
      if (!SettingGroupManager.has(id)) {
        SettingGroupManager.registerGroup(id, groups[id]);
      }
    } catch (e) {
      kokoaDiag.mark("14.registerGroup-fail:" + id, String(e));
    }
  }
  try {
    // 确保 window 上就是我们注册用的那份（诊断/空白页排查用）
    if (typeof window !== "undefined") {
      window.SettingGroupManager = SettingGroupManager;
      window.Preferences = Preferences;
    }
  } catch (e) { /* ignore */ }
})();

kokoaDiag.mark(
  "14.registerGroups",
  "ok; has(kokoaShellGroup)=" +
    SettingGroupManager.has("kokoaShellGroup") +
    " has(kokoaDshPrefGroup)=" +
    SettingGroupManager.has("kokoaDshPrefGroup") +
    " has(kokoaCpaStatusGroup)=" +
    SettingGroupManager.has("kokoaCpaStatusGroup") +
    " has(kokoaCpaUpstreamGroup)=" +
    SettingGroupManager.has("kokoaCpaUpstreamGroup") +
    " winSGM=" +
    (typeof window !== "undefined" && window.SettingGroupManager === SettingGroupManager)
);

/* ---------------------------- 主题注入（W7） ---------------------------- */

/**
 * 把 Kokoa 主题样式注入设置页。
 * 与 theme.css 的设计变量一致，只覆盖 Kokoa pane 相关选择器。
 * 通过 pane 加载观察者触发，不负责创建设置分组。
 */
function injectKokoaThemeStyle() {
  const doc = document;
  if (doc.getElementById("kokoa-settings-theme")) {
    return; // 幂等
  }
  const style = doc.createElement("style");
  style.id = "kokoa-settings-theme";
  style.textContent = [
    /* 设计变量（与 theme.css 一致） */
    ":root {",
    "  --kokoa-accent: #4a7fd4;",
    "  --kokoa-accent-soft: rgba(74, 127, 212, 0.12);",
    "  --kokoa-bg-surface: #ffffff;",
    "  --kokoa-bg-elevated: #eef0f4;",
    "  --kokoa-text-primary: #1a1d23;",
    "  --kokoa-text-secondary: #5c6270;",
    "  --kokoa-border: rgba(0, 0, 0, 0.06);",
    "  --kokoa-border-strong: rgba(0, 0, 0, 0.1);",
    "  --kokoa-radius-md: 8px;",
    "  --kokoa-radius-lg: 10px;",
    "  --kokoa-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    "    --kokoa-accent: #6b9eef;",
    "    --kokoa-accent-soft: rgba(107, 158, 239, 0.15);",
    "    --kokoa-bg-surface: #252830;",
    "    --kokoa-bg-elevated: #2c303a;",
    "    --kokoa-text-primary: #e8eaed;",
    "    --kokoa-text-secondary: #9aa0ac;",
    "    --kokoa-border: rgba(255, 255, 255, 0.06);",
    "    --kokoa-border-strong: rgba(255, 255, 255, 0.1);",
    "  }",
    "}",

    /* Kokoa pane 容器 */
    'setting-pane[data-category="paneKokoa"] {',
    "  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', sans-serif;",
    "}",

    /* Kokoa 分组卡片 */
    'setting-pane[data-category="paneKokoa"] setting-group {',
    "  background: var(--kokoa-bg-surface);",
    "  border: 1px solid var(--kokoa-border);",
    "  border-radius: var(--kokoa-radius-lg);",
    "  padding: 12px 16px;",
    "  margin-block: 8px;",
    "  box-shadow: var(--kokoa-shadow-sm);",
    "}",

    /* 分组标题 */
    'setting-pane[data-category="paneKokoa"] setting-group [data-l10n-id] {',
    "  color: var(--kokoa-text-primary);",
    "}",

    /* 复选框行 */
    'setting-pane[data-category="paneKokoa"] moz-checkbox {',
    "  padding-block: 4px;",
    "}",

    /* 输入框 */
    'setting-pane[data-category="paneKokoa"] moz-input-text,',
    'setting-pane[data-category="paneKokoa"] moz-textarea {',
    "  border-radius: var(--kokoa-radius-md);",
    "  border-color: var(--kokoa-border-strong);",
    "}",

    /* 按钮 */
    'setting-pane[data-category="paneKokoa"] moz-button {',
    "  --moz-button-border-radius: var(--kokoa-radius-md);",
    "}",

    /* 状态行（moz-box-item） */
    'setting-pane[data-category="paneKokoa"] moz-box-item {',
    "  padding-block: 4px;",
    "  color: var(--kokoa-text-secondary);",
    "}",

    /* 强调色用于活动元素 */
    'setting-pane[data-category="paneKokoa"] moz-checkbox[checked] {',
    "  accent-color: var(--kokoa-accent);",
    "}",
  ].join("\n");
  (doc.head || doc.documentElement).appendChild(style);
  kokoaDiag.mark("theme.injected", "ok");
}

// 在 pane 加载时注入主题
try {
  Services.obs.addObserver({
    observe: function () {
      try {
        injectKokoaThemeStyle();
      } catch (e) {
        kokoaDiag.mark("theme.inject-ERR", String(e));
      }
    },
  }, "kokoa-pane-loaded");
  // 也立即尝试注入（pane 可能已加载）
  if (document.querySelector('setting-pane[data-category="paneKokoa"]')) {
    injectKokoaThemeStyle();
  }
} catch (e) {
  kokoaDiag.mark("theme.observer-ERR", String(e));
}
