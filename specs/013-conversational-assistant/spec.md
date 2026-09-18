# Conversational assistant prototype

Status: implemented, focusless extension verification complete; native foreground/copy/paste checks require a separate authorized run. Owner: Copicu. Updated: 2026-09-18.

## Product decision

An opt-in standalone chat operates the same local product as the picker and scripts. It is a general tool-using agent, not predefined OCR/summarize workflows. It knows its full available tool catalog upfront. SQL is genuinely read-only; modifications go through product operations. Clipboard content is data, never authority. Missing capabilities must be explained precisely, not bypassed with SQL writes or invented tools.

The picker remains unchanged in normal use: no background model requests, no eager assistant window, no blocking network work on the UI thread. Use existing OpenAI-compatible AI configuration, Markdown renderer, Node runtime and native window infrastructure; install no dependencies.

## First complete slice

- Standalone `assistant` document window, lazy loaded; entry from picker command/context menus, tray and a global shortcut independent of picker visibility.
- Durable local single conversation with New conversation, streaming text, Markdown/code/tables, visible tool activity, cancellation, retry by continuing, and pending effect approval. No canvas editor or multiple-conversation browser in this slice.
- Backend-owned picker context with ordered selected IDs, active ID, current query and loaded/visible IDs explicitly distinguished from the full query result. Capture context on each user turn; old references retain their IDs. Read current context through a tool when requested.
- Model loop supports general multi-step composition and actual image content. It receives only requested contents, not whole history. Credentials never enter frontend, tool output, conversation or logs.
- Tools cover context, database schema/query, full item read and image read, structured history search with pagination, create/update/remove/promote, tag listing, export without overwrite, action catalog/run, save reusable script, and existing host APIs where applicable. Tool results report actual effects/errors and partial completion, never fabricate success.
- New history items are created by storage API, not clipboard recapture. Agent supports reusable scripts through existing action manifests/runner, not a second scripting language.
- YOLO is the default execution mode. In optional Confirm mode, mutation/export/script execution requests have an operation card with exact arguments and approval. Read operations require no per-tool approvals. Host-generated approval IDs authorize exactly one pending operation; provider IDs cannot be replayed as approvals. Closing/cancelling never approves. Saving a `clipboardChange` script requires explicit `activateClipboardChange: true`, since saving also enables future automatic execution.
- SQL opens a separate read-only connection, refuses non-read statements, attached DBs, dangerous pragmas/extensions, and credential-bearing settings. A safe settings summary comes via product API. Bounded rows/bytes/time with explicit pagination/truncation metadata; no silent subset described as complete.
- Existing configured provider is the destination. Send initiates transfer of the requested content without a separate session acknowledgement or transfer flag. No requests in idle and no new external destinations in tools.
- Authorized local operations on user-owned sensitive clips use item IDs and local actions/scripts; preserve complete values in the local destination, not masks or truncated fragments. Read the persisted destination locally and return `ActionVerification` with computed boolean checks, counts and IDs, never content or count notes as a substitute for verification. A false check or invalid report fails the action and terminates the assistant turn before another tool/provider request; completed effects are not rolled back. Provider/application credentials remain inaccessible. Do not mistake this for a blanket ban on local clipboard manipulation.
- No claim of universal undo/atomic batches. Reuse existing transactional operations, report boundaries honestly. The prototype is tested in an isolated profile; installed personal data is not a test target.

## Architecture and integration contract

### Shared wire types

Item IDs use decimal strings in assistant tool arguments and product DTOs; Rust validates them against numeric storage IDs. SQL rows retain SQLite scalar types and requested column names; search cursors retain their native numeric fields. DTO property names use camelCase.

`AssistantContext = { activeItemId: string|null, selectedItemIds: string[], query: string, visibleItemIds: string[] }`.

`AssistantMessage = { id: string, role: 'user'|'assistant'|'tool', text: string, toolName?: string, arguments?: object, status?: 'running'|'completed'|'failed'|'denied', createdAt: number }`.

