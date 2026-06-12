---
id: 010-ui-rethink
status: active
updated: 2026-06-12
---

# 010 UI Rethink

Trabajo vivo para rediseñar la UI de Copicu.

Tema fuente: `docs/topics/ui-rethink.md`.

## Objetivo

Repensar la UI antes de seguir acumulando pantallas. Resolver cuatro problemas:

- UI fea;
- falta de temas reales;
- overlays/ventanas internas dentro del picker;
- componentes poco cuidados.

## Estado Actual

Iniciado el 2026-06-06.

Contexto local leido:

- `docs/README.md`
- `docs/WORKING_MEMORY.md`
- `docs/PROJECT.md`
- `docs/ASSISTANT_RULES.md`
- `docs/DEVELOPMENT.md`
- `docs/TOPICS.md`
- `docs/topics/ui-design-and-impeccable.md`
- `docs/tracks/009-ui-host-custom-surface.md`
- `src/styles.css`
- `src/main.tsx`

Research web inicial agregado en `docs/topics/ui-rethink.md`.

Primer corte aplicado:

- la ventana principal Tauri pasa a ser undecorated/transparente;
- `.app-shell` deja de dibujar una superficie externa;
- `.picker-panel` ocupa toda la ventana del picker;
- queda pendiente separar Settings/editor/command palette en superficies propias.

Segundo corte aplicado:

- Mantine instalado y cableado en el root React;
- tema inicial en `src/mantineTheme.ts`;
- topic especifico creado en `docs/topics/mantine-ui-system.md`;
- proxima migracion recomendada: Settings primero.

Tercer corte aplicado:

- Settings migro a Mantine para controles comunes (`Button`, `ActionIcon`, `TextInput`, `Select`, `Switch`, `Menu`, `Tabs`);
- se agregaron wrappers locales iniciales para controles repetidos (`UiButton`, `UiIconButton`, `UiTextInput`, `UiSelect`, `UiSwitch`);
- Settings salio del picker: el boton del picker llama `open_settings_window` y Tauri crea/activa la ventana standalone `settings`;
- la app frontend renderiza `SettingsWindowApp` cuando el label es `settings` o en dev con `?window=settings`;
- guardar Settings emite `copicu://settings/updated` hacia `main` para refrescar tema/behavior sin overlay interno;
- el picker/feed principal sigue custom.

Estudio Mantine 2026-06-06:

- agregado audit en `docs/topics/mantine-ui-system.md`;
- agregado task detallado en `docs/tracks/011-mantine-component-migration.md`;
- conclusion: seguir Mantine-first para controles, overlays, menus, prompts, settings y tema;
- mantener custom el feed virtualizado, previews rich, medicion de filas y frame del picker;
- proximo corte tecnico recomendado: extraer wrappers Mantine y mover defaults/variantes a `src/mantineTheme.ts`, antes de migrar mas UI visible.

Cuarto corte aplicado:

- wrappers Mantine extraidos de `src/main.tsx` a `src/ui/controls.tsx`;
- agregados wrappers minimos `UiTextarea`, `UiNumberInput`, `UiCheckbox`, `UiBadge`, `UiKbd`, `UiTooltip` y `UiLoader`;
- defaults compartidos de inputs, botones, badges, tabs, menu, tooltip, kbd y loader movidos a `src/mantineTheme.ts`;
- reducidos overrides globales `.mantine-*` en Settings, manteniendo solo foco de input y layout especifico de labels de tabs;
- checks pasaron: `npm run build`, `npm run visual:check`.

Quinto corte aplicado:

- ventana principal auditada para Mantine: feed/previews/virtualizacion siguen custom por decision;
- top row del picker migro search a `UiTextInput`, comandos/settings a `UiButton` + `UiTooltip`, status a `UiBadge` y loader a `UiLoader`;
- mark visible/all migro a `UiCheckbox` con indeterminate y mark dropdown a Mantine `Menu` con portal;
- se mantuvieron custom item menu, item mark por fila, command palette y edit/batch edit para cortes posteriores;
- checks pasaron: `npm run build`, `npm run visual:check`.

