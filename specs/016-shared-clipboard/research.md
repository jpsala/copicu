# Preflight técnico: clipboard compartido

Actualizado: 2026-10-01. Estado: **L1/N1 sintéticos y C1/T1 locales comprobados**; persistencia D1 candidata y resultados actuales en [implementación local](local-implementation.md). JP aprobó los cinco cargo add con «avancemos», ejecutados opcionalmente. Vectores e interop HPKE/DPAPI/HTTP/SQLite/cifrado reales sobre fixtures; no integración shipping, enrollment humano ni dos PCs. Alcance confirmado: Q1 `liveOnly`, Q2 texto plano, Q3 servicio privado. Contratos: [spec](spec.md), [plan](plan.md), [track](../../docs/tracks/041-shared-clipboard.md). El preflight histórico de abajo no reemplaza el estado actual ni autoriza proveedores/deploy.

[N1 nativo/custody](n1-native-custody.md): N1-A (código/features/build/Pure) completo, Build offline/locked y **15 tests Pure** pasan tras la reparación nativa. N1-B (**11 Clipboard**) y N1-C (**6 DPAPI**) autorizados/ejecutados en Windows Sandbox aislado, con verificación adicional del coordinador y ambos guests cerrados. Ese dossier acota N1; el `cargo add` preliminar de abajo conserva condición de candidato no autorizado y no se usó para este harness opt-in. No E2EE ni integración shipping/entrega entre PCs.

## Resultado recomendado

1. Primer corte local: lógica de snapshot/eligibilidad/generation/claim y pruebas deterministas, usando dependencias existentes. Sin transporte, criptografía nueva ni APIs shared públicas todavía. No conectar el código al watcher/shortcuts/UI ni leer/escribir Windows durante ese corte.
2. Segundo gate, independiente: harness nativo sintético para snapshot/writer y custody; requiere autorización de ejecución con efectos. Primero resolver HWND owner, delayed rendering y correlación con watcher, no suponer que un mock los acredita.
3. Relay candidato: Worker + Durable Object con SQLite por canal, conservando envelope/ciphertext/sequence/idempotencia en un mismo almacenamiento transaccional. R2/D1 no son necesarios para el vertical de texto; quedan alternativas para formatos futuros, no recursos a crear ahora.
4. E2EE candidato: AEAD de biblioteca mantenida para publicaciones, firma verificable de dispositivo y HPKE estándar para transferir claves a equipos aprobados. Custody candidata: DPAPI por usuario mediante `windows` existente. La composición/enrollment, revisión de versiones y vectores siguen siendo un gate de seguridad, no un protocolo aprobado.

## Evidencia local

- `src-tauri/Cargo.toml`: `windows 0.62.2`, `serde`, `serde_json`, SQLite y hashing existentes. N1-A añade sólo features Windows opt-in para owner/DPAPI/Job Object; dependencias directas HTTP/E2EE siguen pendientes.
- `src-tauri/Cargo.lock`: `reqwest 0.13.4`, `rustls 0.23.40`, `ring 0.17.14`, `tokio 1.52.3` y `zeroize 1.9.0` transitivos. No equivalen a dependencias directas del dominio ni permiten usar sus APIs sin declarar/revisar features.
- Manifiesto cacheado de **tauri-plugin-updater 2.10.1**, versión del lock: usa `reqwest` con `json/stream`, `rustls-no-provider` y `rustls` con provider `ring`. Reusar esa familia evita añadir por reflejo otro backend TLS; verificar el grafo después de cualquier cambio autorizado.
- `clipboard_probe.rs:98–139` ya consulta sequence, pero enumera/probea formatos y no reserva el contenido del atajo. No llamar al probe completo desde el callback para fingir un snapshot.
- `clipboard.rs:903–989` abre con `OpenClipboard(None)` para **lectura**; ese guard no es un writer owner válido. El writer sharing sigue sin implementar.
- `storage.rs:1084–1103` expone `AiSettings.api_key` como string serializable. No reusar ese contrato ni pasar secretos sharing al runner Node/React.
- Bindings cacheados `windows 0.62.2`: DPAPI con `Win32_Security_Cryptography`, `WNDCLASSW` con `Win32_Graphics_Gdi` y contención con `Win32_System_JobObjects`, aprobadas/compiladas sólo en feature `shared-clipboard-n1`; ausentes de los defaults de app. Cargo.lock conservado.
- Toolchain observado mediante consultas de versión, sin build: Rust/Cargo 1.89.0. MSRV de `reqwest 0.13.4` declarado: 1.85.0; no prueba compatibilidad del conjunto de crates criptográficos candidatos.

