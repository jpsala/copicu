# Sharing de contenido: texto e imágenes

Estado: validado y distribuido en v0.5.4; relay actualizado. Aceptación física de
imágenes pendiente. Origen: pedido de JP del 2026-10-02 para compartir
imágenes y los contenidos del portapapeles. JP confirmó dejar transferencia de
archivos para después. Este corte abarca los tipos que Copicu captura y conserva
hoy: texto UTF-8 e imágenes normalizadas a PNG. HTML, RTF, objetos OLE y formatos
privados de aplicaciones requieren captura y persistencia propias; no se promete
su fidelidad mediante una conversión a texto.

## Contrato

- Enviar un ítem activo, una captura nueva conectada a una carpeta o el contenido
  actual de Windows conserva su tipo. Una imagen se recibe y guarda como imagen,
  tiene miniatura y se puede copiar manualmente o escribir automáticamente en
  Windows bajo las mismas reglas `liveOnly` que el texto.
- Conectar no envía existentes. Imágenes remotas e importadas conservan procedencia
  y no disparan republicación automática. Dedupe conserva metadata y ubicación de
  un ítem existente. Pausas, revocaciones, generaciones y secuencia local siguen
  siendo barreras antes de cualquier efecto.
- La representación tipada va dentro del cifrado autenticado. Texto conserva
  `TXT1`; imagen usa `IMG1` con longitud y bytes PNG. Firma, AAD, claves, ámbito,
  anti-replay y leases mantienen el contrato existente. Este cambio no decide la
  custodia de claves pendiente en `identity-service-plan.md`.
- Máximo: texto 1 MiB; imagen PNG 25 MiB y 4096 × 4096 px, coherente con captura
  local. Validar firma y autenticación antes de decodificar; validar cabecera,
  dimensiones y tamaño antes de asignar pixeles. Rechazar entradas corruptas,
  formatos desconocidos y tamaños excedidos sin escribir Windows.
- Relay conserva sólo sobres cifrados. Ampliar límites acotados de transporte,
  páginas, persistencia y IPC para una publicación admitida; conservar cuotas
  acumuladas, autenticación y errores visibles. No registrar contenido real.
- Actualizar el servicio y ambas PCs antes de enviar imágenes. El wire conserva
  versión 1 y `TXT1`, pero los límites anteriores no admiten páginas con imágenes
  grandes: un cliente viejo puede rechazar la página completa y demorar los textos
  posteriores hasta actualizarse o expirar esa publicación. Una imagen dentro de
  los límites viejos queda indisponible por tipo desconocido; no se convierte a
  texto ni autoriza efectos. No omitir sobres para fabricar continuidad de cursores.
- Snapshot y escritura nativos permanecen en el proceso aislado y acotado. La
  imagen se publica como PNG y se escribe con representación Windows compatible,
  sin rutas del equipo emisor ni archivos descargados en ubicaciones arbitrarias.
- Outbox pendiente limitada a 64 MiB; payloads de receipts limitados a 128 MiB por
  suscripción. Publicación, sync e historial admiten hasta 45 segundos de transporte;
  un lease vencido durante la transferencia sigue excluido de efectos automáticos.
- Windows recibe PNG y `CF_DIBV5` juntos, con BGRA de 32 bits, orientación top-down
  y alpha. Se validan dimensiones antes de decodificar también al leer DIB local.
  Referencia: [BITMAPV5HEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header).

## Comprobación

Usar imágenes sintéticas: round-trip cifrado; tamaños y PNG malicioso; importación
con miniatura y dedupe; procedencia sin bucles; carpeta emisora/receptora; manual
copy y snapshot nativo con fence; recuperación y lease vencido sin escritura;
relay con imagen mayor que el antiguo límite y cuota acumulada. Revisar UI con
fixture sintético. La aceptación física entre PCs se registra separadamente de
las pruebas locales y requiere ambos clientes actualizados.

Resultados y límites actuales en [media-acceptance.md](media-acceptance.md).
