# Aceptación de custodia del servicio

Estado al 2026-10-04. Contrato elegido por JP:
[service-key-custody.md](service-key-custody.md). El cliente latest al iniciar
el cierre era `v0.5.5`, con aprobación legada. Custodia está desplegada y el
cliente `v0.5.6` está publicado como stable/latest, con downloads, firma, CI
y updater verificados. La instalación y aceptación física siguen separadas.

## Base comprobada del cierre

- Latest `v0.5.5`, publicado el 2026-10-03 desde
  `e19babfa299298d28ce18248d7a5fabee8f37f65`, conserva **Check approval**.
- Al iniciar el cierre, `/v3/info` remoto publicaba `deviceApproval:true`, `recovery:true`, sin
  `keyCustody`. El issuer público previo al cambio es
  `w/OKRybsdLcYiEvCzezPHogyL/QeMfp4fW/PvNef2Zs=` y debe conservarse.
- JP reporta uso/autenticación entre Casa y Trabajo y aprobación pendiente en
  la notebook. No se inspeccionaron esas PCs ni se atribuye a este reporte un
  modo de claves, una versión concreta o nueva aceptación física de la custodia.

## Evidencia ejecutada

- Bun 1.3.14: 59 tests, 662 assertions, cero fallos, sobre relay, control,
  identidad y OIDC. Incluyen vector oficial RFC 9180 A.1.1, PCs iguales sin
  aprobación, nueva PC posterior, separación entre cuentas, paquetes alterados,
  clave inmutable, retiro, rotación, permiso read-only y floor histórico.
- El anuncio del destinatario de custodia tiene firma Ed25519 del issuer sobre
  entorno, identidad, claves públicas y suite; campos/firma alterados se rechazan
  y el destinatario permanece estable tras reinicio.
- Vault SQLite conserva ciphertext AES-256-GCM, nunca claves de contenido en
  claro. Backup consistente mediante el helper de operación y restore aislado
  releen las claves copiadas y conservan acceso. El backup valida entorno,
  issuer y secreto de custodia contra los marcadores de la DB; valores distintos
  y configuración legada sobre un vault existente fallan cerrados. El backup
  previo al vault sigue siendo válido.
- Intents firmados cifrados: fallo antes de commit, respuesta perdida y retry
  conservan el recurso y su clave, sin duplicar grants ni reemplazar epochs.
- El mismo subject/email en distintos issuers permanece separado. Paquetes
  firmados con scope, destinatario o ciphertext alterados revierten la operación.
  La migración activa sólo solicitudes pendientes vigentes; no revive las
  expiradas, canceladas o retiradas y conserva paquetes legados y epochs faltantes.
- Los paquetes legados ya instalados se conservan byte a byte durante depósito,
  consulta y reinicio; una notebook nueva recibe un paquete AES del servicio y
  abre la misma clave depositada. Esto no acredita clientes antiguos para
  recursos o epochs nuevos.
- TypeScript `tsc --noEmit` y build visual pasan. Playwright del candidato:
  32 casos pasan, incluidos ocho de identidad/custodia, desktop 900×620 y narrow
  420×620. Cubren inicio de sesión, retiro consentido/idempotente, custodia
  explícita y draft de conexión conservado. No hay botones de approve/recovery.
- Checks documentales: 15 tests pasan, cero errores; dos avisos preexistentes
  de longitud. Fixtures usan cuentas/bases/clips sintéticos, sin datos del perfil
  Home ni del clipboard Windows del usuario.

Comando de regresión Bun:
`bun test tests/shared-clipboard-relay.test.mjs tests/shared-clipboard-control.test.mjs tests/shared-clipboard-identity.test.mjs tests/shared-clipboard-oidc.test.mjs`.
Esta evidencia usa HTTP/Bun/SQLite/OIDC sintéticos y criptografía real local;
no acredita Windows UI, VPS ni PCs físicas.

La suite visual se ejecutó en
`C:/Users/jpsal/.codex/worktrees/release-sharing-custody/copicu`, con
`COPICU_VISUAL_PORT=1437` y
`npx --no-install playwright test --grep 'shared (identity|product|clipboard)' --workers=2`.
Recibo: `.codex-run/custody-visual-candidate.log` del checkout primario; capturas
`shared-identity-linked-*.png` y `shared-identity-custody-*.png` en `.codex-run`
del candidato. El bridge visual no se distribuye: regenerar frontend normal
antes del paquete Windows.

### Host y migración

La suite Rust del candidato `v0.5.6` pasa en target GNU aislado, offline y locked:
392 tests, cero fallos, un benchmark omitido. Incluye:

- `managed_account_links_equal_pcs_and_delivers_text_image_rotation_and_restart`:
  PCs de la misma cuenta, texto/PNG, rotación con reconciliación del head vigente
  y reinicio.
- `managed_custody_migrates_legacy_keys_without_reconnecting_or_changing_effects`:
  perfil legado ya conectado; migración preserva política, conexión y receipts,
  sin backfill.