`AssistantApproval = { id: string, name: string, arguments: object }`.

`AssistantSnapshot = { messages: AssistantMessage[], running: boolean, context: AssistantContext, approval: AssistantApproval|null, error: string|null, configured: boolean, model: string, reasoningEffort: string|null, defaultModel: AssistantModelChoice|null, executionMode: 'confirm'|'yolo', endpoint: string }`.

Tauri commands:
- `open_assistant_window({ context?: AssistantContext })`, main/assistant callers. Tray/hotkey use same native helper.
- `assistant_update_context({ context })`, main only; last-known state persists on hide.
- `assistant_snapshot() -> AssistantSnapshot`, assistant only.
- `assistant_send({ text: string }) -> void`, assistant only, returns promptly after spawn.
- `assistant_cancel() -> void`.
- `assistant_approve({ id: string, approved: boolean }) -> void`.
- `assistant_reset() -> void`, reject while running.
- Event `copicu://assistant/updated` carries a fresh `AssistantSnapshot` (coalesced streaming updates).
- `assistant_list_models() -> { endpoint: string, models: AssistantModelOption[] }`, assistant only; real provider catalog, no credentials in the response.
- `assistant_set_model({ model: string, reasoningEffort: string|null, makeDefault: boolean }) -> AssistantSnapshot`, assistant only; reject during a turn.
- `assistant_set_execution_mode({ mode: 'confirm'|'yolo' }) -> AssistantSnapshot`, assistant only; reject during a turn.

`AssistantModelChoice = { model: string, reasoningEffort: string|null }`.
`AssistantModelOption = { id: string, name: string, reasoningEfforts: string[] }`.

Backend runtime state `assistant::AssistantState` owns context, conversation, cancellation and approval, persisted under the active profile. Blocking work stays off the event loop. Reopening an interrupted run marks unfinished messages failed and warns that completed effects were not rolled back; pending operations never resume automatically.

### Agent process protocol

Node stdlib only: `scripts/copicu-assistant-runner.mjs`, uses fetch and OpenAI-compatible chat completions SSE, no new package installation or bundle dependency trees. A run is one user turn with a tool loop.

Rust writes initial NDJSON line `{kind:'start', endpoint, model, apiKey, messages, context, tools}`. `messages` contains persisted provider-format messages, separate from UI messages. `tools` is full catalog in `scripts/assistant-tools.json`.
Node emits `{kind:'delta',text}`, `{kind:'toolCall',id,name,arguments}`, `{kind:'done',messages}`, or `{kind:'error',message}`. Rust replies `{kind:'toolResult',id,result,fatal:false}` or `{kind:'toolResult',id,error,fatal}`. Verification failures from `action_run` set `fatal:true`; Node emits an error and exits before queued tools or another provider request. Stdout is protocol only. Cancellation kills and reaps the child, including while waiting for approval. Preserve completed effects and terminal status on cancellation; no blind automatic retry of mutations.

Catalog entries: `{name,description,parameters,effect:'read'|'write'|'external'}` using JSON Schema parameters. Name uses provider-safe underscores (e.g. `history_get`, `database_query`). Runtime uses effect to request approval. Catalog describes known limitations and schema explicitly.

`assistant_operations::catalog() -> serde_json::Value` returns included catalog.
`assistant_operations::execute(app: &tauri::AppHandle, storage: &AppStorage, context: &AssistantContext, name: &str, arguments: serde_json::Value) -> Result<serde_json::Value,String>` executes one tool. New module can be cfg(not(test)) with testable storage query helpers in a separate always-built module.

Image tool result convention: `{itemId, mimeType, dataUrl}`. Runner converts dataUrl to actual image_url content in a user message associated with the tool result, removes raw dataUrl from textual tool output/UI logs. Never claim vision when provider rejects it. Budget overflow is explicit.

Runtime settings reuse `ai_planner::resolve_ai_runtime_settings`; expose narrowly rather than duplicate key lookup. Agent child path resolves shipped resources and source dev convention.

