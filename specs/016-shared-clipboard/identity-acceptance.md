# Primer acceso: aceptación local

Origen: continuación de JP del 2026-10-02 para hacer Sharing usable entre sus PCs.
Implementación en `main`, base `788d2e3e452effd474e17f7b893d263c92aef30b`,
distribuida en el corte `v0.5.3`. No forma parte de los assets de `0.5.2`.
Contrato y gates en [identity-service-plan.md](identity-service-plan.md).

## Resultado y alcance

El servicio y el cliente tienen primer acceso OIDC, aprobación por huella,
transferencia HPKE y recuperación E2EE. Settings pide servicio/nombre, abre el
navegador del sistema y muestra la solicitud de la segunda PC; el bundle queda
en un control avanzado para fixtures. Crear/conectar y Windows/Actions conservan
intenciones separadas. Tres perfiles nuevos recorren la UI del host Windows.

| Evidencia | Resultado | Alcance |
| --- | --- | --- |
| Rust completo | 382 pasan, 1 benchmark omitido | Storage, runtime, crypto, host e integración de identidad |
| Servicio Bun | 50 pasan, 481 assertions | OIDC, V1/V2/SSE, identidad, transacciones, límites y restart |
| Visuales Sharing | 26 pasan | 13 escenarios en desktop y narrow; 4 escenarios nuevos de identidad |
| Host Windows y UI montada | 5 casos pasan | Tres perfiles sintéticos, navegador del sistema y HTTP/SQLite/DPAPI reales |
| Build | TypeScript/Vite y binario Windows offline pasan | Frontend normal después del harness visual |
| Documentación | Check sin errores; 15 tests pasan | No certifica aceptación remota ni permisos |

El proveedor local firma tokens RSA reales y verifica PKCE/nonce. No es un login
con Google ni acredita cuentas humanas. Perfiles, scripts y DB son sintéticos;
captura, startup, updater, AI y efectos de Windows/Actions están apagados.
Los cinco casos nativos no se suman a las repeticiones ni a resultados históricos.

## Casos comprobados

- Primera identidad con espacio vacío; otras dos quedan pendientes, sin acceso
  al catálogo/publicaciones. El comando de identidad se rechaza desde Main y se
  permite en Settings; el renderer no recibe bearer, private keys ni key packages.
- Comparación de la misma huella completa en ambos equipos y aprobación explícita
  en la UI. HPKE abre nombres/claves reales, sin crear conexiones ni importar
  historial ni habilitar efectos. Una revisión de cuenta vieja exige refrescar
  y volver a comparar antes de aprobar.
- Creación y conexiones explícitas desde el selector. Texto Unicode en ambas
  direcciones llega una vez. La suite del host añade pausa/resume `liveOnly`,
  creación desde el segundo equipo, retiro y revinculación del mismo perfil,
  conservando receipts/texto local sin reactivar conexiones.
- Corte/reinicio del servicio con SSE abierto: identidad, claves y conexión
  explícita persisten. Shutdown cerca solicitudes antes/después de la ruta async,
  drena bodies SSE antes de cerrar sockets y cierra SQLite después del servidor.
- Código de recuperación mostrado sólo por intención; se oculta sin copiarlo a
  Windows. La UI recupera claves desde el snapshot cifrado, retira los equipos
  anteriores, conserva sus copias locales y exige rotación para enviar. El host
  prueba respuesta de recovery perdida y retry tras restart con la misma intención.
- Firma/issuer/audience/azp/tiempo/nonce/JWKS OIDC, admisión cerrada, scopes,
  cancelación posterior al callback, expiración, huellas incorrectas y rollback
  rechazan acceso. Un retry aprobado no duplica el commit ni cambia su transcript.
  El login completado se recupera después del deadline/restart/limpieza con prueba
  local firmada; no reabre el navegador ni extiende el pedido pendiente de 24 horas.
- UI en 420 y 900 px: huellas/código no desbordan; aprobación requiere comparación,
  reintento conserva intención, selector conserva draft al volver del vínculo y
  bloquea la conexión durante retiro. Poll de identidad no acumula requests.

## Reproducción

Servicio y visuales usan sólo dependencias ya presentes:

```powershell
bun test tests/shared-clipboard-identity.test.mjs tests/shared-clipboard-oidc.test.mjs tests/shared-clipboard-control.test.mjs tests/shared-clipboard-relay.test.mjs tests/shared-clipboard-events.test.mjs
npx --no-install playwright test --grep 'shared (identity|product|clipboard)' --workers=2
bun run check
```

Rust usa GNU sin Miniconda en PATH y el manifest común ya disponible para tests:

```powershell
$env:PATH = (($env:PATH -split ';') | Where-Object { $_ -and ($_ -notlike '*\miniconda3*') }) -join ';'
$env:CARGO_TARGET_DIR = 'D:/copicu-shared-c1-target'
$env:RUSTFLAGS = '-C link-arg=D:/copicu-shared-c1-target/test-manifest/common-controls-v6.res'
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib
```

Después de visuales, generar frontend normal y compilar assets embebidos:

```powershell
npm run build
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
$env:TAURI_CONFIG = Get-Content src-tauri/tauri.built-dev.conf.json -Raw
cargo build --manifest-path src-tauri/Cargo.toml --offline --locked --bin copicu --features tauri/custom-protocol
node tests/manual/shared-identity-acceptance.mjs .codex-run/shared-product-20261002153910298-abc1e877 D:/copicu-shared-c1-target/debug/copicu.exe
```

El runner verifica el marker y copia sólo schema/settings sintéticos, sin datos
del fixture previo. Crea directorios `shared-identity-*`, puertos 9451–9453 y
procesos propios; cierra sólo sus procesos. Los puertos/hotkeys requieren estar
libres. Recibos y capturas quedan bajo `.codex-run/`, fuera de Git; registrar el
recibo del último binario comprobado abajo. No operar el perfil instalado.

## Recibo del binario

Recibo final `2026-10-02T22:35:03.053Z`: cinco casos pasan en
`.codex-run/shared-identity-6PzX3T/identity-ui-results.json`.
Binario `D:/copicu-shared-c1-target/debug/copicu.exe`, SHA-256:
`227ad741355b2187a7dc954ded7b0ae3f161301b6b6c842ba3bfe012cf529aab`.
Es un build debug local `0.5.2` con WIP de primer acceso, `tauri/custom-protocol`
y frontend normal; no es NSIS ni asset publicado. Las capturas
`native-pending.png` y `native-recovered.png` del mismo directorio se inspeccionaron.
El runner terminó sus procesos propios. `physicalPcAcceptance` sigue en `false`.

## Paquete Windows v0.5.3

NSIS normal `v0.5.3`/core `0.5.3`, construido offline con frontend normal y firma
updater ED/trusted comment verificada contra el pubkey vigente. Recibos en
`.codex-run/release-candidate-v0.5.3-q9N3Xy/artifact-manifest.json` y
`source-manifest-final.json`: 318 inputs de build conservados; sólo `package.json`
normalizó CRLF a LF, comprobado byte por byte. Payload x64 GUI, recursos/DLL y
TypeScript coherentes; no distribuye otros ejecutables ni fixtures. La firma
updater no es Authenticode.

| Artefacto | SHA256 |
| --- | --- |
| `Copicu_0.5.3_x64-setup.exe`, 14 446 161 bytes | `07C1404083F39219795791F0434A3E1F09F8AE0E3341EBD59722D3449AEA427F` |
| `.exe.sig`, 416 bytes | `7652A647853E4B8634D68E1EC92FD0FA4E70E0FAD9DCDEE72F13C40442758A42` |
| `latest.json`, 964 bytes | `7DDFFA12AE69797F5473EFBB3E2BB7E01920599775D82C2C245DC113D2C92C84` |
| EXE extraído e instalado, 47 156 061 bytes | `29BA249ED28A35CB3FA157605687290E1CCD37B68A0803FB855861875EFBF112` |

Tres checks nativos pasan sobre el payload exacto: arranque/versión/IPC con gate
Settings, primer acceso normal sin conexiones y rechazo de HTTP aun con el flag
de fixture debug. Los cinco casos completos anteriores conservan alcance debug:
el release exige HTTPS. Recibo `native-ui/payload-ui-results.json` a
`2026-10-03T00:09:43.999Z`, bajo el directorio del corte.