- Firma del anuncio de custodia, campos/scope alterados y replay; el host
  rechaza el destinatario no autenticado antes de depositar claves.
- Lecturas DPAPI simultáneas: el caso determinista de lectores solapados y las
  regresiones de custodia conservan lectura concurrente sin permitir escritura
  ni eliminación durante la lectura. Recibo específico:
  `.codex-run/custody-rust-dpapi.log`.

Comando: `cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib`,
con `CARGO_TARGET_DIR=C:/dev/copicu/src-tauri/target-codex-test`, PATH sin Miniconda
y `RUSTFLAGS=-C link-arg=C:/dev/copicu/src-tauri/target-codex-test/test-manifest/common-controls-v6.res`.
Recibo: `.codex-run/custody-rust-candidate.log` del checkout primario. La fuente
candidata excluye el WIP de ventanas/búsqueda e incluye el anuncio firmado y
la preservación de paquetes legados. Los casos específicos están incluidos en
los 392; no se suman ejecuciones anteriores ni las del checkout primario.
No sustituye el recorrido UI/host Windows ni verifica por sí sola el NSIS.

### UI y host Windows

Cinco casos pasan con el binario debug del candidato, renderer normal y tres
perfiles sintéticos nuevos:

1. UI montada y navegador del sistema con OIDC loopback RSA/PKCE; las PCs de la
   misma cuenta quedan activas sin aprobación.
2. Paquetes HPKE del servicio entregan claves; conexiones y efectos locales
   permanecen apagados hasta una intención explícita.
3. Conexiones creadas desde UI entregan texto Unicode en ambos sentidos una sola
   vez, con Windows y Actions deshabilitados.
4. Reiniciar el servicio conserva identidad, claves y conexión explícita.
5. La tercera PC recibe claves sin contactar sus pares; retirar ese equipo
   detiene sólo su acceso y conserva las copias descargadas.

Recibo del candidato: `.codex-run/shared-identity-zt3bxP/identity-ui-results.json`,
comprobado a `2026-10-04T02:46:59.118Z` (3 de octubre, 23:46 ART).
SHA-256 del **EXE debug probado**:
`7370d72d7ac78dc424c61bcb0e5e0dee7f68230f1ad9675a4b1c5a47d1ffaa6e`.
Comando desde el candidato:
`node tests/manual/shared-identity-acceptance.mjs .codex-run/shared-product-custody-source-SzpVAo src-tauri/target/debug/copicu.exe`.
Log primario: `.codex-run/custody-host-candidate.log`. Capturas
`native-linked.png` y `native-service-custody.png` inspeccionadas; procesos
propios cerrados y puertos 9451–9453 liberados al terminar.
Esto acredita UI montada, DPAPI/HPKE real y proveedor sintético, no Google humano,
servicio productivo, dos PCs físicas ni el payload de release.

### Backup remoto previo a custodia

El helper corregido produjo un backup consistente en el VPS y se comprobó su
restauración aislada con el entrypoint real del servicio versión 1: `/health`
devolvió 200 y el issuer original se conservó. El restore no publicó puertos ni
expuso contenido privado. Backup privado:
`/opt/copicu-sharing/backups/preflight-v0.5.6-20261004T023139Z`.
Reproducción local: `.codex-run/release-v0.5.6/backup-preflight.sh`.

Esta prueba acredita el rollback previo a activar custodia; no es un deploy ni
una restauración de un vault productivo. La imagen candidata se construyó
offline usando la base fijada ya presente. Dockerfile y contexto incluyen el
helper en `/app/deploy/backup.mjs`.

Se creó una sola vez el secreto durable remoto, fuera de Git y con modo 0600.
La configuración versión 2 se probó con el entrypoint real sobre una copia
aislada de DB/privados: `/health` 200, issuer original y capacidades
`keyCustody:service`, `deviceApproval:false`, `recovery:false`.
Reproducción: `.codex-run/release-v0.5.6/restore-custody-preflight.sh`.
Esta prueba aislada no modificó producción; la activación efectiva se registra
por separado a continuación.

### Servicio de custodia desplegado

Comprobado a `2026-10-04T02:51:04.390Z` (3 de octubre, 23:51 ART): HTTPS y
`/health` 200, issuer original conservado, `keyCustody:service`,
`deviceApproval:false`, `recovery:false`. Sin bearer, `/v1/channels`,
`/v2/catalog`, `/v2/changes` y `/v2/events` devuelven 401.

Los siete módulos y el helper de backup desplegados coinciden byte a byte con
la fuente candidata. Imagen:
`sha256:f4081f07707e5d0d3ccebe037030d71f34454394c41d225e219a0a34b8c674df`.
Backup previo: `/opt/copicu-sharing/backups/pre-v0.5.6-20261004T025006Z`.
Backup posterior: `/opt/copicu-sharing/backups/post-v0.5.6-20261004T025231Z`;
incluye el secreto y su restore aislado con el servicio real conserva coherencia
de issuer y custodia. Recibos del checkout primario:
`.codex-run/release-v0.5.6/service-receipt.json`, `deploy.log` y `backup-post.log`.