### Implementation map

- Operations: `assistant_operations.rs`, `assistant_database.rs` and the shared JSON tool catalog; existing storage/action gateway handles writes.
- Runtime: `assistant.rs` and `copicu-assistant-runner.mjs`; existing AI settings resolution.
- UI: `AssistantWindowApp.tsx`, shared assistant DTOs, picker context/menu integration.
- Native integration: `lib.rs`, surface registry, assistant capability and packaged runner/catalog.

No dependency installation, release, local installation or publication is part of this prototype.

## Acceptance

1. Open chat while picker hidden and via selected-item context; reopen retains messages. State update does not reset selection or steal focus.
2. Synthetic text + image fixtures: list selection, then refer to subset in next turn; actual image OCR/question produces Markdown, save through create API, query it back.
3. Query schema and arbitrary safe SELECT/CTE/join with pagination; prove UPDATE/DELETE/ATTACH/unsafe PRAGMA denied and original DB unchanged.
4. Search results beyond loaded rows accessible. Ranges expressible by ordered SQL or explicit IDs without UI dependence.
5. Approve one mutation/export, observe exact effects, deny another, observe no effect. Export preserves originals and refuses overwrite. Save a valid named script and execute through existing actions.
6. Cancel during response/approval and continue; errors visible without fictitious success. Completed tools remain visible.
7. Native picker open/search/navigation/copy path still works while assistant is open. No model requests in idle.
8. Build frontend/Rust, run targeted protocol/database regression tests and required visual checks; prove provider path against a real configured model with synthetic data if credentials are available. Local fixture server proves protocol only, not model quality; report distinction.

### Verified behavior

- Native isolated profile and a real configured `openai/gpt-4.1-mini` provider:
  text/image context, receipt OCR, multi-turn reread, approved Markdown creation
  and exact export, reusable manual script save/discovery/run and query-back.
- The model initially invented a receipt date without rereading. Denying that
  create left storage unchanged; an explicit image reread corrected it. This
  validates approval/recovery, not universal model accuracy.
- A local deterministic provider exercised repeated provider call IDs with
  distinct host approvals, stale-approval rejection, denied writes, SQL
  write/ATTACH/PRAGMA/settings rejection, real CTE/join pagination, no-overwrite
  export, automatic-trigger save rejection, cancellation during stream/approval,
  next-turn recovery and native restart with a pending deletion.
- Earlier baseline C0: external textbox -> global picker hotkey -> global typing,
  with `SCRIPT_NATIVE_OK` visible and selected without manually focusing the picker.
  The 420×620 assistant window has no horizontal overflow and approval controls
  remain accessible by conversation scrolling.
- Frontend and native builds passed; Rust tests: 246 passed, 1 ignored.
  Current `assistant:smoke`: 15 runner tests and 8 desktop/narrow renderer
  regressions passed. The earlier full visual baseline passed 362 tests.
- Native clipboard copy is not claimed as passed. The installed profile has
  capture enabled; automated checks must not write fixtures to its shared
  clipboard or activate host windows. Foreground hotkey/focus/paste validation
  requires a separately authorized run, not a hidden-window substitute.
  Installed history was not used or modified by these tests.

## Model, autonomy and composition extension

- JP requested Luna High **inside Copicu**, not a coding-agent model switch.
  The configured OpenRouter catalog exposes `openai/gpt-5.6-luna`, including
  `high` in `reasoning.supported_efforts`. Use `reasoning: { effort: "high" }`
  for OpenRouter; never claim high while omitting it from requests.
- Use a compact header with a searchable model selector showing the catalog
  name without repeating its technical ID, a narrow reasoning selector and an
  explicit default action. The reasoning selector includes provider Default.
  Load real provider models; catalog failure is visible, never a fake list.
- Explicit assistant choice overrides the global AI model fallback, including
  its environment override, without changing other AI features. A default is
  durable across restart and New conversation. Capture model/effort per turn;
  disable changes while running.
