# Kokoa 设置页（pane）是怎么接起来的 —— 以及两个必须同时满足的条件

（2026-09-16 写。起因：Kokoa 设置页一直「空白 + 闪烁」，还被看到
「内容跑到账户与同步那一栏」。根因是**一个属性没写**。）

# 一、完整链路

1. **导航按钮** — `src/browser/components/preferences/preferences-xhtml.patch`
   ```xml
   <html:moz-page-nav-button id="category-kokoa" view="paneKokoa" data-l10n-id="pane-kokoa-title"/>
   ```
   `view` 的值 `paneKokoa` 就是**面板的内部名**，下面每一步都用它。

2. **include** — 同一个 patch 末尾：`#include kokoaSettings.inc.xhtml`。
   位置在 `#mainPrefPane` 内、其它 pane template 之后。产物实测：
   `template-paneKokoa`(L2052) 与 `template-paneSync`(L1474)、
   `template-paneZenMarketplace`(L1990) 平级，祖先链 =
   `html > html:body > stack#preferences-stack > hbox > vbox.main-content >
   vbox.pane-container > vbox#mainPrefPane`。

3. **注册模块** — `src/browser/components/preferences/preferences-js.patch`
   ```js
   register_module("paneKokoa", gKokoaSettings);
   ```
   `register_module` 只登记，**点导航时**才 `init()`。

4. **展开 template** — Firefox 的 `register_module`（产物 preferences.js L517-552）：
   ```js
   let template = document.getElementById("template-" + categoryName);
   if (template && (!srdSectionPrefs.all || categoryName.startsWith("paneZen")
                    || categoryName.startsWith("paneKokoa"))) {   // ← 这段是我们加的
     template.replaceWith(template.content);   // ★ 顶层节点变成 #mainPrefPane 的直接子节点
   }
   ```

5. **★ 显示/隐藏** — 同一个 `gotoPref()` 里，`init()` 之后**紧接着**
   （产物 preferences.js L936 / L952 / L995-1012）：
   ```js
   categoryInfo.init();
   ...
   search(category, "data-category");

   function search(aQuery, aAttribute) {
     for (let element of document.getElementById("mainPrefPane").children) {
       if (element.getAttribute(aAttribute) == aQuery) element.hidden = false;
       else element.hidden = true;
     }
   }
   ```
   → **template 里每个顶层节点都必须写 `data-category="paneKokoa"`。**

# 二、两个陷阱（缺一个就是白板）

## 陷阱 1（真正让我们空白了三轮）：顶层节点漏写 data-category

- 漏写 → 展开后被 `search()` 立刻 `hidden = true` → **右侧空白**
  （中间有一帧 → **闪烁**）。
- 如果某次路径没走到 `search()`（`return` 在它前面，或没重新导航），
  这些节点就**一直不隐藏**，留在 `#mainPrefPane` 顶部 →
  看起来"挂在别的分类上"。用户看到的「出现在账户与同步那一栏」就是这个。
- 为什么恰好是「账户与同步」：`browser.settings-redesign.enabled` 在 Zen 里是
  **true**（`prefs/firefox/browser.yaml` L83），redesign 下默认类别
  `kDefaultCategoryInternalName = "paneSync"`（preferences.js L749）。

正确写法（照 Zen：产物 L1870/L1874 一带）：
```xml
<hbox    class="subcategory" hidden="true" data-category="paneKokoa">…</hbox>
<groupbox                  hidden="true" data-category="paneKokoa">…</groupbox>
```
`hidden="true"` 也要写：`search()` 只负责把匹配的改回 `false`，
不写的话它跑到之前会露出来。

## 陷阱 2：template 展开条件要放行 paneKokoa

见第 4 步。不改条件 → 连展开都不会发生（也是空白，但连闪都不闪）。

# 三、守卫（秒级，不用等 3 小时构建）

| 检查 | 位置 | 查什么 |
|---|---|---|
| `bash scripts/check.sh panes` | `scripts/check-pane-data-category.py` | `src/` 下每个 `template-pane*` 的顶层节点是否都带正确的 `data-category`（顺带警告漏写 `hidden`） |
| `python scripts/check-artifact.py <产物目录>` 第 7 项 | 产物的 `preferences.xhtml` | 产物里 `template-paneKokoa` 的顶层节点是否都带 `data-category="paneKokoa"` |

两个都做过**故意破坏验证**：把 `data-category` 删掉 → 检查报 FAIL（删之前误报 0）。
对旧产物（35096636452，修之前构建的）第 7 项精确报出
`3 个顶层节点漏/错: hbox,groupbox,groupbox`。

# 四、排查时不要再犯的两条

1. **不要改用户配置目录的 `prefs.js` 来"做实验"** —— 排查欢迎页那次我把它删了，
   连带清掉 `zen.welcome-screen.seen` 等记录，症状反而"加重"（又冒出欢迎页和默认浏览器提示）。
2. **不要用旧产物验证新代码** —— 先确认标的 commit 是产物 headSha 的祖先
   （`git merge-base --is-ancestor <commit> <headSha>`）。见 `testing-pitfalls.md` 第十节。
