---
id: open-source-github
status: active
kind: decision-map
triggers:
  - open source
  - GitHub public
  - repo publico
  - publicar repo
  - README publico
  - project website
  - web del proyecto
  - contributors
primary_refs:
  - ../../README.md
  - ../../.env.example
  - ../active-work/013-open-source-growth.md
  - ../PROJECT.md
  - ../topics/product-register.md
  - ../topics/ai-search-and-actions.md
  - ../user/README.md
  - ../user/scripts.md
---

# Open Source And GitHub

Topic para decisiones y pendientes sobre publicar Copicu como proyecto open source en GitHub.

Este documento no reemplaza `README.md`: el README es la entrada publica del repo. Este topic guarda la estrategia, decisiones tomadas, riesgos, web del proyecto y futuras decisiones sobre la presencia publica.

## Estado Actual

- Repo remoto actual: `https://github.com/jpsala/copicu.git`.
- Repo anterior: `https://github.com/jpsala/copyq-tauri.git`.
- Visibilidad actual confirmada 2026-06-09 con `gh repo view`: `PUBLIC`.
- El repo fue renombrado de `copyq-tauri` a `copicu`.
- Metadata GitHub inicial cargada: descripcion y topics publicos.
- Release Windows inicial creado: `v0.1.0-alpha.1`.
- `README.md` raiz fue reescrito como README publico de producto.
- `.env.example` existe como template publico para AI provider config.
- Commit publico inicial creado y pusheado: `1628ec0b24d330d381ca0b577aff43d4df8aef4f`.

## Decisiones Tomadas

### Nombre

Mantener **Copicu** como nombre publico del proyecto.

Razon:

- viene de la inspiracion CopyQ sin reclamar compatibilidad;
- es corto y distintivo;
- ya esta integrado en docs, scripts, settings, app data y narrativa;
- permite posicionar el proyecto como algo propio: CopyQ-inspired, not CopyQ-compatible.

### Posicionamiento

Copicu se presenta como:

> Local-first clipboard workbench for search, reuse, automation, and AI-assisted workflows.

La explicacion publica debe enfatizar:

- clipboard manager local y privado;
- CopyQ-inspired, no CopyQ clone;
- picker keyboard-first;
- historial searchable;
- metadata estructurada;
- scripts locales TypeScript/JavaScript;
- AI command mode como capa accionable sobre el historial;
- privacidad y control del usuario.

### Relacion Con CopyQ

CopyQ es baseline e inspiracion, no contrato de paridad.

El README publico debe decir explicitamente:

- Copicu no corre scripts CopyQ;
- no promete paridad completa;
- toma ideas probadas de CopyQ y las reconstruye con Tauri/Rust/TypeScript/SQLite;
- las nuevas features se evaluan por valor de producto, no por checklist de compatibilidad.

### AI Como Diferenciador Publico

AI debe aparecer como una parte importante de la ambicion del proyecto.

Mensaje clave:

> Copicu lets you search your clipboard like a history, organize it like a workspace, automate it like a tool, and command it like an assistant.

AI no debe comunicarse como "chat agregado al clipboard", sino como **AI command mode**:

- lenguaje natural para busqueda vaga;
- comandos que se convierten en operaciones locales;
- summaries Markdown de items seleccionados;
- temporary AI-generated scripts usando el mismo action runner;
- capabilities explicitas y limites de privacidad.

Privacidad:

- AI deshabilitada por defecto;
- simple AI search puede no enviar contenido de clips;
- summaries/transformaciones sobre items si envian contenido seleccionado al provider configurado;
- no enviar todo el historial por defecto;
- no dar acceso crudo a SQLite, filesystem, shell ni clipboard completo.

### AI Provider Config

No pedir al usuario nombres arbitrarios de variables en Settings.

Contrato publico:

```text
COPICU_AI_ENDPOINT=https://openrouter.ai/api/v1
COPICU_AI_MODEL=openai/gpt-4.1-mini
COPICU_AI_API_KEY=your_key_here
```

`.env.example` es el template publico. `.env` local no debe commitearse.

### License

Decision 2026-06-09: usar MIT para el primer corte publico.

Razon:

- licencia simple y ampliamente entendida;
- baja friccion para usuarios y contribuidores;
- encaja con una herramienta desktop/productividad early-stage.

### GitHub Visibility

