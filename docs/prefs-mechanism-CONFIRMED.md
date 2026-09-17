# ✅ prefs/*.yaml 机制【终于查清】—— 我之前两次判断都错了

> 2026-09-15。**撤回 `docs/howto-mechanism-error.md` 与 `docs/prefs-mechanism-and-residue.md` 的相关结论。**

---

# 一、正确答案（**有 CI 日志 + 源码双重证据**）

```
链路：
  prefs/{firefox,zen,privatefox,fastfox}/*.yaml
       |  tools/ffprefs（Rust 程序，Zen 改造过）
       v
  engine/browser/app/profile/zen.js          <- 动态 pref
  engine/modules/libpref/init/zen-static-prefs.inc   <- 静态 pref
       |  ffprefs 在 firefox.js 末尾加一行：
       |     #include zen.js
       v
  Firefox 构建 -> omni.ja 的 defaults/preferences/firefox.js
```

## 证据 A：CI 日志

```
L15709  Running `target/debug/ffprefs ../../`
L15710  Writing preferences to:
L15711  Static:  .../engine/modules/libpref/init/zen-static-prefs.i
L15712  Dynamic: .../engine/browser/app/profile/zen.js
```

## 证据 B：源码 `tools/ffprefs/src/main.rs`

```
L110  const STATIC_PREFS: &str = "../engine/modules/libpref/init/zen-static-prefs.inc";
L112  const DYNAMIC_PREFS: &str = "../engine/browser/app/profile/zen.js";
L139  fn get_prefs_files_recursively(dir, files)
L147      if ext == "yaml" || ext == "yml" { files.push(path); }
L304  // Add `#include zen.js` to the bottom of the firefox.js file if it doesn't exist
L305  let line = "#include zen.js";
L363  fn main() {
L372    prepare_zen_prefs();
L373    let mut preferences = load_preferences();
L375    write_preferences(&preferences);
```

# 二、我错了两次，怎么错的

## 第一次错：说「经 tools/ffprefs 编译」是错的

**我读的是 `tools/ffprefs/src/main.rs` 的【头部注释】**（L5-L41），
那里写着 `cpptype` / `mirror` / `lang` 字段要求 —— **那是 Firefox 原版 StaticPrefs 的说明。**

**我没往下读代码主体**（L110 之后才是 Zen 改造的逻辑）。

```
于是我看到 prefs/*.yaml 只有 name/value（没有 cpptype），
就推断「格式不匹配，不可能是它的输入」—— 【结论下得太早】。
```

**实际上 Zen 改造后的 ffprefs 就是读 name/value 的 YAML。**

## 第二次错：其实是对的，但我又绕回来了

我在 `prefs-mechanism-and-residue.md` 里写「prefs/*.yaml 的内容被合并进 firefox.js」，
那【方向是对的】，但我把它归因于「某个未确认的工具」。

**现在确认：那个工具就是 `tools/ffprefs`，路径是 `zen.js` + `#include`。**

# 三、附带确认：有一条残留

```
engine/browser/app/profile/zen.js      <- 文件名是 zen
engine/modules/libpref/init/zen-static-prefs.inc  <- 文件名是 zen

这两个是【构建期生成】的，源码树里没有。
用户看不到（在 engine/ 里），但如果要彻底贴牌，这是两个点。
改动方式：tools/ffprefs/src/main.rs 的 L110/L112 常量。
```

# 四、教训（第三次了）

```
1. 【不要只读文件头部就下结论】
   我读了 main.rs 的注释（那是 Firefox 原版说明），没读代码。
   -> 注释可能过时、可能是上游遗留，【代码才是事实】。

2. 【「格式不匹配」这种推断要谨慎】
   我看到 cpptype 字段缺失就断定「不是它的输入」，
   但代码可能已经被改造过（Zen fork 了它）。
   -> 应该直接看【读取逻辑】，而不是看注释里的字段要求。

3. 这是我在这个项目里第 3 次因为【只看了一部分】而误判：
     1) MOZ_APP_VENDOR 的 default 管 Vendor      -> 产物证明不管
     2) application.ini 来自 Firefox 模板        -> URL 格式对不上
     3) tools/ffprefs 不处理 prefs/*.yaml        -> 实际处理（这次）

   第 3 次尤其可惜：**答案就在同一个文件里，我读了前 60 行就下结论，
   而真相在 L110。**
```

# 六、★ 同名覆盖：为什么「pref 写对了却不生效」（2026-09-17 补）

本文机制的直接推论，但直到**产物核对**才被抓住 —— 它让一次用户可见的修复白做了一轮。

## 事故

用户报「启动又出现固定任务栏通知 + 初始设置页」。我在 `prefs/kokoa/branding-behavior.yaml`
里加了 6 条 pref（含 `zen.welcome-screen.seen: true`），本地与 CI 全绿。
构建 35163254400 的产物核对却显示：

```
defaults/preferences/firefox.js
  L1860  pref("zen.welcome-screen.seen", true);    <- prefs/kokoa/（我们的）
  L1862  pref("zen.welcome-screen.seen", false);   <- prefs/zen/welcome.yaml（@cond 展开）
```

**关键那条被吃了** —— 欢迎页照常出现。当时文档把它误记成「默认层静默失效」，真因不是。

## 机制（`tools/ffprefs/src/main.rs`）

```
L139-154  get_prefs_files_recursively()   递归收集 prefs/**/*.yaml
          —— fs::read_dir 的结果【没有排序】-> 遍历顺序没有保证（跨文件系统可能不同）
L133-136  ordered_prefs(): prefs.sort_by(|a,b| a.name.cmp(&b.name))
          —— Rust 的 sort_by 是【稳定排序】-> 同名条目保持上面的遍历序
          输出 -> engine/browser/app/profile/zen.js（被 #include 在 firefox.js 末尾）
prefs 引擎：后定义覆盖前定义（last wins）
```

→ 同一条 pref 写两遍时，**谁赢取决于目录遍历顺序**：既反直觉，又跨文件系统不确定。
我们那条恰好 `kokoa/` 在 `zen/` 之前 → 必输。

## 为什么 `@cond` 出的是 false

`prefs/zen/welcome.yaml` 原本是 `value: "@cond"` + `condition: "!defined(MOZILLA_OFFICIAL)"`。
ffprefs（L234-243）把 `@cond` 展开成：

```
#if !defined(MOZILLA_OFFICIAL)
pref("zen.welcome-screen.seen", true);
#else
pref("zen.welcome-screen.seen", false);
#endif
```

**我们的构建是 official**（产物里留下的是 `false`）→ 走 `#else`。
顺带：这条上的 `sticky: true` 在 `@cond` 分支里**从来没生效**（那条路径不带第三参数）。

## 修法与守卫

- **修法：同一条 pref 只在一处定义。** 这次把 `zen.welcome-screen.seen` 改到它的权威位置
  `prefs/zen/welcome.yaml`（无条件 `true`），并从 `prefs/kokoa/` 删掉 3 条同值重复。
- **守卫**：`scripts/check-pref-shadowing.py`（`bash scripts/check.sh prefs-shadow`，已并入 `all`）
  —— `prefs/kokoa/` 里出现同名覆盖即 FAIL。静态看不出 `condition`，所以上游同名降级为 WARN
  （例如 mods.yaml 的 `zen.injections.match-urls` 两条是**条件互斥**，无害）。
- **本地验证配方（不用等 3 小时构建）**：在沙箱里跑**真生成器**看 zen.js 的最终取值。

  ```bash
  lab=/tmp/lab; rm -rf $lab; mkdir -p $lab/tools
  cp -r prefs $lab/
  cp -r tools/ffprefs $lab/tools/
  mkdir -p $lab/engine/browser/app/profile $lab/engine/modules/libpref/init
  echo '// sandbox' > $lab/engine/browser/app/profile/firefox.js
  (cd $lab/tools/ffprefs && cargo run --quiet --bin ffprefs -- $lab)
  grep -n "zen.welcome-screen.seen" $lab/engine/browser/app/profile/zen.js
  ```

  本次实测：修复前 3 条（`true` / `#if` 分支 `true` / `#else` 分支 `false`），
  修复后 **只有 1 条 `pref("zen.welcome-screen.seen", true)`**；
  `git diff --no-index` 两版 zen.js，差异**恰好只有**预期那几处。

---

# 五、对文档的影响

```
· docs/howto-mechanism-error.md      -> 【撤回】：那条说法其实是对的
· docs/prefs-mechanism-and-residue.md -> 【部分保留】：
    「内容被合并进 firefox.js」是对的，
    但「消费者未知」已查明（tools/ffprefs）
```
