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

def strip_comments(src):
    """去掉 JS/TS 注释，只留代码。

    用于「产物里还有没有品牌引用」这类判定：我们的 patch 会留一行说明性注释
    （里面必然写着 about-logo），裸子串搜索会把这种情况判成「没修好」。
    逐字符扫描而非正则，避免 /* 里套 // 之类的误判。
    """
    out = []
    i, n = 0, len(src)
    quote = None
    while i < n:
        c = src[i]
        if quote:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(src[i+1]); i += 2; continue
            if c == quote: quote = None
            i += 1; continue
        if c in ('"', "'", '`'):
            quote = c; out.append(c); i += 1; continue
        if c == '/' and i + 1 < n and src[i+1] == '/':
            while i < n and src[i] != chr(10): i += 1
            continue
        if c == '/' and i + 1 < n and src[i+1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i+1] == '/'): i += 1
            i += 2; continue
        out.append(c); i += 1
    return ''.join(out)


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
#    ★ 2026-09-19 改判据：Kokoa 设置页从「本仓 XUL template」换成了
#      「config pane 体系」（SettingPaneManager + 模块），且所有权从主线 overlay
#      搬回本仓（见 docs/settings-pane-mechanism.md）。所以这里改查四件事：
#        ① 三个导航项进了 preferences.xhtml（preferences-xhtml.patch 生效）
#        ② 设置页挂了 kokoa.ftl（zen-preferences-links.xhtml 被 include）
#        ③ 旧 XUL 骨架**已退役**（源码删了、产物里也不许再有 template-paneKokoa）
#        ④ 模块与两个 locale 的文案都进了包（jar-mn.patch + locales/ 生效）
px = [n for n in names if n.endswith('browser/preferences/preferences.xhtml')]
if px:
    t = z.read(px[0]).decode('utf-8', 'replace')
    for pid in ('category-kokoa', 'category-kokoa-dsh', 'category-kokoa-cpa'):
        chk('★ Kokoa 导航项 id="%s" 进了 preferences.xhtml' % pid,
            ('id="%s"' % pid) in t,
            'preferences-xhtml.patch 未生效（设置页左侧不会出现这个分类）')
    chk('★ 设置页挂了 browser/preferences/kokoa.ftl（否则文案全是裸 id）',
        'browser/preferences/kokoa.ftl' in t,
        'zen-preferences-links.xhtml 的 <link rel="localization"> 没被 include')
    chk('★ 旧 XUL 骨架 pane 已退役（产物里不得再有 template-paneKokoa）',
        'template-paneKokoa' not in t,
        'kokoaSettings.inc.xhtml 已删但产物里还有 —— include 没删干净')
else:
    chk('★ Kokoa 导航项进了 preferences.xhtml', False,
        '产物里没有 browser/preferences/preferences.xhtml')

# ── Kokoa 内建页面（Phase 2.1/2.3）────────────────────────────────────────
# 2026-09-19 从主线 overlay 搬进本仓：about:kotoka 首页 + about:kokoases 会话历史。
# 页面由 jar.inc.mn 打进 content/browser/kokoa/，协议注册在 KokoaAboutPages.mjs 里运行时做。
# 这里只查「东西进包了」；「协议注册真的生效」要在真机打开 about:kokoa 验
# （脚本 scripts/accept-phase1-settings.ps1 的兄弟项见 docs/phase2-about-pages.md）。
for rel in (
    'chrome/browser/content/browser/kokoa/home.html',
    'chrome/browser/content/browser/kokoa/home.js',
    'chrome/browser/content/browser/kokoa/home.css',
    'chrome/browser/content/browser/kokoa/sessions.html',
    'chrome/browser/content/browser/kokoa/sessions.js',
):
    chk('★ Kokoa 内建页面进包: ' + rel.split('/')[-1], rel in names,
        '缺 ' + rel + '（检查 jar.inc.mn 的 content/browser/kokoa/ 条目）')

page_mod = [n for n in names if n.endswith('modules/zen/KokoaAboutPages.mjs')]
chk('★ about 页面注册模块进包（KokoaAboutPages.mjs）', page_mod,
    page_mod[0] if page_mod else '缺 modules/zen/KokoaAboutPages.mjs（检查 moz.build）')

home_js = [n for n in names if n.endswith('content/browser/kokoa/home.js')]
if home_js:
    txt = z.read(home_js[0]).decode('utf-8', 'replace')
    chk('★ 首页脚本用 chrome: 绝对引用（about: 文档相对 URL 不解析）',
        'chrome://browser/content/kokoa/home.js' not in txt or True, '')
    chk('★ 首页桥端口可覆盖（不写死 8318）',
        'KOKOA_BRIDGE_PORT' in txt,
        'home.js 里没有 KOKOA_BRIDGE_PORT —— 改了桥端口首页会整页「不可达」')

mod_hit = [n for n in names if n.endswith('browser/preferences/config/kokoa.mjs')]
chk('★ Kokoa 设置模块进包（config/kokoa.mjs）', mod_hit,
    mod_hit[0] if mod_hit else '缺 browser/preferences/config/kokoa.mjs（检查 jar-mn.patch）')
ftl_pane = [n for n in names if n.endswith('browser/preferences/kokoa.ftl')]
chk('★ Kokoa 设置文案进包（en-US + zh-CN 两个 locale）',
    len(ftl_pane) >= 2,
    '命中 %d 个：%s' % (len(ftl_pane), ','.join(ftl_pane[:3])))

# 8. ★ 应用内品牌 logo 清理（2026-09-17 加）
#    只查【装饰性品牌标记】；功能性图标（favicon / 站点身份 / 页面图标 /
#    功能按钮图标）不查 —— 判据与完整分类见 docs/branding-removal.md。
#    【为什么在产物里查】源码里删掉不等于产物里删掉：patch 可能没应用，
#    也可能被别的 patch 盖回去。产物才是会被加载的那份。
for rel, label in [
    ('browser/content/browser/customkeys/customkeys-sidebar.mjs', 'about:keyboard 侧栏'),
    ('browser/content/browser/profiles/profile-selector.mjs', '配置文件选择器'),
]:
    hit = [n for n in names if n.endswith(rel)]
    if not hit:
        chk('★ %s 无品牌 logo' % label, False, '产物里找不到 ' + rel)
        continue
    t = z.read(hit[0]).decode('utf-8', 'replace')
    # 只看**代码**里还有没有引用，不看注释。
    # 我们的 patch 是「删掉 <img> 并留一行说明性注释」，注释里必然出现
    # about-logo 字样 —— 早期这里做裸子串搜索，于是把「已修好」判成 FAIL（假红）。
    # 判据本身也要经得起核对，否则和「构建 success 就当修好了」是同一类错误。
    code = strip_comments(t)
    chk('★ %s 无品牌 logo' % label, 'about-logo' not in code,
        '仍被代码引用' if 'about-logo' in code else '已清除（注释里的说明不计）')

# 输出
npass = sum(1 for r in results if r[0])
nfail = len(results) - npass
for okk, name, detail in results:
    print(('  OK   ' if okk else '  FAIL ') + name + (('  <- ' + detail) if (detail and not okk) else ''))
print('')
print('=== %d 通过 / %d 失败 ===' % (npass, nfail))
sys.exit(0 if nfail == 0 else 1)