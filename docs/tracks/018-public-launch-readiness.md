---
id: public-launch-readiness
status: active
updated: 2026-06-23
---

# Public Launch Readiness

Plan ejecutable para convertir Copicu en un proyecto open source entendible, confiable, instalable y promocionable sin sobreactuar claims ni esconder que es Windows alpha.

Este track complementa `docs/tracks/013-open-source-growth.md`: 013 guarda la estrategia de growth y assets; este track ordena la implementacion concreta de launch readiness para el proximo corte publico.

## North Star

Hacer que una persona nueva entienda en menos de 30 segundos:

1. que Copicu es un clipboard manager/workbench local-first para power users de Windows;
2. que puede instalarlo y probarlo con expectativas alpha claras;
3. que el diferencial real es search + metadata + TypeScript/JavaScript actions + privacidad local-first;
4. que el proyecto esta vivo y acepta feedback/contribuciones concretas.

## Posicionamiento Vigente Para Launch

Usar como framing principal:

> A local-first, scriptable clipboard manager for Windows power users.

Variantes permitidas:

- `Local-first clipboard history with search, metadata, scripts, and optional AI actions.`
- `A keyboard-first clipboard manager for Windows developers and power users.`
- `Clipboard history as working memory: search it, organize it, automate it.`

Bajar de prioridad:

- AI como headline.
- CopyQ como comparacion principal.
- Tauri/Rust/SQLite como primer beneficio para usuarios finales.
- `workbench` solo, sin decir `clipboard manager`.

Mantener claims honestos:

- Windows alpha / Windows-first.
- AI off by default.
- scripts are trusted local automation, not a sandboxed marketplace.
- local SQLite/blob storage.
- no unlimited-history claims without public benchmark evidence.
- no `stable`, `production-ready`, `secure sandbox`, `CopyQ replacement` sin matices.

## Ask-Before Boundaries

Pedir confirmacion explicita antes de:

- publicar posts en HN/Reddit/Dev.to/X/LinkedIn/AlternativeTo;
- hacer `git push`, crear tags, crear releases o subir assets;
- comprar o tramitar code-signing certificates;
- enviar PRs a `winget-pkgs`, Scoop buckets o awesome lists;
- borrar docs agenticos versionados si el cambio no es una simple reubicacion documentada;
- cambiar nombre publico, licencia o promesas de privacidad.

## Workstreams

### A. Surface Hygiene And Repo First Impression

Objetivo: que el repo no parezca una herramienta personal accidentalmente publica.

Tareas:

1. Auditar archivos versionados que parecen tool-cache o meta-agenticos:
   - `.pi/extensions/`
   - `.pi/prompts/`
   - `docs/skills/aos-*`
   - `.agents/`, `.codex-run/`, `.codemapper/`, `.vscode/`, logs y test outputs si aparecen versionados.
2. Clasificar cada grupo:
   - necesario para operar el proyecto publico;
   - util solo para JP/agentes;
   - cache local que no debe versionarse.
3. Proponer antes de remover/reubicar cualquier pieza agentica durable.
4. Asegurar `.gitignore` cubre caches locales.
5. Si se preserva contexto agentico publico, moverlo o explicarlo como `docs/internal/agentic-workflow` o similar para no contaminar onboarding.

Validacion:

```powershell
git ls-files | grep -E '^(\.agents|\.codex-run|\.codemapper|\.vscode|test-results|logs|tmp-)' || true
git status --short
```

Notas:

- `.pi/prompts` y `.pi/extensions` pueden ser parte operacional real de Pi en este repo; no asumir que son basura.
- Si se remueve algo, hacerlo con explicacion y sin romper el flujo local de JP.

### B. README User-First Rewrite

Objetivo: reducir friccion de lectura y hacer que el README convierta visitantes en testers.

Tareas:

1. Reescribir `README.md` a una estructura mas corta:
   - hero one-liner;
   - GIF/screenshot real-looking;
   - install Windows release;
   - 3 flows concretos: search/paste, metadata/tags, actions/scripts;
   - privacy/local-first;
   - alpha limitations;
   - contributing quickstart;
   - links profundos.
