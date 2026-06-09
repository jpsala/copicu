---
id: performance-memory
status: active
updated: 2026-06-09
---

# Performance And Memory

Trabajo vivo para mejorar velocidad, memoria e idle cost de Copicu, desde los factores de mayor impacto a los menores.

## Objetivo

Optimizar el comportamiento real de Copicu como app local:

- menos bytes por pagina del picker;
- menos memoria por items largos e imagenes;
- menos IPC y SQLite en idle;
- busqueda mas escalable;
- scripts menos costosos cuando se ejecutan seguido;
- diagnosticos utiles en dev sin pagar ese costo en produccion.

Topic estable: `docs/topics/performance-and-memory.md`.

## Estado Actual

Auditoria estatica inicial realizada 2026-06-09.

Checks de referencia:

- `npm run build`: pasa. Build reportado: JS minificado aprox `891.57 kB`, CSS aprox `257.59 kB`.
- `cd src-tauri; cargo check`: pasa.
- `npm run rust:test`: bloqueado antes de correr tests por compile error test-only en `apply_autostart_setting`/`autolaunch()`; `cargo check` normal pasa.

Profiling de arranque dev 2026-06-09:

- Hallazgo P0: `npm run tauri:dev` quedaba sin arrancar la app porque `tauri dev` invocaba `cargo run` sin `--bin` y el crate ya tiene dos binarios (`copicu`, `bench_history_search`). Fix aplicado: `default-run = "copicu"` en `src-tauri/Cargo.toml`.
- Medicion con target vacio aislado: Vite listo aprox 1.1s, puerto escuchando aprox 1.8s, Rust `Finished` aprox 168s; el costo dominante fue compilar desde cero.
- Medicion incremental tras tocar manifest: Vite listo aprox 1.1s, `cargo run` lanzado aprox 3.8s, Rust recompilo `copicu` en 8.4s, app respondio/logueo storage+shortcut aprox 13.7s.
- Medicion incremental sin cambios: Vite listo aprox 1.0s, puerto aprox 1.5s, `tauri dev` lanzo `cargo run` aprox 3.8s, Cargo `Finished` aprox 4.5s, storage/watcher/shortcut/foco aprox 5.0s.
- Medicion separada: `npm run dev` solo reporta Vite ready en aprox 0.2s; `cargo run --no-default-features --bin copicu` con Vite ya vivo llega a foco/storage/shortcut en aprox 1.4s. La lentitud incremental visible proviene mayormente de la orquestacion de `tauri dev` antes de lanzar Cargo, no del setup Rust de Copicu.
- Logs de medicion quedaron en `.codex-run/startup-profile/`. App dev viva relanzada con logs en `.codex-run/live-dev-startup-profile/` y app data aislada.

Incidente de restart/menu 2026-06-09:

- `Win+A, P, R` / `npm run dev:restart` reprodujo pantalla negra: ventana Tauri visible y proceso `Responding=True`, pero WebView con `#root` vacio y sin input. Eso no es responsive aunque Windows lo reporte como tal.
- Medicion real de una corrida problematica: Vite reporto `ready` en 0.3-1.7s y Cargo termino en 10-16s, pero React no monto hasta mucho despues. En corrida final `tauri-dev-20260609-133308.err.log`, foco inicial `[diag 1781022811384]` y `renderer: module-load` `[diag 1781022926211]`: aprox 115s de pantalla negra antes de UI usable. Despues aparecieron heartbeats con `active=INPUT:Search clipboard history`.
- Hallazgo: redirigir stdout/stderr de Vite o lanzar Vite separado desde PowerShell puede dejar el proceso escuchando en `1420` pero sin responder HTTP (`curl /` y `/src/main.tsx` timeout). Eso produce WebView negra. El script `dev:restart` fue revertido a usar `npm run tauri:dev` como fuente de verdad y ahora imprime progreso por fases leyendo logs.
- Hallazgo adicional: con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` se facilito inspeccionar CDP, pero no debe estar activo por defecto en el menu. `dev:restart` lo deja deshabilitado salvo `-RemoteDebug`.
- Cambios aplicados: `scripts/dev/restart-dev.ps1` mata procesos del repo, lanza `npm run tauri:dev`, imprime tiempos por fase (`Vite ready`, `Cargo`, `shortcuts`, `renderer: module-load`, `input focused`) y falla si no ve renderer. `index.html` tiene fallback dev-only para importar `/src/main.tsx` si `#root` queda vacio; `src-tauri` tambien intenta un recovery dev por `window.eval`.
- Estado actual: app viva desde `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe`, pid observado `36936`, `Responding=True`, renderer module-load confirmado por logs. Pero el tiempo hasta responsive sigue siendo inaceptable en algunas corridas y debe seguir investigandose en sesion nueva.
- Proximo foco: aislar por que Vite/WebView tarda ~115s en ejecutar modulos aunque Vite diga ready; revisar si lo causa cache Vite/WebView2, optimizer, stdout redirection, plugin React/Vite 8, o el fallback duplicado. No dar por resuelto hasta medir una corrida `npm run dev:restart` con `renderer_ready` en pocos segundos.

