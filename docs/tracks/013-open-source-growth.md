---
id: open-source-growth
status: active
updated: 2026-06-13
---

# Open Source Growth

Trabajo vivo para convertir el repo publico de Copicu en un proyecto open source entendible, instalable, testeable y compartible.

## Objetivo

Conseguir usuarios reales y contributors utiles sin vender Copicu como un clon de CopyQ ni como una demo generica de AI.

Copicu debe posicionarse como:

> Local-first clipboard workbench for people who reuse snippets, links, prompts, code, screenshots, and notes all day.

El mensaje largo:

> Search your clipboard like a history, organize it like a workspace, automate it like a tool, and command it like an assistant.

## Diferenciadores Publicos

### CopyQ-Inspired, Not CopyQ-Compatible

CopyQ es una referencia fuerte, pero Copicu no busca compatibilidad de scripts, internals ni paridad completa.

Mensaje publico recomendado:

- CopyQ proved that clipboard history can become a power-user workspace.
- Copicu rebuilds that idea with Tauri, Rust, TypeScript, SQLite, a compact picker, structured metadata, local scripts, and optional AI commands.
- Compatibility with CopyQ scripts is not a goal.
- CopyQ parity requests should be evaluated by product value, not by checklist.

### Low UI Footprint For Large Histories

No decir "no consume memoria". Todo software consume memoria, y el storage crece con metadata, blobs, thumbnails, paginas cacheadas y SQLite.

La promesa correcta:

- Copicu does not render the full clipboard history in React.
- The picker uses SQLite pagination plus `@tanstack/react-virtual`.
- The UI renders only the visible rows plus a small overscan buffer.
- This lets the picker stay responsive with very large histories, assuming storage, indexes, retention policy and preview generation are healthy.

Mensaje publico recomendado:

> Copicu is designed for large clipboard histories: SQLite keeps the history local and queryable, while TanStack Virtual keeps the picker from rendering thousands of rows at once.

Mensaje a evitar:

> Copicu uses no memory.

Mensaje a evitar por ahora, salvo benchmark:

> Millions of items with no difference.

Version honesta:

> The architecture is built so thousands of items should not make the picker feel like a giant DOM list. We still need public benchmarks before making stronger claims.

### Local-First Privacy

Mensaje publico:

- clipboard history is sensitive;
- metadata lives in local SQLite;
- image/blob payloads live in local files;
- scripts are trusted local files;
- AI is off by default;
- AI actions only send selected/explicit content to the configured provider.

### Scriptable Clipboard Workflows

No vender scripts como marketplace. Venderlos como automation local:

- normalize text;
- extract URLs;
- tag selected clips;
- open filtered picker views;
- summarize checked items;
- paste transformed content into the previous app.

## Target Audiences

1. Power users de Windows que ya usan clipboard managers.
2. Developers que copian comandos, snippets, URLs, prompts y errores todo el dia.
3. Usuarios de CopyQ interesados en una alternativa moderna, no necesariamente compatible.
4. Usuarios de Tauri/Rust interesados en desktop apps con clipboard, tray, shortcuts y SQLite.
5. Usuarios de AI workflows que necesitan control local y acciones explicitas.

## Conversion Funnel

### Visitor

Un visitante llega desde HN, Reddit, GitHub topics, un post tecnico o un link directo.

Necesita entender en menos de 30 segundos:

- que es Copicu;
- por que no es solo otro clipboard manager;
- si puede instalarlo;
- si es seguro probarlo;
- que limitaciones tiene la alpha.

### User

Un usuario inicial necesita:

- release Windows descargable;
- quickstart;
- screenshot/gif del picker;
- shortcut default;
- explicacion de privacidad;
- forma simple de reportar bugs.

### Contributor

Un contributor necesita:

- `CONTRIBUTING.md`;
- templates;
- issues etiquetados;
- docs de arquitectura;
- comandos de verificacion;
- reglas de privacidad sobre payloads reales.

## Checklist Ejecutable

### Repo Readiness

