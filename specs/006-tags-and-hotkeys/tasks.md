# Tasks: Hotkeys, WhichKey, Tags

Status: tag-hotkey-routing-validated

## Estado 2026-06-08

`Task B2: Stabilize Post-Compound Main Window` esta cerrado. El runtime vigente mantiene el prefijo compuesto como global permanente, pero no registra next steps temporales globales ni emite pending desde Rust hacia el WebView principal.

Decision vigente: `ENABLE_COMPOUND_GLOBAL_SHORTCUTS = true` y `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`. El prefijo global entra en pending, muestra/focaliza Copicu por main thread, el renderer consulta `get_compound_hotkey_pending` por polling liviano y captura el siguiente paso con `document keydown`. WhichKey debe ser una UI observadora de ese pending estable, no el mecanismo de captura.

Validacion B2: `Ctrl+Alt+C,T` con `jp.compoundHotkeyToast` real (`log + ui.notify`) completa, los renderer heartbeats continuan, drag post-compuesto mueve por Win32 `GetWindowRect`, y la X custom post-compuesto completa `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.

Fix posterior 2026-06-08: el primer intento de temporales colgo Copicu porque registraba el shortcut temporal dentro del callback global. El handler ahora spawnea un thread para registrar/desregistrar temporales y procesar el avance, evitando reentrancia del plugin.

Segundo fix 2026-06-08: crear/posicionar la ventana de notificaciones desde el camino del shortcut global tambien dejo Copicu unresponsive. La ventana `notifications` ahora se prepara en startup; los shortcuts globales solo emiten eventos/toasts hacia superficies existentes.

Revision posterior 2026-06-08: se desactivo tambien la precreacion de `notifications` en startup para reducir superficies WebView durante dogfood. WebView2 CDP confirmo que la ventana principal renderiza correctamente; el blanco reportado era un item de imagen grande en el feed, no un WebView vacio. Los scripts compuestos de prueba usan ahora `ui.notify` nativo para feedback visual.

Revision shortcut simple 2026-06-08: `Ctrl+Shift+,`/tray/menu seguian mostrando la ventana principal desde callbacks nativos. Se cambio a tareas diferidas con pequeno delay y segundo intento de foco. Queda pendiente validar fisicamente que la ventana abierta por shortcut se pueda mover/clickear sin quedar en estado aparente de no respuesta.

Revision arquitectura 2026-06-08: las tareas diferidas no deben tocar ventanas Tauri desde threads propios. Se movio show/toggle a `app.run_on_main_thread(...)` y se agrego telemetria `[diag]` de ventana, renderer y drag. La prueba sintetica de `Ctrl+Shift+,` ahora muestra `focused=true` y heartbeats posteriores.

Revision script effects 2026-06-08: JP encontro un flujo mas preciso: la ventana principal funciona antes de ejecutar `Ctrl+Alt+C, T`; despues de que el script compuesto muestra feedback, volver a abrir la ventana principal la deja unresponsive. Se movieron efectos de scripts (`ui.notify`, `ui.markdownOutput`, `picker.show`, `picker.hide`) a helpers que despachan por `app.run_on_main_thread(...)`. Pendiente: dogfood manual real de `Ctrl+Alt+C, T -> Ctrl+Shift+,` y review completo del codebase para encontrar el mismo patron en otros callbacks/threads.

Fix parcial 2026-06-08: CDP mostro renderer vivo, pero IPC Tauri bloqueado despues de `ui.notify` nativo en main thread. `ui.notify` de scripts ahora emite toast local al WebView principal y dispara la notificacion nativa desde un thread separado. Tambien se movieron a main thread: hide diferido por focus-lost, emits de pending compuesto, toasts de `globalShortcut`/`clipboardChange`, y show/emit de `ui-host`. Validacion sintetica de `Ctrl+Alt+C, T -> Ctrl+Shift+,` paso con heartbeats e IPC CDP sanos. Dogfood posterior con Desktop Use mostro que antes del compuesto X custom y drag registran diagnosticos, pero despues de `Ctrl+Alt+C, T` la ventana se muestra y el proceso queda `Responding=True` mientras el renderer deja de emitir heartbeats/diagnosticos; X/drag custom no deben considerarse resueltos. `Alt+F4` sigue llegando como `window.event: main close requested`.

Fix B2 2026-06-08: el blocker se resolvio aislando el problema como ruptura de IPC renderer->Tauri causada por eventos/effects backend hacia el WebView durante el runtime compuesto, no por el body del script. `Ctrl+Alt+C,T` no-op rompia; hotkey simple no-op equivalente pasaba; mantener `app.emit(COMPOUND_HOTKEY_PENDING_EVENT)` tambien rompia justo despues del prefijo. Cambio aplicado: `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`; el prefijo global solo entra en pending y muestra/focaliza main por main thread; Rust no registra bare next-step globals ni emite pending hacia el renderer; el renderer consulta `get_compound_hotkey_pending` cada 250 ms y captura el segundo paso por `keydown`. Timeout compuesto: 3000 ms. Validado con `jp.compoundHotkeyToast` real (`log + ui.notify`): script completo, heartbeats continuos, drag post-compuesto medido con `GetWindowRect`, y X custom completa.

Tag hotkey routing 2026-06-08: hotkeys simples y compuestas guardadas en Settings Tags ya se registran en el registry comun como `ShortcutRoute::TagOpen { slug }`. La ruta abre/focaliza picker con `tag:<slug>` y no copia, pega ni activa automaticamente. Settings Tags muestra estados visibles (`Registered`, `Conflict`, `Invalid`, `Unsupported`, `Failed`, `Ready`) y no registra hotkeys conflictivos. Computer Use valido con datos sinteticos: `Ctrl+Shift+Y` abre `tag:1`, `Ctrl+Shift+I,A` abre `tag:context`, y `Shift+Enter` desde el picker pega en Notepad preservando la app previa. Checks: `npm run build`, `npm run visual:check` 66/66 y `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.

