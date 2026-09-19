# Kokoa settings pane strings.
#
# ⚠️ The shape of a Fluent message is decided by the element that CONSUMES it —
# getting it wrong never raises an error, it just renders nothing (or wipes the
# element's children):
#   kokoa-category          → moz-page-nav-button reads the message VALUE   → bare value
#   kokoa-header            → moz-page-header  heading (fluent attribute)   → .heading
#   kokoa-*-group           → moz-fieldset     label   (fluent attribute)   → .label
#   everything else         → moz-checkbox / moz-input-text / moz-textarea /
#                             moz-button / moz-box-item  label+description
#                             (fluent attributes)                         → .label / .description
# Writing a bare value where the element wants an attribute makes Fluent write
# the message value straight into element.textContent and delete every child
# node (measured: two setting-controls replaced by a text node, zero JS errors).
# Evidence: docs/t5-kokoa-native-settings-pane.md
kokoa-category = Kokoa
kokoa-dsh-category = Kokoa dsh
kokoa-cpa-category = Kokoa CPA

kokoa-header =
    .heading = Kokoa

kokoa-shell-group =
    .label = Kokoa shell

## dsh sidecar (migrated from the removed legacy pane)

kokoa-dsh-status-dynamic =
    .label = { $text }

kokoa-dsh-open-workspace =
    .label = Open AI workspace
    .description = Open or reuse the main workbench tab (dsh home). No new session, no split.

kokoa-dsh-toggle-split =
    .label = AI split (layout only)
    .description = Side-by-side the current AI tab with the web page. Does not change session content.

