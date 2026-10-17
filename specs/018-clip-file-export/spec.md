# Guardar clips como archivos

Estado: implementado en el candidato Windows **0.5.10**: selección explícita y
marcados globales, archivos sueltos/ZIP, apertura de destino y naming AI de texto.
Plan: [plan.md](plan.md). Continuidad: [track](../../docs/tracks/clip-file-export.md).
Publicación e instalación se acreditan en las [notas del corte](../../docs/releases/v0.5.10.md),
no por este estado de implementación.

## Contrato

Separar **origen → nombres → destino → empaquetado**. No modificar clips,
títulos, marcas, carpetas ni clipboard. Exportar archivos utilizables, no un backup
recuperable de SQLite/blobs ni una promesa de compatibilidad con CopyQ.

- Selección: capturar IDs y orden al invocar; vacío no se transforma en activo,
  filas visibles ni historial. El menú contextual puede pedir explícitamente el
  clip sobre el cual se abrió, o la selección completa si pertenece a ella.
- Marcados: cargar todas las páginas de `is:marked` desde el host, sin limitarse al
  filtro actual ni a filas virtualizadas. Habilitar la acción sólo al completar
  ese conjunto; congelar sus IDs al invocar.
- Leer cada ítem cuando le toca. Ediciones concurrentes usan la versión leída;
  borrados son fallos individuales. No prometer snapshot transaccional del lote.
- Host restringido al picker, sin acceso frontend directo a SQLite/blobs ni API
  pública nueva para scripts. Una operación efímera en memoria, no jobs durables.
- Límites explícitos: 1–10.000 IDs distintos, 32 MiB por ítem y 512 MiB por lote.
  Excederlos informa fallo, nunca trunca silenciosamente un alcance.

## Representación y nombres

- Texto con MIME ausente o `text/plain`: bytes UTF-8 `.txt`, sin BOM.
- Imagen: bytes reales del PNG normalizado en blob, validados por formato,
  dimensiones y tamaño antes del decoder. Extensión `.png`, no inferida del MIME.
- HTML/rich text/fileList y otros MIME se omiten con motivo. No reconstruir
  recursos embebidos, seguir URLs ni copiar archivos externos referenciados.
- Convencional: ordinal estable y título útil saneado, o tipo-ID. Host normaliza
  Unicode/NFC, acota longitud, neutraliza caracteres/separadores/ADS y nombres
  reservados de Windows, espacios/puntos finales y rutas relativas.
- Comparación case-insensitive antes de crear y semántica create-new/no-replace
  final, también bajo carreras. Colisiones reciben sufijo, nunca sobrescritura.
- Acciones de guardar viven en menús de selección, contexto y marcados; no hay un
  enlace suelto ni resumen permanente dentro del picker.

## Destino, apertura y diálogo

- `export.defaultFolder`: carpeta predeterminada opcional y persistente.
- Última carpeta exitosa es estado separado: editar Settings no la reemplaza.
- Siempre confirmar destino por selector nativo. Sugerencia: predeterminada →
  última → ubicación nativa. Elegir otra no modifica la predeterminada.
- Ruta sugerida inexistente/inaccesible se informa, sin fallback silencioso.
  Por ahora se recupera configurando una predeterminada válida en Settings.
- Cancelar el selector no crea sesión, archivos ni solicitudes AI; vuelve limpio
  al picker. Progreso, cancelación y resultado van en un diálogo transitorio.
  Close/X/Escape al terminar lo retiran y devuelven foco al buscador; durante el
  trabajo se usa Stop/Cancel, sin descartar un trabajo activo hacia el picker.
- `export.openDestinationAfterSave`: off por defecto. Abre sólo después de al
  menos un archivo guardado o un ZIP publicado; conserva parciales de sueltos.
  El botón manual **Open destination folder** vive sólo en el diálogo terminado.
- Última carpeta se recuerda sólo tras publicar un archivo o el ZIP final. Fallar
  al recordarla o abrir Explorer no deshace archivos: warning local explícito.

## Archivos sueltos y ZIP

Sueltos: guardar de a uno. Stop termina el archivo/solicitud actual y evita el
siguiente; conserva completados. Fallos de escritura limpian sólo su archivo
propio y avisan si esa limpieza falla. Sin rollback global.

