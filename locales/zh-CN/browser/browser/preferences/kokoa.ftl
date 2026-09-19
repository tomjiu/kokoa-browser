# Kokoa 设置页字符串。消息形态约定见 en-US 版本注释。
kokoa-category = Kokoa
kokoa-dsh-category = Kokoa dsh
kokoa-cpa-category = Kokoa CPA

kokoa-header =
    .heading = Kokoa

kokoa-shell-group =
    .label = AI 与会话（外壳）
    .description = 打开 AI 工作台/会话、并行资源、启动首屏、二级菜单。模型与密钥在「Kokoa CPA」分类。

## dsh sidecar（从被删的旧 pane 迁移）
## ★ 设置入口收口（2026-09-18）：dsh / CPA / 并行会话资源 / 菜单显隐
##   唯一管理入口是本页；dsh「设置 → 模型」里的 CPA 卡片只做只读状态与跳转。

kokoa-dsh-status-dynamic =
    .label = { $text }

kokoa-dsh-open-workspace =
    .label = 打开 AI 工作台（dsh 主页）
    .description = 打开/复用主工作台标签（dsh 主页）。不新建会话、不分屏。

kokoa-dsh-open-sessions =
    .label = 打开会话历史
    .description = 打开 about:kokoases，从列表点进某个会话的独立标签。

kokoa-open-cpa-page =
    .label = 打开 CPA 设置页
    .description = 独立分类「Kokoa CPA」：模型路由 / 上游 Key / 逻辑别名。

kokoa-open-dsh-page =
    .label = 打开 dsh 设置页
    .description = 独立分类「Kokoa dsh」：主题/语言/会话默认/工具与搜索。

kokoa-dsh-session-group =
    .label = dsh 会话与对话默认
    .description = 新会话的权限、Agent 预设、忙碌时回车行为、对话记录视图、默认工作目录。

kokoa-dsh-tool-group =
    .label = dsh 工具 · Agent · 搜索
    .description = Agent 并行工具调用上限、Shell 超时与输出上限、DeepSeek 罫搜索次数与地址。

kokoa-dsh-busy-enter =
    .label = 忙碌时回车
    .description = 下拉选择：排队或转向插话。

kokoa-dsh-transcript =
    .label = 对话记录视图
    .description = 下拉选择：完整或紧凑。

kokoa-dsh-tool-parallel =
    .label = Agent 并行工具调用上限
    .description = agent-loop.maxParallelToolCalls，整数。

kokoa-dsh-shell-timeout =
    .label = Shell 命令超时（毫秒）
    .description = shell.timeoutMs，例如 120000。

kokoa-dsh-shell-maxout =
    .label = Shell 最大输出（字节）
    .description = shell.maxOutputBytes，例如 1048576。

kokoa-dsh-web-maxuses =
    .label = 罃搜索最多使用次数
    .description = web-search-deepseek.maxUses。

kokoa-dsh-web-baseurl =
    .label = 罃搜索 API 地址
    .description = web-search-deepseek.baseURL，可空。

kokoa-cpa-summary =
    .label = { $text }

kokoa-open-home =
    .label = 打开 Kokoa 首页
    .description = about:kokoa：工作区 / 运行时列表 / 文件树。

kokoa-startup-home-first =
    .label = 启动时先打开 Kokoa 首页（推荐）
    .description = 首屏是 about:kokoa（状态/列表/文件树），而不是 dsh 主页。

kokoa-startup-workbench =
    .label = 启动时直接打开 dsh 工作台
    .description = 与上一项互斥使用：关掉「首页优先」后再打开本项，才会启动即 dsh。

kokoa-dsh-toggle-split =
    .label = AI 分屏（仅布局）
    .description = 把当前 AI 标签与网页左右并排；不改变会话内容。要新开会话请用下一项。

kokoa-dsh-new-parallel =
    .label = 新建并行 AI 会话
    .description = 在 dsh 新建一个会话，并以独立标签打开（#kokoa-session=）。

kokoa-ai-max-parallel =
    .label = 并行 AI 会话标签上限（0 = 不限制；超出时后台标签将被挂起）

kokoa-ai-auto-discard =
    .label = 打开新会话时挂起后台 AI 标签以省内存

## dsh 通用设置（M2 拆分：真值在 $DSH_HOME/settings.yaml，经状态桥白名单写入）

kokoa-dsh-pref-group =
    .label = dsh 运行偏好（写入 settings.yaml）
    .description = DeepSeek Harness 自身偏好（主题/语言/默认权限/Agent 预设），约 100ms 热生效。模型与 API Key 不在这里，在「Kokoa CPA」。

kokoa-dsh-theme =
    .label = dsh 界面主题（system | light | dark）

kokoa-dsh-font-size =
    .label = dsh 正文字号（10–28）

