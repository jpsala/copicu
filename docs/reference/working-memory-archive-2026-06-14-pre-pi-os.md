# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-13.

## Regla

Este archivo es router operativo, no historia. La version larga previa quedo archivada en `docs/reference/working-memory-archive-2026-06-10.md`.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Revisar otra extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md`, `specs/008-clipboard-enrichment/spec.md` | Flujo manual de edicion de shortcuts de scripts validado; patch preview queda opcional/futuro si JP lo pide. |
| Performance/UI windows | active | `docs/topics/custom-window-system.md`, `docs/topics/ui-surface-architecture.md`, `docs/tracks/010-ui-rethink.md` | Dogfood prewarm de `metadata`; mantenerlo si la velocidad percibida compensa el coste idle. |
| Open source growth | active | `docs/tracks/013-open-source-growth.md` | `v0.2.1` publicado y PR `#10` mergeado a `main`; siguiente paso: elegir proximo frente de crecimiento o release hardening. |
| Dev/instalada | active | `docs/topics/windows-installer.md`, `docs/tracks/014-performance-memory.md` | `install:current` ya quedo revalidado end-to-end; siguiente corte: decidir si recuperar code split o atacar el warning de chunk grande. |
| OS Lite/docs | active | `docs/topics/docs-knowledge-system.md` | Mantener ruta caliente liviana; usar `docs/topics/agentic-os-operations.md` para `realinear os`. |
| Skills locales | reference | `docs/topics/local-codex-skills.md` | Abrir solo para crear/revisar skills locales o discutir costo de discovery. |

## Specs Activas

| Spec | Estado | Abrir |
| --- | --- | --- |
| `004-actions-scripting-api` | active | `specs/004-actions-scripting-api/spec.md` |
| `005-search-plan-engine` | active | `specs/005-search-plan-engine/spec.md` |
| `006-tags-and-hotkeys` | active | `specs/006-tags-and-hotkeys/tasks.md` |
| `008-clipboard-enrichment` | draft | `specs/008-clipboard-enrichment/spec.md` |

## Decisiones Vigentes

- Copicu es CopyQ-inspired, no CopyQ-compatible.
- Stack vigente: Tauri 2, React/Vite/TypeScript, Rust, SQLite, Mantine donde aporta.
- Preferencia de producto JP: favorecer velocidad/latencia percibida agresivamente por defecto; aceptar coste extra razonable de memoria/procesos si no es extremo.
- Paste-to-previous-window sigue siendo el flujo nativo mas riesgoso.
- Open source Windows `v0.2.1` queda como release actual.
- Scripts/AI deben usar host APIs/capabilities, no SQL/shell/fs/network crudo.
- Clipboard enrichment v1 arranco como logica interna post-capture, no scripting-first.
- Para UI relevante, usar `docs/topics/ui-design-and-impeccable.md`.
- `docs/skills/` es la fuente canonica de skills locales; `.agents/skills` queda como junction de compatibilidad.
- Para nuevos comandos operativos, preferir modelo hibrido: skill corta para discovery y logica durable en topic/script/doc canonico.
- La ruta inicial debe seguir liviana; no convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activos en transcript.
- Instalada es la herramienta diaria: `%APPDATA%\dev.jpsala.copicu\copicu.sqlite3`. Dev no debe tocar esa DB por defecto.
- Comando conversacional `actualizar instalada`/`promover dev a instalada`: ejecutar `npm run install:current`.
- Al aplicar OS Lite a otros proyectos, copiar/fusionar `docs/skills/` y recrear `.agents/skills` con `scripts/ensure-skills-link.ps1`.
- Dev aislado: `npm run tauri:dev`, `npm run dev:built`, `npm run dev:restart`; app data `.codex-run\dev-isolated\app-data`, hotkey `Ctrl+Shift+.`, tray `Copicu Dev`.

## Riesgos