2. Mover `Working With Coding Agents` a docs de contributor/agentic workflow, dejando solo un link breve si hace falta.
3. Bajar AI del subtitulo/descripcion principal y tratarlo como optional actions.
4. Reducir CopyQ a una seccion corta: inspired by, not compatible.
5. Agregar una tabla chica `Copicu vs CopyQ/Ditto/PasteBar` con dimensiones honestas:
   - Windows focus/paste;
   - local storage;
   - metadata/tags;
   - scripting/action model;
   - optional AI;
   - maturity/cross-platform caveats.
6. Agregar badges solo si reflejan checks reales.

Validacion:

```powershell
python - <<'PY'
from pathlib import Path
p=Path('README.md')
print(len(p.read_text(encoding='utf-8')))
PY
rg -n "Working With Coding Agents|AGENTS.md|docs/topics" README.md
```

Criterio:

- README objetivo: ~8-10 KB o menos salvo que los assets/links requieran mas.
- Primer pantallazo: install + valor + visual.

### C. Demo Assets Real-Looking With Synthetic Data

Objetivo: mostrar utilidad real sin filtrar clipboard real.

Tareas:

1. Crear dataset sintetico realista:
   - stack traces falsos;
   - URLs con tracking params;
   - snippets TS/Rust;
   - markdown notes;
   - comandos terminal;
   - texto sucio para limpiar;
   - screenshots/fake image clips si aplica.
2. Grabar o generar assets:
   - hero GIF 20-30s: open picker -> search -> select -> paste previous window;
   - screenshot picker con preview y metadata;
   - screenshot actions/scripts menu;
   - optional GIF: action cleans URL / formats JSON.
3. Etiquetar visualmente o documentar que son synthetic demos.
4. Linkear assets desde README y release notes.

Validacion:

```powershell
ls docs/assets/gifs docs/assets/screenshots docs/assets/videos
```

Criterio:

- El demo debe parecer un flujo real de dev/power-user, aunque los datos sean falsos.
- No usar payload real del clipboard ni rutas/secrets personales.

### D. Scripts And Actions Showcase

Objetivo: que `scriptable` sea visible a los 5 minutos.

Tareas:

1. Agregar 5 scripts/acciones ejemplo documentadas:
   - clean URL tracking params;
   - format JSON;
   - normalize whitespace;
   - extract URLs;
   - join checked/selected clips as Markdown.
2. Decidir si van como built-ins, sample scripts copiables o ambos.
3. Actualizar `docs/user/scripts.md` con input/output sintetico.
4. Si se agregan built-ins, crear tests focalizados.
5. En README, mostrar un ejemplo compacto de una action/script real.

Validacion:

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --tests
npm run rust:test
```

Criterio:

- Un usuario debe entender que Copicu transforma/reutiliza clips, no solo los guarda.

### E. Contributor Funnel

Objetivo: convertir interes en contribuciones pequeñas y seguras sin que el repo parezca artificial.

Tareas:

1. No sembrar issues placeholder solo para mostrar actividad; JP decidio borrar los issues generados porque sonaban falsos.
2. Crear issues publicos solo cuando representen feedback real, bug reproducible o tarea curada con owner/contexto concreto.
3. Si hace falta un `good first issue`, escribirlo como trabajo real y verificable, no como backlog promocional.
4. Agregar seccion `Contribute in 15 minutes` cuando exista un flujo de contribucion claro:
   - instalar deps;
   - correr checks;
   - elegir issue real;
   - reglas de privacidad para fixtures.
5. Asegurar `CONTRIBUTING.md` no obliga a leer la capa agentica completa.

Validacion:

```powershell
gh issue list --repo jpsala/copicu --limit 20 --json number,title,labels
```

Criterio:

- Un contributor externo puede tomar una tarea sin conocer el sistema agentico local.

### F. Trust, Distribution And Signing Research

Objetivo: reducir miedo a instalar un clipboard monitor unsigned.

Tareas:

1. Documentar estado actual:
   - Windows NSIS x64;
   - unsigned alpha si aplica;
   - SHA256 publicado;
   - GitHub Releases;
   - auto-update firmado con Tauri updater si aplica, distinguiendo de code signing Windows.
2. Investigar opciones:
   - winget;
   - Scoop;
   - Chocolatey opcional;
   - OV/EV code signing certificate para Windows;
   - costos/requisitos de identidad;
   - tradeoff para un proyecto open source personal.
3. Preparar recomendacion antes de pagar/tramitar nada.
4. Agregar aviso transparente de SmartScreen/Defender si corresponde.

Validacion:

```powershell
gh release view v0.2.8 --repo jpsala/copicu --json tagName,assets,url
```

Criterio:

- No prometer instalacion sin warnings si el binario no esta firmado.
- No iniciar compras o submissions sin aprobacion de JP.

### G. v0.3.0 Public Feedback Release

Objetivo: tener un corte unico para promocionar.

Tareas:

1. Consolidar mejoras de README/assets/scripts/issues.
2. Preparar changelog `v0.3.0` orientado a feedback publico.
3. Correr checks de release.
4. Crear release solo con confirmacion explicita.
5. Actualizar README a `v0.3.0`, asset y SHA256.

Validacion:

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --tests
npm run rust:test
npm run tauri:build
```

