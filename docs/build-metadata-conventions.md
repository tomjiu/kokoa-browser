# 构建元数据的约定（踩了 5 次坑后系统整理）

> 2026-09-15。这轮我在构建元数据上连续踩了 5 次坑。
> **每一次都是「本地能查、CI 才发现」** —— 所以本文把这些约定写清。

---

# 一、五次踩坑（按发生顺序）

| # | 错 | 现象 | 代价 | 现在有检查吗 |
|---|---|---|---|---|
| 1 | 模块注册用 `jar.inc.mn` 的 `chrome://` | 无先例（尚未出错） | 0（查先例后改对） | — |
| 2 | patch 末尾缺换行 | `corrupt patch at :13` | 一次构建（13 分钟） | ✅ `check_patches` |
| 3 | `jar.mn` 文件目录不对 | `File not found` | 一次构建（2h39m） | ✅ `check_jarmn` |
| 4 | `moz.build` 子目录没登记 DIRS | 模块**没进产物**（构建仍成功！） | 一次构建（3h） | ✅ `check_mozbuild_dirs` |
| 5 | `moz.build` 列表没按字母序 | `UnsortedError` | 一次构建（12 分钟） | ✅ `check_mozbuild_dirs` |

**共同点**：都是【形式要求】，不是逻辑错误；**本地都能查**。

---

# 二、各类元数据的约定

## 2.1 注册 JS 模块：`moz.build` 的 `EXTRA_JS_MODULES.zen`

```python
# src/zen/kokoa/moz.build
EXTRA_JS_MODULES.zen += [
    "KokoaAiPanel.mjs",          # 【必须按字母序】否则 UnsortedError
    "KokoaAiSplit.mjs",
    "KokoaDshSidecar.mjs",
    "KokoaWorkspaceSessions.mjs",
]
```

**效果**：注册为 `resource:///modules/zen/<名字>`，用 `ChromeUtils.importESModule` 导入。

**★ 两个必须满足的条件**：

```
① 列表按字母序（mozbuild 强制）
② 该子目录必须登记在【父级 moz.build 的 DIRS】里：

     # src/zen/moz.build
     DIRS += [
         "boosts", "common", ..., "kokoa", ...   <- 漏了就不会被构建
     ]
```

**第 ② 条最隐蔽**：漏了不报错，只是**模块不会进产物**。
（构建成功、Package 成功，只有读 `omni.ja` 才发现。）

## 2.2 注册 chrome:// 资源：`jar.mn`

```makefile
# 两种形式，语义完全不同：

content/browser/preferences/zen-settings.js
  ↑ 没有 (源路径) —— jar.mn 从【自己所在目录】找文件
     即 browser/components/preferences/zen-settings.js

content/browser/preferences/widgets/update-state.mjs   (widgets/update-state/update-state.mjs)
  ↑ 有 (源路径) —— 相对 jar.mn 所在目录
```

**我踩的坑**：抄了「没有源路径」的写法，却把文件放到了 `src/zen/kokoa/`。

## 2.3 patch 文件

```
① 必须【以换行结尾】（缺了 git apply 报 corrupt）
② hunk 头的行数要与实际一致（old/new 两侧分别数）
③ hunk 里的【上下文行】必须能在【目标文件】里找到
④ 上下文要用【构建时】的版本 —— 即 Zen patch 应用【之后】的
⑤ ★ hunk 头 @@ 【前面不能有空行】（空行会让 git 报 patch fragment without header）
```

## 2.4 ★ 五条规则各由什么保证（2026-09-16 补）

| 规则 | 谁来保证 |
|---|---|
| ① 末尾换行 | `check.sh patches`（第 2 道检查） |
| ② 行数自洽 | `check.sh patches`（第 1 道检查） |
| ③ 上下文存在 | **`scripts/preflight-patches.py`**（真实 `git apply --check`） |
| ④ 版本正确 | 同上（它会先比对 `index` 行的 blob 哈希） |
| ⑤ 无空行 | `check.sh patches`（第 3 道检查，2026-09-16 加） |

### preflight-patches.py 怎么做到「真预检」

