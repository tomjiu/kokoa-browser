# 工作项：Kokoa 设置页（TASK-06 落地）

> 🗄️ **本文是历史工作项（XUL 模板路线）**：文中 `kokoa-settings.js` / `kokoaSettings.inc.xhtml` /
> `register_module("paneKokoa", gKokoaSettings)` 这套做法**已于 2026-09-19 退役** ——
> 设置页改为 Firefox 自己的 config pane 体系，且所有权从主线 overlay 迁回本仓。
> 现行做法见 `phase1-settings-pane-migration.md` 与 `src/browser/components/preferences/config/kokoa.mjs`。
> 本文保留是为了记录当时的坑（jar.mn 源路径、data-category、l10n 形态等，多数仍然成立）。

> 依据：TASK-06（312 行，验收方已核验 4/4 命中 + 1 个真陷阱）
> 目的：把「调研结论」变成「照做即可的步骤」。

---

# ★ 一个必须先讲清的流程问题

**TASK-06 的 MVP 第 3 步写的是 `npm run import && npm run build`（本地构建）——
对我们不适用。我们的构建在 CI 上，一次 3 小时。**

更重要的是 TASK-06 自己指出的一条**流程**（原文 L234）：

```
注意：这是 patch 文件。正确流程是改 engine 里的 preferences.xhtml 后
      npx surfer export browser/components/preferences/preferences.xhtml 生成补丁
```

**「不要直接手写 patch」** —— 这正是外部代理手写 patch 出错的根因
（hunk 行数不符 -> corrupt patch -> 白费一次 3 小时构建）。

**所以本工作项的每个步骤都要说明：改源码文件，还是改 patch？**

---

# 一、目标

在 `about:preferences` 里出现一个 **Kokoa 分类**，放我们的设置
（外壳开关、CPA 模型管理、AI 工作区偏好）。

# 二、要新增的 4 个文件（**都是源码文件，不是 patch**）

| 路径 | 作用 |
|---|---|
| `src/browser/components/preferences/kokoaSettings.inc.xhtml` | 面板本体（`<html:template id="template-paneKokoa">`） |
| `src/kokoa/preferences/kokoa-settings.js` | 逻辑对象 `gKokoaSettings`，至少要有 `init()` |
| `locales/en-US/browser/browser/preferences/kokoa-preferences.ftl` | 文案 |
| `locales/zh-CN/.../kokoa-preferences.ftl` | 中文文案（别忘这个） |

> 样式可选。**如果要加，路径要符合 Zen 的 jar 映射规则**（见 TASK-04）。

# 三、要改的既有文件（**关键：分清是改源码还是改 patch**）

## 3.1 patch 类（**要用 surfer export 生成，不要手写**）

| 文件 | 改什么 |
|---|---|
| `preferences-xhtml.patch` | ① nav 按钮（L37 后、L38 `category-sync` 前）② `#include kokoaSettings.inc.xhtml`（L48 后） |
| `preferences-js.patch` | ① `register_module("paneKokoa", gKokoaSettings);`（L38 后）② **template 展开条件**（见下） |
| `main-js.patch` L31 | Localization 数组加 `"browser/preferences/kokoa-preferences.ftl"` |
| `jar-mn.patch` L10 | 若新建 .js，登记 `content/browser/preferences/kokoa-settings.js` |

**做法**：改 `engine/` 里的对应原文件 -> `npx surfer export <路径>` -> 生成 patch。

## 3.2 源码类

| 文件 | 改什么 |
|---|---|
| `src/browser/components/preferences/zen-preferences-links.xhtml` | 加 `<link rel="localization" href="browser/preferences/kokoa-preferences.ftl"/>` |

# 四、★ TASK-06 发现的真陷阱（**已核验**）

`preferences-js.patch` **L27** 的 template 展开条件是：

```
if (template && (!srdSectionPrefs.all || categoryName.startsWith("paneZen"))) {
```

**我们的分类如果叫 `paneKokoa`，这个条件不会命中，面板就不会展开。**

TASK-06 给了两个解法：

```
a) 改条件，加上 || categoryName.startsWith("paneKokoa")
b) 【它认为更省事】分类名直接叫 paneZenKokoa，复用现有条件，少改一行
   代价：命名上挂在 Zen 命名空间下
```

**我倾向 (a)**，理由：

```
- 我们是在做【自己的产品分支】，把 Kokoa 命名为 paneZenKokoa 是技术债
- 改一行条件的代价，远小于长期命名混乱
- 而且改条件后，将来加更多 Kokoa 面板也更自然

> 但这是**我的判断，不是实测结论**。如果时间紧，(b) 也完全可行。

# 五、实施顺序（**按风险从低到高**）

## 第 1 步：最小可见（**先验证机制，不写业务**）

```
1. 建 kokoaSettings.inc.xhtml（只放一个 checkbox，写死不用逻辑）
2. 建 en-US + zh-CN 的 ftl（两个 key：分类标题、那个 checkbox）
3. 改 preferences-xhtml.patch 与 preferences-js.patch（含 template 条件）
4. 加 localization link
5. bash scripts/check.sh  <- 必须过（含 patch 自洽性与 mozconfig 检查）
6. 排 CI 构建（3 小时）
7. 打开 about:preferences，看 Kokoa 分类在不在、展开是否正常

**这一步只验证「机制通不通」，不碰任何业务逻辑。**

## 第 2 步：接 `gKokoaSettings.init()` 与真实设置项

## 第 3 步：CPA 模型管理搬进来（那是主线已有的实现，可直接参考）

# 六、风险

| 风险 | 应对 |
|---|---|
| patch 手写会 corrupt | **用 surfer export 生成**；check.sh patches 会拦 |
| template 条件不命中 -> 面板空白 | 第一步就要验证展开 |
| ftl 缺 key -> 文案显示成 key 本身 | check.sh l10n 会查（我们的文件缺 key 报 FAIL） |
| 每次验证要等 3 小时构建 | 第一步尽量小；静态检查前置 |

# 七、我没查清的

```
❓ npx surfer export 的确切用法（TASK-06 只说「改 engine 后 export」）
❓ 若新建 kokoa-settings.js，jar-mn.patch 的确切改法（TASK-06 给了行号但没给上下文）
❓ Kokoa 的 CPA 设置目前在哪（主线）—— 还没看，迁移时要对照
```
