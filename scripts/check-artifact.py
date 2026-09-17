import zipfile, sys, re, glob, os, json
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
"""
核对一次构建产物（不需要实机）。

用法: python scripts/check-artifact.py <产物目录> [--json]

查什么：
  1. Kokoa 模块是否进包（modules/zen/Kokoa*.mjs）
  2. pref 默认值是否内联进 defaults/preferences/firefox.js
  3. 品牌名（brand.ftl 五项）
  4. 欢迎页大标题是否已删
  5. 新标签页 hideLogo
"""

d = sys.argv[1] if len(sys.argv) > 1 else None
if not d:
    print('用法: python scripts/check-artifact.py <产物目录>'); sys.exit(2)

omni = os.path.join(d, 'omni.ja')
if not os.path.exists(omni):
    zips = sorted(glob.glob(os.path.join(d, '**', '*.zip'), recursive=True),
                  key=os.path.getsize, reverse=True)
    for zp in zips:
        try: zf = zipfile.ZipFile(zp)
        except Exception: continue
        for n in zf.namelist():
            if n.endswith('browser/omni.ja'):
                open(omni, 'wb').write(zf.read(n)); break
        if os.path.exists(omni): break

if not os.path.exists(omni):
    print('找不到 omni.ja'); sys.exit(2)

z = zipfile.ZipFile(omni)
names = z.namelist()
results = []

def chk(name, cond, detail=''):
    results.append((bool(cond), name, detail))

# 1. Kokoa 模块
mods = ['KokoaAiPanel','KokoaAiSplit','KokoaDshSessions','KokoaDshSidecar','KokoaWorkspaceSessions','KokoaMenubar']
for m in mods:
    hit = [n for n in names if 'modules/zen/' in n and m in n]
    chk('模块进包: ' + m, hit, hit[0] if hit else '不在产物')

# 2. pref 默认值
ff = 'defaults/preferences/firefox.js'
if ff in names:
    t = z.read(ff).decode('utf-8','replace')
    # 收【全部】pref("k", v)，后行覆盖前行 —— 与 Firefox pref 引擎语义一致。
    #
    # 【★ 这条正则改过两轮，两次都踩了同一个坑】
    #   第一版只收 kokoa.menu|browser.shell 两个前缀。
    #   后来往 expect 里加了 app.update.* / asrouter.userprefs.* 之后，
    #   忘了扩正则 —— 于是【明明在产物里】的 4 个 pref 被判成「缺」，
    #   两次核对都出现 4 项假 FAIL（构建 35096636452 / 35113050289），
    #   差点让人以为构建没生效。
    #
    #   所以现在【收全部 pref】，不再维护前缀白名单：
    #   以后往 expect 里加任何 pref 都不用动这里。
    #
    # 【同名多次定义取哪一个】同一个 pref 可能出现多次（Firefox 的定义在前，
    #   我们的在 zen.js 里、以 #include 追加在末尾）。Firefox 后定义覆盖前定义
    #   -> 所以【取最后一次】。dict 赋值天然如此。
    prefs = {}
    for _m in re.finditer(r'pref\(\s*"([^"]+)"\s*,\s*([^)]{0,24})\)', t):
        prefs[_m.group(1)] = _m.group(2).strip()
    expect = {
        'kokoa.menu.new-tab.visible': 'true',
        'kokoa.menu.new-window.visible': 'true',
        'kokoa.menu.print.visible': 'false',
        'kokoa.menu.fxa.visible': 'false',
        'kokoa.menu.save-file.visible': 'false',
        # 【2026-09-16 重写】★ 初始设置页（欢迎页）—— 这次新加的，也是关键
        # 那个页面本身就带「设为默认 + 固定任务栏」的步骤，
        # 所以「通知又出现」和「初始设置页又出现」是同一个原因。
        'zen.welcome-screen.seen': 'true',
        'browser.aboutwelcome.enabled': 'false',
        # 首次运行 / 默认浏览器（读它的：AboutWelcomeDefaults / OnboardingMessageProvider）
        'browser.shell.checkDefaultBrowser': 'false',
        # ★「推荐消息」总开关 —— 关「设为默认 / 固定任务栏」那条 infobar
        # （checkDefaultBrowser 只是必要条件之一；这条才是彻底的）
        'browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features': 'false',
        'browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons': 'false',
        # 更新检查（Kokoa 还没发布流水线）
        'app.update.auto': 'false',
    }
    for k, v in expect.items():
        got = prefs.get(k)
        chk('pref ' + k + ' = ' + v, got == v, ('实际 ' + got) if got else '缺')