Criterio:

- Release notes dicen que probar, que reportar y limitaciones alpha.

### H. Soft Launch Technical

Objetivo: conseguir feedback forgiving de devs antes de HN amplio.

Tareas:

1. Actualizar drafts para:
   - r/tauri;
   - r/rust;
   - Tauri Discord/community;
   - Dev.to technical post.
2. Usar angulo tecnico:
   - Windows clipboard/focus edge cases;
   - Tauri 2 + Rust native core;
   - TypeScript actions;
   - local-first privacy.
3. Pedir feedback concreto, no vender humo.

Criterio:

- No publicar sin aprobacion.
- Cada post debe tener link a release, demo y issues.

### I. Public Launch / Show HN

Objetivo: hacer un launch honesto cuando el repo ya convierta.

Tareas:

1. Editar Show HN a menos de 350 palabras.
2. Titulo preferido:
   - `Show HN: Copicu, a local-first scriptable clipboard manager for Windows`
3. Primer comentario:
   - por que existe;
   - por que local-first;
   - que feedback se busca;
   - limitaciones alpha.
4. Preparar respuestas a preguntas esperables:
   - por que no CopyQ/Ditto;
   - SmartScreen/signing;
   - AI/privacy;
   - Windows-only;
   - scripting safety;
   - benchmarks.

Criterio:

- Publicar solo despues de soft launch y con aprobacion.

### J. Post-Launch Response Loop

Objetivo: convertir atencion en aprendizaje y confianza.

Tareas:

1. Responder comentarios en menos de 24h durante los primeros dias.
2. Convertir feedback en issues etiquetados.
3. Shippear fixes chicos rapido si son seguros.
4. Registrar metricas utiles:
   - downloads reales de installer;
   - stars/forks/watchers;
   - issues con repro Windows;
   - script ideas;
   - paste target failures;
   - external PRs.
5. Actualizar `docs/tracks/013-open-source-growth.md` con resultados.

## Orden Recomendado

1. A: audit de superficie.
2. B: README rewrite.
3. C: assets hero.
4. D: scripts showcase.
5. E: contributor funnel.
6. F: distribution/signing research.
7. G: v0.3.0 release.
8. H: soft launch.
9. I: Show HN/public launch.
10. J: response loop.

## Siguiente Paso Concreto

Primer lote recomendado:

1. hacer audit no destructivo de archivos publicos y README;
2. preparar PR/local commit con README user-first y link a este track;
3. elegir si `.pi/*` queda publico como tooling del proyecto o se mueve a docs/internal antes del launch;
4. empezar hero demo real-looking con datos sinteticos.

## Progress 2026-06-23

Hecho en el primer lote:

- Creado este track y agregado al router `docs/TOPICS.md`.
- Audit no destructivo de superficie versionada:
  - `.agents/`, `.codex-run/`, `.codemapper/`, `.vscode/`, `test-results/`, `logs/` y `tmp-*` no aparecen versionados.
  - Si aparecen como archivos locales, `.gitignore` ya los cubre.
  - Siguen versionados `.pi/extensions/*`, `.pi/prompts/*` y `docs/skills/aos-orquestar/SKILL.md`; tratarlos como tooling durable del proyecto hasta que JP apruebe moverlos o retirarlos antes del launch.
- `README.md` reescrito con enfoque user-first:
  - headline cambio a `local-first, scriptable clipboard manager for Windows power users`;
  - AI bajo de headline a feature opcional;
  - CopyQ bajo a contexto/compatibilidad;
  - removida seccion larga `Working With Coding Agents` del README publico;
  - agregada tabla comparativa conservadora;
  - agregado aviso transparente de SmartScreen/unsigned alpha;
  - agregado link a este track de launch readiness;
  - agregado showcase de ejemplos versionados en `scripts/examples/`.
- `docs/launch-drafts.md` reescrito con angulo nuevo, links a `v0.2.8`, drafts Show HN/Reddit y borradores de issues de codigo reales.
- JP decidio mantener y explicar `.pi/*` / `docs/skills/aos-*` como tooling durable del proyecto, sin destacarlo en README; agregado bloque breve en `CONTRIBUTING.md` aclarando que es opcional para contributors normales.
- JP autorizo crear issues publicos de codigo; creados #11-#15, implementados en `6ed2525` y cerrados tras push a `main`.
- Para mantener contributor funnel abierto, creados reemplazos:
  - #16 Add sample action to extract URLs from selected text
  - #17 Add tests for JSON formatting sample action
  - #18 Add README-ready synthetic picker screenshot
