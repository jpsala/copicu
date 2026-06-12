# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-12.

## Regla

Este archivo es router operativo, no historia. La version larga previa quedo archivada en `docs/reference/working-memory-archive-2026-06-10.md`.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Revisar otra extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md`, `specs/008-clipboard-enrichment/spec.md` | Validar `suggestOnly` vs `autoApply` con scripts `026`/`027` y decidir si hace falta UI chica de inspeccion o si policy + bridge alcanzan. |
| Performance/UI windows | active | `docs/topics/custom-window-system.md`, `docs/topics/ui-surface-architecture.md`, `docs/tracks/010-ui-rethink.md` | Dogfood prewarm de `metadata`; mantenerlo si la velocidad percibida compensa el coste idle. |
| Open source growth | active | `docs/tracks/013-open-source-growth.md` | Capturar screenshots/gifs sinteticos y linkear primer asset desde README. |
| Dev/instalada | active | `docs/topics/windows-installer.md`, `docs/tracks/014-performance-memory.md` | `tauri dev` ya valido keyboard/paste en Notepad, browser y WinForms; siguiente corte: decidir si recuperar code split o retomar instalada/NSIS. |
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
- No persistir ni publicar contenido real del clipboard en docs, tests o logs.
- Paste-to-previous-window sigue siendo el flujo nativo mas riesgoso.
- Open source Windows alpha esta publicado; mantener audit de secretos antes de releases.
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

- Hay cambios locales no revisados en Rust/docs; no revertirlos.
- No confiar en `Process.Responding` como readiness de WebView.
- `visual:check` puede fallar por infraestructura Vite/WebView, no necesariamente por assertions.
- En shortcuts globales, evitar next-step globals temporales y emits backend hacia `main` sin harness.
- Dogfood hotkeys filtrados: JP confirmo `020`-`024`; no volver a implementar hotkeys nativos por tag.
- `.env`, logs, DBs, blobs, dumps de clipboard, build outputs y `.agents/` no se publican.
- Lifecycle: Settings cacheada acelera reapertura y cuesta una WebView extra; no cambiar `hide()` a `destroy()` sin prueba visual/foco.
- Ventanas futuras: seguir `docs/topics/custom-window-system.md`; superficies ricas fuera del picker deben ser standalone via surface registry host-owned, con label/capability/lifecycle/bounds/allowedCommands propios, un solo `index.html` + routing por label por defecto, y no `ui-host` transparente generico.
- Surface registry host-owned existe en `src-tauri/src/surface_registry.rs`; settings queda lifecycle `cached/hidden` por ahora. Capabilities separadas por superficie reemplazan `default.json`, y comandos sensibles tienen guards por `window.label()`.
- Clipboard enrichment slice 2026-06-12: `src-tauri/src/enrichment.rs` ahora detecta `path`, `url`, `json`, `code` y `secret-risk` para texto. Sigue siendo local y post-capture.
- Clipboard enrichment slice 2026-06-12: Settings minimos viven en `AppSettings.enrichment` con `enabled`, toggles por detector y `applyMode` (`autoApply` / `suggestOnly` placeholder). Watcher solo auto-aplica cuando `enabled` y `autoApply`.
- Clipboard enrichment slice 2026-06-12: API host minima para scripts expuesta via `enrichment.runForItem(itemId, options?)` y `enrichment.getResult(itemId)`, con capabilities `enrichment:run` y `enrichment:read`.
- Clipboard enrichment slice 2026-06-12: persistencia rule-based sigue usando `tags` + `clipboard_item_tags`, sincroniza `clipboard_items.tags`, y ahora conserva `confidence` por detector en relaciones `source=rule`.
- Clipboard enrichment dogfood 2026-06-12: script `026-inspect-enrichment-active.ts` queda usable desde picker con shortcut local `Ctrl+Alt+E`. El parser estatico del registry era fragil con template literals; la version activa se simplifico para evitar falso `missing defineAction({...}) export`.
- Clipboard enrichment dogfood 2026-06-12: script `027-toast-path-clipboard-change.ts` ahora usa `enrichment.getResult()` para mostrar una señal visible de cualquier detector matcheado durante `clipboardChange`, incluyendo si el resultado quedo auto-aplicado o solo sugerido.
- Dev runtime 2026-06-12: `restart-dev.ps1`/`isolated-dev.ps1` ya soportan watcher activo en perfil aislado via `-EnableClipboardWatcher` y scripts npm `dev:restart:watcher` / `tauri:dev:watcher`.
- Global shortcut startup 2026-06-12: se removio el registro hardcodeado del picker shortcut en init del plugin Tauri; ahora el startup depende del refresh desde settings reales, evitando colision entre instancias con hotkeys distintas.
- Tests Rust focalizados 2026-06-12: `cargo test` sigue bloqueado a runtime nativo en este entorno; dos pruebas focalizadas abortaron con `STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139)`, no por error de compilacion.
- Instalada/build 2026-06-12: `npm run tauri:build` volvio a pasar y genero `src-tauri\target\release\bundle\nsis\Copicu_0.2.0_x64-setup.exe`. Revalidar `npm run install:current` antes de usarlo como promocion rutinaria, pero el bundling NSIS dejo de estar bloqueado.
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

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
```

Comando conversacional: `realinear os` audita y repara drift de la capa agentica siguiendo `docs/topics/agentic-os-operations.md`.

Continuidad: `sigamos` continua en la misma sesion sin cierre ni handoff. `cerrar sesion` cierra valor; `continuar sesion` cierra valor y arranca thread visible nuevo con handoff si la herramienta existe; no usar subagente interno como sustituto; fallback prompt pegable. `continuar sesion con gol` hace lo mismo y pide que el thread nuevo arranque con `gol` para el proximo lote acordado. `continuar con gol` y `siguiente` son aliases de `continuar sesion con gol`; no hay variante para seguir en la misma sesion con `gol`.

## Proximo Paso Probable

Proximo lote recomendado:

1. Decidir si mantener `index.html -> src/main.tsx` directo o recuperar un entry/chunk split sin `html-proxy` ni `src/boot.tsx` colgado.
2. Retomar dogfood enrichment (`026`/`027`, `suggestOnly` vs `autoApply`) ahora que el harness nativo vuelve a ser confiable.
3. Revalidar `npm run install:current` sobre la instalada real ahora que `npm run tauri:build` vuelve a generar NSIS.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
