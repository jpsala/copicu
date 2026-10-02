---
title: Actions y Scripting API
summary: Contrato de acciones TS/JS locales, runner de confianza, host APIs y límites de datos y capabilities.
keywords:
  - actions
  - scripting
  - scripts
  - plugins
  - TypeScript actions
  - JavaScript actions
  - CopyQ commands
  - command context
---

# Actions And Scripting API

Referencias de entrada: [track de scripting](../tracks/004-actions-scripting.md), [modularización](../tracks/017-actions-modularization.md), [spec](../../specs/004-actions-scripting-api/spec.md), [ejemplos](../../scripts/examples/README.md), [tipos](../../scripts/examples/copicu-action.d.ts) y [referencia anterior](../reference/actions-and-scripting-api-archive-2026-06-25.md).

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
- `sharedClipboard.channels/target/state/history/publish/received` cuando el build y el perfil habilitan sharing;
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

### Publicación en canales compartidos

`copicu.sharedClipboard.channels()` exige `shared:read` y devuelve sólo ID y
nombre de canales publicables para los grants explícitos de esa acción.
`publish({ channelId, text })` exige `shared:publish` y
`shared:publish:<channelId>`; no admite wildcard. El host comprueba además que
el perfil/canal están habilitados, conserva claves y credenciales, cifra y
admite el texto en la cola durable limitada. El retorno
`{ publicationId, state: "queued" }` confirma admisión local, no entrega remota.
Cada llamada deliberada crea una publicación inmutable distinta; reintentos
del host conservan su identidad. Scripts pueden transformar/generar texto o
recorrer IDs seleccionados usando los permisos de lectura existentes.

`target()` consulta el destino configurado para esa Action y revalida su grant;
`publish({ text })` lo resuelve sin hardcodear un canal. `state()` devuelve observaciones
locales de pausas, recursos y cola limitadas a los scopes del script, sin claves ni bearer;
no consulta remoto ni certifica que otro equipo recibió o aplicó la publicación.
Ambas consultas requieren `shared:read`. `history({ channelId, cursor })` exige
además `shared:history:<channelId>`: una página de publicaciones cifradas,
autenticadas y descifradas, desde la más antigua disponible, con cursor decimal
opaco. No conecta, importa ni dispara efectos. Un transporte ocupado rechaza
la consulta inmediatamente; no bloquea esperando otros requests. Está prohibida
en Actions automáticas de recepción.

Las built-ins `builtin.sharedSendActive` y `builtin.sharedSendClipboard`
distinguen el clip activo de Copicu del clipboard actual de Windows. La primera
usa `currentItemId`; la segunda exige un fence de secuencia de la invocación y
rechaza entrada obsoleta. Ninguna usa el último clip del historial como proxy
del clipboard de Windows. Ambas usan el canal de envío configurado en sharing
y admiten hotkeys explícitos mediante el registro existente; no traen atajos
habilitados por defecto.

### Actions de recepción

Una suscripción puede asociar y habilitar explícitamente un script local que
declare `sharedReception`, entrada `none` y selección `none`, con el grant
`shared:receive:<channelId>`. El host entrega identidad/procedencia en
`ctx.sharedReception`; `copicu.sharedClipboard.received()` obtiene el texto
inmutable de esa publicación, sin leer un ítem mutable del historial. El
scheduler reclama cada ejecución de forma durable y conserva su resultado
por separado de guardar/copiar; fallar no implica rollback de efectos admitidos.
Cada llamada host revalida el binding, pausa y generación.

En este corte, un receptor puede usar UI/log y publicación sólo cuando el
binding autoriza un canal destino y el script declara tanto permisos normales
de publicación como `shared:forward:<originChannelId>:<targetChannelId>`.
No hay forwarding por defecto. Mutaciones y lecturas de historial/metadata,
lecturas del clipboard actual, copias de ítems, picker, paste y foco se rechazan
en recepciones para preservar procedencia y evitar ecos.

El forwarding actual permite un solo salto: el host asigna una identidad firmada
`forwarded_v1_*` y rechaza volver a reenviar esa publicación. Puede haber ramas
explícitas a varios destinos autorizados; no se promete routing de varios saltos.

Un receptor que declara `clipboard:write` puede producir una única salida
`copicu.clipboard.writeText(text)` por publicación, cuando su suscripción
habilita explícitamente `receiveActionWritesClipboard`. Este permiso es
independiente de la salida built-in `updateClipboard`; sólo una de ambas puede
ser el escritor automático del perfil. El host admite las operaciones buffered
después del resultado exitoso del runner y revalida procedencia, permiso,
generación, lease y secuencia anterior a la recepción; una nueva copia local,
pausa o vencimiento omite la escritura. Reclama el sink durable antes del
adapter nativo acotado y registra su resultado por separado del script.
Los hashes de salida conservan procedencia remota para evitar republicación
por reglas o watcher. Un script fallido no admite operaciones buffered; efectos
host anteriores, como forwarding, siguen registrados y no se revierten.

Contratos y evidencia local en [Shared Clipboard](shared-clipboard.md) y
[aceptación local](../../specs/016-shared-clipboard/local-acceptance.md). Los
ejemplos 034–036 cubren envío de seleccionados, inspección de recepción y salida
transformada de una recepción. Son ejemplos de desarrollo; el instalador sólo
distribuye la selección indicada en [Windows Installer](windows-installer.md#scripts-incluidos).

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
