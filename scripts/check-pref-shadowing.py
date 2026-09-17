#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检测 prefs/*.yaml 里的【同名多处定义】—— 这是「pref 写了却不生效」的根因。

用法: python scripts/check-pref-shadowing.py

【机制（读源码 + 产物双向坐实，2026-09-17）】
  tools/ffprefs/src/main.rs：
    · L139-154 get_prefs_files_recursively() 递归收集 prefs/**/*.yaml
      —— **没有对 read_dir 的条目排序**（顺序无保证，跨文件系统可能不同）
    · L133-136 ordered_prefs() = prefs.sort_by(|a,b| a.name.cmp(&b.name))
      —— Rust 的 sort_by 是【稳定排序】：同名条目的相对顺序 = 上面那个遍历序
    · 输出到 engine/browser/app/profile/zen.js（被 #include 在 firefox.js 末尾）
  prefs 引擎：**后定义覆盖前定义**。
  → 于是同一条 pref 写两遍时，「谁赢」取决于目录遍历顺序 —— 既违反直觉又不确定。

【真实事故（构建 35163254400 产物）】
  defaults/preferences/firefox.js：
      L1860  pref("zen.welcome-screen.seen", true);    <- prefs/kokoa/（我们）
      L1862  pref("zen.welcome-screen.seen", false);   <- prefs/zen/welcome.yaml（@cond 展开）
  用户报的「启动又出现固定任务栏通知 + 初始设置页」因此【没被修好】：
  我们那条永远输（kokoa/ 在 zen/ 之前），而当时的文档把它误记成「默认层静默失效」。

【判定规则】
  FAIL  prefs/kokoa/ 里的 pref 同时在别的 prefs 目录里有定义
        —— 我们的值可能被覆盖，且覆盖与否不确定（read_dir 顺序）
  FAIL  同一个 pref 名在 prefs/kokoa/ 内部出现多次
  WARN  完全发生在上游目录之间的同名（zen/privatefox/fastfox），只提示不判失败：
        它们是 Zen/Betterfox 自己的写法，我们不改（但值得知道哪些值会被吃掉）
"""
import collections
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prefs")
NAME_RE = re.compile(r"^\s*-\s*name:\s*(\S+)\s*$")
VAL_RE = re.compile(r"^\s*value:\s*(.+?)\s*$")


def collect():
    defs = collections.defaultdict(list)  # name -> [(dir, file, value)]
    for dp, _dn, fn in os.walk(ROOT):
        for f in sorted(fn):
            if not f.endswith((".yaml", ".yml")):
                continue
            d = os.path.basename(dp)
            cur = None
            with open(os.path.join(dp, f), encoding="utf-8") as fh:
                for ln in fh:
                    m = NAME_RE.match(ln)
                    if m:
                        cur = m.group(1)
                        defs[cur].append([d, f, None])
                        continue
                    m2 = VAL_RE.match(ln)
                    if m2 and cur and defs[cur] and defs[cur][-1][2] is None:
                        defs[cur][-1][2] = m2.group(1)
    return defs


def main():
    if not os.path.isdir(ROOT):
        print("找不到 prefs/ 目录: " + ROOT)
        return 2
    defs = collect()
    dups = {k: v for k, v in defs.items() if len(v) > 1}
    errors, warns = [], []
    for name in sorted(dups):
        where = dups[name]
        dirs = [w[0] for w in where]
        detail = " | ".join("%s/%s=%s" % (a, b, c) for a, b, c in where)
        if "kokoa" in dirs:
            errors.append("%s\n        定义于: %s" % (name, detail))
        else:
            warns.append("%s  ->  %s" % (name, detail))

    print("=== pref 同名定义检查（共 %d 个 pref 名，其中同名 %d 条）===" % (len(defs), len(dups)))
    for w in warns:
        print("  WARN  上游同名（静态看不出 condition；若两条 condition 互斥则无害）: " + w)
    if errors:
        for e in errors:
            print("  FAIL  prefs/kokoa/ 的 pref 被同名覆盖（谁赢取决于目录遍历序，不可依赖）:")
            print("        " + e)
        print()
        print("=== 失败 %d 条 ===" % len(errors))
        print("修法：同一条 pref 只在一处定义 —— 要么删掉 prefs/kokoa/ 里的重复（若别处的值就是你要的），")
        print("      要么改到【权威位置】（别处那一处）并把意图写在注释里（见 prefs/zen/welcome.yaml 的样例）。")
        return 1
    if not dups:
        print("  OK    没有任何同名多处定义")
    else:
        print("  OK    prefs/kokoa/ 里没有会被覆盖的重复定义（上游同名 %d 条已列出）" % len(warns))
    return 0


if __name__ == "__main__":
    sys.exit(main())
