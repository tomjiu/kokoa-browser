#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
列出产物里所有【品牌图片】引用（按文件分组、带行号）。

用法:
    python scripts/scan-branding-refs.py <产物目录>

【它只负责列出来，不判断该不该删】
  判断「这是装饰性品牌标记，还是功能性图标」需要看选择器指向哪个控件
  （例如同样是 about-logo.svg：`#ai-window-toggle` 是功能按钮图标要留，
  `profile-selector.mjs` 里的 <img class="logo"> 是装饰字标要去）。
  分类结论见 docs/branding-removal.md 第二~五节。
"""
import os
import re
import sys
import zipfile
import glob as globmod

sys.stdout.reconfigure(encoding="utf-8")

# 品牌图片的引用形态（路径都来自 chrome://branding/content/）
PATS = re.compile(
    r"about-logo|about-wordmark|firefox-wordmark|zen-logo|zen-wordmark|branding/content",
    re.I,
)
EXTS = (".mjs", ".js", ".xhtml", ".html", ".css")


def find_omni(d):
    p = os.path.join(d, "omni.ja")
    if os.path.exists(p):
        return p
    for zp in sorted(globmod.glob(os.path.join(d, "**", "*.zip"), recursive=True),
                     key=os.path.getsize, reverse=True):
        try:
            zf = zipfile.ZipFile(zp)
        except Exception:
            continue
        for n in zf.namelist():
            if n.endswith("browser/omni.ja"):
                open(p, "wb").write(zf.read(n))
                return p
    return None


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/scan-branding-refs.py <产物目录>")
        return 2
    omni = find_omni(sys.argv[1])
    if not omni:
        print("找不到 omni.ja")
        return 2
    z = zipfile.ZipFile(omni)
    hits = {}
    for n in z.namelist():
        if not n.endswith(EXTS) or "/localization/" in n:
            continue
        try:
            t = z.read(n).decode("utf-8", "replace")
        except Exception:
            continue
        for i, ln in enumerate(t.splitlines(), 1):
            if PATS.search(ln):
                hits.setdefault(n, []).append((i, ln.strip()[:150]))
    print("命中 %d 个文件（分类结论见 docs/branding-removal.md）\n" % len(hits))
    for n in sorted(hits):
        print("== %s（%d 处）" % (n, len(hits[n])))
        for i, ln in hits[n]:
            print("   L%-5d %s" % (i, ln))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
