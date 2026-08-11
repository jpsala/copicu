# Copicu dogfood battery

Batería guardada para correr periódicamente sobre la app real de Windows. El
script npm de producto y las baterías manuales OMP son superficies separadas.

## OMP Computer directo

Las baterías del built-in `computer` son:

- `tests/manual/dogfood/COMPUTER_USE_BATTERY.md` — batería general.
- `tests/manual/dogfood/PICKER_COMPUTER_USE_FOCUS_BATTERY.md` — foco,
  pin/keep-open y C0 obligatorio: app externa -> hotkey foreground ->
  `desktop.type` sin targetear Copicu -> token visible.
- `tests/manual/dogfood/PICKER_REAL_USER_STRESS_FLOW.md` — copy/search/activate/
  paste interactivo con datos sintéticos.

No son comandos npm. Se ejecutan con `desktop.windows`, `desktop.focusedWindow`,
window handles, AX y screenshots del built-in; input requiere aprobación.

## Comando principal

```powershell
npm run dogfood:battery
```

Evidencia: `.codex-run/dogfood-battery/<timestamp>/`.

El comando:

1. Cierra Copicu repo-owned previo.
2. Levanta `src-tauri/target/release/copicu.exe` en la sesion interactiva de Windows.
3. Usa app-data aislada en `.codex-run/dogfood-battery/app-data`.
4. Deshabilita clipboard watcher para que el test sea estable.
5. Siembra fixtures text/path/url/json/code/markdown con `seed_dogfood_history.py`.
6. Corre la bateria mock de scripts/API (`dogfood:api`) contra ejemplos y `999-api-surface-smoke.ts`.
7. Abre el picker con `Ctrl+Shift+.`.
8. Valida que aparezca la ventana `Copicu` / `Tauri Window`.
9. Prueba busqueda, navegacion por teclado, multiseleccion, context menu y screenshot final.

Para dejar la app abierta al terminar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-dogfood-battery.ps1 -KeepOpen
```

## Bateria de API/scripts

Comando solo API:

```powershell
npm run dogfood:api
```

Cubre los ejemplos versionados y `tests/manual/dogfood/999-api-surface-smoke.ts`, que llama de forma segura la superficie soportada:

- `history.search/get/update/promote/move/remove`;
- `metadata.listTags/editActive`;
- `clipboard.read/writeText/writeItem`;
- `ui.toast/notify/alert/confirm/input/markdownOutput`;
- `ai.respondMarkdown` / mock synthetic;
- `enrichment.getResult/runForItem`;
- `picker.open/filter/activate/show/hide`;
- `commands.run("picker.open")`;
- `window.rememberPrevious/focusPrevious`;
- `input.paste`;
- logging JSONL y validacion de `logging.name`.

Antes de correr scripts, `api-surface-coverage.test.mjs` compara `999-api-surface-smoke.ts` contra `src-tauri/src/actions/capabilities.rs`, asi si agregamos una capability nueva la bateria falla hasta cubrirla.

Esto no reemplaza la prueba real por UI: es el contrato rapido de forma/semantica para scripts antes de tocar la app interactiva.

## Primer smoke estudiado / baseline

El primer caso que dejamos automatizado es el smoke de picker real:

- app real en sesion interactiva, no solo proceso headless;
- global shortcut registrado;
- picker visible/focalizable;
- search input recibe texto;
- hotkey del picker deja el search keyboard-ready sin click ni `focus` manual;
- la lista filtra sobre fixtures sembrados;
- Enter copia el item filtrado y se valida en una app interactiva;
- teclado navega y permite marcas/multiseleccion;
- se puede abrir menu contextual;
- queda screenshot de evidencia.

Esto cubre el problema central: existencia/capture de la ventana no prueban foco ni keyboard-readiness; C0 usa entrega foreground y resultado visible.

## Matriz larga para ir ampliando

La suite debe crecer por capas. Cada capa nueva debe dejar evidencia textual + screenshot cuando sea UI.

### A. Startup / Computer Use

- [x] Proceso Copicu arranca en sesion interactiva.
- [x] Hotkey global abre/oculta picker.
- [x] OMP enumera una ventana exacta y confirma foreground.
- [x] Screenshot real de WebView.
- [ ] Formalizar pin/keep-open sin coordenadas aproximadas.

### B. Picker keyboard-first

- [x] Hotkey global abre con foco y permite escribir inmediatamente en search.
- [x] Buscar texto sembrado.
- [x] Navegar con flechas.
- [x] Multi-select con `Space`.
- [x] Context menu por teclado.
- [x] `Enter` copy/activate y confirmar clipboard.
- [ ] Pin/unpin picker con hotkey configurado.
- [ ] Hide-on-focus-lost.

### C. Tipos de contenido / preview

Fixtures ya sembrados:

- [x] texto plano;
- [x] path Windows;
- [x] URL;
- [x] JSON;
- [x] codigo;
- [x] markdown.

Pendiente ampliar:

- [ ] imagen real con blob/thumbnail;
- [ ] HTML/rich text;
- [ ] items largos/virtualizacion;
- [ ] metadata title/notes/tags.

### D. Acciones / scripts

- [x] Mock battery corre ejemplos principales.
- [x] Script `999-api-surface-smoke.ts` cubre la superficie API soportada.
- [ ] Registrar scripts de ejemplo en app-data aislada real.
- [ ] Command palette ejecuta accion built-in.
- [ ] Command palette ejecuta script listo.
- [ ] Script con output markdown abre ventana de output real.
- [ ] Shortcut local de script.
- [ ] Shortcut global simple de script.
- [ ] Shortcut compuesto + WhichKey.

### E. Settings / temas

- [ ] Abrir settings.
- [ ] Buscar setting.
- [ ] Cambiar tema y persistir.
- [ ] Cambiar global shortcut en perfil aislado y volver a baseline.

### F. Tags / filtering

- [ ] Crear tag.
- [ ] Asignar tag a item.
- [ ] Filtrar por `tag:`.
- [ ] Hotkey/tag workflow.

### G. Paste-to-previous-window

- [ ] Abrir target controlado (Notepad o textarea propia).
- [ ] Copiar item desde picker.
- [ ] Restaurar foco previo.
- [ ] Confirmar paste con `Ctrl+V` o shortcut configurado.

### H. Enrichment / AI surfaces

- [ ] Enrichment path/url/json/code sugiere/aplica metadata.
- [ ] AI planner smoke con mock o endpoint deshabilitado controlado.
- [ ] Markdown output no desborda.

## Guardrails

- No usar `%APPDATA%\dev.jpsala.copicu` para esta bateria: siempre app-data aislada.
- AX/UIA no es oracle único para WebView; combinar foco, teclado, screenshots y estado de producto.
- Todo click por coordenadas usa el screenshot más reciente del mismo target y se recaptura tras cambios de ventana/display.
- No dejar watcher activo salvo test específico de clipboard capture.
- No cerrar apps del usuario fuera de procesos repo-owned.
- Ejecutar en sesión Windows interactiva; no usar Session 0 como oracle de foco, hotkeys o clipboard.