else:
    chk('存在 firefox.js', False, '不在产物')

# 2b. ★ 欢迎页 URL 不能指向 GitHub（2026-09-16 实机验收踩的坑）
# 【注意】这几条在 firefox-branding.js，不是 firefox.js（踩过）
fbr = 'defaults/preferences/firefox-branding.js'
if fbr in names:
    t = z.read(fbr).decode('utf-8','replace')
    bad = []
    for k in ['startup.homepage_welcome_url', 'startup.homepage_welcome_url.additional', 'startup.homepage_override_url']:
        m = re.search(r'pref\(\s*"' + re.escape(k) + r'"\s*,\s*"([^"]*)"', t)
        if m and m.group(1).strip():
            bad.append(k + ' -> ' + m.group(1)[:40])
    chk('★ 欢迎页 URL 不指向外部站点（不打开 GitHub）', not bad,
        '; '.join(bad) if bad else '全部为空')

# 3. 品牌名
bftl = [n for n in names if n.endswith('brand.ftl') and '/en-US/' in n]
if bftl:
    t = z.read(bftl[0]).decode('utf-8','replace')
    for k in ['-brand-shorter-name','-brand-short-name','-brand-full-name','-brand-product-name','-vendor-short-name']:
        m = re.search(re.escape(k) + r'\s*=\s*(.+)', t)
        val = m.group(1).strip() if m else ''
        chk('品牌 ' + k + ' = Kokoa*', 'Kokoa' in val, val)
else:
    chk('存在 en-US brand.ftl', False)

# 4. 欢迎页大标题
zw = [n for n in names if 'ZenWelcome' in n and n.endswith('.mjs')]
if zw:
    t = z.read(zw[0]).decode('utf-8','replace')
    chk('欢迎页大标题已删', 'zen-welcome-title-line1' not in t,
        '仍引用 line1' if 'zen-welcome-title-line1' in t else '已删')

# 5. hideLogo
asx = [n for n in names if 'ActivityStream.sys.mjs' in n]
if asx:
    t = z.read(asx[0]).decode('utf-8','replace')
    m = re.search(r'"hideLogo",\s*\{[^}]*value:\s*(true|false)', t)
    v = m.group(1) if m else '?'
    chk('新标签页 hideLogo = true', v == 'true', '实际 ' + v)

# 6. AI 侧栏（kokoa-ai-sidebar，TASK-04 MVP）
#    CSS/文案走 jar.mn 直接进包；DOM 骨架经 browser-box.inc.xhtml
#    预处理展开进 browser.xhtml（include 在 html:sidebar-main 内）。
css_hit = [n for n in names if n.endswith('zen-styles/kokoa-ai-sidebar.css')]
chk('AI 侧栏 css 进包', css_hit, css_hit[0] if css_hit else '缺 zen-styles/kokoa-ai-sidebar.css')

ftl_hit = [n for n in names if 'kokoa-ai-sidebar.ftl' in n]
chk('AI 侧栏文案进包', ftl_hit, ftl_hit[0] if ftl_hit else '缺 kokoa-ai-sidebar.ftl')