- [x] Repo publico `jpsala/copicu`.
- [x] README publico.
- [x] License MIT.
- [x] Release Windows alpha `v0.1.0-alpha.1`.
- [x] Topics GitHub iniciales.
- [x] `CONTRIBUTING.md`.
- [x] `SECURITY.md`.
- [x] `.github/ISSUE_TEMPLATE/bug_report.md`.
- [x] `.github/ISSUE_TEMPLATE/feature_request.md`.
- [x] `.github/ISSUE_TEMPLATE/script_idea.md`.
- [x] `.github/pull_request_template.md`.
- [x] Labels iniciales: `bug`, `enhancement`, `good first issue`, `help wanted`, `docs`, `scripts`, `windows`, `clipboard`, `privacy`, `copyq-inspired`.
- [x] 5-10 issues iniciales realmente tomables.

### Public Assets

- [x] Estructura y lista de assets en `docs/assets/README.md`.
- [x] Primer demo generado/sintetico: `docs/assets/videos/copicu-synthetic-picker-demo.mp4`, gif y poster.
- [ ] Video real corto: abrir picker, buscar, pegar en target temporal.
- [ ] Screenshot del picker con historial sintetico.
- [ ] Screenshot de Settings/AI config sin secretos.
- [ ] Gif corto: abrir picker, buscar, copiar.
- [ ] Gif corto: paste-to-previous-window.
- [ ] Gif corto: tag/filter workflow.
- [ ] Gif corto: AI command mode con Markdown output, usando datos sinteticos.
- [x] Guardar assets en `docs/assets/` o `.github/assets/` y linkear desde README.

### README Improvements

- [x] Subir "Install Windows alpha" cerca del inicio.
- [x] Agregar screenshot/gif inicial visible.
- [x] Agregar "Large histories without rendering thousands of rows" con wording honesto.
- [x] Agregar "Limitations of this alpha".
- [x] Agregar "What to test and report".
- [ ] Agregar badges cuando exista CI/release workflow.

### Launch Prep

- [x] Preparar post tecnico corto sobre paste-to-previous-window en Windows/Tauri.
- [x] Preparar post tecnico corto sobre clipboard history as working memory.
- [x] Preparar Show HN.
- [x] Preparar variantes Reddit por comunidad, sin copy-paste identico.
- [ ] Preparar hilo corto para X/LinkedIn si JP quiere usar esos canales.
- [ ] Evaluar GitHub Pages solo despues de tener assets.

### Distribution

- [x] Workflow reproducible de release Windows.
- [x] Checks de release: build, visual, rust tests, secret scan basico, audit de `.env`/logs/DB/blobs.
- [x] Documentar SHA256 de instalador por release.
- [x] Mejorar notas de release con known issues / highlights verificables.

### Estado 2026-06-12

- Publicado release final `v0.2.0` en GitHub con instalador NSIS Windows x64.
- Rama de publicacion: `codex/release-0.2.0`.
- PR draft abierto: `#9`.
- Verificaciones usadas en el corte:
  - `npm run build`
  - `npm run visual:check`
  - `npm run capabilities:drift:test`
  - `npm run ai:planner:test`
  - `npm run tauri:build`
- Siguiente foco de crecimiento publico:
  - agregar screenshot/gif visible en README;
  - `install:current` ya revalidado sobre instalada real el 2026-06-12;
  - seguir endureciendo el checklist para futuros releases sin depender de memoria manual.

### Estado 2026-06-13

- Publicado corte `v0.2.1` con version alineada en npm, Tauri y Cargo.
- README actualizado para apuntar a `v0.2.1`, instalador `Copicu_0.2.1_x64-setup.exe`, demo sintetica y SHA256 final.
- `npm run install:current` genero el instalador NSIS, reemplazo la instalada real y relanzo `C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`.
- Commit `a5c38a4`, rama `codex/release-0.2.1`, release GitHub `v0.2.1` y PR `#10` publicados; PR `#10` mergeado a `main` con merge commit `2207675`.
- SHA256: `B6CDF1A66FB61AADBC8341203BA15CF52FD1971E7EC65FA30A80BF9EC8433A9E`.