Corte boot/lazy surfaces 2026-06-09:

- Snapshot previo preservado en `.codex-run/snapshots/20260609-145936`; no se revirtieron cambios del incidente dev restart/menu.
- `index.html` conserva un bootstrap inline que registra tiempos de boot y hace `import("/src/main.tsx")`; se evita pedir `src/boot.tsx` como modulo separado en Vite dev.
- `src/main.tsx` conserva el picker como ruta inicial y usa `React.lazy`/`Suspense` para ventanas secundarias.
- Ventanas lazy extraidas:
  - `src/windows/secondaryWindows.tsx`: `SettingsWindowApp`, `UiHostApp`, `NotificationsApp`, `WhichKeyWindowApp`.
  - `src/windows/AiOutputWindowApp.tsx`: AI Markdown output + `react-markdown`, `remark-gfm`, `rehype-highlight`.
- El picker inicial ya no importa estaticamente `react-markdown`, `remark-gfm` ni `rehype-highlight`; esos deps quedan en el chunk de AI output.
- Build despues del corte: `dist/assets/index-*.js` aprox 2.75 kB, `main-*.js` aprox 264.12 kB, `secondaryWindows-*.js` aprox 35.37 kB, `AiOutputWindowApp-*.js` aprox 325.47 kB, `CustomWindowFrame-*.js` aprox 243.23 kB, CSS aprox 257.59 kB.
- `scripts/dev/profile-vite-probes.ps1` sigue mostrando Vite dev no confiable: status HTTP `000` y/o requests sin `finish`; no usar esto como salud del renderer. Corrida `.codex-run/vite-probes/20260609-154427`: `00-empty.ts`, `01-react.tsx` y `02-tauri-api.ts` devolvieron `000` tras 30s; el log de Vite mostro requests retenidos aprox 90s. Corrida `.codex-run/vite-probes/20260609-154640` con timeout mayor: todos los probes devolvieron `000`; `00-empty.ts` tardo 25.556s y los demas aprox 2.0s, con log cortado en `start GET /src/dev-probes/00-empty.ts`.
- `npm run dev:built:fresh` sigue siendo el modo usable sin Vite dev server. Corrida con target compartido `.codex-run/built-dev-measure/20260609-154820` fallo antes de arrancar por `os error 32` en build script Tauri/Cargo. Corrida fria con `CARGO_TARGET_DIR` aislado `.codex-run/built-dev-measure/20260609-155304`: build frontend termino en 5.714s y `renderer: module-load` llego en 218.106s, dominado por compilacion Rust fria. Corridas incrementales con el mismo target aislado: `.codex-run/built-dev-measure/20260609-155716` llego a `renderer: module-load` en 12.075s; `.codex-run/built-dev-measure/20260609-155758` llego a shortcut en 2.931s, `renderer: module-load` en 2.956s y heartbeat `active=INPUT:Search clipboard history` en 5.161s.
- Checks del corte: `npm run build` pasa; `cd src-tauri; cargo check` pasa.