ZIP: mismos bytes, extensiones y nombres, con Deflate. Temporal propio en destino;
finalizar, sincronizar y publicar sin reemplazo con `MoveFileW` en Windows.
Entradas planas, sin rutas absolutas ni `..` como componente. Nombre convencional
del paquete, independiente del modelo. No crear un ZIP vacío.

Progreso ZIP distingue **prepared** de **saved**: sólo la publicación final convierte
los preparados a guardados. Cancelar descarta todo el paquete; un fallo de escritura
impide publicar un ZIP corrupto. Omisiones/fallos individuales pueden producir un
paquete parcial válido, con resumen honesto. No anunciar confirmación de publicación
si se perdió su respuesta: indicar inspeccionar destino antes de reintentar.

Cleanup explícito y Drop limpian sólo temporales propios; nueva invocación del mismo
picker sustituye una sesión incompleta tras reload. Un kill duro puede dejar `.tmp`,
no un ZIP incompleto anunciado como final. No añadir recolector de archivos ajenos.

## Naming AI y modelos

- `export.aiNames` off por defecto; `export.namingModel` explícito e independiente
  del modelo general/asistente. Usar proveedor y credenciales existentes, sin
  duplicar secretos ni inferir disponibilidad/visión por un apodo como «Luna».
- AI general y export tienen selector por nombre y catálogo real bajo botón
  explícito. Usar el draft actual de proveedor/AI enabled al consultar, sin exigir
  Save/reabrir ni persistir esa habilitación por listar. Se puede configurar el
  modelo export antes de activar naming. Errores son accionables y reintentables.
  El catálogo reutiliza el runner Node existente; NSIS no instala ese runtime.
- Nada en captura, idle, abrir Settings o alternar un switch hace naming o consulta
  automáticamente modelos. Un catálogo lista metadata, no recibe clips.
- Tras destino confirmado, pedir permiso explícito por operación: proveedor/modelo,
  máximo de solicitudes y hasta 4.000 caracteres por texto. Negar usa nombres
  convencionales. Congelar configuración/modelo en la sesión host.
- Sólo texto en este corte. Imágenes conservan nombre convencional con aviso y no
  se envían: el catálogo actual no acredita capacidades visuales.
- Sin tools, shell, acciones, conversación ni lectura de otras filas/archivos/URLs.
  Texto no confiable va como datos. Solicitudes seriales, sin retries/redirecciones,
  4 s connect/12 s total, respuesta hasta 8 KiB y JSON basename estricto.
- Revisar todo el texto antes de truncar para detectar secretos/PII evidentes.
  No enviar secretos, credenciales ni datos personales; el detector conservador no
  garantiza reconocerlos todos y la confirmación lo advierte.
- Nombre vacío/estructuralmente inválido, ruta, timeout, rechazo o credenciales
  ausentes: fallback convencional por ítem y warning visible. Host impone extensión
  y sanea el basename final. No impedir guardar por un fallo de naming.
- Sin persistir prompts/payloads ni devolver errores crudos del proveedor a logs.
  Cancelar evita nuevas solicitudes; la actual termina bajo timeout. Builds sin
  transporte HTTP opcional conservan fallback convencional, no otro proveedor.

## Validación y pendientes

Checks con fixtures sintéticos: bytes texto/PNG, metadata/marcas intactas, selección
vacía, más de una página global de marcados, nombres/carreras/no-replace, rutas
inválidas, cancelación/cleanup y persistencia de Settings. ZIP leído por librería
independiente y extraído con .NET estándar de Windows, comparando bytes.

Mocks AI: desactivado/sin aprobación/sensible/imagen hacen cero requests; JSON,
inyección como datos, rutas, error/timeout y fallback conservan extensión. Request
HTTP sólo a mock localhost con clave sintética. UI cubre draft no guardado, catálogo
por nombre/reintento y diálogo sin residuos/foco restaurado, desktop y narrow.

JP ejercitó guardado en dev; aceptación de calidad con modelo/proveedor real y
naming visual siguen separadas. Carpeta interna, búsqueda completa, ZIP cifrado,
restauración de backup, documentos combinados y API pública Actions no se incluyen.