- #16/#17 implementados en `19a1ba7` y cerrados tras push a `origin/main`.
- #18 implementado en `fc47d7a` y cerrado tras push a `origin/main`.
- Commit documental `35677ca` (`Persist release and import notes`) pusheado a `origin/main`; `main` quedo sincronizado y limpio.
- Implementado y pusheado para el proximo commit/release:
  - `scripts/examples/028-clean-url-tracking-copy.ts` (#11)
  - `scripts/examples/029-format-json-copy.ts` (#12)
  - `scripts/run-example-action.mjs` ahora permite `COPICU_MOCK_ITEM_TEXT` / `COPICU_MOCK_ITEM_TITLE` para validar transform scripts con inputs sinteticos especificos
  - `docs/assets/source-data/public-demo-clips.json` y expansion de `synthetic-clips.md` (#15)
  - demo generado actualizado con clips mas real-looking (`scripts/demos/generate-synthetic-picker-demo.mjs` + MP4/GIF/poster regenerados)
  - `tests/script-clean-url-helper.test.mjs` + `npm run scripts:examples:test` cubren cleanup de tracking params (#13)
  - script registry empty-state onboarding mejorado en Settings (#14)
  - `docs/release-drafts/v0.3.0-public-feedback.md` creado como draft de release, sin publicar
  - validado `npm run scripts:run-example` para clean URL y format JSON con inputs sinteticos via env
  - validado `npm run scripts:examples:test`
  - validado `npm run build`
  - validado `npm run capabilities:drift:test`
  - validado `npm run ai:planner:test`
  - validado `npm run visual:check`
  - app dev reiniciada con `npm run dev:restart`; el tool timeout reporto 120s, pero el log `.codex-run/dev-restart/logs/restart-20260623-135502.log` confirma startup hidden a +80.1s y `copicu.exe` responding=True

Avance siguiente sesion:

- Cerrado #18 con `docs/assets/screenshots/picker-synthetic-history.png`, screenshot README-ready generado con datos sinteticos.
- `README.md` ahora muestra el screenshot estatico antes del GIF; `docs/assets/README.md` lista el asset.
- `scripts/demos/generate-synthetic-picker-demo.mjs` ahora consume `docs/assets/source-data/public-demo-clips.json` y regenera screenshot/poster/MP4/GIF desde la misma fuente sintetica.
- `docs/launch-drafts.md` ahora contiene borradores WinGet, Scoop y code-signing para `v0.3.0` con limites de no submission/no compra.
- Validado `node scripts/demos/generate-synthetic-picker-demo.mjs`.
- Validado borrador WinGet sustituyendo valores `v0.2.8`: `winget validate .tmp/winget-v0.2.8` paso tras agregar schema headers.
- Validado borrador Scoop a nivel JSON con `python -m json.tool .tmp/scoop/copicu.json`; instalacion/extraccion no probadas para no mutar sistema local.
- Commit `fc47d7a` pusheado a `origin/main`; `main` quedo sincronizado con GitHub.

Avance #16/#17:

- Agregado `scripts/examples/030-extract-urls-copy.ts`: extrae URLs `http(s)` de un clip seleccionado, copia una por linea y loguea solo ID/longitudes/conteo.
- `scripts/examples/029-format-json-copy.ts` ahora exporta helper puro `formatJson` que reporta errores sin payload.
- Agregados tests `tests/script-format-json-helper.test.mjs` y `tests/script-extract-urls-helper.test.mjs`; `npm run scripts:examples:test` ahora cubre URL cleanup, JSON formatting y URL extraction.
- Validado `npm run scripts:examples:test`, `npm run build`, `npm run capabilities:drift:test`, `npm run ai:planner:test` y `npm run scripts:run-example` con inputs sinteticos para `029`/`030`.
- Commit `19a1ba7` pusheado a `origin/main`; #16/#17 cerrados.

Research de distribucion/confianza 2026-06-23:

- Microsoft Learn indica que para apps fuera de Microsoft Store conviene firmar los archivos, pero la reputacion SmartScreen se construye con descargas/uso; EV ya no debe asumirse como bypass instantaneo desde la documentacion 2024+.
  - https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
  - https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Microsoft Store/MSIX evita warnings SmartScreen por firma/reputacion de Store, pero implica pipeline y requisitos extra; no tomarlo como paso inmediato sin evaluar compatibilidad Tauri/NSIS.
- WinGet acepta manifests YAML para paquetes con instaladores EXE/MSI/MSIX y `InstallerUrl` debe apuntar a la ubicacion del publisher/ISV; GitHub Releases encaja como origen si el installer es estable.
  - https://learn.microsoft.com/en-us/windows/package-manager/package/
  - https://learn.microsoft.com/en-us/windows/package-manager/package/manifest
  - https://learn.microsoft.com/en-us/windows/package-manager/package/windows-package-manager-policies
- Recomendacion actual: para `v0.3.0`, mantener GitHub Releases + SHA256 + warning transparente; preparar winget/Scoop despues del corte si el instalador y naming quedan estables; no comprar OV/EV todavia sin validar costos/requisitos y beneficio real.

Checkpoint 2026-06-29 post `v0.3.0`:

- `v0.3.0` publicado en GitHub con assets `Copicu_0.3.0_x64-setup.exe` y `latest.json`; release/tag apunta a `ef4192a6ffbde51fee59d4bee68a847adb745667`; SHA256 `05B077A3416A65A7979BEFE1DF35AC3951AAD42B92304F7FDB6E938EEBB0F2A6`.
- Checks del corte: `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml --tests`, `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-run`, `npm run rust:test`, `npm run scripts:examples:test`, `npm run capabilities:drift:test`, `node --test tests/ai-query-planner.test.mjs` y `npm run visual:check` (98 tests) pasaron.
- JP decidio borrar todos los issues publicos sembrados porque sonaban falsos/no reales; se eliminaron #1-#8 y #11-#18 con `gh issue delete`, y `gh issue list --state all` quedo vacío.
- `main`/`origin/main` quedaron en `7b9dda4` con docs post-release. El siguiente cambio publico debe ser feedback real, bug/repro o tarea curada.

Pendiente inmediato:

1. Dogfood instalada/update de `v0.3.0` y revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` si aparece hang/lentitud.
2. Si se quiere abrir contributor funnel, crear solo issues reales/curados; evitar issues de relleno.
3. Si se crea release/tag o se pushea otro commit, pedir aprobacion explicita antes.