Cierre dev restart/menu 2026-06-09:

- Hallazgo concreto 1: imports desde el barrel `lucide-react` hacian que Vite dev transformara cientos de modulos `lucide-react/dist/esm/icons/*`. Se cambiaron imports de iconos a paths profundos `.mjs`; el build bajo de 2976 a 1291 modulos transformados.
- Hallazgo concreto 2: `COPICU_VITE_RESTART_MODE` con `optimizeDeps.include=[]` rompia React en WebView: errores `react/index.js does not provide an export named 'Fragment'` y `react/jsx-dev-runtime.js ... 'jsxDEV'`. Se reactivo `optimizeDeps` minimo para React, JSX runtime, Mantine, Tauri API y virtualizer.
- Hallazgo concreto 3: `server.warmup`, cache/revalidacion y la inyeccion de `/@vite/client` podian bloquear requests del WebView durante decenas de segundos. En restart mode se desactiva warmup, se fuerza `Cache-Control: no-store` y se remueve la inyeccion de `/@vite/client` del HTML transformado.
- Aun con esos fixes, `tauri dev` + Vite dev siguio variable y lento: corridas medidas quedaron aprox 52-54s hasta heartbeat. Ya no queda el fallo de import React ni el bloqueo de 115s, pero Vite dev no queda como camino usable principal.
- Decision operativa aplicada: `npm run dev:restart` ahora usa built-dev por defecto (`npm run dev:built:fresh` bajo el script), sin Vite dev server. `scripts/dev/restart-dev.ps1 -ViteDev` queda como modo diagnostico explicito para seguir investigando Vite.
- Implicacion aceptada: el modo dev diario de Copicu prioriza confiabilidad nativa sobre HMR. Para dogfood real, tray, shortcuts, paste, WebView y Rust, usar built-dev. Para iteracion UI pura se puede crear mas adelante un modo preview/frontend separado, pero no usar Vite dev WebView2 como señal primaria de salud.
- Corrida valida de `npm run dev:restart` built-dev: `.codex-run/dev-restart/logs/restart-20260609-163810.log`; frontend build +9.5s, shortcuts +20.8s, `renderer: module-load` +20.8s, heartbeat `active=INPUT:Search clipboard history` +22.8s. Proceso vivo: `src-tauri\target\debug\copicu.exe`, sin Vite escuchando en 1420.
- Checks despues del cierre: `npm run build` pasa; `cd src-tauri; cargo check` pasa.

Primer corte ya implementado antes de la pausa:

- thumbnails reales desde `thumbnail_path`;
- `includeContent=false` con preview DTO;
- `get_history_item` para contenido completo bajo demanda;
- UI del picker pidiendo preview en paginas normales.

Cierre diagnosticos/idle 2026-06-09:

- `copicuDiagnostics` permite `debug`/`errors`/`off`; default dev `debug`, produccion `errors`.
- `record_renderer_diagnostic` conserva errores reales en modo `errors`; heartbeats/focus/blur/visibility solo corren en debug.
- `get_capture_snapshot` y `get_clipboard_probe` quedan solo en debug, sin polling cada 900 ms en produccion.
- Historial mantiene polling rapido solo en debug; produccion refresca por `copicu://history/changed` si la ventana esta visible y por focus/visibility.
- WhichKey conserva sync inicial/focus/evento y handler de teclas en produccion; polling queda solo en debug.
- Evento `copicu://history/changed` desde captura usa payload minimo `{ itemId, contentKind }`, sin contenido del clipboard.
- Checks: `npm run build` pasa, `cd src-tauri; cargo check` pasa, `npm run visual:check` pasa 72/72.

## Pausa 2026-06-09: Diagnosticos/Idle

Trabajo pausado a pedido de JP porque hay otros cambios concurrentes en el worktree. No continuar sin revisar el diff actual.

Intento aplicado en el worktree al pausar:

- `src/main.tsx`: agregado modo interno `copicuDiagnostics` (`debug`/`errors`/`off`) con default `debug` en dev y `errors` en build de produccion. Heartbeats/focus/blur/visibility quedan detras de debug; errores del renderer quedan disponibles en modo `errors`.
- `src/main.tsx`: `get_capture_snapshot` y `get_clipboard_probe` quedan detras de debug para evitar polling cada 900 ms en produccion.
- `src/main.tsx`: polling rapido de historial cada 1400 ms queda como fallback debug; produccion escucha `copicu://history/changed` y refresca en focus/visibility.
- `src/main.tsx`: polling de WhichKey principal/ventana WhichKey queda como fallback debug y usa evento/focus para sincronizar.
- `src-tauri/src/clipboard.rs`: el watcher emite `copicu://history/changed` con payload minimo `{ itemId, contentKind }` despues de insertar texto/imagen; no envia contenido del clipboard.
- `tests/visual/shell.spec.ts`: agregado smoke `diagnostics off disables idle diagnostics polling`.

Verificacion durante la pausa:

- `npm run build`: pasa.
- `cd src-tauri; cargo check`: pasa.
- `npm run visual:check`: no paso; fallo sistemico en `page.goto`/Vite (`load` timeout, luego `ERR_CONNECTION_REFUSED`). Tambien fallo el test focalizado igual. Se limpio `node_modules/.vite`, pero el bloqueo siguio. No se obtuvo evidencia visual concluyente.

Riesgos antes de retomar:

- Resuelto: WhichKey ya no queda restringido a debug; la ventana WhichKey funciona con diagnostics off sin polling.
- Confirmar que `history.changed` cubre todas las mutaciones relevantes o dejar claro que este corte solo cubre captura; edit/delete/mark/tag todavia refrescan por sus rutas UI.
- Resuelto: `npm run visual:check` paso 72/72 con Vite estable; el fallo anterior fue infraestructura temporal, no regresion de la app.
- El worktree contiene cambios no relacionados de open-source/docs y del corte previo de preview DTO; no revertirlos sin pedido explicito.

## Priorizacion

### Task 1: Feed Preview DTO E `includeContent=false`

Prioridad: P0.

Hipotesis: el mayor gasto de memoria/IPC viene de cargar texto completo de todos los items visibles/paginados cuando el feed solo necesita preview.

Archivos probables:

- `src-tauri/src/storage.rs`
- `src-tauri/src/actions.rs`
- `src/main.tsx`
- tests Rust de storage
- visual checks del picker

Checklist:

- [x] Definir contrato de pagina con preview sin contenido completo.
- [x] Hacer que `HistorySearchRequest.include_content` tenga efecto real.
- [x] Mantener `history.get` y scripts con `{ content: true }` funcionando.
- [x] Cargar contenido completo bajo demanda para edit/batch edit si ya no esta en el feed.
- [x] Validar snippets largos sin overflow ni payload completo en pagina inicial.

Aceptacion:

- El picker muestra previews correctos.
- Editar/activar/copiar item sigue usando contenido completo.
- `copicu.history.search(query, { content: false })` no devuelve texto completo.
- `copicu.history.search(query, { content: true })` si devuelve contenido para scripts.

### Task 2: Imagenes Con Thumbnail Real En Feed

Prioridad: P0.

Hipotesis: usar el PNG principal como `thumbnail_data_url` infla memoria/IPC en paginas con imagenes.

Archivos probables:

- `src-tauri/src/storage.rs`
- `src-tauri/src/image_capture.rs` si falta metadata
- `src/main.tsx`

Checklist:

- [x] Cambiar feed para usar `thumbnail_path` en imagenes.
- [x] Preservar `blob_path` principal para `write_item`/copy-back.
- [x] Agregar test o fixture que pruebe que `thumbnail_data_url` sale del thumbnail.
- [x] Validar imagen sintetica grande y thumbnail visible.

Aceptacion:

- El picker no manda PNG principal como data URL en pagina normal.
- Copy-back de imagen sigue pegando el PNG principal.

### Task 3: Separar Dev Diagnostics De Produccion

Prioridad: P0.