## Launch Messages

### One-Liner

```text
Copicu is a local-first clipboard workbench for search, reuse, scripts, and optional AI-assisted workflows.
```

### Short Pitch

```text
Copicu is a CopyQ-inspired clipboard manager built with Tauri, Rust, TypeScript and SQLite. It keeps history local, uses a keyboard-first picker, supports local scripts, and is designed for large histories without rendering thousands of clipboard items in the UI at once.
```

### Show HN Candidate

```text
Show HN: Copicu, a local-first clipboard workbench built with Tauri and Rust
```

### Reddit/Tauri Candidate

```text
I built a Windows-first clipboard manager with Tauri 2, Rust, SQLite, global shortcuts, tray behavior, paste-to-previous-window, virtualized history, local scripts, and optional AI commands. It is early alpha, and I am looking for real clipboard/paste edge cases.
```

### CopyQ Audience Candidate

```text
Copicu is inspired by CopyQ, but it is not a CopyQ-compatible clone. I am using CopyQ as a product baseline and rebuilding the workflow around a compact Tauri/Rust app, SQLite metadata, a virtualized picker, local scripts, and privacy-aware AI actions.
```

## Claims Policy

Use measured language until benchmarks exist.

Allowed now:

- "Windows alpha".
- "local-first".
- "CopyQ-inspired".
- "uses SQLite for local metadata/history".
- "uses TanStack Virtual so the picker does not render every history row".
- "AI is optional and disabled by default".
- "scripts are trusted local automation".

Avoid for now:

- "stable".
- "production ready".
- "no memory usage".
- "unlimited history".
- "millions of items with no performance difference".
- "secure sandboxed scripts".
- "CopyQ replacement" without qualifiers.

## Metrics

Track signal, not vanity only:

- release downloads;
- real issues from Windows users;
- clipboard source apps reported;
- paste target failures reported;
- script ideas submitted;
- stars/watchers/forks;
- external PRs;
- docs questions that reveal onboarding friction.

## Demo Video Pipeline

Objetivo: que Copicu pueda producir demos publicas y videos tipo YouTube con guiones reproducibles, datos sinteticos y bajo riesgo de filtrar clipboard real.

Modalidades:

- **Generated/storyboard demos**: se renderizan frames desde HTML/Playwright y se codifican con FFmpeg. Sirven para intros, gifs de README, thumbnails y demos conceptuales con control visual total. Primer script: `scripts/demos/generate-synthetic-picker-demo.mjs`.
- **Real app recordings**: se corre Copicu real con `COPICU_APP_DATA_DIR` aislado, se siembra historial sintetico, se graba pantalla/region con FFmpeg u OBS, y se automatiza la UI/target con Playwright/CDP y/o input Windows. Sirven para demostrar instalacion, first run, picker, paste, scripts y AI.
- **YouTube-ready videos**: variantes largas en 1080p/1440p, con capitulos, subtitulos/captions, posible voz, y varios segmentos grabados por feature.

Reglas:

- Nunca usar datos reales del clipboard.
- Usar app data aislada (`.codex-run/demo-*`) para cada demo real.
- Sembrar solo clips sinteticos desde `docs/assets/source-data/` o fixtures generados.
- Grabar targets temporales: HTML local, Notepad con archivo temporal o WinForms TextBox sintetico.
- Revisar poster/frame final antes de publicar.
- Exportar MP4 para YouTube/release notes y GIF corto para README cuando corresponda.
- Mantener marca visible o metadata clara: "Synthetic demo · no real clipboard data".

Outputs actuales:

- `docs/assets/videos/copicu-synthetic-picker-demo.mp4`
- `docs/assets/gifs/copicu-synthetic-picker-demo.gif`
- `docs/assets/screenshots/copicu-synthetic-picker-demo-poster.png`

Hallazgo 2026-06-09:

- Se agrego `scripts/demos/record-picker-search-paste-demo.ps1` para una grabacion real picker -> search -> paste con app data aislada, backdrop sintetico y FFmpeg.
- El pipeline levanta Copicu, siembra clips sinteticos y graba sin filtrar escritorio real gracias al backdrop.
- Bloqueo detectado: arrancar Copicu con WebView2 `--disable-gpu --disable-gpu-compositing` dejaba la app visualmente blanca para Computer Use/Windows Graphics Capture. Reiniciar sin esos flags deja la UI renderizada correctamente.
- `ffmpeg -f gdigrab` puede capturar mal superficies WebView2/Tauri; Computer Use usa Windows Graphics Capture y confirmo la UI renderizada cuando la app corre sin flags de GPU.
- Segundo problema: la automatizacion por teclado puede activar el item vigente si el search input no recibe foco; el script no conserva artefactos si la validacion no ve el texto sintetico esperado pegado en el target.
- El script ahora soporta `-UseExistingApp`: JP puede arrancar Copicu dev, confirmar visualmente que ya renderizo y esta usable, y recien ahi el script graba sin relanzar ni matar la app existente.
- Estado actual: Copicu dev queda corriendo desde `.codex-run/demo-tauri-target/debug/copicu.exe`, con app data aislada en `.codex-run/live-dev-for-demo/app-data`, Vite en `127.0.0.1:1420` y CDP en `127.0.0.1:9222`. Computer Use verifico visualmente la UI con search y empty state.
- Proximo intento recomendado: usar la app existente ya renderizada (`-UseExistingApp`) y Computer Use/OBS/Windows Graphics Capture para validar foco y grabacion; evitar relanzar con flags de GPU deshabilitada.

Siguiente demo en curso:

- Real app recording: abrir picker, buscar `auth bug`, seleccionar clip sintetico y pegarlo en un editor temporal.

## Next Session Task

Estado 2026-06-09: implementado el bloque de repo/documentacion del plan de crecimiento open source.

Hecho:

- `CONTRIBUTING.md`, `SECURITY.md`, issue templates y PR template.
- README install-first con Windows alpha, limitaciones alpha, que reportar y performance honesta para historiales grandes.
- Labels GitHub iniciales creados/actualizados.
- Issues iniciales #1-#8 creados.
- Estructura de assets publicos y datos sinteticos en `docs/assets/`.
- Drafts de Show HN, Reddit y posts tecnicos en `docs/launch-drafts.md`.

Pendiente real:

- Capturar screenshots/gifs/videos publicos con datos sinteticos.
- Linkear el primer screenshot/gif desde README.
- Decidir si agregar badges cuando exista CI/release workflow.
- Publicar launch posts solo despues de revisar assets y release notes.

Tarea original:

Al arrancar la siguiente sesion:

1. Crear `CONTRIBUTING.md`, `SECURITY.md` y templates GitHub.
2. Actualizar README con flujo install-first, limitaciones alpha y wording de performance para historiales grandes.
3. Crear labels/issues iniciales si se puede operar GitHub desde la sesion; si no, dejar comandos `gh` preparados.
4. Preparar estructura para assets publicos (`docs/assets/` o `.github/assets/`) y lista exacta de screenshots/gifs pendientes.
5. Preparar drafts de Show HN/Reddit/post tecnico, pero no publicar todavia.

Mantener estas reglas:

- usar datos sinteticos en screenshots/gifs;
- no publicar `.env`, logs, DBs, blobs ni payloads reales;
- no prometer "no consume memoria", "historial infinito" ni "millones sin diferencia";
- explicar el diferencial como SQLite paginado + TanStack Virtual + no renderizar todo el historial en React;
- aclarar que Copicu es CopyQ-inspired, not CopyQ-compatible.

## Next Step

1. Create public screenshots/gifs/videos with synthetic clipboard data.
2. Link the first useful screenshot/gif from README.
3. Review release notes against the alpha limitations and privacy rules.
4. Decide whether CI/release badges are ready.
5. Publish launch drafts only after visual assets are reviewed.
