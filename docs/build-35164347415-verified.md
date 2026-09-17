# 构建 35164347415 产物核对（head `987e3bf`）

> 2026-09-17。**结论：设置页面板修复（用户报的「Kokoa 设置页空白/闪烁」）已在产物里证实。**

## 一、核对结果：**30 通过 / 3 失败**，3 个失败**全部是预期的**

```bash
gh run download 35164347415 -R tomjiu/kokoa-browser -n kokoa-win64-build -D E:\builds\35164347415
cd kokoa-browser && python scripts/check-artifact.py E:\builds\35164347415
```

| # | 失败项 | 为什么是预期的 |
|---|---|---|
| 1 | `pref zen.welcome-screen.seen = true`（实际 false） | 这条的同名覆盖修复在 **`23c6d2f`**，比本构建的 head `987e3bf` 晚 |
| 2 | `★ about:keyboard 侧栏 无品牌 logo` | 品牌字标 patch 在 **`a581869`**，同样晚于 head |
| 3 | `★ 配置文件选择器 无品牌 logo` | 同上 |

**先确认祖先关系再下结论**（否则就是"拿旧产物找新代码"）：
`987e3bf` → `b33ca4b` → `dc5416b` → `a581869` → `e95d644` → `23c6d2f`（线性，前者是后者的祖先）。

## 二、★ 本构建真正验证到的（最关键的一条）

```
OK   ★ Kokoa 面板顶层节点都带 data-category="paneKokoa"
```

这条在**旧产物 `35096636452`** 上是 `FAIL 3 个顶层节点漏/错: hbox,groupbox,groupbox`。
现在变成 OK —— 说明 `987e3bf` 的修复（template 顶层节点补 `data-category`）**真的进了产物**，
用户报的「设置页 Kokoa 空白 / 闪烁 / 内容跑到账户与同步那一栏」在产物层闭环。
机制与证据见 `docs/settings-pane-mechanism.md`。

同批一并确认的（都来自更早的提交，本构建包含）：
- 6 个 Kokoa 模块进包；5 条 `kokoa.menu.*` 默认值正确
- 品牌名 5 项 = Kokoa*；欢迎页大标题已删；新标签页 `hideLogo=true`
- **AI 侧栏 5 项**（css 进包 / ftl 进包 / DOM 挂载 / 样式表 `<link>` / 本地化 `<link>`）
- 其余 4 条欢迎页/默认浏览器/CFR/更新 pref 生效（只有 `welcome-screen.seen` 被同名覆盖，见上）

## 三、还差哪两个构建才算全绿

| 构建 | head | 它多验证什么 | 预期 |
|---|---|---|---|
| `35165650008` | `a581869` | 两处品牌字标（§8） | 应只剩 `welcome-screen.seen` 一条 FAIL |
| `35173069555` | `23c6d2f` | pref 同名覆盖修复（`prefs/zen/welcome.yaml` → 无条件 true） | **应 33/33 全绿** |

三份都在 `E:\builds\<runid>` 下；本条记录随后两份出来后补。
