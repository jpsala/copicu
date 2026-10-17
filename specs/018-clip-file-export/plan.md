# Plan incremental: exportación de clips

Estado: cortes 1–3 implementados en el candidato **0.5.10**, con naming AI de texto
(y fallback local para imágenes). Marcados globales del corte 4 incluidos; carpeta,
búsqueda completa y API de scripts pendientes. Contrato: [spec.md](spec.md).
Publicación/instalación: [notas del corte](../../docs/releases/v0.5.10.md).

## Arquitectura vigente

- `src-tauri/src/clip_export.rs`: materialización y escritura compartida/no-replace;
  asistente conserva sus aprobaciones y reutiliza la primitiva de escritura.
- `clip_export/batch.rs`: una sesión efímera del picker con IDs/config congelados,
  límites explícitos, siguiente ítem y commit/abort; sin jobs persistentes.
- `clip_export/naming.rs`: propuesta tool-free acotada, guard de datos, JSON estricto
  y fallback. Reutiliza resolución AI/catálogo existente, sin conversación.
- ZIP 4.6.1 ya estaba instalado transitivamente; JP autorizó dependencia directa
  con `deflate-flate2`, resolución offline y sin descargas. `MoveFileW` del Windows
  ya instalado permite publicación atómica sin reemplazo, no sólo hardlinks NTFS.
- Selector nativo Tauri existente. UI de progreso/resultado en diálogo transitorio;
  acciones en menús. Settings comparte selector de modelos para AI general/export
  y consulta sólo al pulsar Load, usando el draft sin guardarlo implícitamente.
- Marcados reutiliza consulta host `is:marked` paginada completa, no filas visibles.
  Frontend nunca lee SQLite/blobs directamente.

## Entregado

### Selección y destino

- [x] Carpeta opcional, última separada, defaults compatibles y tests de persistencia.
- [x] Selector siempre confirmado, sin fallback silencioso para rutas inválidas.
- [x] Texto plain/None MIME a UTF-8 TXT y PNG real validado desde blob.
- [x] Nombres ordinales seguros, colisiones/carreras sin sobrescritura.
- [x] Cancelación entre ítems, fallos individuales y limpieza propia honesta.
- [x] Setting de abrir destino tras éxito y botón sólo en diálogo terminado.
- [x] Progreso/resultados sin ensuciar picker; cierre y foco/selección preservados.

### ZIP

- [x] Compresión real sobre la misma representación/nombres, sin copia permanente
  previa de los archivos sueltos.
- [x] Temporal propio, finalize/sync/commit sin reemplazo, abort sin ZIP final.
- [x] Estado prepared no se anuncia saved antes de commit; parciales explícitos.
- [x] Tests bytes, formato/compresión, vacío, fallo, cancelación, carreras y cleanup.
- [x] Extracción con biblioteca estándar de Windows y comparación byte-a-byte.

### Nombres AI de texto

- [x] Opt-in, modelo independiente y catálogo real por acción explícita.
- [x] Draft de AI/proveedor sirve para elegir sin memorizar ID ni Save/reabrir.
- [x] Confirmación remota por export, payload/respuesta/cantidad/timeouts acotados,
  serial y sin retries/tools/acciones ni seguimiento de instrucciones del clip.
- [x] Guard conservador de secretos/PII, aviso de no exhaustividad, no payload logs.
- [x] Fallback convencional por ítem con warning; extensiones/paths sólo del host.
- [x] Imágenes no enviadas y fallback explícito hasta acreditar visión real.
- [x] Mocks y request HTTP sólo localhost; cero envíos en rutas desactivadas/negadas.
- [ ] Evaluar calidad y compatibilidad con proveedor/modelo real bajo autorización
  específica y datos sintéticos; no asumir que «Luna» es un ID ni que admite visión.

### Marcados y futuros alcances

- [x] Todos los marcados desde cualquier filtro, con paginación y prueba de 125
  ítems incluyendo los no cargados/virtualizados.
- [ ] Carpeta interna con política explícita de descendientes y búsqueda completa.
- [ ] API pública mínima con capacidades host, SDK, gateway, catálogos y tests de
  permisos; no habilitar filesystem genérico ni diálogos desde triggers automáticos.

## Validación y límites

Pruebas automatizadas/smoke local son evidencia proporcional, no aceptación de otra
PC, provider real o input nativo universal. Fixtures son sintéticos, no historial
privado ni clipboard real. Checklist del paquete/firma/latest/instalación pertenece
a [release Windows](../../docs/topics/windows-installer.md).

Pendientes operativos: recuperación directa si desaparece la carpeta recordada
(hoy informar error y configurar una predeterminada válida); cleanup tras kill duro
puede dejar temporal propio `.tmp`, sin publicación corrupta. Conservar sólo reglas,
repros/checks y recibos útiles, no narrativa de debugging ni transcripts.
