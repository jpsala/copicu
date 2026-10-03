# Sharing de imágenes: aceptación

Origen: ampliación solicitada por JP el 2026-10-02, con transferencia de archivos
pospuesta expresamente. Contrato en [media-plan.md](media-plan.md). Implementación
local validada; candidata `v0.5.4` stable/latest en preparación. No atribuir estos
resultados al paquete anterior `v0.5.3`.

## Evidencia local

| Comprobación | Resultado y alcance |
| --- | --- |
| `npm run rust:test` | 388 pasan, 1 benchmark omitido. Cifrado tipado, PNG/DIB acotados, storage, runtime, permisos, colas y regresiones. |
| Cuatro suites Bun de relay/control/OIDC/identity | 48 pasan, 480 assertions. Límites de sobres/páginas, cuotas, autenticación e identidad. |
| Visuales Sharing | 24 pasan en desktop y narrow. Imágenes en historial/receipts, selección/expiración y traslado explícito de recepción. |
| `npm run build` | TypeScript/Vite normal pasa después de visuales; bridge de fixtures fuera de `dist`. |
| Helper nativo Windows | Imagen sintética conserva colores y alpha al escribir/leer; provenance presente; deadlines y secuencias vencidas no mutan el clipboard. |

La integración Rust recorre crypto real, relay HTTP Bun y perfil receptor aislado
con una imagen sintética 800 × 600, mayor que el límite anterior de 1 MiB. Verifica
captura/publicación, recaptura sin duplicación, importación en carpeta, hash/blob,
preview, claim de efecto una sola vez, dedupe manual, ausencia de eco y pausa.
Los scripts de recepción continúan limitados a texto; una imagen nunca se entrega
como caption o texto vacío a esa Action.

El helper nativo es un example opt-in, fuera del instalador. Ejecutar mediante
Cargo con el manifest de common-controls disponible y sin Miniconda en PATH:

```powershell
$env:CARGO_TARGET_DIR = 'target-codex-test'
$env:RUSTFLAGS = '-C link-arg=C:/dev/copicu/src-tauri/target-codex-test/test-manifest/common-controls-v6.res'
cargo run --example shared-clipboard-product --features shared-clipboard-n1,shared-clipboard -- --native-image-roundtrip --allow-clipboard-mutation
```

Esto muta Windows sólo con sentinels e imagen sintéticos. Prueba un child nativo
real; no acredita el payload shipping ni envío entre PCs físicas.

## Alcance y pendientes

- JP reportó entrega manual de texto en una dirección entre sus PCs mediante
  **Send new text**. También confirmó el traslado de recepción desde All history
  a la carpeta. Son reportes de uso, separados de las fixtures sintéticas.
- Texto UTF-8 e imágenes PNG hasta 25 MiB y 4096 × 4096 px. Archivos quedan para
  después; HTML, RTF, OLE y formatos privados requieren captura/persistencia propia.
- Actualizar el servicio y ambas PCs antes de compartir imágenes: los clientes
  viejos pueden rechazar páginas grandes y demorar publicaciones posteriores.
- Paquete exacto, deploy del límite del relay, publicación y actualización local
  requieren recibos propios. Aceptación física de imágenes sigue pendiente.
- Custodia de claves y eliminación de aprobación entre PCs esperan la decisión
  de JP. La admisión para cualquier cuenta está probada localmente; Google y el
  servicio siguen con la admisión inicial hasta activar ese cambio explícitamente.
