---
id: actions-and-scripting-api
status: active
kind: decision-map
triggers:
  - actions
  - scripting
  - scripts
  - plugins
  - TypeScript actions
  - JavaScript actions
  - CopyQ commands
  - command context
primary_refs:
  - docs/tracks/004-actions-scripting.md
  - docs/tracks/017-actions-modularization.md
  - specs/004-actions-scripting-api/spec.md
  - scripts/examples/README.md
  - scripts/examples/copicu-action.d.ts
  - docs/reference/actions-and-scripting-api-archive-2026-06-25.md
---

# Actions And Scripting API

Router compacto para acciones scriptables. La version larga previa quedo archivada en `docs/reference/actions-and-scripting-api-archive-2026-06-25.md`.

## Direccion Vigente

- Copicu soporta acciones built-in y scripts locales TypeScript/JavaScript.
- Scripts viven como archivos del usuario; no se guarda codigo crudo en SQLite.
- La app descubre manifests, cachea definiciones/diagnosticos y ejecuta scripts por runner Node confiable.
- Scripts usan host APIs/capabilities; no SQL/shell/fs/network crudo por defecto.
- CopyQ es baseline de inspiracion, no contrato de compatibilidad total.

## Contrato De Accion

Manifest esperado, resumido:

- `id`, `title`, `description` estables;
- `triggers`: `itemMenu`, `commandPalette`, `localShortcut`, `globalShortcut`, `clipboardChange`, `devRun`;
- `input`: source/selection/kinds/mime/query;
- `capabilities`: permisos explicitos;
- `shortcut` opcional;
- `logging` opcional y redacted por defecto.

Referencia versionable de tipos: `scripts/examples/copicu-action.d.ts`.

## Contexto De Ejecucion

El contexto debe exponer solo lo necesario:

- trigger y shortcut;
- item activo/seleccionado cuando aplica;
- query/view del picker cuando aplica;
- APIs host bajo `copicu.*` con capability checks;
- logging redacted.

No pasar payloads grandes si no se pidieron. Para contenido completo usar APIs explicitas (`history.get(..., { content: true })`).

## APIs Host Vigentes

Familias utiles:

- `history.search`, `history.get`, metadata/tags;
- `clipboard.read/write` segun capability;
- `picker.filter`, `picker.activate`;
- `ui.toast`, `ui.alert`, `ui.confirm`, `ui.input`, `ui.markdownOutput`;
- `enrichment.read/run`;
- `log.*`.

Si se agrega una API, actualizar `scripts/examples/copicu-action.d.ts`, ejemplos, docs de usuario y tests de drift.

## Shortcuts

- Local shortcuts: solo cuando la ventana/picker tiene foco.
- Global shortcuts: registrados por backend y validados contra conflictos.
- Shortcuts de scripts deben ser explicitos en el manifest; evitar colisiones con picker/core.
- WhichKey y hotkeys compuestos viven principalmente en `docs/topics/hotkeys.md` y `docs/topics/compound-hotkeys-and-whichkey.md`.

## Clipboard Change Trigger

Usar con cuidado: corre en respuesta a capturas del clipboard.

Guardrails:

- Candidatos se filtran desde cache, no redescubrir carpeta por captura.
- Ejecutar solo scripts que declaran `clipboardChange`, input compatible y sin diagnostics error.
- Evitar trabajo pesado, prompts bloqueantes o lectura de contenido completo salvo necesidad.
- Considerar debounce/queue/backoff si aparecen varios cambios seguidos.
- Si un script falla repetidamente, la UX debe hacerlo visible y/o permitir deshabilitarlo.

## UI Feedback

- Preferir toasts para feedback breve.
- Usar `ui-host` para confirm/input/control auxiliar.
- Usar `markdown-output` para salidas largas o reportes.
- No acoplar scripts a ventanas internas no documentadas.

## Debug Y Diagnosticos

- Diagnosticos de discovery se cachean en SQLite para Settings/debug.
- Logs de scripts deben ser redacted y por archivo seguro.
- Errores de capability o manifest deben aparecer antes de ejecutar.
- Tests importantes: drift de capabilities, ejemplos unitarios y dogfood manual cuando toca UI/native.

## Estado / Proximos Pasos

- Track principal: `docs/tracks/004-actions-scripting.md`.
- Modularizacion en curso: `docs/tracks/017-actions-modularization.md`.
- Proximo corte recomendado: extraccion mecanica chica sin tocar semantica del runner Node.
- Si se retoma diseño grande, abrir `specs/004-actions-scripting-api/spec.md` y el archive largo solo bajo demanda.