Sexto corte aplicado:

- Settings cleanup Mantine: `Retention count` migro a `UiNumberInput`;
- Settings `Tabs` usa `classNames` para el label y se elimino el override global `.mantine-Tabs-tabLabel`;
- queda solo un override `.mantine-*` scoped para foco de inputs en Settings;
- checks pasaron: `npm run build`, `npm run visual:check`.

Septimo corte aplicado:

- command palette mantiene logica local, listbox y handlers de teclado;
- input migro a `UiTextInput`, shortcuts a `UiKbd` y source badges a `UiBadge`;
- panel migro a `UiPaper`, result buttons a `UiUnstyledButton` y empty state a `UiAlert`;
- checks pasaron: `npm run build`, `npm run visual:check`.

Octavo corte aplicado:

- checks/marking del picker corregidos y cubiertos: check principal, check por item y mark menu;
- check por item migro a `UiCheckbox`, manteniendo `stopPropagation` y foco del search;
- mark menu principal usa Mantine `Menu` con iconos `lucide-react`;
- item action button migro a `UiIconButton` con icono;
- item menu mantiene portal/fixed positioning propio por virtualizacion, pero usa `UiPaper`, `UiUnstyledButton`, `UiKbd` e iconos;
- se agrego `lucide-react`;
- checks pasaron: `npm run build`, `npm run visual:check` 46/46.

Noveno corte aplicado:

- edit content, edit metadata, batch metadata y `ui-host` migraron su capa de controles a wrappers Mantine;
- `@mantine/notifications` quedo descartado para toasts principales con posicionamiento multi-monitor, porque renderiza dentro de la WebView;
- Appearance ahora tiene infraestructura N-theme en `src/themeCatalog.ts`, separando `theme` (`system | light | dark`) de `themeId`;
- presets built-in actuales: Default, Graphite, Code, High contrast, Midnight, Blueprint, Moss y Rose;
- `src/mantineTheme.ts` consume paletas del catalogo y `src/styles.css` ya no duplica bloques CSS por preset;
- checks pasaron: `npm run build`, `npm run visual:check` 52/52 y `cargo check`. `npm run rust:test` sigue fallando al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

Decimo corte de investigacion/documentacion:

- creado `docs/topics/custom-window-system.md` para el plan de ventanas custom compartibles;
- decision propuesta: custom chrome por composicion/variantes, no herencia magica;
- primer corte recomendado: solo `main` picker con frame custom solido, drag strip y boton hide;
- evitar `transparent: true` como default de dogfood y no reimplementar resize handles/paridad nativa en el primer corte;
- Settings queda nativa hasta validar el picker custom.

Undecimo corte aplicado parcialmente:

- creado `src/ui/window/CustomWindowFrame.tsx` con `CustomWindowFrame` y `WindowDragStrip`;
- aplicado solo al picker `main`;
- chrome compacto agregado con pin/always-on-top, minimizar, maximizar/restaurar y cerrar-como-hide;
- chrome custom quedo separado en base reusable: `CustomWindowFrame`, `WindowControls`, `windowChrome.ts` y `windowVariants.ts`;
- permisos `core:window:allow-start-dragging`, `allow-set-always-on-top`, `allow-minimize` y `allow-toggle-maximize` agregados;
- `main` cambio a ventana solida (`transparent: false`) y sigue `decorations: false`;
- `main` quedo `resizable: false` porque el resize por borde no funciono con `decorations: false` en una validacion Win32 parcial;
- `main` quedo `shadow: false` porque `shadow: true` en Windows undecorated genero borde blanco de 1px;
- el frame del picker quedo flush, sin borde/radio/sombra exterior CSS, para evitar doble marco en una WebView solida rectangular;
- pin tiene semantica especial: si `always-on-top` esta activo, focus-lost no oculta el picker aunque el setting global este activo; si el usuario despinea, `hideOnFocusLost` vuelve a aplicar;
- esa semantica especial queda en la politica Rust de `main`; el control base `pin` solo alterna `always-on-top`;
- Settings sigue como ventana nativa standalone;
- no se implementaron resize handles ni paridad nativa.