- Worktree esperado tras merge de release: rama `main` limpia y alineada con `origin/main`; PR `#10` mergeado.
- No confiar en `Process.Responding` como readiness de WebView.
- `visual:check` puede fallar por infraestructura Vite/WebView, no necesariamente por assertions.
- En shortcuts globales, evitar next-step globals temporales y emits backend hacia `main` sin harness.
- Dogfood hotkeys filtrados: JP confirmo `020`-`024`; no volver a implementar hotkeys nativos por tag.
- Lifecycle: Settings cacheada acelera reapertura y cuesta una WebView extra; no cambiar `hide()` a `destroy()` sin prueba visual/foco.
- Ventanas futuras: seguir `docs/topics/custom-window-system.md`; superficies ricas fuera del picker deben ser standalone via surface registry host-owned, con label/capability/lifecycle/bounds/allowedCommands propios, un solo `index.html` + routing por label por defecto, y no `ui-host` transparente generico.
- Surface registry host-owned existe en `src-tauri/src/surface_registry.rs`; settings queda lifecycle `cached/hidden` por ahora. Capabilities separadas por superficie reemplazan `default.json`, y comandos con guards dependen de `window.label()`.
- Clipboard enrichment slice 2026-06-12: `src-tauri/src/enrichment.rs` ahora detecta tipos textuales como `path`, `url`, `json` y `code`. Sigue siendo local y post-capture.
- Clipboard enrichment slice 2026-06-12: Settings minimos viven en `AppSettings.enrichment` con `enabled`, toggles por detector y `applyMode` (`autoApply` / `suggestOnly` placeholder). Watcher solo auto-aplica cuando `enabled` y `autoApply`.
- Clipboard enrichment slice 2026-06-12: API host minima para scripts expuesta via `enrichment.runForItem(itemId, options?)` y `enrichment.getResult(itemId)`, con capabilities `enrichment:run` y `enrichment:read`.
- Clipboard enrichment slice 2026-06-12: persistencia rule-based sigue usando `tags` + `clipboard_item_tags`, sincroniza `clipboard_items.tags`, y ahora conserva `confidence` por detector en relaciones `source=rule`.
- Clipboard enrichment dogfood 2026-06-12: script `026-inspect-enrichment-active.ts` queda usable desde picker con shortcut local `Ctrl+Alt+E`. El parser estatico del registry era fragil con template literals; la version activa se simplifico para evitar falso `missing defineAction({...}) export`.
- Clipboard enrichment dogfood 2026-06-12: script `027-toast-path-clipboard-change.ts` ahora usa `enrichment.getResult()` para mostrar una señal visible de cualquier detector matcheado durante `clipboardChange`, incluyendo si el resultado quedo auto-aplicado o solo sugerido.
- Clipboard enrichment policy 2026-06-12: `enrichment.runForItem()` ya no auto-aplica por default cuando `enabled=false`; el default de aplicacion ahora requiere `enabled && autoApply`, pero `{ apply: true }` permite aplicar manualmente desde scripts. `EnrichmentResult` expone `autoApplyEnabled` y `manualApplyAllowed`; copias activas de `026`/`027` y `copicu-action.d.ts` quedaron sincronizadas en `Documents\Copicu\Scripts` y `.codex-run\dev-isolated\scripts`.
- Clipboard enrichment dogfood 2026-06-12: watcher real validado en perfil aislado sin tocar la instalada. Casos sinteticos confirmados en DB/logs: `autoApply` aplico `path` con `source=rule` y `confidence=1.0`; `suggestOnly` detecto `url` sin persistir tags; `enabled=false` detecto `json` sin persistir tags. `027` mostro la diferencia via toast/log en los tres casos.
- Clipboard enrichment dogfood 2026-06-12: el bug principal del picker dev estaba en `window_state::restore()` usando APIs de monitor del `WebviewWindow` demasiado temprano. El restore ahora usa `AppHandle` para cursor/monitores y dejo de disparar `window main monitors failed`; `show_main_window` volvio a abrir la `main` en bounds normales (`820x620`) en vez de `6x6` negro.
- Clipboard enrichment dogfood 2026-06-12: `enrichment.getResult()` tenia un bug semantico y devolvia `manualApplyAllowed=false` siempre porque entraba con `allow_apply=false`; la ruta host fue corregida para reflejar que scripts manuales si pueden aplicar tags via `runForItem({ apply: true })`.
- Clipboard enrichment dogfood 2026-06-12: sigue pendiente dogfoodear `026` por `Ctrl+Alt+E` con gesto realmente aceptado por el renderer. Tras corregir restore/render, la inyeccion sintetica usada en esta sesion no genero `action_runs` de `examples.inspectEnrichmentActive`; el bloqueo remanente ya parece de foco/input local shortcut y no del picker ni de la policy.
- Runtime dev diagnostics 2026-06-12: con watcher desactivado el renderer seguia llamando `get_capture_snapshot()` y `get_capture_stats()` aunque `ClipboardCapture` no estaba `manage()`-ado, generando `unhandled-rejection` continuo por `state not managed for field capture`. Los comandos ahora devuelven defaults vacios cuando el watcher no existe, evitando ruido y una app aparentemente rota en perfil aislado.
- Runtime dev diagnostics 2026-06-12: `main` consultaba `get_compound_hotkey_pending()` aunque el comando solo aceptaba `whichkey`. El guard backend ahora permite `main` y `whichkey`, eliminando el spam `get_compound_hotkey_pending cannot be called from window 'main'`.
- Metadata prewarm 2026-06-12: la surface `metadata` ya no debe quedar asomada por prewarm. El prewarm ahora fuerza `hide()` despues de construir/restaurar y deja traza `metadata.prewarm.done ... visible=false`.
- Shortcuts env 2026-06-12: los fallos `HotKey already registered` vistos en dev no salieron de una regresion nueva del repo sino de convivencia entre dos procesos vivos (`C:\Users\jpsal\AppData\Local\Copicu\copicu.exe` instalada y `src-tauri\target\debug\copicu.exe` dev). Para dogfood de shortcuts globales conviene cerrar una de las dos o usar bindings no superpuestos.
- Dev runtime 2026-06-12: `restart-dev.ps1`/`isolated-dev.ps1` ya soportan watcher activo en perfil aislado via `-EnableClipboardWatcher` y scripts npm `dev:restart:watcher` / `tauri:dev:watcher`.
- Global shortcut startup 2026-06-12: se removio el registro hardcodeado del picker shortcut en init del plugin Tauri; ahora el startup depende del refresh desde settings reales, evitando colision entre instancias con hotkeys distintas.
- Tests Rust focalizados 2026-06-12: `cargo test` sigue bloqueado a runtime nativo en este entorno; pruebas focalizadas abortaron con `STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139)` despues de compilar, no por error de compilacion. Para el ajuste de enrichment policy pasaron `cargo check`, `npm run build` y typecheck TS focalizado de `026`/`027`.
- Instalada/build 2026-06-12: `npm run tauri:build` volvio a pasar y genero `src-tauri\target\release\bundle\nsis\Copicu_0.2.0_x64-setup.exe`. Revalidar `npm run install:current` antes de usarlo como promocion rutinaria, pero el bundling NSIS dejo de estar bloqueado.
- Instalada/build 2026-06-12: `npm run install:current` quedo revalidado end-to-end sobre la instalada real. El script rebuildo (`npm run tauri:build`), genero `src-tauri\target\release\bundle\nsis\Copicu_0.2.0_x64-setup.exe`, cerro `copicu.exe`, instalo en silencio y relanzo `C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`.
- Build warning 2026-06-12: la promocion instalada sigue mostrando warning Vite por chunk `dist/assets/index-*.js` >500 kB. No bloqueo release ni instalacion, pero sigue pendiente revisar si conviene recuperar code split sin reintroducir el problema previo de `html-proxy`/boot entry.
- Publicacion GitHub 2026-06-12: rama `codex/release-0.2.0`, PR draft `#9` y release final `v0.2.0` quedaron publicados con instalador NSIS y SHA256 documentado.
- Primer surface nuevo: `metadata`, label/capability propias, pending payload Rust, ventana standalone para edit metadata single-item desde Tauri; el editor inline queda como fallback visual/web.
- Diagnostico UI 2026-06-12: captura de `Assign metadata` fea no era la nueva ventana `metadata`, era `scripts/examples/025-assign-metadata-to-active.ts` usando `copicu.ui.input()` sobre `ui-host`. El ejemplo ahora usa `copicu.metadata.editActive()` y la surface standalone `metadata`; `ui-host` queda reservado para alert/confirm/input chico. Copias activas actualizadas en `Documents\Copicu\Scripts` y `.codex-run\dev-isolated\scripts`.
- Metadata UX 2026-06-12: ventana standalone enfoca `Title` al abrir; atajos `Escape`, `F2`, `Ctrl+Enter` funcionan desde todo el formulario. Checks pasaron: `npm run build`, `npm run visual:check` 80/80.
- Performance ventanas 2026-06-12: fuente externa WebView2 confirma que crear/navegar un WebView2 en cold start puede ser cuello de botella y que cada control suma procesos/memoria. Hipotesis local: `metadata` warm deberia ser rapido por `CachedHidden`; si cold lento y warm rapido, usar prewarm/cache; si warm sigue lento, medir lifecycle/bundle/IPC.
- Performance `metadata` medida 2026-06-12 con `scripts/dev/measure-metadata-window.ps1`: sin prewarm, cold direct visible 681 ms / Title focused 745 ms; warm direct 425/428 ms; warm script 414/418 ms. Backend cold build 136 ms, total hasta emit 201 ms; warm backend 67-86 ms. Se corrigio deadlock de comando sync despachando `open_metadata_window` via thread + `run_on_main_thread`.
- Performance `metadata` prewarm 2026-06-12: se crea oculta 350 ms despues de setup. Medicion aislada `20260612-094624`: prewarm build 126 ms / done 128 ms; primera apertura directa ya cacheada visible 207 ms / focused 210 ms; warm direct 137/139 ms; warm script 130/131 ms. Coste idle observado: WebView2 processes aprox. 10 -> 13 y private MB aprox. 342 -> 405 en harness aislado. Decision: mantener `CachedHidden` + prewarm por preferencia de velocidad percibida de JP, salvo que dogfood muestre coste extremo.
- `visual:check` puede fallar si el entorno local descubre mas scripts que los fixtures esperados; el fixture fue actualizado a 7 scripts cuando se sumo `025`.
- Dev con `COPICU_DISABLE_CLIPBOARD_WATCHER=1` evita doble captura junto a instalada, pero deja pendiente limpiar comandos/diagnosticos de capture state para no loguear errores de stats.
- `Win+Alt+C` estaba tomado por `C:\dev\main\copy-q.ahk` (`#!c`). Se removio ese binding AHK y queda libre para Copicu instalada si Settings lo registra.
- Dev runtime cierre 2026-06-12: el bloqueo de `tauri dev` + Vite se acoto y corrigio lo suficiente para montar picker: `index.html` carga `src/main.tsx` directo; `COPICU_TAURI_DEV=1` desactiva HMR/inyeccion de `/@vite/client`, fuerza cache busting y saltea prewarm de `metadata` para evitar WebViews simultaneas durante transform inicial. Validado por CDP: picker montado, search input enfocado, `window.__copicuDev=true`.
- Dev runtime cierre 2026-06-12: primera carga Vite/WebView puede tardar ~20s en transformar `src/main.tsx`; despues queda usable. `built-dev` sigue siendo mas estable/rapido para dogfood real.
- Dev runtime cierre 2026-06-12: paste por API dev contra Notepad paso (`activate_item` con copy/focusPrevious/paste).
- Picker reopen fix 2026-06-12: al activar un item con hide (`Enter`/doble click) ahora la sesion queda marcada explicitamente como hidden para que la proxima apertura fuerce reset y reseleccione el primer item visible, evitando que persista visualmente el item activado anterior despues de nuevas copias.
- Dev runtime cierre 2026-06-12: `tests/manual/validate-paste-targets.ps1` ya separa readiness real (`__copicuDev` + input), usa hotkey real para abrir picker y usa CDP solo para preparar query. La accion final de teclado pasa por `SendKeys` real; la ruta previa `page.keyboard.press(...)` era el problema del harness, no regresion confirmada del producto.
- Dev runtime cierre 2026-06-12: regresion manual/automatizada en `tauri dev` paso para `Shift+Enter` paste contra Notepad, browser textarea y editor WinForms. `Enter` copy tambien paso con query preparada y tecla real.
- Build cierre 2026-06-12: `npm run build` pasa, pero aparece warning de chunk >500 kB porque cargar `src/main.tsx` directo elimina el micro-entry/chunk split previo. No bloquea, pero conviene revisar si se puede recuperar code split sin reintroducir el bloqueo Vite/WebView.
- Picker batch workflow 2026-06-12: `Keep picker open` es ahora la politica persistida de sesion persistente. Si esta activa, activar item no oculta ni resetea query y focus-lost no oculta. El boton del picker toggla esa politica via comando host `set_picker_keep_open` desde `main`; no usa `update_settings` porque ese comando esta guardado para `settings`. `Pin` queda como always-on-top generico y tambien evita ocultado por foco mientras esta activo. Hotkeys renderer probados (`Ctrl+G`, `Ctrl+Shift+O`, `F8`) no fueron confiables en WebView/Computer Use; si se quiere hotkey, hacerlo nativo/global.
- Picker keep-open window policy 2026-06-12: el picker normal sigue `skip_taskbar=true` para funcionar como transitorio; cuando `Keep picker open` esta activo, el host aplica `skip_taskbar=false` al iniciar, al cambiar desde el picker y al guardar Settings, para que la ventana sea recuperable desde taskbar/Alt-Tab. Esto corrige el caso "queda abierta pero no puedo volver".
- Picker keep-open cierre 2026-06-12: `cargo check`, `npm run build`, `bun run context:index` y `bun run context:audit` pasaron; se reinicio dev con `npm run dev:restart` y el log confirmo `picker.keep_open.window_policy keep_open=true skip_taskbar=false`.
- Picker keep-open dogfood 2026-06-12: Computer Use valido que el boton cambia `Keep picker open is on/off`, persiste en backend (`picker.keep_open keep_open=true hide_on_focus_lost=false`), deshabilita hide-on-focus-lost y permite activar un item real sin ocultar el picker. Se reforzo el estado visual activo con fondo/borde porque el icono persistido podia arrancar ya `on` y confundia.
- Dev runtime keep-open 2026-06-12: `tauri dev` puede quedar blanco si Vite no termina `GET /src/main.tsx`; no clasificar como app colgada sin revisar logs/heartbeats. `built-dev` normal volvio a montar con heartbeats. `restart-dev -RemoteDebug`/launch manual desde Computer Use puede abrir o dejar instancias confusas; para dogfood normal usar `npm run dev:restart` y hotkey dev `Ctrl+Shift+.`.
- Picker keyboard dogfood 2026-06-12: Computer Use valido flujo casi todo teclado. Se encontro y corrigio que `Ctrl+A` en search capturaba multi-select de items en vez de seleccionar texto; ahora reemplaza query nativamente y tiene visual test. El modelo de pin queda por mouse por ahora; no reintroducir hotkey renderer para pin sin ruta nativa/global.
- Picker focus-lost reset 2026-06-12: corregido con `PickerSessionController` host-owned. `host::hide_picker()` y el hide nativo de `PickerFocusPolicy::schedule_hide()` marcan sesion transitoria hidden/resettable; `main` consume `consume_picker_session_snapshot()` al recuperar foco y refresca con `queryOverride: ""`. Dogfood real con Notepad + `Ctrl+Shift+.` paso: UI Automation puede conservar linea vieja en cache, pero el input real reabre vacio (`oldPlusProbe=false`, `probeOnly=true`).
- Settings Hotkeys slice 2026-06-12: `Settings > Hotkeys` ya existe como inventario v1. Ahora edita dos shortcuts app-owned persistidos: `general.globalShortcut` para abrir picker y `picker.pinToggleShortcut` para togglear pin/always-on-top nativo del picker. Default actual del pin toggle: `F8`. `Keep picker open` se maneja desde Picker settings/barra del picker, no desde el shortcut de pin. Los shortcuts locales app-owned (`Ctrl+K`, `Ctrl+I`, `Enter`/`Shift+Enter`, `F2`/`Shift+F2`) siguen read-only; scripts descubiertos con `shortcut` siguen read-only porque la fuente de verdad vive en source/metadata del script. Hay `ShortcutBadge` reusable para hints compactos; el picker ya lo usa en menus de acciones/command palette, el toggle AI muestra tooltip con `Ctrl+I` y el boton de pin muestra su shortcut configurado.
- Settings Hotkeys slice 2026-06-13: el inventario ahora muestra status nativo real para `general.globalShortcut` y `picker.pinToggleShortcut` via `get_app_shortcut_status`: `Registered`, `Conflict`, `Unsupported`, `Disabled` o `Checking`, con error OS visible cuando falla. El refresh backend reintenta registrar si el estado interno coincide con el setting pero el OS no lo tiene registrado.
- Settings Hotkeys slice 2026-06-13: scripts con `shortcut` siguen read-only para Settings, pero ahora cada fila tiene `Edit shortcut`, `Open source` y `Refresh diagnostics`. `edit_script_in_vscode(path)` abre el archivo puntual tras validar que esta dentro de la carpeta configurada de scripts. No hay patch automatico ni override persistido.
- Settings Hotkeys dogfood 2026-06-13: perfil dev aislado valido el flujo manual con script sintetico temporal. Cache inicial `Ctrl+Alt+Shift+9`; cambio manual a `Ctrl+Alt+Shift+T` produjo diagnostico `global shortcut collides with another script`; cambio a `Ctrl+Alt+Shift+8` limpio diagnosticos y registro el shortcut. El script temporal fue eliminado y dev quedo relanzada sin ese action.
- Release 2026-06-13: version alineada a `0.2.1` en npm, Tauri y Cargo; `npm run install:current` genero e instalo `src-tauri\target\release\bundle\nsis\Copicu_0.2.1_x64-setup.exe` sobre la instalada real y relanzo `C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`. SHA256 final: `B6CDF1A66FB61AADBC8341203BA15CF52FD1971E7EC65FA30A80BF9EC8433A9E`. Commit `a5c38a4`, rama `codex/release-0.2.1`, release GitHub `v0.2.1` y PR `#10` quedaron publicados; PR `#10` fue marcado ready y mergeado a `main` el 2026-06-13 con merge commit `2207675`.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
```

Comando conversacional: `realinear os` audita y repara drift de la capa agentica siguiendo `docs/topics/agentic-os-operations.md`.

Continuidad: `sigamos` continua en la misma sesion sin cierre ni handoff. `checkpoint` / `persistí estado` guarda valor durable sin cerrar, handoff, thread nuevo, `gol` ni compactacion manual. `cerrar sesion` cierra valor; `continuar sesion` cierra valor y arranca thread visible nuevo con handoff si la herramienta existe; no usar subagente interno como sustituto; fallback prompt pegable. `continuar sesion con gol` hace lo mismo y pide que el thread nuevo arranque con `gol` para el proximo lote acordado. `continuar con gol` y `siguiente` son aliases de `continuar sesion con gol`; no hay variante para seguir en la misma sesion con `gol`.

## Proximo Paso Probable

Proximo lote recomendado:

1. Decidir si el siguiente frente es recuperar code split/limpiar warning de chunk grande o seguir con actions modularization.
2. Opcional/futuro: si JP quiere editar shortcuts de scripts sin abrir el editor, disenar patch preview controlado; no hay necesidad inmediata despues del dogfood manual.
3. Opcional: agregar test focalizado para `consume_picker_session_snapshot()`/focus-lost cuando haya harness nativo confiable; `visual:check` ya cubre hide explicito.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