Evidencia/resumen:

- instancia correcta desde `C:\dev\chat\copyq-tauri`;
- Vite y backend vivos durante la investigacion;
- logs con `compound shortcut prefix pressed`, `main window show ok`, y luego sin segundo paso;
- intento de mitigacion aplicado: auto-expire backend, `get_compound_hotkey_pending`, sync frontend focus/visibility, root React persistente y foco nativo parcial;
- dogfood sintetico siguio sin ejecutar `Ctrl+Alt+C, H`; se observo `compound shortcut pending auto-expired`.

## Task A: Hotkeys Foundation

- [x] Define normalized grammar for simple hotkeys and compound hotkeys.
- [x] Implement parser/formatter for examples like `Ctrl+Shift+,` and `Ctrl+Alt+C, J`.
- [x] Define `ShortcutRoute` for picker, tags, scripts, commands and WhichKey.
- [x] Implement in-memory registry/trie.
- [x] Detect duplicate simple hotkeys.
- [x] Detect duplicate compound sequences.
- [x] Detect ambiguous compound sequences.
- [x] Add Rust tests with synthetic routes only.

## Task B: Compound Hotkey Runtime

- [x] Register global prefixes through `tauri-plugin-global-shortcut`.
- [x] Enter pending state when a global prefix fires.
- [x] Remember previous foreground window before focusing Copicu.
- [x] Capture follow-up keys reliably through focused WebView polling/keydown fallback while temporary global next-step shortcuts remain disabled.
- [x] Execute route when a full sequence matches in real dogfood.
- [x] Resolve or temporarily disable `Ctrl+Alt+C` perceived hang.
- [x] Evaluate temporary global next-step approach and reject it for the current runtime because it can break renderer->Tauri IPC.
- [x] Reset on timeout, Escape and blur, including backend-only auto-expire when frontend is unavailable.
- [x] Add stability regression checks for the B2 global shortcut callback path: no synchronous shortcut registration, no window creation/show, no blocking UI work.
- [ ] Audit all native callback/thread/script paths beyond B2 for main-thread-safety: `thread::spawn`, global shortcut callbacks, tray/menu callbacks, window event callbacks, script runner effects, notification APIs, `WebviewWindowBuilder`, window show/hide/focus, `emit`/`emit_to`, and plugin APIs with UI effects.
- [x] Move picker shortcut/tray/menu show/toggle out of native callbacks.
- [x] Route deferred window show/toggle back through Tauri main thread.
- [x] Route script UI effects currently known to be risky (`ui.notify`, `ui.markdownOutput`, `picker.show`, `picker.hide`) back through Tauri main thread.
- [x] Add temporary stability diagnostics for window show/focus, renderer heartbeat, renderer errors and drag.
- [ ] Route or explicitly constrain `picker.activate` + `hidePicker` from script/global contexts so `host::hide_picker` does not run from background while preserving hide -> focus previous -> paste ordering.
- [ ] Add tests or harness coverage for pending-state transitions.

## Task B2: Stabilize Post-Compound Main Window

Objective: fix the current blocker where `Ctrl+Alt+C, T` completes, `Ctrl+Shift+,` shows the main window, but the renderer stops emitting heartbeats/diagnostics and custom chrome controls stop working.

Acceptance criteria:

- [x] Baseline before compound: `Ctrl+Shift+,` opens main window, renderer heartbeat continues, custom X logs `window-control-hide-click -> hide-picker-command-ok`, and drag moves the window as measured by Win32 `GetWindowRect`.
- [x] Compound no-op variant: `Ctrl+Alt+C, T` with script body reduced to no-op does not break renderer heartbeat, custom X, or drag after the runtime fix.
- [ ] Compound log-only variant does not break renderer heartbeat, custom X, or drag.
- [ ] Compound local-toast-only variant does not break renderer heartbeat, custom X, or drag.
- [x] Compound native-notification/current notify variant is proven safe through `jp.compoundHotkeyToast`.
- [x] Compound current `jp.compoundHotkeyToast` variant passes the full flow: execute, reopen, heartbeat continues, custom X hides, drag moves by `GetWindowRect`.
- [x] Hotkey-simple equivalent of the same script is tested to distinguish global-shortcut runtime from script/feedback effects.
- [x] Diagnostics never block user controls: drag, X/hide and close must not await `record_renderer_diagnostic` before performing the action.
- [x] If the failure recurs, classify with evidence as one of: Rust main thread blocked, renderer JS blocked, renderer->Tauri IPC blocked, focus/foreground issue, WebView2 alive but UI event delivery broken, or global-shortcut reentrancy.

Protocol:

- [x] Before restart/kill: capture exact `copicu.exe` PID/path, `127.0.0.1:1420`, `127.0.0.1:9222`, current `.codex-run/tauri-dev-*.log`, CPU/Responding for Copicu/WebView2, visible/focus state, and latest `[diag]` lines.
- [x] Use only synthetic scripts/data; do not persist real clipboard payloads.
- [x] Avoid Desktop Use coordinates on the top-right X while the "Codex is using your computer" overlay is present; prefer logs, keyboard alternatives, or controls away from the overlay.
- [x] For drag validation, do not rely on visual impression; measure before/after with Win32 `GetWindowRect`.
- [x] Do not advance WhichKey or tags until this task passes.

## Task C: WhichKey

- [ ] Define `WhichKeyState` derived from the hotkey registry.
- [ ] Support route `WhichKeyOpen(prefix)`.
- [ ] Support automatic reveal after `revealDelayMs`.
- [ ] Decide dedicated `whichkey` window vs command palette mode.
- [ ] Render compact grouped entries.
- [ ] Dismiss on Escape, timeout and blur.
- [ ] Add visual checks for desktop and narrow layout.

## Task D: Tags Backend Foundation

- [x] Add `tag_configs` migration.
- [x] Implement tag parsing/normalization helper shared by metadata and tag listing.
- [x] Implement `list_tags` with counts derived from normalized tag relations migrated from `clipboard_items.tags`.
- [x] Implement `create_tag`, `update_tag_config`, and `set_item_tags` storage APIs.
- [x] Expose Tauri commands for `list_tags`, `create_tag`, `update_tag_config`, and `set_item_tags`.
- [x] Add Rust tests with synthetic tags only.
- [x] Add Settings UI wiring for the tag list, create tag, pin, hotkey field, and open filtered.

## Task E: Tag Hotkey Routing

- [x] Register tag hotkeys/sequences in the unified registry.
- [x] Validate conflicts across picker/scripts/tags/WhichKey.
- [x] Add `open_picker_for_tag` backend command.
- [x] Emit frontend event to set picker query to `tag:<slug>`.
- [x] Dogfood simple tag hotkey opens picker filtered by `tag:<slug>` without activating or pasting an item.
- [x] Dogfood compound tag hotkey opens picker filtered by `tag:<slug>` while keeping temporary next-step globals disabled.
- [x] Confirm `Shift+Enter` after tag hotkey still pastes into the pre-hotkey app.

## Task F: Tags UI

- [x] Decide standalone `tags` window vs Settings section.
- [x] Add Tags entry point from picker/settings.
- [x] Build searchable tag list with counts and hotkey/sequence control.
- [x] Show shortcut diagnostics inline.
- [x] Add "open filtered" action per tag.
- [x] Replace free-text tag hotkey field with reusable `HotkeyRecorder`.
- [x] Normalize saved hotkeys through Rust command `normalize_hotkey_sequence`.
- [x] Support simple and compound hotkeys in Settings Tags.
- [x] Reassign existing tag hotkey without `UNIQUE constraint failed` by temporarily clearing/restoring during recording.
- [x] Compact Tags list item: no duplicated `#slug`, no long saved-config hint, visible `Pending` state only.
- [x] Computer Use dogfood: reassign same hotkey on same tag and record compound `Ctrl+Shift+I, A`.

## Task G: Verification

- [x] `npm run build`.
- [x] `npm run visual:check`.
- [x] `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`.
- [ ] `npm run rust:test` runtime pass. Current 2026-06-08 result: tests compile, then the test executable exits with `STATUS_ENTRYPOINT_NOT_FOUND` before running.
- [x] Manual dogfood with synthetic scripts/data and no real clipboard payload persistence.
- [x] Manual dogfood sequence: confirm baseline main window opens/drags, run `Ctrl+Alt+C, T`, confirm script completion, then reopen main window and confirm it remains draggable/clickable with renderer heartbeat.
- [x] If unresponsive recurs, classify using diagnostics before patching: Rust main thread blocked, renderer blocked, focus/foreground issue, WebView2 alive but IPC/drag hung, or global-shortcut plugin reentrancy.
- [x] Confirm `Shift+Enter` paste-to-previous-window still targets the pre-hotkey app.