kokoa-dsh-locale =
    .label = dsh 界面语言（如 zh-CN / en-US，可留空）

kokoa-dsh-permission =
    .label = 新会话默认权限（read-only | workspace-write | danger-full-access）

kokoa-dsh-agent-preset =
    .label = 新会话默认 agent preset（如 standard）

kokoa-dsh-session-cwd =
    .label = 新建并行会话的工作目录（cwd，可空 = 使用 dsh 默认）

kokoa-dsh-pref-msg =
    .label = { $text }

## Kokoa 二级菜单项（控制应用菜单里哪些条目出现）
## 名字必须与 KokoaMenubar.mjs 的 PREF_PREFIX = "kokoa.menu." 一致

kokoa-menu-new-tab =
    .label = 新建标签页

kokoa-menu-new-window =
    .label = 新建窗口

kokoa-menu-print =
    .label = 打印…

kokoa-menu-fxa =
    .label = 登录 Firefox 账户

kokoa-menu-save-file =
    .label = 页面另存为…

## Kokoa CPA（dsh 唯一的模型出口）

## CPA 管理（唯一入口 = 本设置页；dsh 内卡片只读）

kokoa-cpa-category = Kokoa CPA
kokoa-cpa-status-group =
    .label = CPA 服务状态
    .description = CPA（模型路由）进程状态。管理上游 Key / 别名请用下方表单；保存后点「重启 CPA」。

kokoa-cpa-upstream-group =
    .label = 上游模型与逻辑别名
    .description = 填聚合商 base-url 与 api-key（每行一个）。别名 code/cheap/strong/vision 是 dsh 唯一看见的四个模型名。保存会整份重写托管 config.yaml。

kokoa-cpa-status-checking =
    .label = 正在读取 CPA 状态…

kokoa-cpa-status-bridge-down =
    .label = Kokoa 状态桥不可达（{ $bridge }）—— CPA 状态、上游配置与别名都无法读取或保存

kokoa-cpa-status-bridge-error =
    .label = 状态桥返回错误：{ $detail }

kokoa-cpa-status-stopped =
    .label = CPA 未运行（端口 { $port }）

kokoa-cpa-status-running =
    .label = CPA 运行中 · 端口 { $port } · 上游已配置（{ $keys } 个 api-key）

kokoa-cpa-status-running-no-upstream =
    .label = CPA 运行中 · 端口 { $port } · 上游未配置 —— 模型路由无法工作

kokoa-cpa-models-count =
    .label = 上游可用模型：{ $count } 个
    .description = { $list }

kokoa-cpa-models-none =
    .label = 上游可用模型：0 个
    .description = CPA 端口有应答但一个模型都不提供：上游未配置、不可达或全部处于冷却中。这种情况下 dsh 只会报「TRANSPORT: Connection error.」，不指明是哪个路由。

kokoa-cpa-models-unknown =
    .label = 上游可用模型：未知（状态桥不可达）

kokoa-cpa-unmanaged =
    .label = config.yaml 已不再由 Kokoa 托管
    .description = 该文件没有 Kokoa 托管标记，上方各项一律只读 —— 绝不覆盖手工接管的配置。删除该标记行即可恢复托管。

kokoa-cpa-baseurl =
    .label = 上游 base-url（OpenAI 兼容；留空 = 未配置上游）
    .placeholder = https://your-flash-pool.example.com/v1

kokoa-cpa-apikeys =
    .label = 上游 api-key（每行一个；未改动的行原样保留，保存后重新脱敏显示）
    .placeholder = sk-…

kokoa-cpa-alias-code =
    .label = code → 上游模型

kokoa-cpa-alias-cheap =
    .label = cheap → 上游模型

kokoa-cpa-alias-strong =
    .label = strong → 上游模型

kokoa-cpa-alias-vision =
    .label = vision → 上游模型

kokoa-cpa-save =
    .label = 保存

kokoa-cpa-restart =
    .label = 重启 CPA

kokoa-cpa-msg-saved =
    .label = ✓ 已保存 —— 点「重启 CPA」生效

kokoa-cpa-msg-saved-stale =
    .label = ✓ 已保存 —— 点「重启 CPA」生效（视图刷新失败，稍后自动重试）

kokoa-cpa-msg-restarting =
    .label = ✓ 已请求重启，2 秒后刷新状态…

kokoa-cpa-msg-error =
    .label = ✗ { $detail }

kokoa-cpa-msg-truncated-key =
    .label = ✗ 第 { $line } 行的密钥疑似被截断（含 …）—— 请完整粘贴或清空该行

kokoa-cpa-msg-not-loaded =
    .label = ✗ 配置尚未读取成功，拒绝保存（空表单会把上游配置覆盖掉）。请检查状态桥后重开本页。