Hipotesis: heartbeats, probe/snapshot y logs constantes son utiles en dev pero caros en produccion.

Archivos probables:

- `src/main.tsx`
- `src-tauri/src/lib.rs`
- Settings si se decide flag visible

Checklist:

- [x] Definir flag interno: dev build, env var/query/localStorage o setting diagnostico.
- [x] Gatear `recordRendererDiagnostic` heartbeat/focus/blur/visibility.
- [x] Gatear `get_capture_snapshot`/`get_clipboard_probe` polling si la UI no muestra diagnosticos.
- [x] Mantener diagnosticos disponibles para debug de ventanas/hotkeys y validarlo con visual.

Aceptacion:

- En produccion no hay heartbeat IPC cada 2s.
- En dev se puede reactivar diagnostico sin tocar codigo.

### Task 4: Refresh De Historial Event-Driven

Prioridad: P0/P1.

Hipotesis: el polling cada 1.4s mantiene SQLite/IPC activos sin necesidad.

Archivos probables:

- `src-tauri/src/clipboard.rs`
- `src-tauri/src/storage.rs`
- `src-tauri/src/lib.rs`
- `src/main.tsx`

Checklist:

- [x] Emitir evento de cambio de historial desde captura segura de texto/imagen.
- [x] Refrescar picker al evento si esta visible/focused para captura.
- [x] Refrescar al show/focus.
- [x] Mantener fallback polling solo dev/debug o intervalo largo.
- [x] Respetar regla de no emitir hacia `main` desde caminos global-shortcut sensibles en este corte.

Pendiente de Task 4: extender `history.changed` a mutaciones backend fuera de las rutas UI si aparecen casos reales. Edit/delete/mark/tag hechos desde la UI ya refrescan por su propia ruta.

Aceptacion:

- Al copiar texto sintetico, el picker visible se actualiza sin polling rapido.
- En idle produccion no corre refresh de historial periodico.

### Task 5: Cache De Actions/Scripts Sin Reescanear Siempre

Prioridad: P1.

Hipotesis: `list_actions` hace filesystem scan y escritura SQLite en llamadas que deberian ser lectura barata.

Archivos probables:

- `src-tauri/src/actions.rs`
- `src-tauri/src/storage.rs`
- `src-tauri/src/lib.rs`

Checklist:

- [x] Separar `refresh_script_action_cache` de `list_actions`.
- [x] `list_actions` lee built-ins + cache.
- [x] Startup y thread de firma refrescan cache.
- [x] Cambio de settings refresca cache y shortcuts globales.
- [x] Comando explicito `refresh_script_action_cache` fuerza rediscovery.
- [x] Clipboard change usa cache y filtra candidatos antes de trabajo caro.

Aceptacion:

- Abrir command palette/settings no reescribe cache si no hubo cambios.
- Cambiar un script sigue apareciendo tras refresh por firma.
- Clipboard capture sin scripts candidatos no escanea carpeta ni reescribe cache SQLite.

Cierre 2026-06-09:

- `actions::list_actions` quedo como lectura barata de built-ins + `script_action_registry`.
- `actions::refresh_script_action_cache` hace discovery de `scripts.folderPath`, anota diagnostics de shortcuts y materializa `script_action_registry`/`script_action_diagnostics`.
- Startup, `update_settings`, watcher por firma de carpeta y comando Tauri explicito `refresh_script_action_cache` son los unicos caminos de rediscovery.
- `clipboardChange` lee scripts cacheados y descarta no candidatos antes de validar input/ejecutar, sin filesystem scan ni rewrite de cache por captura.
- Test focalizado agregado: `list_actions_reads_cache_and_refresh_materializes_scripts`.
- Checks: `npm run build` pasa; `cd src-tauri; cargo check` pasa. `cargo test list_actions_reads_cache_and_refresh_materializes_scripts` y `npm run rust:test -- list_actions_reads_cache_and_refresh_materializes_scripts` compilan el binario de test pero fallan al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND`, el problema conocido del loader en esta maquina.

### Task 6: Busqueda Escalable Y Conteos

Prioridad: P1.

Hipotesis: `LIKE '%term%'` y conteos completos por keypress van a degradar con historiales grandes.

Checklist:

- [x] Medir con dataset sintetico de 10k items.
- [ ] Decidir si FTS5 entra ahora o despues del DTO preview.
- [x] Reducir conteos donde no aportan: paginas incrementales pueden pedir `includeCounts=false`.
- [ ] Mantener query syntax existente.

Aceptacion:

- Search local tiene benchmark antes/despues parcial.
- No se degrada el contrato de filtros estructurados.

Corte 2026-06-09:

- Agregado `HistorySearchRequest.include_counts`/`includeCounts` con default compatible `true`.
- `HistoryPage.total_count`/`filtered_count` ahora son opcionales cuando la llamada pide `includeCounts=false`.
- El frontend conserva conteos existentes al cargar paginas siguientes y pide `includeCounts=false` solo en paginacion incremental.
- Agregado harness sintetico `npm run perf:history -- <items>` (`src-tauri/src/bin/bench_history_search.rs`), con DB temporal y payloads `COPICU_SYNTH_PERF`, sin clipboard real.
- Medicion 10k sinteticos:
  - `initial_with_counts`: 82 ms, 60 items, JSON aprox 59.9 KB.
  - `needle_with_counts`: 62 ms, 1429 matches, JSON aprox 59.7 KB.
  - `needle_without_counts`: 39 ms, sin conteos, JSON aprox 59.7 KB.
  - `bucket_with_counts`: 53 ms, 1000 matches, JSON aprox 45.1 KB.
  - `bucket_without_counts`: 26 ms, sin conteos, JSON aprox 45.1 KB.
- Decision parcial: diferir FTS5 hasta medir 50k o hasta que el costo de texto libre sea visible en dogfood. El primer ahorro claro es no recalcular conteos en paginas incrementales.
- Checks: `npm run build` pasa; `cd src-tauri; cargo check` pasa. `npm run visual:check` queda bloqueado por timeouts de navegacion inicial de Vite/Playwright (`page.goto` a `127.0.0.1:1420`, server manual quedo en `CloseWait`/sin responder); no se observo fallo de assertion asociado al cambio. Corrida focalizada narrow posterior: 34/36 pasaron, dos primeras fallaron por el mismo timeout de navegacion inicial.

### Task 7: Runner Node Persistente Solo Si Mide Mal

Prioridad: P1/P2.

Hipotesis: proceso Node por accion puede doler en acciones frecuentes, pero no conviene complejizar sin medicion.

Checklist:

- [ ] Medir latencia de script manual simple.
- [ ] Medir latencia de clipboardChange con script candidato.
- [ ] Decidir si worker persistente vale la pena.

Aceptacion:

- Decision documentada con datos sinteticos.

### Task 8: Code Splitting Por Superficie

Prioridad: P2.

Hipotesis: el picker paga bundle de superficies que no necesita al abrir.

Checklist:

- [x] Separar entrypoints o lazy imports por ventanas.
- [x] Lazy-load markdown/syntax highlight.
- [x] Medir bundle antes/despues parcial.

Aceptacion:

- Picker inicial carga menos JS/CSS sin romper ventanas secundarias.

Cierre 2026-06-09:

- Primer corte implementado por lazy windows, no por entrypoints HTML multiples.
- Faltan validaciones visuales/manuales especificas de Settings, UiHost, Notifications, AI Output y WhichKey si se toca comportamiento; el corte actual compila y el picker inicial monta en `dev:built:fresh`.
- `npm run dev:restart` queda solucionado como built-dev default. Vite dev sigue siendo factor inestable y solo debe usarse con `scripts/dev/restart-dev.ps1 -ViteDev` para diagnostico.

### Task 9: Render Feed Micro-Optimizations

Prioridad: P2.

Checklist:

- [ ] Memoizar `markdownImages` por item.
- [ ] Revisar `overscan: 24`.
- [ ] Exponer metadata `hasMarkdownImages` desde backend si conviene.

Aceptacion:

- Scroll sigue fluido y no hay regresiones visuales.

### Task 10: Idle Warm Picker Memory Policy

Prioridad: P1.

Hipotesis: el baseline idle de produccion esta dominado por WebView2, no por el core Rust. Mantener el picker caliente puede ser el tradeoff correcto si garantiza apertura inmediata, foco confiable y cero flash visual.

Medicion base 2026-06-09, build instalado:

- `copicu.exe` + 6 procesos `msedgewebview2.exe`;
- private memory total aprox 260 MB;
- working set total aprox 493 MB;
- `copicu.exe` host nativo aprox 8.8 MB private;
- WebView2 GPU/renderer/browser explican casi todo el resto.

Decision de producto/UX:

- No implementar lazy WebView ni destruir el picker por idle como default.
- Aceptar el costo de mantener el picker caliente si evita latencia, flicker, ventana fea o problemas de foco.
- Considerar modo "low memory" solo futuro/opt-in si aparece demanda concreta.

Checklist:

- [ ] Confirmar en build de produccion que idle crea solo `main`/picker y no precrea Settings, AI output, ui-host, notifications o WhichKey.
- [ ] Medir memoria privada/working set tras abrir y cerrar Settings.
- [ ] Medir memoria privada/working set tras abrir y cerrar AI output.
- [ ] Medir memoria privada/working set con 10k/50k items sinteticos.
- [ ] Medir caso con imagenes sinteticas grandes + thumbnails.
- [ ] Revisar que diagnostics/polling/logs normales sigan apagados en produccion.
- [ ] Documentar si alguna superficie secundaria debe quedar precreada por UX y por que.

Aceptacion:

- La politica queda documentada con numeros y tradeoff explicito.
- Produccion mantiene picker caliente y no introduce primer-open lento.
- No quedan procesos/superficies extra en idle salvo decision justificada.
- Cualquier optimizacion propuesta preserva apertura inmediata del picker y foco confiable.

## Medicion Inicial Pendiente

Crear un harness sintetico antes o durante Task 1:

- DB aislada con `COPICU_APP_DATA_DIR` temporal.
- Items de texto: cortos, medianos, largos, multilinea y sin espacios.
- Items de imagen sintetica con PNG grande y thumbnail.
- Medir duracion de `history_search`, longitud JSON serializado y memoria del proceso.

No usar datos reales del clipboard.

## Proximo Corte Recomendado

Task 1/2/3/4/5 y primer corte de Task 6 ya quedaron implementados.

Orden sugerido:

1. Aislar el problema Vite/Playwright de navegacion inicial para recuperar `npm run visual:check` completo.
2. Medir busqueda/conteos con dataset sintetico de 50k antes de decidir FTS5.
3. Medir idle/IPC con build de produccion y datos sinteticos.
4. Medir runner Node solo si scripts frecuentes o `clipboardChange` se sienten lentos.

## Prompt Para Siguiente Sesion

```text
Estamos en C:\dev\chat\copyq-tauri. Lee primero docs/README.md, docs/WORKING_MEMORY.md, docs/topics/performance-and-memory.md y docs/active-work/014-performance-memory.md.

Estamos en C:\dev\chat\copyq-tauri. Lee primero docs/README.md, docs/WORKING_MEMORY.md, docs/topics/performance-and-memory.md y docs/active-work/014-performance-memory.md.

Performance/memoria ya cerro Task 1/2/3/4/5 y primer corte de Task 6. `history_search` soporta `includeCounts=false`; paginas incrementales ya no recalculan conteos. Harness: `npm run perf:history -- <items>`.

Objetivo recomendado: aislar primero el bloqueo de `npm run visual:check` por navegacion inicial Vite/Playwright en `127.0.0.1:1420`. Luego medir 50k items sinteticos antes de decidir FTS5. No usar payload real del clipboard. Correr `npm run build` y `cd src-tauri; cargo check`; si se toca UI/test harness, reintentar `npm run visual:check` y documentar error exacto.
```