El repo ya fue hecho publico y renombrado a `copicu`.

Riesgo actual: el worktree local contiene muchos archivos modificados/untracked, por lo que el codigo del proximo release puede no coincidir con el commit publico/tag hasta hacer un commit auditado.

Antes de publicar commits nuevos o releases estables:

- revisar secretos;
- revisar `.env`, logs, DBs, blobs, dumps, screenshots, fixtures y rutas privadas;
- confirmar `.gitignore`;
- agregar licencia y archivos OSS basicos;
- preparar una primera version o status alpha claro.

## Web Del Proyecto

Estado: no decidida.

Opciones:

1. GitHub repo como web inicial.
   - Menor friccion.
   - README publico cumple el rol de landing tecnica.
   - Recomendado para el primer corte.

2. GitHub Pages simple.
   - Puede usar una pagina estatica con screenshots, quickstart, scripts y AI command mode.
   - Bueno cuando existan screenshots/gifs y una release descargable.

3. Dominio propio futuro.
   - Pendiente.
   - Solo vale la pena cuando haya binario instalable, identidad visual y roadmap publico mas estable.

Decision actual:

- Usar el repo/README como web inicial.
- Preparar GitHub Pages despues de tener screenshots/gifs y release alpha.

## GitHub Metadata Recomendada

Repository description:

```text
Local-first clipboard workbench for search, scripts, and AI-assisted workflows.
```

Topics recomendados:

- `clipboard-manager`
- `clipboard`
- `tauri`
- `rust`
- `typescript`
- `sqlite`
- `windows`
- `productivity`
- `automation`
- `ai`
- `local-first`

Estado 2026-06-09: descripcion y topics aplicados al repo `jpsala/copicu`.

## Archivos Publicos Agregados

Agregados 2026-06-09:

- `CONTRIBUTING.md`.
- `SECURITY.md`.
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/ISSUE_TEMPLATE/feature_request.md`.
- `.github/ISSUE_TEMPLATE/script_idea.md`.
- `.github/pull_request_template.md`.
- `docs/assets/README.md`.
- `docs/assets/source-data/synthetic-clips.md`.

Pendiente:

- `CODE_OF_CONDUCT.md` si se decide formalizarlo.
- screenshots/gifs bajo `docs/assets/`.

## README Publico

Estado 2026-06-09: README raiz reescrito como entrada publica.

Contenido actual deseado:

- pitch corto;
- por que existe;
- relacion con CopyQ;
- que hace hoy;
- picker como producto;
- scripts/actions;
- AI command mode;
- AI provider config con `.env.example`;
- privacidad;
- roadmap;
- status;
- comandos dev;
- docs;
- contributing.

Mejoras futuras:

- agregar screenshots del picker;
- agregar gif/video de busqueda/paste;
- agregar gif o captura de AI command mode y Markdown output;
- mantener explicacion honesta de performance para historiales grandes: Copicu no renderiza todo el historial en React; usa SQLite paginado + `@tanstack/react-virtual`; no prometer "no consume memoria" ni "items infinitos" sin benchmark;
- agregar badges despues de CI/licencia/release;
- agregar quickstart para usuarios no-dev cuando haya instalador;
- agregar FAQ.

## Growth / Promocion

Plan vivo: `docs/active-work/013-open-source-growth.md`.

Direccion:

- primero convertir visitas al repo en instalaciones y reportes utiles;
- despues publicar en canales tecnicos con demos visuales;
- pedir feedback especifico sobre clipboard, paste, scripts y Windows edge cases;
- evitar promocion generica sin screenshots/gifs ni quickstart claro.

Canales recomendados:

- GitHub repo, releases y topics como landing inicial;
- Show HN cuando haya assets y mensaje claro;
- Reddit con framing especifico por comunidad, no post duplicado;
- Tauri/Rust/devtool communities con posts tecnicos;
- Product Hunt/GitHub Pages mas adelante, cuando el producto y assets esten mas pulidos.

Mensaje de performance recomendado:

> Copicu is designed for large clipboard histories: SQLite keeps the history local and queryable, while TanStack Virtual keeps the picker from rendering thousands of rows at once.

Evitar:

- "no consume memoria";
- "historial infinito";
- "millones de items sin diferencia";
- "CopyQ replacement" sin aclarar que es CopyQ-inspired, not CopyQ-compatible.

## Public Demo Assets

Decision 2026-06-09: usar demos reproducibles como parte del crecimiento open source.

Tipos:

- demos generadas/storyboard con Playwright + FFmpeg;
- grabaciones reales de la app con app data aislada y datos sinteticos;
- videos largos tipo YouTube para instalacion, first run y features por separado.

Primer output generado:

- `docs/assets/videos/copicu-synthetic-picker-demo.mp4`
- `docs/assets/gifs/copicu-synthetic-picker-demo.gif`
- `docs/assets/screenshots/copicu-synthetic-picker-demo-poster.png`

Reglas para cualquier demo publica:

- no usar contenido real del clipboard;
- no mostrar `.env`, DBs, blobs, logs privados ni rutas sensibles;
- usar fixtures sinteticos versionados o generados;
- marcar claramente cuando la demo sea sintetica;
- para demos reales, correr Copicu con `COPICU_APP_DATA_DIR` aislado;
- revisar frames/poster antes de linkear desde README o publicar.

### Agentic Development Context

Decision 2026-06-09: explicar en el README publico como usar el sistema de contexto agentico del repo.

Se publica como parte del repo:

- `AGENTS.md`;
- `docs/README.md`;
- `docs/WORKING_MEMORY.md`;
- `docs/PROJECT.md`;
- `docs/ASSISTANT_RULES.md`;
- `docs/DEVELOPMENT.md`;
- `docs/TOPICS.md`;
- `docs/topics/`;
- `docs/active-work/`;
- `specs/`.

No se publica:

- `.agents/`, porque es cache/local tooling y no contexto portable del proyecto;
- logs temporales;
- `.env`;
- bases locales o dumps de clipboard.

No existe `CLOG.md` en el repo actual. La funcion equivalente queda cubierta por `docs/WORKING_MEMORY.md` y `docs/active-work/`.

Beneficio publico:

- un contributor puede clonar el repo y pedirle a un agente que lea `AGENTS.md`;
- el agente hereda reglas de privacidad, stack, producto, decisiones y trabajos vivos;
- se reduce onboarding y se evita reconstruir contexto en cada sesion.

## Releases

### v0.1.0-alpha.1

Estado: publicado como prerelease el 2026-06-09.

Asset:

- `Copicu_0.1.0_x64-setup.exe`
- Tipo: instalador NSIS Windows x64, current-user install.
- SHA256: `931DE5582DD6912AA0332CF51E751FA5B55D88085114A502CF610A3D74095266`.
- URL: `https://github.com/jpsala/copicu/releases/tag/v0.1.0-alpha.1`.