kokoa-dsh-new-parallel =
    .label = New parallel AI session
    .description = Create a dsh session and open it in its own tab (#kokoa-session=).

kokoa-dsh-open-sessions =
    .label = Open session history
    .description = Open about:kokoases and jump into a session tab from the list.

kokoa-open-cpa-page =
    .label = Open CPA settings page
    .description = Separate category Kokoa CPA: model routing, upstream keys, aliases.

kokoa-open-dsh-page =
    .label = Open dsh settings page
    .description = Separate category Kokoa dsh: appearance, language, session defaults, tools.

kokoa-dsh-session-group =
    .label = dsh session & conversation defaults
    .description = Default permission, agent preset, busy Enter behavior, transcript view, session cwd.

kokoa-dsh-tool-group =
    .label = dsh tools · agent · search
    .description = Agent parallel tool calls, shell timeout/output limits, DeepSeek web search.

kokoa-dsh-busy-enter =
    .label = Enter when busy
    .description = Choose queue or steer.

kokoa-dsh-transcript =
    .label = Transcript view
    .description = Choose normal or compact.

kokoa-dsh-tool-parallel =
    .label = Agent max parallel tool calls
    .description = agent-loop.maxParallelToolCalls.

kokoa-dsh-shell-timeout =
    .label = Shell timeout (ms)
    .description = shell.timeoutMs, e.g. 120000.

kokoa-dsh-shell-maxout =
    .label = Shell max output (bytes)
    .description = shell.maxOutputBytes, e.g. 1048576.

kokoa-dsh-web-maxuses =
    .label = Web search max uses
    .description = web-search-deepseek.maxUses.

kokoa-dsh-web-baseurl =
    .label = Web search API base URL
    .description = web-search-deepseek.baseURL, may be empty.

kokoa-cpa-summary =
    .label = { $text }

kokoa-open-home =
    .label = Open Kokoa home
    .description = about:kokoa: workspaces / runtime lists / file tree.

kokoa-startup-home-first =
    .label = Open Kokoa home first at startup (recommended)
    .description = First screen is about:kokoa (status/lists/file tree), not the dsh home page.

kokoa-startup-workbench =
    .label = Open dsh workbench at startup
    .description = Use with Home-first off if you want dsh as the first screen.

kokoa-ai-max-parallel =
    .label = Max parallel AI session tabs (0 = unlimited; extra background tabs are discarded)

kokoa-ai-auto-discard =
    .label = Discard background AI tabs when opening a new session

kokoa-dsh-pref-group =
    .label = dsh general settings (sole entry)
    .description = Theme / language / default permission / default agent preset write dsh settings.yaml via the state bridge (~100ms hot reload). These are no longer managed in dsh’s own settings UI.

kokoa-dsh-theme =
    .label = dsh UI theme (system | light | dark)

kokoa-dsh-font-size =
    .label = dsh body font size (10–28)

kokoa-dsh-locale =
    .label = dsh UI language (e.g. zh-CN / en-US; may be empty)

kokoa-dsh-permission =
    .label = Default permission for new sessions (read-only | workspace-write | danger-full-access)

kokoa-dsh-agent-preset =
    .label = Default agent preset for new sessions (e.g. standard)

kokoa-dsh-session-cwd =
    .label = Working directory (cwd) for new parallel sessions (empty = dsh default)

kokoa-dsh-pref-msg =
    .label = { $text }

## Kokoa menu items (which entries appear in the app menu)
## Names must match KokoaMenubar.mjs PREF_PREFIX = "kokoa.menu."

kokoa-menu-new-tab =
    .label = New Tab

kokoa-menu-new-window =
    .label = New Window

kokoa-menu-print =
    .label = Print…

kokoa-menu-fxa =
    .label = Sign in (Firefox Account)

kokoa-menu-save-file =
    .label = Save Page As…

## Kokoa CPA (the only model exit for dsh)

kokoa-cpa-status-group =
    .label = Kokoa CPA model routing (sole management entry)
    .description = The Kokoa CPA card under dsh Settings Models is read-only status plus a jump here. This page is the sole management entry for CPA, upstream API keys and logical aliases. The product skips dsh Add-a-DeepSeek-API-key onboarding. The port below is the one cpa-embed actually listens on.

kokoa-cpa-upstream-group =
    .label = Upstream and model aliases
    .description = Saving rewrites config.yaml as a whole, then “Restart CPA” applies it. dsh only ever sees the four alias names.

# Status line — dynamic: one message per health state.
kokoa-cpa-status-checking =
    .label = Checking CPA status…

kokoa-cpa-status-bridge-down =
    .label = Kokoa state bridge unreachable ({ $bridge }) — CPA status, upstream settings and aliases can neither be read nor saved

kokoa-cpa-status-bridge-error =
    .label = The state bridge answered with an error: { $detail }

kokoa-cpa-status-stopped =
    .label = CPA is not running (port { $port })

kokoa-cpa-status-running =
    .label = CPA is running · port { $port } · upstream configured ({ $keys } api-key(s))

kokoa-cpa-status-running-no-upstream =
    .label = CPA is running · port { $port } · no upstream configured — model routing cannot work

kokoa-cpa-models-count =
    .label = Upstream models served: { $count }
    .description = { $list }

kokoa-cpa-models-none =
    .label = Upstream models served: 0
    .description = CPA answers on its port but serves no model at all: the upstream is missing, unreachable or fully cooling down. dsh would only report “TRANSPORT: Connection error.” without naming the route.

kokoa-cpa-models-unknown =
    .label = Upstream models served: unknown (state bridge unreachable)

kokoa-cpa-unmanaged =
    .label = config.yaml is not managed by Kokoa any more
    .description = The file has no Kokoa managed marker, so everything above is read-only — a hand-written configuration is never overwritten. Delete that marker line to let Kokoa manage it again.

kokoa-cpa-baseurl =
    .label = Upstream base-url (OpenAI compatible; empty = no upstream)
    .placeholder = https://your-flash-pool.example.com/v1

kokoa-cpa-apikeys =
    .label = Upstream api-keys (one per line; lines left untouched are kept as they are and shown masked again after saving)
    .placeholder = sk-…

kokoa-cpa-alias-code =
    .label = code → upstream model

kokoa-cpa-alias-cheap =
    .label = cheap → upstream model

kokoa-cpa-alias-strong =
    .label = strong → upstream model

kokoa-cpa-alias-vision =
    .label = vision → upstream model

kokoa-cpa-save =
    .label = Save

kokoa-cpa-restart =
    .label = Restart CPA

# Result of the last save / restart.
kokoa-cpa-msg-saved =
    .label = ✓ Saved — click “Restart CPA” to apply

kokoa-cpa-msg-saved-stale =
    .label = ✓ Saved — click “Restart CPA” to apply (the view could not be refreshed; it retries automatically)

kokoa-cpa-msg-restarting =
    .label = ✓ Restart requested, refreshing status in 2 seconds…

kokoa-cpa-msg-error =
    .label = ✗ { $detail }

kokoa-cpa-msg-truncated-key =
    .label = ✗ Line { $line } looks like a truncated key (it contains “…”) — paste the full key or clear that line

kokoa-cpa-msg-not-loaded =
    .label = ✗ The configuration has not been read yet, so saving is refused (an empty form would wipe the upstream settings). Check the state bridge and reopen this page.