Checks pasados:

- `npm run build`;
- `npm run visual:check` 54/54;
- `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.

Validacion manual parcial:

- la instancia dev cargo el nuevo frame;
- el drag strip movio la ventana visible;
- resize por borde no funciono.

Pendiente para sesion nueva con JP: validar hide, focus-lost, shortcut, tray, paste-to-previous-window, DPI/monitor y decidir si el picker queda fixed-size, vuelve nativo o recibe otro enfoque de resize. No seguir agregando tests nativos ad hoc sin JP.

Duodecimo corte aplicado:

- Settings adopto la misma infraestructura de ventana custom con `CustomWindowFrame` variante `document`;
- la ventana Tauri `settings` ahora se crea `decorations: false`, `transparent: false`, `shadow: false`, `resizable: true` y `skipTaskbar: false`;
- los controles compartidos de Settings son minimizar, maximizar/restaurar y cerrar real;
- el layout de Settings se corrigio para que la lista scrollee dentro del frame y no tape Save/Cancel en ancho angosto;
- checks pasaron: `npm run build`, `npm run visual:check` 54/54 y `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.

Incidente dev observado:

- tras agregar Mantine, la ventana principal quedo vacia aunque `npm run build` pasaba;
- via WebView2 CDP se vio `#root` vacio y Vite sirviendo `504 Outdated Optimize Dep` para dependencias optimizadas;
- recargar WebViews por CDP resolvio el montaje; si vuelve a pasar, reiniciar `npm run tauri:dev` o limpiar cache de Vite antes de asumir bug de React.

Decimotercer corte aplicado:

- documentada politica multi-monitor en `docs/topics/window-state-and-monitor-policy.md`;
- agregado registry compartido `src-tauri/src/window_state.rs`;
- `main`, `settings` y `ai-output` son redimensionables y persisten bounds por monitor;
- `ui-host`, `notifications` y `whichkey` quedan opt-out por ser superficies fijas/posicionadas;
- el picker `main` restaura contra el monitor del cursor al abrir;
- las ventanas document restauran contra monitor actual/primario y ajustan bounds al `workArea` si el monitor guardado no esta disponible;
- `CustomWindowFrame` agrego handles compartidos de resize con `startResizeDragging`;
- `tauri.conf.json` vuelve a `resizable: true` para `main`;
- `default.json` agrega `core:window:allow-start-resize-dragging`.

Checks iniciales pasaron:

- `npm run build`;
- `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.

Validacion posterior:

- `npm run visual:check` y un subset focalizado (`shell loads`, `settings panel`) fallaron por el incidente conocido de Vite/WebView: `root still empty`, `@vite/client` lento y `page.goto` timeout/abort. No hubo assertion especifica de overflow/resize del cambio.
- `npm run dev:restart` dejo la app viva en `src-tauri\target\debug\copicu.exe`, con `renderer: module-load`, heartbeat y shortcuts registrados.

Decimocuarto corte documental:

- `docs/topics/custom-window-system.md` quedo como registro canonico de research de ventanas Tauri.
- Fuentes canonicas prioritarias:
  - https://v2.tauri.app/learn/security/capabilities-for-windows-and-platforms/
  - https://v2.tauri.app/learn/window-customization/
- Regla fijada: si issues, blogs, recuerdos locales o StackOverflow contradicen esas guias oficiales actuales de Tauri v2, ganan las guias oficiales; antes de fijar decisiones durables, verificar version actual de Tauri.
- Research complementario guardado: Window API, WebviewWindowBuilder docs.rs, Electron BrowserWindow/modal como comparativa, y issues Tauri sobre transparencia/undecorated en Windows.
- Direccion acordada: la mayoria de funcionalidad vivira fuera del picker; las superficies ricas deben ser ventanas standalone de producto con label/capability propios, no pseudo-modales dentro de `ui-host` transparente.
- `ui-host` queda cuestionado para prompts ricos; mantenerlo solo para inputs chicos o migrarlo gradualmente.
- Proxima sesion: auditar ventanas existentes contra el topic canonico antes de implementar nueva ventana `metadata` o migrar scripts.

Decimoquinto corte de auditoria/research:

- Auditadas ventanas existentes contra Tauri v2.11.2 y fuentes canonicas actuales.
- Fuentes nuevas agregadas al topic: Capabilities Overview, Capability Reference, Window State Plugin y maintainer discussion #11643.
- Segunda opinion de agente confirmo el rumbo: superficies ricas como ventanas standalone, pero a traves de un surface registry host-owned y con un solo `index.html` + routing por label como default React/Vite.
- Decision durable registrada en `docs/DECISIONS.md`: `2026-06-12 - Ventanas de producto con surface registry`.
- Pattern final documentado:
  - ventanas de producto con label estable;
  - registry Rust para route/kind/lifecycle/bounds/chrome/capability;
  - capabilities separadas por superficie/categoria, no `default.json` gigante;
  - guards backend por `window.label()` para comandos sensibles;
  - pending state/handshake para payloads al abrir ventanas nuevas;
  - `ui-host` solo para alert/confirm/input chico.
- Fix chico aplicado en codigo durante la auditoria: `ai-output` ahora tiene `pending_ai_output` para no perder el primer payload si el listener React aun no monto.
- Checks: `npm run build` paso; `cargo check` paso; `npm run visual:check` paso 76/78 y fallo solo en Settings por esperar `6 scripts` cuando el workspace ya tiene `7 scripts`.
- Proxima sesion: implementar primer corte de surface registry y split de capabilities antes de crear `metadata` o `scripts`.

Decimosexto corte aplicado:

- `scripts/examples/025-assign-metadata-to-active.ts` dejo de usar `copicu.ui.input()` y ahora abre la surface standalone `metadata` via `copicu.metadata.editActive()`.
- Agregado host API/capability acotado `metadata:edit-active` para scripts, con dispatch Rust hacia el editor `metadata` existente y pending payload host-owned.
- Actualizadas listas de capabilities en runner, types, frontend, planner y guia de scripts.
- `visual:check` actualizado a 7 scripts y vuelve a pasar completo.
- Checks: `cargo check`, `npm run build`, `npm run visual:check`.
- Proximo dogfood: abrir `Assign metadata` desde item menu/shortcut sobre datos sinteticos y validar foco, cierre y persistencia de bounds de `metadata`.

Decimoseptimo corte aplicado:

- Copias activas del script `025-assign-metadata-to-active.ts` fueron actualizadas en `Documents\Copicu\Scripts` y `.codex-run\dev-isolated\scripts`; el bug visible era que la app ejecutaba copias viejas con `copicu.ui.input()`.
- `MetadataWindowApp` ahora enfoca el primer input (`Title`) al abrir, igual que el picker enfoca search.
- Los atajos del editor (`Escape`, `F2`, `Ctrl+Enter`) pasaron al formulario completo para funcionar desde `Title` y `Notes and tags`.
- Agregado test visual `metadata window focuses title input on open`; checks pasaron: `npm run build`, `npm run visual:check` 80/80.
- Research rapido externo: Microsoft documenta que WebView2 cold start al crear/navegar un control puede tener demora notable y que cada control suma procesos/memoria. Tauri es liviano en Rust/binario, pero una ventana nueva sigue pagando WebView2 + carga de frontend.
- Proximo corte recomendado: medir cold vs warm de `metadata` con timestamps desde script action hasta input focused; si warm es rapido, implementar prewarm/cache; si warm tambien es lento, investigar bundle/IPC/renderer.

Decimoctavo corte aplicado:

- Agregada instrumentacion de apertura `metadata`: accion script, host call, fetch de item, pending payload, build/show/focus/emit backend, mount/pending/loadPayload/focus renderer.
- Agregado harness `scripts/dev/measure-metadata-window.ps1` con app data aislado, item sintetico y medicion direct + script cold/warm.
- Hallazgo: la ruta directa anterior podia quedarse en `surface.build.start` al crear WebView desde comando sync; `open_metadata_window` ahora despacha como Settings via thread + `run_on_main_thread`.
- Medicion final aislada `20260612-092632`: cold direct visible 681 ms / Title focused 745 ms; warm direct visible 425 ms / focused 428 ms; warm script visible 414 ms / focused 418 ms.
- Backend final: cold build 136 ms y total backend hasta emit 201 ms; warm backend direct 86 ms; warm backend por script host call 67 ms, action completo 479 ms.
- Memoria aislada: cold `metadata` suma una WebView extra, 10 -> 11 procesos WebView, private MB aprox. 342 -> 398; hidden mantiene la WebView cacheada.
- Foco cold requirio retry renderer corto del input `Title`; visual check `metadata window focuses title input on open` sigue pasando.
- Recomendacion con datos: mantener `CachedHidden`; si JP quiere que la primera apertura se sienta instantanea, preferir prewarm idle/intencion de la surface `metadata`. Bundle split o skeleton no son primer candidato: warm ya esta dominado por show/focus/renderer visible, no por fetch/IPC.

Decimonoveno corte aplicado:

- Decision de producto: JP prioriza velocidad percibida agresivamente por defecto; aceptar coste razonable extra de memoria/procesos si no es extremo.
- `metadata` ahora se prewarm-ea oculta 350 ms despues de setup, usando el surface registry, restauracion de bounds y diagnosticos `metadata.prewarm.*`.
- Medicion aislada `20260612-094624`: prewarm oculto build 126 ms / done 128 ms; primera apertura directa cacheada visible 207 ms / `Title` focused 210 ms; warm direct visible 137 ms / focused 139 ms; warm script visible 130 ms / focused 131 ms.
- Backend medido despues de prewarm: primera apertura cacheada hasta emit 64 ms; warm direct 36 ms; warm script host call 25 ms y action completo 348 ms.
- Tradeoff observado en harness aislado: queda una WebView oculta en idle; procesos WebView2 aprox. 10 -> 13 y private MB aprox. 342 -> 405. Por ahora se considera aceptable para dogfood por el salto de latencia.
- Recomendacion vigente: mantener `CachedHidden` + prewarm default para `metadata`; si dogfood siente el idle demasiado caro, probar prewarm por intencion antes que bundle split. Bundle split y skeleton visible quedan como segunda linea porque la mayor mejora vino de quitar el cold create/navigate.

Auditoria de ventanas existentes:

- `main`: ok como picker solido frameless; pendiente split de capability y guards de comandos.
- `settings`: ok como document window solida; inconsistencia pendiente entre docs de close real y codigo cacheado con `hide()`.
- `ui-host`: mantener solo como prompt chico; transparencia sigue como riesgo a revisar en corte separado.
- `notifications`: ok como toast window fixed-position; pendiente capability minima separada.
- `whichkey`: ok como utility temporal destroy/recreate y opt-out de bounds; pendiente capability minima separada.
- `ai-output`: ok como document window; corregido readiness con pending payload; pendiente capability minima separada.

## Diagnostico Inicial

El picker ya tiene valor funcional, pero la composicion visual sigue arrastrando decisiones de MVP:

- app shell con panel central y overlays absolutos;
- settings como modal interno;
- editor como modal interno;
- command palette como overlay interno;
- notifications y ui-host como superficies auxiliares separadas, pero todavia no hay modelo global de ventanas;
- tema actual limitado a `system/light/dark`;
- componentes definidos por CSS global, sin vocabulario extraido.

## Checklist De Estudio

- [x] Crear topic durable.
- [x] Indexar trabajo vivo.
- [x] Hacer research inicial con web.
- [x] Quitar frame externo del picker rapido.
- [x] Adoptar Mantine como infraestructura minima.
- [x] Crear topic Mantine UI System.
- [x] Migrar Settings a Mantine.
- [x] Sacar Settings del picker como ventana standalone.
- [x] Crear topic operativo de arquitectura UI: `docs/topics/ui-surface-architecture.md`.
- [ ] Capturar screenshots actuales de picker/settings/command/editor/ui-host.
- [ ] Auditar problemas visuales por superficie.
- [ ] Elegir direccion visual candidata.
- [x] Definir modelo inicial de superficies y ventanas.
- [x] Definir contrato inicial de temas (`theme` + `themeId` + catalogo).
- [x] Documentar plan inicial de custom window chrome compartido.
- [ ] Definir componentes base y estados.
- [ ] Crear spec antes de implementar rediseño grande.

## Issues

### 1. Feo

Hipotesis:

- No hay sistema visual consolidado.
- El feed mezcla densidad util con demasiados bordes, microbotones y overlays.
- La paleta actual es sobria, pero no memorable ni muy refinada.
- La UI no tiene suficiente diferencia entre quick picker, settings, menus y prompts.

Primeras soluciones a evaluar:

- nuevo set de tokens semanticos;
- selected row mas claro y elegante;
- menus y botones iconicos consistentes;
- menos borde por defecto, mas jerarquia por superficie/tono/espaciado;
- preview-first layout mas deliberado.

### 2. Temas Reales

Estado:

- La app ya no depende solo de dark/light: `themeCatalog.ts` permite presets N con light/dark pair.
- Settings persiste `theme` + `themeId`.
- Falta polish visual: contraste, preview compacta si aporta valor y eventual import/export.

Siguientes soluciones a evaluar:

- validar contraste de los 8 presets en desktop/narrow;
- preview de tema en Settings si el select queda pobre para elegir;
- versionar JSON de tema solo cuando haya custom/import/export.

### 3. Ventanas Dentro De Otra Ventana

Hipotesis:

- Settings y editor no deberian vivir dentro del picker rapido.
- Command palette puede ser modo del picker, pero no como dialog pesado.
- `ui-host` confirma que Tauri windows separadas son viables; falta aplicar el mismo criterio a settings/editor.

Primeras soluciones a evaluar:

- Settings como ventana Tauri standalone.
- Editor grande como inspector/window standalone.
- Command palette como quick mode sin backdrop.
- Toasts/prompts por `ui-host`.

### 4. Elementos UI Poco Bonitos

Hipotesis:

- Los controles existen, pero no tienen contrato de diseno.
- Hay demasiada variacion manual en botones, pills, rows, menus y panels.

Primeras soluciones a evaluar:

- extraer componentes base;
- sumar iconos consistentes;
- estados obligatorios por componente;
- pruebas visuales por superficie;
- checklist de contrast/focus/reduced-motion.

## Preguntas Para Decidir Con JP

1. La direccion base debe ser mas `Native Utility`, mas `Command Surface`, o separar `Quick Picker + Clipboard Workbench`?
2. Settings: ventana normal standalone o floating tool window?
3. Item editor: inspector separado, ventana separada, o edicion inline limitada?
4. Temas: presets primero, o custom theme JSON desde el primer corte?
5. Iconos: decidido `lucide-react` para controles/menus Mantine; extenderlo gradualmente donde reemplace glyphs sueltos.

## Proximo Corte

Proximo corte UI recomendado:

1. Abrir `docs/topics/custom-window-system.md` y usar el contrato `Surface Registry Host-Owned`.
2. Crear/extraer registry Rust de superficies actuales sin cambiar comportamiento visible.
3. Separar capabilities por superficie/categoria y dejar de ampliar `default.json` como permiso comun.
4. Agregar guards backend por `window.label()` para comandos sensibles.
5. Normalizar lifecycle de `settings`: `cached` con `hide()` o close real con `destroy()`.
6. Recién despues crear la primera ventana nueva (`metadata` o `scripts`) usando el registry.

Auditoria visual concreta pendiente:

1. Correr la app o abrir el target visual local.
2. Sacar screenshots de superficies actuales.
3. Anotar fallas por issue y por superficie.
4. Preparar una propuesta de direccion visual con 2 o 3 rutas comparables.
