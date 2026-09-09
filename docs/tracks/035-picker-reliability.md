---
id: picker-reliability
status: complete
updated: 2026-09-09
---

# Picker Reliability

## Estado Y Gate

Correcciones autorizadas e implementadas; verificadas en regresiones sinteticas
y dev aislado. No hay una causa unica probada del hang ni reproduccion del
paste historico al destino equivocado. Este track no reabre Architecture Hardening.

Gate funcional de retencion resuelto por JP e implementado: ultimas 3 capturas
por clip, no 3 procedencias ni limite por edad. El corte autorizado esta cerrado.
Reparar thumbnails/datos instalados e instalar esta version requieren alcance
y autorizacion propios. RPC no forma parte del corte.

## Contratos Implementados

- Edicion full/inline usa `update_history_item_text`: SQL parcial conserva metadata,
  relaciones, provenance y suppression incluso con cache discrepante y cambios
  concurrentes. Enrichment revalida el hash dentro de su transaccion.
- Creacion/dedupe, tags/config y enrichment son transaccionales. Relaciones
  normalizadas son autoridad; el cache se deriva de ellas. Las notas no asignan
  tags al guardar contenido; el editor de metadata escapa sintaxis literal.
- Tags preservan `/` y Unicode, con case-fold ASCII solamente. Match exacto o
  descendiente, incluso en fallback legacy; no se migra ni normaliza Unicode.
- Keyset transmite Inbox, timestamp Inbox nullable, recencia e ID como tupla
  completa. No depende de volver a leer la fila del cursor.
- Refresh renueva todos los IDs retenidos en lotes de hasta 100 previews sin
  reordenar la ventana ni perder el ancla; invalida contenido expandido cambiado.
- SQL/decode/activacion del picker corren en `spawn_blocking`; mostrar/focalizar
  el picker no duerme esperando eventos de su propio hilo UI.
- Captura no coalesce contenidos distintos por tiempo; UTF-16/marker se acotan
  al HGLOBAL. Postprocesamiento FIFO acotado no bloquea la siguiente captura;
  saturation omite postprocesamiento, no el item ya persistido.
- Self-write mantiene multiples hashes pendientes con expiracion independiente.
  Paste fija HWND/PID/TID antes de copy/hide; excluye el PID propio y revalida
  identidad/visibilidad/foreground despues del delay y antes de SendInput.
- Feed y preview permiten solo imagen raster data-URL local; CSP bloquea red de
  recursos de clips. Listeners tardios se liberan tras cleanup. UiHost rechaza
  solapamientos/replays y conserva input/respuesta si falla el cierre.
- Blobs usan temp completo + sync + rename; rollback limpia archivos nuevos sin
  referencias. Recaptura restaura thumbnails ausentes. Borrado SQL usa cascada FK
  atomica. Filas accesibles conservan controles anidados y navegacion por teclado.
- Texto, imagen y creacion manual/dedupe insertan el evento, conservan los 3 mas
  recientes por `captured_at_unix_ms DESC, id DESC` y reconstruyen contexto
  buscable dentro de la misma transaccion. Find invalida snapshots al podar.
  La primera recaptura de un clip historico reduce todo su historial de eventos
  a ese limite; clips no tocados no se podan. Metadata/provenance y referencias
  ajenas al historial de captura permanecen intactas.

## Verificacion Reusable

- `npm run build` y build nativo Tauri GNU del dev aislado.
- `npm run rust:test`: 223 pasan, 1 ignorado. Incluye drift/concurrencia,
  dedupe/tags, keyset mixto con NULL, preview acotado, fault injection FS/SQL,
  captura/suppression, enrichment stale y UiHost.
- `bun test tests/metadata-text.test.ts`: 6 pasan; Node search/snapshot: 20 pasan.
- Playwright focalizado: edicion full/inline concurrente, refresh mas alla de
  pagina 1/ancla, privacy feed/full, teclado y UiHost en 900x620 y 420x620.
  Todos los casos pasan; un fallo de descarga local `ERR_NO_BUFFER_SPACE`
  requirio repetir el caso de teclado, que paso en ambos tamanos.
- Oracle nativo con datos sinteticos, watcher deshabilitado y app data nueva:
  app externa -> hotkey global -> type global escribio token en search sin
  targetear Copicu. `Shift+Enter` pego el token exacto en un TextBox externo.
  Reabrir picker durante el delay aborto con `paste target is no longer
  foreground`, sin modificar el TextBox.
- Edicion nativa con F2 conservo tag jerarquico/notas. Feed y preview Markdown
  completo mostraron imagen bloqueada; servidor loopback controlado registro
  cero solicitudes. MIME Markdown se preparo solo en la base sintetica.
- Retencion: regresiones de storage cubren timestamps iguales y fuera de orden,
  procedencias repetidas/distintas, plain/regex/ctx/filtros por eventos,
  invalidacion de Find, metadata/provenance/suppression, rollback antes/despues
  de reconstruir contexto, manual/dedupe e imagenes con blobs intactos.
- Smoke ejecutable contra SQLite temporal: cinco capturas, empates, busquedas
  antiguas ausentes/recientes presentes, tags, rollback manual y reapertura.
  Base sintetica y fuente temporal del smoke retiradas. Build frontend y
  reinicio built-dev aislado con watcher deshabilitado verificados.

## Limites De Interpretacion

- `meta:`/`has:metadata` abarcan titulo, notas y tags por contrato; agregar
  properties es una decision de producto, no un bug confirmado.
- Los probes nativos verificaron foreign keys activas, busy timeout configurado
  y borrado sin eventos huerfanos: no aplicar un parche generico de PRAGMAs.
- No adoptar FTS5, migrar datos ni atribuir hangs a una ruta solo por inspeccion.
- No hay poda retroactiva global: solo la futura recaptura aplica el limite de
  eventos al clip tocado. No se repararon datos instalados ni se creo instalador.
- Keyset garantiza recorrido de dataset estable, no snapshot frente a cambios
  concurrentes del orden. Un self-write y copia externa del mismo hash pueden
  ser indistinguibles dentro de la ventana de suppression.
- Un crash puede dejar archivos sin referencias; FS y SQLite no constituyen una
  transaccion distribuida. Win32 tampoco hace atomicos el guard final y SendInput.
- Lectura/conversion/persistencia siguen sincronicas dentro del watcher; el
  corte desacopla enrichment/scripts y no promete latencia universal.
- Los informes HTML/JSON y logs locales son evidencia auxiliar, no dependencias
  de este track ni material para versionar. No conservar contenido de usuario.

## Fuentes Canonicas

- [Integridad de tags](../topics/tag-management-hotkeys.md#integridad-de-edicion).
- [Consultas y keyset](../topics/filtering-and-query-syntax.md).
- [Captura](../topics/clipboard.md).
- [Foco y paste](../topics/windows-focus-and-paste.md).
- [Rendimiento y medicion](../topics/performance-and-memory.md).
- [Oracle del picker](../topics/picker-interaction.md).