El mismo NSIS se instaló por autorización actual de JP mediante
`install:current -SkipBuild`; versión y hash coinciden con el payload.
`installed-receipt.json` y `installed-ui/installed-ui-results.json` acreditan
los mismos tres checks con otro perfil sintético nuevo; no son seis casos
distintos. El cierre selecciona la ruta instalada y conserva las otras copias.
Un probe NSIS nativo propio comprobó paths con espacios, apóstrofe y dólar,
sin comandos de shell ni cierre por nombre. No se leyó el perfil habitual.

## Publicación normal v0.5.3

[v0.5.3](https://github.com/jpsala/copicu/releases/tag/v0.5.3) publicado como
normal/latest a `2026-10-03T00:25:38Z`, desde tag/source inmutable
`780241184555d61549755e99d9637fecd5e2736a`.
[Agentic Validation 37081883421](https://github.com/jpsala/copicu/actions/runs/37081883421)
SUCCESS para esa fuente: documentación y chunks de release. Recibo
`.codex-run/release-candidate-v0.5.3-q9N3Xy/publication-receipt.json` a
`2026-10-03T00:26:28.9672168Z`: API latest y tag correctos, endpoint real updater
HTTP 200/version `0.5.3`, los tres downloads coinciden por SHA256 con locales y
digests de GitHub, y manifest URL/firma coherentes. No se recompiló ni sustituyó
el paquete después de comprobarlo; el manifest final sólo ajustó notas/fecha.

## Servicio remoto activo

JP confirmó los tres gates puntuales de Google/OAuth, DNS e imagen Bun en esta
sesión. El servicio está activo en `https://sharing.jpsala.dev/`, detrás del
Traefik existente. Los seis módulos desplegados coinciden por hash con la fuente
de `v0.5.3`; conserva issuer Ed25519 y SQLite persistentes. Imagen oficial Bun
`1.3.14` fijada al digest documentado. No se creó una suscripción nueva.

Evidencia en `.codex-run/sharing-deploy-20261002/`: certificado HTTPS verificado
sin bypass, `/health` HTTP 200/ready/version 3 y `/v3/info` con el origen y
issuer correctos. DNS público y resolución local entregan el destino aprobado.
`unauthenticated-routes.json` acredita 401 en V1 channels y V2 catalog/changes/events.
Google guardó sólo `openid email`; captura `google-oidc-scopes.jpg`.
El proxy tiene access logs apagados en esta ruta y no usa buffering.

Backup remoto consistente mediante `VACUUM INTO`, con `integrity_check=ok`, issuer
y configuración privados 0600, en `/opt/copicu-sharing/backups/20261003T014500Z`.
Su copia se abrió con el entrypoint real en un contenedor aislado, sin puertos
publicados: health ready y el mismo issuer público. El probe se cerró; el servicio
habitual siguió healthy. No se inspeccionó contenido de usuarios ni se reinició
el servicio activo para esta verificación.

JP informó que instaló e inició sesión en la otra PC. Metadata del servicio
confirma Home activo. La captura con `synthetic owner / synthetic product fixture`
correspondía a otro binario/perfil; dev ahora usa el perfil habitual de Home y
conserva su identidad. JP reportó entrega manual de texto en una dirección entre
sus PCs por **Send new text**, y confirmó el traslado explícito de recepción desde
All history a la carpeta. Este reporte no acredita las pruebas sintéticas en dos
PCs físicas, automatización en ambos sentidos, streaming remoto ni recovery Google.

La admisión desplegada sigue limitada a JP y Google sigue en Testing. La nueva
política de cualquier cuenta autenticada está implementada y probada localmente,
con aislamiento por issuer/subject y validación OIDC/PKCE conservada. La URL fija
del cliente pasa build normal, 383 Rust (1 omitido), 52 Bun/502 assertions y ocho
visuales desktop/narrow. Son resultados posteriores al tag, no del NSIS `v0.5.3`.
La eliminación de aprobación/transferencia entre PCs espera la decisión de
custodia de claves; no se redujo E2EE ni se publicó otro paquete.