```
patch 的 index 行带着原始文件的 blob 哈希：
    index 017125bc2510e5f5e317a5e78c40d6aa9ded76ca..d343d8c6...

所以脚本可以：
  1. 从 GitHub 拉那个文件（按引擎版本对应 tag，如 FIREFOX_156_0_RELEASE）
  2. 算它的 blob 哈希，与 index 的 pre-image 比
  3. 一致 -> 拿到了【一模一样的原始文件】
          -> 建临时 git 仓库，真跑 git apply --check（与 CI 同参数）

哈希不一致时【跳过】而不是报失败（引擎版本可能略有差异，
或目标文件先被别的 patch 改过）。跳过的会在输出里标明。
```

**用法**：

```bash
python scripts/preflight-patches.py                      # 全部
python scripts/preflight-patches.py <patch> [<patch>...] # 指定
```

### 为什么需要 ③ 和 ⑤（两个真实事故）

```
事故 A（构建 34985728054）：patch 末尾缺换行
    -> error: corrupt patch at ...:13
    当天加了检查 ①。

事故 B（构建 35093838416，只跑 7 分钟就挂）：@@ 前面多一个空行
    -> error: patch fragment without header at ...:20: @
    hunk 行数【完全正确】、文件【以换行结尾】—— ①② 都放行了。
    当天加了检查 ⑤。

同一次还发现：上下文里少写了几个字符（复制时被截断）
    -> error: patch does not apply
    这类只有【真预检】能抓（③）。
    为此写了 scripts/preflight-patches.py。
```

**关于 ④**（容易搞错）：

```
我们的 src/ 覆盖会【替换】Zen 的同名 patch。
所以：
  我们 patch 的 - 行 = Firefox 原文（不是 Zen 改后的）
  我们 patch 的 + 行 = 我们的最终结果

例：preferences-js.patch 里，Zen 把条件改成：
  if (template && (!srdSectionPrefs.all || categoryName.startsWith("paneZen")))
我们【又改了一层】，但要【保留 Zen 的条件】：
  if (
    template &&
    (!srdSectionPrefs.all ||
      categoryName.startsWith("paneZen") ||      <- 保留 Zen 的
      categoryName.startsWith("paneKokoa"))       <- 加我们的
  ) {

=> 【取上游 + 加自己】，而不是从 Firefox 原文重写。
```

---

# 三、`check.sh` 的 10 项检查（其中 4 项是这轮买的）

| 检查 | 抓什么 |
|---|---|
| `syntax` | JS/MJS 语法 |
| `json` | JSON 合法性 |
| `prefs` | pref 一致性 |
| `l10n` | 文案键缺失 |
| `brands` | 品牌残留 |
| `patches` | ★ hunk 行数 + **末尾换行** |
| `jarmn` | ★ jar.mn 注册的文件是否存在 |
| `mozbuild_dirs` | ★ DIRS 登记 + **列表字母序** |
| `mozconfig` | 非法 project_flag export |

**每一项都做过双向验证**（故意破坏 → FAIL；恢复 → OK）。

---

# 四、我该改的工作方式

```
我之前的做法：
  看到一个例子 -> 照抄 -> 跑 check.sh -> 排构建 -> 等 3 小时

问题：
  · 例子可能【不完整】（我只抄了「写法」，没注意「配套位置」）
  · check.sh 的覆盖【滞后于踩坑】（每次都是踩了才加）

更好的做法：
  1. 照抄之前，先问「这个例子还有哪些【隐含前提】？」
     例：jar.mn 那行没有 (源路径) —— 隐含前提是「文件在同目录」
  2. 加新文件后，【主动】核对它在构建系统里的所有登记点
     JS 模块：moz.build 的列表 + 父级 DIRS + 字母序
     chrome 资源：jar.mn 的条目写法 + 文件位置
     patch：行数 + 换行 + 上下文 + 上游版本
  3. 能本地跑的命令【都跑一遍】
     git apply --check（patch）
     bash scripts/check.sh all
     必要时手工 grep 产物
```

# 五、一条最实用的自检

```
【改动后问自己：这个改动依赖哪些「别的文件/别的目录」？】

  · 新加 .mjs  -> 依赖 moz.build 列表 + 父级 DIRS
  · 新加 .js   -> 依赖 jar.mn 条目 + 文件位置
  · 改 patch   -> 依赖 行数/换行/上下文/上游版本

  这些【都不是文件自己内部的正确性】，而是它与【构建系统】的关系。
  我踩的 5 次坑，全是这一类。
```