Notas:

- primer alpha publico Windows;
- build dogfood/early-stage;
- Windows es la plataforma primaria testeada para este release;
- no presentarlo todavia como estable.

## Public-Ready Audit

Checklist antes de consolidar el repo publico:

- [x] `git status` revisado antes del publish inicial.
- [x] No hay `.env` trackeado en el publish inicial.
- [x] No hay SQLite local, clipboard dumps ni blobs privados trackeados en el publish inicial.
- [x] No hay logs sensibles trackeados en el publish inicial.
- [x] Secret scan basico hecho antes del publish inicial.
- [x] `.gitignore` cubre secretos, logs, data local, `.agents/` y build outputs.
- [x] README no promete soporte estable; release marcado alpha/prerelease.
- [x] LICENSE agregada.
- [x] CONTRIBUTING y SECURITY agregados o decision explicita de postergar.
- [x] GitHub description/topics definidos.
- [x] Primer release/status alpha decidido.

## Preguntas Abiertas

- Nombre de package/binary final para releases.
- GitHub Pages si/no para primer corte publico.
- Ubicacion final de screenshots/gifs.
- Si publicar primero sin release binaria o esperar installer Windows alpha.
- Politica de issues para CopyQ parity requests.
- Politica de scripts externos: ejemplos personales vs contribuciones oficiales.
- Politica de AI providers recomendados en docs publicas.

## Proximo Corte Recomendado

1. Crear screenshots/gifs publicos del picker, Settings AI y AI command mode con datos sinteticos.
2. Linkear el primer asset visual desde README.
3. Agregar badges al README despues de definir CI/release workflow.
4. Evaluar GitHub Pages cuando existan assets publicos.
5. Crear workflow de release Windows reproducible.
6. Mantener audit de secretos/datos privados antes de cada release.