bx = [n for n in names if n.endswith('browser.xhtml')]
if bx:
    t = z.read(bx[0]).decode('utf-8','replace')
    # 【★ 这里以前会「说假话」】原版只查子串 'kokoa-ai-sidebar' 在不在 ——
    #   可是这条子串同时出现在
    #     <link rel="stylesheet" href=".../zen-styles/kokoa-ai-sidebar.css">
    #     <link rel="localization" href="browser/kokoa-ai-sidebar.ftl">
    #   里，于是【DOM 根本没挂上也能通过】。
    #   「检查器会说谎」这条在 docs/testing-pitfalls.md 记过一次（pref 假 FAIL），
    #   这是第二次：那次是假 FAIL，这次是假 PASS —— 假 PASS 更危险。
    #   现在三项各用各的判定串，互不代偿。
    mounted = 'id="kokoa-ai-sidebar"' in t
    css_link = 'zen-styles/kokoa-ai-sidebar.css' in t
    ftl_link = 'kokoa-ai-sidebar.ftl' in t
    has_zen = 'zen-appcontent-wrapper' in t
    chk('AI 侧栏 DOM 挂载进 browser.xhtml（id="kokoa-ai-sidebar" 在 sidebar-main 内）',
        mounted,
        'browser.xhtml 有 zen 标记但没挂上 —— include 未生效' if has_zen
        else 'browser.xhtml 连 zen-appcontent-wrapper 都没有 —— 形态与预期不符，先查这个')
    chk('AI 侧栏样式表 <link> 进 browser.xhtml（否则 css 进了包也不生效）',
        css_link, 'zen-assets.inc.xhtml L31 的 <link> 没被 include 进来')
    chk('AI 侧栏本地化 <link> 进 browser.xhtml（否则文案键取不到）',
        ftl_link, 'zen-locales.inc.xhtml 的 <link rel="localization"> 没被 include 进来')
else:
    chk('AI 侧栏 DOM 挂载进 browser.xhtml（id="kokoa-ai-sidebar" 在 sidebar-main 内）',
        False, '产物里没有 browser.xhtml')
    chk('AI 侧栏样式表 <link> 进 browser.xhtml（否则 css 进了包也不生效）',
        False, '产物里没有 browser.xhtml')
    chk('AI 侧栏本地化 <link> 进 browser.xhtml（否则文案键取不到）',
        False, '产物里没有 browser.xhtml')

# 7. ★ 设置页面板 data-category（2026-09-16 加）
#    【为什么必须在产物里查，而不是只查源码】
#      展开/隐藏是运行时行为：preferences.js 的 search(category, "data-category")
#      会把 #mainPrefPane 里 data-category != 当前类别的【直接子节点】全部
#      hidden=true；template 展开后的顶层节点正好就是这些直接子节点。
#      漏写 -> 设置页右侧空白 / 闪烁 / 内容残留到别的分类。
#      （用户报的「Kokoa 设置页空白 + 内容出现在账户与同步那一栏」就是这个。）
#    参考对象：Zen 自己的 pane 顶层节点全都写 data-category，同文件可对比。
px = [n for n in names if n.endswith('browser/preferences/preferences.xhtml')]
if px:
    t = z.read(px[0]).decode('utf-8', 'replace')
    m = re.search(r'<html:template\s+id="template-paneKokoa"\s*>(.*?)</html:template>',
                  t, re.S)
    if not m:
        chk('★ Kokoa 面板 template 进了 preferences.xhtml', False,
            '找不到 template-paneKokoa —— include 未生效')
    else:
        try:
            proot = ET.fromstring(
                '<root xmlns:html="http://www.w3.org/1999/xhtml">%s</root>' % m.group(1))
            kids = list(proot)
            miss = [k.tag.split('}')[-1] for k in kids
                    if k.get('data-category') != 'paneKokoa']
            chk('★ Kokoa 面板顶层节点都带 data-category="paneKokoa"',
                bool(kids) and not miss,
                ('%d 个顶层节点漏/错: %s' % (len(miss), ','.join(miss))) if miss
                else '一个顶层节点都没有？')
        except ET.ParseError as e:
            chk('★ Kokoa 面板顶层节点都带 data-category="paneKokoa"', False,
                '解析 template 失败: %s' % e)
else:
    chk('★ Kokoa 面板 template 进了 preferences.xhtml', False,
        '产物里没有 browser/preferences/preferences.xhtml')

# 输出
npass = sum(1 for r in results if r[0])
nfail = len(results) - npass
for okk, name, detail in results:
    print(('  OK   ' if okk else '  FAIL ') + name + (('  <- ' + detail) if (detail and not okk) else ''))
print('')
print('=== %d 通过 / %d 失败 ===' % (npass, nfail))
sys.exit(0 if nfail == 0 else 1)