Se conserva la admisión OIDC existente y Google Audience no cambió. El servicio
está listo para una nueva PC de la cuenta ya admitida; no se acredita apertura
general ni instalación o intercambio en la notebook.

### Payload Windows v0.5.6

NSIS final de 14.470.379 bytes, SHA256
`C6BFB4F69A87AE7A02BDCD67F0905DC3012D146AFEB60BF9A109C34A626DEB32`.
Firma updater y trusted comment verificados contra la clave pública del proyecto;
manifest `0.5.6`, URL y firma coinciden. `latest.json` tiene 813 bytes, SHA256
`DB16AC0EF1298A52C367D1713DD30567BF3DBCCBFAE77262A5F3821B3C4D6F72`.
Los 256 inputs de código/config permanecen iguales durante packaging; digest
`94c42035d98a284bfe3c557f20899b79b4ceccceb91247f5f7bbb40c456cb92d`.

Payload x64 GUI, 154 archivos, recursos/DLL/helpers/TypeScript coincidentes y
sin ejecutables adicionales. EXE SHA256
`EA6024379FF7B82C57DC3164187E170E5B769141DAD0F46B99F3588245FD22C0`.
Cinco casos del mismo payload pasan: arranque sin bridge visual, marcar/desmarcar,
menú secundario/Escape, persistencia tras reload y Sharing con Google/custodia,
sin controles de aprobación ni conexiones implícitas. Captura/updater/AI apagados
en perfil sintético. Screenshot final de Sharing inspeccionado.
Recibos del candidato: `.codex-run/release-v0.5.6/artifact-manifest.json` y
`native-final-smoke/results.json`; log primario `payload-smoke.log` en el mismo
directorio de release. La instalación sobre la app de uso diario no se ejecutó.

### Publicación normal v0.5.6

Publicado a `2026-10-04T03:08:28Z` desde source/tag inmutable
`01c0f2e229053d96afc3ab619b3d27080d368eea`. Los 256 inputs compilados coinciden
con los blobs del commit. [Release](https://github.com/jpsala/copicu/releases/tag/v0.5.6)
normal/latest, sin prerelease, con exactamente NSIS, firma y `latest.json`.
[Agentic Validation 37173130705](https://github.com/jpsala/copicu/actions/runs/37173130705)
SUCCESS para esa fuente.

Los tres assets descargados coinciden por bytes y SHA256 con el artefacto
verificado. El endpoint real `releases/latest/download/latest.json` devolvió
HTTP 200, versión `0.5.6`, URL del instalador y firma correctas a
`2026-10-04T03:09:17.674Z`. Recibo local:
`.codex-run/release-v0.5.6/remote-receipt.json`.
Actualizar y abrir primero una PC existente para depositar claves legadas;
después actualizar y vincular la notebook con la misma cuenta. Actualizar todas
antes de crear recursos o rotar claves. No acredita instalación ni tráfico físico.

### Compilación y arranque dev (2026-10-03)

JP autorizó en esta sesión descargar las dependencias para recompilar y arrancar
dev. Se ejecutó `cargo fetch --locked --target x86_64-pc-windows-msvc` desde `src-tauri`.
Se descargaron `aes 0.9.3`, `aes-gcm 0.11.1`, `cpubits 0.1.1`, `ctr 0.10.1`,
`ghash 0.6.0` y `polyval 0.7.3`; `Cargo.lock` incorpora esas dependencias de HPKE.

`npm run dev:restart` recompiló el frontend normal y el binario debug con
`shared-clipboard`; Cargo terminó y la app arrancó con ventana principal oculta,
proceso vivo y `Responding=True`. Perfil habitual `.codex-run/dev-isolated`,
hotkey `Ctrl+Shift+.` y remote debugging deshabilitado. Recibo local:
`.codex-run/dev-restart/logs/restart-20261003-163502.log`; logs de compilación
`owner-20261003-163502.{out,err}.log` en el mismo directorio.

JP confirmó «anduvo» tras ese arranque. La evidencia acredita compilación y
arranque dev, sin sustituir la validación de migración, custodia o intercambio.

## Pendiente, sin atribuir aceptación

Los tests de host, migración y envío de texto/PNG, las regresiones, UI/host
Windows, payload final, deploy de custodia, publicación latest y updater pasan.
La instalación y prueba física siguen pendientes. Este corte conserva la admisión OIDC y Google existentes;
no abre Audience ni admite cualquier cuenta. La cuenta Google ya admitida de JP
puede vincular la notebook sin esa apertura. La admisión general queda fuera
de este corte y conserva su gate separado.
Dev ya fue recompilada y arrancada en su perfil habitual.
No hay evidencia nueva en dos PCs físicas. Los cambios GPUI ajenos al corte se
conservaron.
