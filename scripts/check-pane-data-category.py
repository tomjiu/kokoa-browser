#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查设置页面板 template 的顶层节点是否都带 data-category。

用法: python scripts/check-pane-data-category.py

【为什么需要这个检查】（2026-09-16，真实踩坑）
  preferences.js 的 gotoPref() 流程是：
      categoryInfo.init();                 // template 在这里 replaceWith 展开
      ...
      search(category, "data-category");   // ★ 紧接着就把不匹配的隐藏掉

  search() 的实现（Firefox 156）：
      let elements = Array.from(document.getElementById("mainPrefPane").children);
      for (let element of elements) {
        if (element.getAttribute("data-category") == aQuery) element.hidden = false;
        else element.hidden = true;
      }

  template 展开后，template 里的【顶层节点】就成了 #mainPrefPane 的直接子节点，
  所以漏写 data-category 的节点会被【立刻隐藏】。

  症状（同一个根因的三种表现）：
    · 设置页右侧空白（点进去闪一下就没了）
    · 闪烁
    · 内容"跑到别的分类里"——展开时机不同（或该次没走到 search()）时不被隐藏，
      就残留在 #mainPrefPane 顶部，看起来挂在别的 pane 上

  修法：每个顶层节点都写 data-category="paneXXX" hidden="true"，与 Zen 一致。
  Zen 的 pane 产物里长这样：
      <hbox    class="subcategory" hidden="true" data-category="paneZenLooks">
      <groupbox id="zenUrlbarGroup" hidden="true" data-category="paneZenLooks">

【检查范围】src/ 下所有 .inc.xhtml 里的 <html:template id="template-paneXXX">。
  缺 data-category / 写错 category -> 失败（exit 1）
  忘了 hidden="true"             -> 警告（会有一帧闪现）
  解析不了（XML 不合法）          -> 警告并跳过（别拿解析器的脾气当门禁）
"""

import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8")

XHTML_NS = "http://www.w3.org/1999/xhtml"
TEMPLATE_RE = re.compile(
    r'<html:template\s+id="template-(pane[A-Za-z0-9_]+)"\s*>(.*?)</html:template>',
    re.S,
)

errors = []
warns = []
checked = 0
files = 0

for path in sorted(glob.glob("src/**/*.inc.xhtml", recursive=True)):
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as e:
        warns.append("%s: 读不了 (%s)" % (path, e))
        continue
    for name, body in TEMPLATE_RE.findall(text):
        files += 1
        # id 是 template-paneKokoa，捕获组已经含 pane 前缀，所以期望值就是它本身
        expected = name
        try:
            root = ET.fromstring(
                '<root xmlns:html="%s">%s</root>' % (XHTML_NS, body)
            )
        except ET.ParseError as e:
            warns.append("%s: template-%s 解析失败，跳过 (%s)" % (path, name, e))
            continue
        for child in list(root):
            checked += 1
            tag = child.tag.split("}")[-1]
            got = child.get("data-category")
            if got != expected:
                errors.append(
                    "%s: template-%s 的顶层 <%s> data-category=%s（应为 %s）"
                    % (path, name, tag, ("缺少" if got is None else got), expected)
                )
            if child.get("hidden") != "true":
                warns.append(
                    "%s: template-%s 的顶层 <%s> 没有 hidden=\"true\"（展开到 search() 之间会闪一下）"
                    % (path, name, tag)
                )

print("=== 设置页面板 data-category（%d 个 template / %d 个顶层节点）===" % (files, checked))
for w in warns:
    print("  WARN  " + w)
if errors:
    for e in errors:
        print("  FAIL  " + e)
    print("")
    print("=== 失败 %d 项：顶层节点漏写 data-category，设置页会空白/闪烁 ===" % len(errors))
    sys.exit(1)

if not files:
    print("  WARN  没有扫到任何 template-paneXXX")
print("  OK    %d 个 template 的顶层节点都带正确的 data-category" % files)
sys.exit(0)