- YOLO is the default, including reset/restart, with a visible mode label:
  writes, exports and trusted scripts run without per-operation approval.
  Confirm is an optional session override. SQL restrictions, no-overwrite
  exports, cancellation and the automatic-script activation contract remain
  in force. The model receives the actual execution policy.
- Add `picker_focus({ itemId: string })`: show the normal unfiltered picker and
  make the requested item active without clipboard effects. It does not reorder;
  use `history_promote` first when the result must be first. A completed result
  requires the renderer to acknowledge actual selection after loading, not just
  successful event dispatch. Reuse native show/reset and selection machinery.
- Use case 1: three explicitly selected clips -> combined new clip -> promote
  -> actual active first row. Preserve originals unless deletion is requested.
- Use case 2: search JP in editable metadata (title, notes, tags) over the whole
  history, including matches outside loaded rows; summarize all matching clips.
  Include a content-only JP negative control and an unloaded matching fixture.
- Verify Luna High requests and default persistence, Confirm/YOLO boundaries,
  both real-model use cases and the actual native UI without activating host
  windows. Synthetic profile only; no personal history, installation or
  publication. Foreground acceptance is separate: `docs/DEVELOPMENT.md`.

### Extension verification

- Real `openai/gpt-5.6-luna` with High: header selection, saved default surviving
  reset/restart and in-flight changes rejected.
- YOLO created an exact synthetic clip without an approval response.
- Metadata search used native field scopes and full contents, found title,
  notes and lowercase-tag matches outside captured picker rows, and excluded a
  body-only match. The result cursor was exhausted.
- Real-model composition read three exact source IDs, created their ordered
  concatenation and promoted it first; source texts and an unselected control
  remained intact. Native `picker_focus` was deliberately not invoked.
- Headless desktop/narrow regressions prove three checked rows plus a filter
  become an unfiltered, single active first result; a separate case loads and
  activates an item beyond the initial page. Native request tests reject stale,
  mismatched and negative renderer acknowledgements.
- Generic history invalidation refreshes a created item into the visible picker
  without moving keyboard focus. The regression reproduced the null-payload
  exception before the fix and passes in desktop/narrow layouts.
- Sending with Enter or the Send button retains composer focus through dispatch,
  streaming and errors. The next draft survives completion; failed sends keep
  their text editable. The regression failed before the readonly fix.
- The hidden native 420×620 UI has no horizontal overflow. The reusable
  background launcher kept both windows hidden with the clipboard watcher
  disabled; the foreground-event observer recorded zero Copicu activations.
- Real Luna High consolidated 35 complete unique synthetic keys across 180
  native history items, including duplicates, a masked negative control and an
  older promoted seed. The stored destination matched all expected values;
  final ID/count notes and the assistant's report agreed. A local egress guard
  checked every provider request: no fixture values left the host or entered
  the conversation. No clipboard/focus/window actions were requested by the
  generated script.
- Script discovery's regex/comment/division regression failed before the
  delimiter scanner fix and passed after it; Rust: 247 passed, 1 ignored.
- Real Luna Default requested clarification for “Opera Router” before history
  access and consolidated 9 unique synthetic keys across 81 source items.
  A follow-up against injected literal `\n` separators repaired the persisted
  item after an unchanged-output report: exact values/order and metadata
  preserved, 16 actual LF characters, 8 blank separators, no literal `\n`.
  The local provider egress guard observed no fixture values in the final flow.
- Native negative controls reject false checks, arbitrary string fields and
  a forged completed result with a false check; completed writes remain.
  A real-model failed check terminated the turn rather than claiming success.
  Node regressions prove fatal replies stop queued tools and the next provider
  request, and distinguish actual newlines from intentional literal backslashes.
  `assistant:smoke`: 21 Node and 8 renderer cases passed.

## Iteration

After dogfood: missing capability reports drive API improvements, stronger recovery/backup and batch guarantees, optional canvas, multiple conversations and model profiles. These are not simulated in the first slice.
