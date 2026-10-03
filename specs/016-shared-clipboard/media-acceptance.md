# Sharing de imágenes: aceptación

Origen: ampliación solicitada por JP el 2026-10-02, con transferencia de archivos
pospuesta expresamente. Contrato en [media-plan.md](media-plan.md). Implementación
local validada; `v0.5.4` stable/latest publicada e instalada. No atribuir estos
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

La normalización puede cambiar compresión y cantidad de bytes del PNG: comparar
pixeles/alpha y metadata del PNG normalizado. Preparar la recepción mediante
Connect y su frontera de head antes de publicar; activar una policy legacy no
convierte publicaciones previas a esa frontera en llegadas nuevas.

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
- Paquete exacto, relay, publicación y actualización local tienen recibos abajo.
  Aceptación física de imágenes sigue pendiente; actualizar la otra PC primero.
- Custodia de claves y eliminación de aprobación entre PCs esperan la decisión
  de JP. La admisión para cualquier cuenta está probada localmente; Google y el
  servicio siguen con la admisión inicial hasta activar ese cambio explícitamente.

## Servicio remoto de imágenes

A `2026-10-03T02:58:44.568Z`, relay desplegado en el VPS existente y container
healthy. Sólo cambió `relay.mjs`: SHA256
`3f5e292b9fa0c6048aee6290091d26986b2cfd6b7f48d9b757d7400092672ac1`.
El módulo dentro de la imagen confirma body 36 MiB y ciphertext 25 MiB + 16 KiB.
Imagen `sha256:1fa58b29d9ad41fe299b67f95a3f337f20e2b20b81e41c18649b669622a1d8e1`,
construida con Bun fijado ya presente, sin agregar dependencias ni tocar Traefik.

Backup SQLite consistente (`VACUUM INTO`, integrity ok) y copias de issuer/config
en `/opt/copicu-sharing/backups/20261003T025456Z`, fuera de Git y con permisos
privados. Configuración antes/después idéntica por digest; imagen anterior
retenida para rollback. Health/info por HTTPS verificado entregan ready/version 3,
endpoint fijo y el mismo issuer público. V1/V2 catálogo/changes/events sin auth
entregan 401. Esto verifica operación/límites, no entrega de imagen en dos PCs.
Google Testing, admisión inicial y custodia E2EE permanecen como en el despliegue.

## Paquete Windows v0.5.4

Release normal/latest construida desde fuente congelada
`1fbbf2215f6cebb87e4ab4ea35c450b4528e7ced`. Build normal TypeScript/Vite,
`cargo check --tests` y Rust release offline pasan. Los 317 inputs de código,
config y recursos mantienen SHA256 agregado
`102470291d35439af853ee8508fd242fd003b71fe01393c68308c52099dfee0b`
antes/después del build. `storage/search.rs` coincide con el blob Git de la fuente;
su indicador dirty era sólo metadata/EOL, sin incluir WIP ajeno.

| Artefacto | Bytes | SHA256 |
| --- | --- | --- |
| `Copicu_0.5.4_x64-setup.exe` | 14 441 967 | `16389E6BC891EF3CB35564515654901476B8052014BE2AD2BBE261FFCFC3C339` |
| `.exe.sig` | 416 | `EA0BAC3472031A5730927CB13294C98CA0937501327E2001B66A2A2EDF7ABBE0` |
| `latest.json` | 920 | `B0737AB9E2EAC66CBE888EE0C304B1EE48E547C19D8105AACA18BBE52769CFBE` |
| EXE extraído | 47 127 315 | `A428E54814FE4ABE9EE5EAC029B29586347CCD44FF047C87F9E6D64B64F80591` |

Firma updater ED y trusted comment verificadas criptográficamente con el pubkey
del producto. Manifest sin BOM, core/URL/tag correctos. Payload x64 GUI 0.5.4,
154 archivos extraídos; DLL, runners, scripts y TypeScript coinciden. Examples
nativos no forman parte del NSIS. Firma updater no equivale a Authenticode.
[CI de la fuente](https://github.com/jpsala/copicu/actions/runs/37091440975) SUCCESS.

Cinco casos del payload exacto pasan con dos perfiles sintéticos Windows: inicio
0.5.4/Settings y URL fija sin Google; enrollments técnicos con efectos apagados;
Action de clip activo cifra/envía PNG; recepción/importación conserva tipo,
pixeles/alpha, miniatura y procedencia; UI de historial/recepciones y guardado
repetido no duplican ni generan eco; reinicio reabre vault/blob/receipt durables.
Tres capturas inspeccionadas. Windows clipboard y Actions receptores apagados;
receipt deferred con historial applied, sin confundirlo con efecto automático live.
Procesos y relays propios cerrados. Los cinco casos no acreditan Google real ni
dos PCs físicas. El escritor Windows tiene la prueba nativa separada de arriba.

## Publicación e instalación

[v0.5.4 normal/latest](https://github.com/jpsala/copicu/releases/tag/v0.5.4) publicada
a `2026-10-03T03:18:02Z`; tag remoto y target coinciden con
`1fbbf2215f6cebb87e4ab4ea35c450b4528e7ced`. A
`2026-10-03T03:18:49.732Z`, endpoint real del updater entrega HTTP 200/version
0.5.4; manifest y los tres downloads remotos coinciden por bytes/SHA256 con la
tabla. Release estable, sin prerelease. No se reescribieron tags/assets anteriores.

El mismo NSIS se instaló a `2026-10-03T03:19:58.5216473Z`; EXE instalado idéntico
al payload, Product/FileVersion 0.5.4 y proceso vivo confirmados. Después se
retoma dev con el perfil habitual para la prueba de JP. Disponibilidad en updater
e instalación local no acreditan actualización ni entrega de imagen en la otra PC.
