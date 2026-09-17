# 写测试时我踩过的坑（2026-09-16 整理）

> 这几轮我加了 119 个用例，过程中犯的错比找到的 bug 还多。
> 这份是【自我纠正清单】—— 下次写测试前先扫一眼。

---

# 一、★ 测试必须 import 真模块（不能复制实现）

**我第一版就是复制的** —— 结果故意改坏模块，测试居然【还通过】。
那测试就是摆设。

**规则**：
1. 模块【导出】可测的东西（正则常量、纯函数、契约表）
2. 测试【import】它们
3. **改坏模块时必须看到测试失败**

---

# 二、★ 每个测试都要做「双向验证」

写完测试，【必须】故意改坏实现，确认测试真的失败：

```
改坏 -> 看到失败（且失败的是【该失败】的那条）-> 恢复 -> 确认全绿
```

**没做过这步的测试，我不该说它「通过了」。**

这轮做过的：
```
KokoaAiPanel:     skipRoute->false      34/1（准确）
                  findAiTab 总返 null   32/3（准确）
KokoaDshSidecar:  暴露 url（安全回归）    19/1（准确）
KokoaMenubar:     打印默认改显示         9/1（准确）
KokoaWorkspace:   读错字段              22/2（准确）
KokoaMenuConsist: 加一个死开关          3/2（准确）
```

---

# 三、fake 必须【对齐真实实现】，不是「能跑就行」

**我第一版 fake 的 `updateSpaceSessionId` 只记录调用，没写回对象。**
于是测试报「写了读不到」—— 看起来像代码 bug，**其实是我 fake 的错**。

真实实现（ZenSpaceManager L1275）：
```js
workspace.kokoaSessionId = sessionId || null;
this.saveWorkspace(workspace);
```

**规则**：fake 要照着真实实现抄【语义】，不只是签名。

---

# 四、解析源文件时，注释里的示例会被当真

我用正则从设置页提 `preference="..."`，
结果把【注释里的示例】`<checkbox preference="完整 pref 名" />` 也抓了。

**规则**：先剥掉注释再解析：
```js
const noComments = xhtml.replace(/<!--[\s\S]*?-->/g, "");
```

---

# 五、跨块正则在【文件末尾】会漏

我用来解析 yaml 的正则：
```js
/^-\s*name:\s*(\S+)\s*$([\s\S]*?)(?=^-\s*name:|^#|\Z)/gm
```
漏掉了【最后一项】。我差点去改代码，其实是测试的错。

**规则**：解析结构化文本用【逐行扫描】，别用跨块大正则。

---

# 六、TS 模板字面量会吃掉 `\n`

我写测试用例时，`"...\n"` 里的 `\n` 被解释成了真换行，
导致生成的 JS 语法错误。

**规则**：要往文件里写 `\n` 两个字符，用 `String.fromCharCode(10)`，
或者写成 `\\n`。

---

# 七、「搜不到」不等于「丢了」

我在 `zen-sets.js` 里搜不到 `skipRoute`，一度以为重构时弄丢了。
实际：它被【正确地搬到了】`KokoaAiPanel.mjs` 的 `openAiTab` 里
（那是更合理的位置 —— 「开标签」这个动作在那里）。

**规则**：搜不到时先确认它是不是【搬到别处】了。

---

# 八、字节数差异可能是 CRLF，不是内容

```
产物 ZenWelcome.mjs: 28113 字节
我们源文件:          29059 字节
差 946 = 891 行 × 1 字节  -> 是 CRLF vs LF
```

**规则**：判断内容是否相同，用【内容比对】，别用字节数。

---

# 九、Node 里没有「隐式全局」

`KokoaWorkspaceSessions.mjs` 混用两种写法：
```js
window.gZenWorkspaces   // 检查（L110/L133）
gZenWorkspaces          // 使用（L53/L119/L134/L158）裸标识符
```
浏览器里裸标识符会解析成 window 属性，所以能跑；
**Node 里直接 ReferenceError**。

**规则**：测试里显式建同名全局，指向同一个对象。

---

# 十、★ 判断能不能测之前，先【核实依赖】（我错了三次）

**我至少三次凭印象说「这个依赖浏览器 API，Node 测不了」，然后核实后发现能测。**

| 我说的 | 实际 |
|---|---|
| `KokoaAiPanel` 行为测不了 | ✅ 能测 —— 浏览器 API 在函数体内，`win` 是参数 |
| `applyMenuVisibility` 测不了 | ✅ 能测 —— 只依赖 Services/PanelMultiView/document 三个全局 |
| `findNode`/`findDsh` 要真进程 | ✅ 能测 —— 依赖 Subprocess.pathSearch/IOUtils/Services.dirsvc，全是全局 |

**判断能不能测的正确步骤**（别跳过第 1 步）:

```
1. 看依赖在哪:
   · 模块【顶层】就碰浏览器 API  -> Node import 就炸，确实难测
   · 在【函数体内】使用         -> 可以测（这是我们的情况）
2. 看是【参数】还是【全局】:
   · win / aiTab 是参数         -> 直接传假对象
   · Services / window 是全局   -> globalThis.xxx = 假的
3. 写之前先注入试一次 —— 别停在"应该不行"
```

**真正测不了的只有**:真 spawn 进程(`Subprocess.call`)、真的 UI 渲染。
其余几乎都能注入。

---

# 十、最贵的一条：拿旧产物找新代码

我核对产物时说「三项没生效」，其实：
```
构建 headSha = 592df11（06:42）
而那三个改动 08:06 才提交  <- 晚了 1.5 小时
```

**规则**：核对前先确认
```bash
sha=$(gh api .../runs/<id> --jq '.head_sha')
git merge-base --is-ancestor <commit> $sha   # 0 = 在构建里
```
详见 `docs/artifact-verification.md`。

---

# 十一、★ 检查器会说谎（假 FAIL 一次，假 PASS 一次）

同一个检查器 `scripts/check-artifact.py` 骗过我两次，方向相反：

```
1) 假 FAIL（构建 35096636452）：「4 个 pref 缺」—— 其实都在产物里。
   根因：收集用的正则只认 kokoa.menu|browser.shell 两个前缀，
        往 expect 里加了 app.update.* / asrouter.* 却没扩正则。
2) 假 PASS（2026-09-17 发现）：判「侧栏 DOM 已挂载」用的是子串
   'kokoa-ai-sidebar' in browser.xhtml —— 可这条子串同时出现在
   <link rel="stylesheet" href=".../kokoa-ai-sidebar.css"> 和
   <link rel="localization" href="browser/kokoa-ai-sidebar.ftl"> 里，
   于是【DOM 根本没挂上也能通过】。
```

**教训**：一个判定串要**唯一指向被判定的事实**。

- 假 FAIL 浪费一轮排查（至少不放过问题）；
- **假 PASS 更危险** —— 它让人以为已经验证过了。

所以侧栏的产物检查拆成了 5 项，各用各的判定串：
`id="kokoa-ai-sidebar"` / `zen-styles/kokoa-ai-sidebar.css` /
`kokoa-ai-sidebar.ftl` 分别判 DOM 挂载 / 样式表 `<link>` / 本地化 `<link>`，
另两项判 css、ftl 是否进包。

---

# 总结：写测试的三条铁律

```
1. import 真模块（不复制实现）
2. 改坏 -> 必须看到失败（双向验证）
3. 失败时先怀疑【测试写错了】，再怀疑代码
```