## Relay, límites y latencia

Fuentes primarias públicas consultadas (no cuenta/infra viva):

- [Cloudflare: almacenamiento Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/): almacenamiento privado, transaccional y fuertemente consistente por objeto; no una transacción entre objetos o con R2.
- [Cloudflare: límites](https://developers.cloudflare.com/durable-objects/platform/limits/): tamaño máximo de string/BLOB/fila SQL de 2 MB. Capacidad por objeto/cuenta depende del plan; no asumir disponibilidad del plan de JP.
- [Cloudflare: pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): Free documenta 100.000 requests DO/día; requests, duration y almacenamiento se contabilizan por separado. Workers invocadores, índices, alarmas y otros servicios también importan. No se verificó una cuenta, presupuesto ni facturación real.

Modelo aritmético sintético, **no test del proveedor/producto**: 1 MiB de texto + tag AEAD de 16 bytes + header acotado propuesto de 16 KiB = 1.064.976 bytes binarios; con ciphertext base64, 1.414.508 bytes. Ambos caben bajo 2.000.000 bytes, pero sólo si el envelope completo y su codificación respetan ese presupuesto. Límite de header, cuota total, índices, retención e idempotencia requieren contrato y tests; no convertir estas cifras en defaults aprobados.

Con un store único, admission/grants/epoch, dedupe, ordinal, ciphertext inmutable y sequence deben confirmarse en una transacción corta antes del ack. No I/O externo dentro de ella. Conflicto no modifica bytes previos. Cleanup elimina payload según TTL y conserva tombstone/idempotencia hasta expiry + ventana de retry. Fault injection debe cubrir commit/ack perdido, cuota, limpieza y revocación concurrente; un fake no acredita la semántica del servicio desplegado.

Para SC-02, recomendar aviso push + cursor HTTP como autoridad, no polling constante presentado como equivalente. Dos dispositivos con polling 1 s durante 24 h generan 172.800 consultas/día, por encima de aquel límite Free aun antes de publicaciones/receipts. Polling 2 s baja a 86.400, pero su espera de hasta 2 s + RTT de 200 ms ya puede superar la meta de latencia. Son cálculos, no mediciones. WebSocket/hibernación es candidato con dependencia cliente aún por evaluar; fallback acotado debe mostrar degradación y medirse, no garantizar SC-02 ni gratuidad.

## Cifrado y vinculación: candidatos y gate explícito

| Necesidad | Candidato / fuente primaria | Conclusión y límite |
| --- | --- | --- |
| AEAD de publicaciones | [RustCrypto chacha20poly1305](https://github.com/RustCrypto/AEADs/tree/master/chacha20poly1305), catálogo consultado [0.11.0](https://docs.rs/crate/chacha20poly1305/0.11.0) | XChaCha20Poly1305 candidato; README declara una auditoría NCC Group histórica. No atribuir automáticamente esa cobertura a 0.11.0 o al protocolo Copicu. Revisar nonce/CSPRNG/AAD, API, MSRV y revisión auditada. |
| Firma de dispositivo | [ed25519-dalek](https://github.com/dalek-cryptography/curve25519-dalek/tree/main/ed25519-dalek), catálogo consultado [3.0.0](https://docs.rs/crate/ed25519-dalek/3.0.0) | Revisar `verify_strict` y rechazo de claves débiles también en enrollment; no usar batch como sustituto de verificación estricta. Catálogo consultado, no versión seleccionada/instalada ni auditoría acreditada. |
| Transferencia de claves | [HPKE RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.txt), [rust-hpke README](https://github.com/rozbb/rust-hpke), catálogo consultado [0.14.1](https://docs.rs/crate/hpke/0.14.1) | HPKE estándar evita implementar KEM/KDF/AEAD caseros. README declara ausencia de auditoría pagada y revisión interna de Cloudflare de 0.8, no de toda versión actual. Gate de revisión pendiente; no instalar ni etiquetar como auditado. |

Primitivas mantenidas no convierten la composición en protocolo auditado. No redactar un `cargo add` criptográfico ejecutable antes de fijar versión/features/licencia/MSRV, cobertura de revisión y schema/enrollment; no reemplazar esa validación por una fecha de entrega. RFC 9180 §9.7 deja replay/orden y otros objetivos a la aplicación, y §9.7.4 no promete forward secrecy ante compromiso de la clave del receptor.

Checklist previo a código de seguridad: suite única sin negotiation/downgrade implícito; encoding canónico sin counters flotantes; AAD/firma ligados a entorno/channel/publication/device/ordinal/epoch/expiry; CSPRNG y nonce único por publicación, retry con mismos bytes; claves signing/KEM separadas; rechazo de inputs/version/tamaño/claves débiles; vectores conocidos, tamper, swap de canal/entorno, replay y cambio de epoch.

Enrollment necesita binding verificable de ambas identidades/claves y aprobación humana fuera de la autoridad del relay. Invitación single-use y código corto no son por sí solos autenticación criptográfica ni clave de contenido. Revisar sustitución de claves, invitación robada/replayed, confirmación cruzada y revocación en vuelo; ausencia de backfill UI no equivale a impedir acceso retrospectivo a ciphertext/claves. Fijar explícitamente el alcance histórico de grants/epochs antes de validar US5. No prometer recuperación de todas las claves ni borrar lo ya descargado.

## Custody y clipboard Windows

[CryptProtectData (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) normalmente liga descifrado a credenciales del usuario/equipo, con excepción de perfiles roaming. Propuesta: DPAPI de usuario, `CRYPTPROTECT_UI_FORBIDDEN`, buffers gestionados y liberados con la API correcta; **no `CRYPTPROTECT_LOCAL_MACHINE`**, que permite descifrado por otros usuarios de ese equipo. Secrets fuera de JSON Settings/SDK/logs y del backup normal, con referencias opacas, permisos de archivo y binding de dominio/perfil.

DPAPI no es sandbox entre dev/instalada bajo el mismo usuario, ni prueba anti-clone/anti-restore. Separar almacenes/IDs/endpoints y validar bindings; restore genera identidad/vinculación nueva. Fallos de unprotect son bloqueo visible, no clave nueva silenciosa ni recepción vacía. Tests de custody con secretos sintéticos, restart/tamper/wrong binding y pérdida de clave deben ejecutarse sólo con permiso; no tocar claves existentes.

[SetClipboardData (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setclipboarddata) exige owner válido: abrir con HWND NULL y vaciar deja owner NULL y hace fallar la escritura. Diseñar/reusar un HWND owner no visible, sin foco; preparar buffers Unicode/marker antes de mutar y correlacionar la sequence final antes del watcher. HWND/procedencia no son credenciales.

[GetClipboardSequenceNumber (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber) devuelve cero sin acceso a la window station, y delayed rendering puede retrasar su incremento. No tratar cero como entrada fiable ni sequence como copia histórica. Smoke externo debe medir el caso, no inventar cancelación dura de GetClipboardData. Fallo parcial sigue `uncertain`, sin restaurar por encima de una copia externa posterior.

## Cortes y permisos (estado actual)

| Corte | Resultado / aceptación | Permiso o gate |
| --- | --- | --- |
| L1 local puro | Modelo interno `shared_clipboard` compilado sólo con `cfg(test)`: admission/eligibilidad, sequence por igualdad, generation, high-water y claim/outcomes; 25 unit tests memoria pasan. Sin wiring runtime/UI/migrations/SDK público | Autorizado por JP y completado. Dependencias existentes; cero instalación/red de producto/perfiles/clipboard. No acredita Windows real ni E2EE/journal durable. |
| N1 nativo/custody | N1-A/B/C completos para el harness: 15 Pure, 11 Clipboard y 6 Custody pasan | JP autorizó B/C en Sandbox aislado y decisiones técnicas; ambos guests cerrados. No perfiles/clipboard del host ni permiso permanente de rerun. No integración shipping/E2EE/anti-clone. |
| D1 dominio/Actions/fake | Persistencia candidata fixture-only: 26 SQLite y 6 wire (+25 L1) comprobados; outbox/cursor/report/gap/TTL/sinks/manual/import/poda. Snapshot host-side, capabilities/grants e integración siguen pendientes | Código local/tests autorizados y ejecutados. [Dossier local](local-implementation.md) delimita SQL candidato, dependencias pendientes y adapters aún sin autenticar; sin perfiles existentes ni fake crypto E2EE. |
| T1 transporte/relay | Un adapter concreto con HTTPS/push, rechazo cross-device/epoch, fault injection y modelo de costo | Dependency dossier y permiso antes de instalar; cuenta/recursos/deploy/DNS separados, sin heredar autorización de L1. |
| C0 remoto | US1–US5/SC01–SC08 en dos PCs, tokens sintéticos y recibos por dispositivo | Autorizar PCs/entorno/enrollment; datos laborales requieren permiso adicional. |

L1 sin dependencias nuevas. Cargo check ejecutado offline/locked; test filtrado ejecutado con esos flags y preparación Windows GNU descrita debajo. Comandos base desde `C:/dev/copicu`:

```text
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib shared_clipboard -- --test-threads=1
cargo check --manifest-path src-tauri/Cargo.toml --offline --locked
```

En Windows GNU aplicar el bootstrap ya existente de `tests/manual/run-rust-tests.ps1` **en un proceso hijo y con filtro**, no ejecutar su suite completa: PATH sin Miniconda sólo para ese proceso, recurso common-controls v6 generado por `windres`, `RUSTFLAGS` con ese recurso y `CARGO_TARGET_DIR=target-codex-test`. No cambiar ambiente global, omitir offline/locked ni correr tests de otros perfiles. Ejecución L1: 25 passed, 0 failed/ignored, 261 filtered out.

Alcance L1: módulo/test internos y wiring de compilación mínimo, sin inicialización del dominio en la app. Cambios esperados sólo en fuentes del corte y salida de compilación/target; no procesos de app ni perfiles. Riesgos: costo de compilación/cache incompleto, o modelar mal una barrera; aceptación no declara runtime probado. Alternativa: conservar modelos en memoria y no escribir código. Rollback: retirar sólo archivos/wiring del corte tras revisar diff, preservando WIP ajeno. Si falta cache, detener e informar; no descargar automáticamente. Reportar nombres/cantidad de tests efectivamente ejecutados: un filtro con cero tests no acredita aceptación.

Dossier preliminar **sólo para una autorización posterior**, no permiso solicitado/otorgado por este estudio:

- Transporte: candidato `reqwest =0.13.4` + `rustls =0.23.40` con provider `ring`, sin defaults que incorporen `aws-lc-rs` por reflejo. Comandos propuestos: `cargo add reqwest@=0.13.4 --manifest-path src-tauri/Cargo.toml --no-default-features --features json,stream,rustls-no-provider` y `cargo add rustls@=0.23.40 --manifest-path src-tauri/Cargo.toml --no-default-features --features ring,std,tls12`. Mantener verificación TLS, HTTPS only, redirects restringidos, timeouts explícitos y body caps. [ClientBuilder 0.13.4](https://docs.rs/reqwest/0.13.4/reqwest/struct.ClientBuilder.html) documenta timeout total/read/connect; total por defecto no está fijado. Proxy/red laboral se evalúa sin desactivar certificados ni enviar credenciales a otro endpoint.
- Custody/owner: si el harness requiere nuevos flags, comando candidato `cargo add windows@=0.62.2 --manifest-path src-tauri/Cargo.toml --features Win32_Security_Cryptography,Win32_Graphics_Gdi`, preservando features existentes.
- Alcance de ambos: Cargo.toml/Cargo.lock/cache local, nunca global ni runtime cloud. Motivo: APIs directas/features correctas. Riesgos: grafo/MSRV/provider TLS y posibles descargas/build scripts transitivos; revisar lock diff, no asumir cero cambios por estar en cache. Alternativa: posponer T1/N1 y hacer L1 sin cambios Cargo. Rollback: retirar únicamente entradas/features incorporadas por ese corte y revisar/restaurar sus cambios propios del lock, sin revertir WIP preexistente. Ningún comando se ejecutó.

## Evidencia L1 y pendientes

Preflight: lecturas/catálogo público/aritmética, no mediciones del proveedor ni selección definitiva. L1 posterior autorizado por JP, ejecución directa sin agentes nuevos:

- [Modelo Rust](../../src-tauri/src/shared_clipboard.rs), [25 tests](../../src-tauri/src/shared_clipboard/tests.rs) y única inclusión `#[cfg(test)] mod shared_clipboard` en `lib.rs`. Sin runtime shipping: `cargo check` es regresión de compilación de la app; `cargo test` compila y ejercita el modelo nuevo.
- Guards de lectura por igualdad antes/después; cero indisponible; contadores de canal `u64` sin pérdida sobre 2^53; `liveOnly`, scopes/generation, supersession y claim automático único. Expiry/origen/frescura son metadata sintética confiable en estos tests, no proofs criptográficos implementados.
- Pausa cancela claims aún no iniciados; ack espera resultado de write ya modelado como iniciado. Reanudación no revive tokens ni backlog. Test de las seis permutaciones pausa/copia/check final; no threads, delayed rendering o Win32 reales.
- Outcome ambiguo permanece `Uncertain`, sin auto replay. `recover_after_executor_exit` exige precondición de executor ya detenido, nunca mero timeout; no implementa persistencia/restauración real. Claim y high-water sólo están en memoria; D1 debe persistir y ligar metadata validada antes de cualquier efecto externo.
- Checks propios: 25 tests Rust pasan (0 fallos/ignored, 261 filtrados), cargo check offline/locked pasa, rustfmt de los dos archivos pasa, Cargo.toml/Cargo.lock sin cambios y diff revisado. Tests ejecutados del módulo, no end-to-end de sharing ni smoke Windows/E2EE.
- Sin app/dev, clipboard, perfiles, keys reales, instalaciones o infraestructura. No se reinicia app: el único cambio de wiring está bajo `cfg(test)`, dev sigue detenida y la app instalada no recibió código nuevo.

Pendiente inmediato: integrar admisión D1 autenticada y cerrar enrollment/custody durable de producto antes de runtime/nativo/Actions/UI. [Implementación local](local-implementation.md) conserva los tests posteriores de C1/T1 y los comandos ya autorizados, sin extrapolar a dos PCs. [Dossier N1](n1-native-custody.md) acredita matrices Windows/DPAPI en Sandbox; no watcher shipping ni entrega/latencia remotas. Cuenta/costo/deploy y el push del proveedor real siguen abiertos.
