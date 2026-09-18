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
- El contrato público usa host APIs/capabilities. Los checks protegen esas APIs; el runner Node ejecuta código local de confianza y no es un sandbox que impida fs/network/shell.
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

`run()` puede devolver `ActionVerification`: checks booleanos calculados,
conteos enteros e IDs; nunca contenido del historial. El gateway valida el
esquema y rechaza campos extra, strings arbitrarios y checks falsos. El SDK
define los límites. `void` mantiene ejecución sin verificación (`verification: null`).
Tras escribir, los checks deben usar una nueva lectura local de `history.get`
y comprobar conservación y formato pedidos, no sólo igualdad con el string
generado. Son evidencia declarada por el script, no una certificación independiente.
Un reporte inválido o check falso falla la acción y detiene el turno del
asistente antes de otra tool/request; no revierte efectos ya realizados.
En diagnósticos, afirmar que la inspección se ejecutó y describir datos
inválidos con conteos, sin exigir que la entrada ya cumpla el formato final.

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

- `history.search`, `history.get`, `history.neighbor`, `history.create`, metadata/tags;
- `clipboard.read/write` segun capability;
- `picker.filter`, `picker.activate`;
- `ui.toast`, `ui.alert`, `ui.confirm`, `ui.input`, `ui.markdownOutput`;
- `enrichment.read/run`;
- `log.*`.

`history.create({ text, title?, notes?, tags?, mimePrimary? })` exige
`history:create` y devuelve `{ id, created }`; no escribe al clipboard.
`history.update(id, patch)` aplica contenido/metadata atómicamente: campos
omitidos conservan su valor, `title`/`notes: null` limpian esos campos y tags
omitidos no se reconstruyen desde una lectura obsoleta.

Si se agrega una API, actualizar `scripts/examples/copicu-action.d.ts`, el
gateway y sus capability checks, catálogos consumidores, docs y pruebas
observables de permisos/comportamiento. No pinnear listas de source como tests.

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
- Guardar un script desde el asistente no puede habilitar este trigger de manera
  implícita: requiere `activateClipboardChange: true` en la operación aprobada.
  El manifest se descubre estáticamente antes de crear el archivo.

## UI Feedback

- Preferir toasts para feedback breve.
- Usar `ui-host` para confirm/input/control auxiliar.
- Usar `markdown-output` para salidas largas o reportes.
- No acoplar scripts a ventanas internas no documentadas.

## Debug Y Diagnosticos

- Diagnosticos de discovery se cachean en SQLite para Settings/debug.
- Logs de scripts deben ser redacted y por archivo seguro.
- Errores de capability o manifest deben aparecer antes de ejecutar.
- Tests importantes: límites reales de capabilities, contratos del runner, ejemplos unitarios y dogfood manual cuando toca UI/native.

## Estado / Proximos Pasos

- Track principal: `docs/tracks/004-actions-scripting.md`.
- Modularizacion en curso: `docs/tracks/017-actions-modularization.md`.
- Proximo corte recomendado: extraccion mecanica chica sin tocar semantica del runner Node.
- Si se retoma diseño grande, abrir `specs/004-actions-scripting-api/spec.md` y el archive largo solo bajo demanda.
