// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import checkForZenUpdates, {
  createWindowUpdateAnimation,
  playWindowSweepAnimation,
} from "chrome://browser/content/ZenUpdates.mjs";

class ZenStartup {
  #watermarkIgnoreElements = ["zen-toast-container", "zen-browser-background"];
  #hasInitializedLayout = false;

  isReady = false;
  promiseInitialized = new Promise(resolve => {
    this.promiseInitializedResolve = resolve;
  });

  init() {
    this.openWatermark();
    this.#zenInitBrowserLayout();
  }

  get #shouldUseWatermark() {
    return (
      Services.prefs.getBoolPref("zen.watermark.enabled", false) &&
      gZenWorkspaces.shouldHaveWorkspaces
    );
  }

  #zenInitBrowserLayout() {
    if (this.#hasInitializedLayout) {
      return;
    }
    this.#hasInitializedLayout = true;
    gZenKeyboardShortcutsManager.beforeInit();
    try {
      const kNavbarItems = ["nav-bar", "PersonalToolbar"];
      const kNewContainerId = "zen-appcontent-navbar-container";
      let newContainer = document.getElementById(kNewContainerId);
      for (let id of kNavbarItems) {
        const node = document.getElementById(id);
        if (!node) {
          console.error("Could not find node with id: " + id);
          continue;
        }
        newContainer.appendChild(node);
      }
      // Fix notification deck
      const deckTemplate =
        document.getElementById("tab-notification-deck-template") ||
        document.getElementById("tab-notification-deck");

      // overlap and interaction issues with vertical tabs
      document.getElementById("browser").prepend(deckTemplate);

      gZenWorkspaces.init().then(() => {
        gZenUIManager.init();
        this.#initUIComponents();
        this.#checkForWelcomePage();

        // 【Kokoa 2026-09-15】工作区与会话的联动。
        //
        // 为什么放这里：gZenWorkspaces.init() 完成后工作区才就绪，
        // 那时注册 addChangeListeners 才拿得到完整的 workspace 对象。
        // 钩子本身的说明见 src/zen/kokoa/KokoaWorkspaceSessions.mjs。
        try {
          const { initWorkspaceSessionBinding } = ChromeUtils.importESModule(
            "resource:///modules/zen/KokoaWorkspaceSessions.mjs"
          );
          initWorkspaceSessionBinding();
        } catch (e) {
          // 不致命：联动失败不该影响浏览器启动
          console.error("[Kokoa] 初始化工作区会话联动失败: " + e);
        }

        // 【Kokoa 2026-09-19】内建 about: 页面（about:kokoa / about:kokoases）。
        //
        // 【为什么这里再注册一次】about 协议是进程级且幂等，早注册只有好处：
        //   zen-sets.js 那次在**窗口脚本加载**时才跑，实测「命令行直接把
        //   about:kokoa 当启动 URL」会失败 —— 首个标签的 URL 解析早于窗口脚本。
        //   产品路径其实不依赖它（启动门面 KokoaStartup 是注册之后才开首页的），
        //   这里补一次是为了让「用户手输 about:kokoa」「启动 URL 就是它」也稳。
        //   说明与验收见 docs/phase2-about-pages.md。
        try {
          const { registerKokoaAboutPagesNow } = ChromeUtils.importESModule(
            "resource:///modules/zen/KokoaAboutPages.mjs"
          );
          const r = registerKokoaAboutPagesNow();
          if (!r.ok) {
            console.error("[Kokoa] about 页面注册失败: " + r.log.join(" / "));
          }
        } catch (e) {
          console.error("[Kokoa] about 页面注册抛错: " + e);
        }
      });
    } catch (e) {
      console.error("ZenThemeModifier: Error initializing browser layout", e);
    }
    if (gBrowserInit.delayedStartupFinished) {
      this.delayedStartupFinished();
    } else {
      Services.obs.addObserver(this, "browser-delayed-startup-finished");
    }
  }

  observe(aSubject, aTopic) {
    // This nsIObserver method allows us to defer initialization until after
    // this window has finished painting and starting up.
    if (aTopic == "browser-delayed-startup-finished" && aSubject == window) {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
      this.delayedStartupFinished();
    }
  }

  delayedStartupFinished() {
    gZenWorkspaces.promiseInitialized.then(async () => {
      await delayedStartupPromise;
      await SessionStore.promiseAllWindowsRestored;
      delete gZenUIManager.promiseInitialized;
      gZenCompactModeManager.init();
      // Fix for https://github.com/zen-browser/desktop/issues/7605, specially in compact mode
      if (gURLBar.hasAttribute("breakout-extend")) {
        gURLBar.focus();
      }
      // A bit of a hack to make sure the tabs toolbar is updated.
      // Just in case we didn't get the right size.
      gZenUIManager.updateTabsToolbar();
      this.closeWatermark();
      document
        .getElementById("tabbrowser-arrowscrollbox")
        .setAttribute("orient", "vertical");
      this.isReady = true;
      this.promiseInitializedResolve();
      delete this.promiseInitializedResolve;

      setTimeout(() => {
        // Wait for the natural PlacesToolbar rebuild before invalidating, so
        // the two async rebuilds don't interleave and duplicate bookmarks.
        // promiseRebuilt() returns undefined when no rebuild is in flight.
        const rebuilt =
          document
            .getElementById("PlacesToolbar")
            ?._placesView?.promiseRebuilt() ?? Promise.resolve();
        rebuilt
          .catch(console.error)
          .then(() => gZenWorkspaces._invalidateBookmarkContainers());
      });
    });
  }

  openWatermark() {
    if (!this.#shouldUseWatermark) {
      document.documentElement.removeAttribute("zen-before-loaded");
      return;
    }
    for (let elem of document.querySelectorAll(
      `#browser > *:not(${this.#watermarkIgnoreElements.map(id => "#" + id).join(", ")}), #urlbar`
    )) {
      elem.style.opacity = 0;
    }
  }

  closeWatermark() {
    document.documentElement.removeAttribute("zen-before-loaded");
    if (this.#shouldUseWatermark) {
      let elementsToIgnore = this.#watermarkIgnoreElements
        .map(id => "#" + id)
        .join(", ");
      gZenUIManager.motion
        .animate(
          "#browser > *:not(" +
            elementsToIgnore +
            "), #urlbar, #tabbrowser-tabbox > *",
          {
            opacity: [0, 1],
          },
          {
            duration: 0.1,
          }
        )
        .then(() => {
          for (let elem of document.querySelectorAll(
            "#browser > *, #urlbar, #tabbrowser-tabbox > *"
          )) {
            elem.style.removeProperty("opacity");
          }
        });
    }
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new window.Event("resize")); // To recalculate the layout
    });
  }

  #initUIComponents() {
    const kUIComponents = ["ZenProgressBar", "ZenSpaceRoutingNavigation"];
    for (let component of kUIComponents) {
      const module = ChromeUtils.importESModule(
        "resource:///modules/zen/ui/" + component + ".sys.mjs"
      );
      new module[component](window);
    }
  }

  #checkForWelcomePage() {
    const kWelcomeScreenSeenPref = "zen.welcome-screen.seen";
    if (Services.env.get("MOZ_HEADLESS")) {
      Services.prefs.setBoolPref(kWelcomeScreenSeenPref, true);
      return;
    }
    if (!Services.prefs.getBoolPref(kWelcomeScreenSeenPref, false)) {
      Services.prefs.setBoolPref(kWelcomeScreenSeenPref, true);
      Services.prefs.setStringPref(
        "zen.updates.last-build-id",
        Services.appinfo.appBuildID
      );
      Services.prefs.setStringPref(
        "zen.updates.last-version",
        Services.appinfo.version
      );
      Services.scriptloader.loadSubScript(
        "chrome://browser/content/zen-components/ZenWelcome.mjs",
        window
      );
    } else {
      this.#createUpdateAnimation();
    }
  }

  async #createUpdateAnimation() {
    checkForZenUpdates();
    return await createWindowUpdateAnimation();
  }

  /**
   * Entry point for privileged modules (e.g. the sync applier) to play the
   * update sweep animation in this window.
   */
  playWindowSweepAnimation() {
    return playWindowSweepAnimation();
  }
}

window.gZenStartup = new ZenStartup();

window.addEventListener(
  "MozBeforeInitialXULLayout",
  () => {
    gZenStartup.init();
  },
  { once: true }
);
