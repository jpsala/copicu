# N1 nativo/custody: matrices A/B/C completas en harness

Actualizado: 2026-10-01. **N1-A/B/C completos para las matrices sintéticas del harness: 15 Pure, 11 Clipboard y 6 Custody pasan.** JP autorizó después de N1-A orquestar la alternativa Windows Sandbox y tomar las decisiones técnicas sin supervisión; el permiso de este encargo incluye preparar, ejecutar y cerrar los guests propios con red/clipboard compartido desactivados. Resultado y repro Sandbox al final. Base: [research](research.md), [plan §5–7 y §9](plan.md), [estado/ownership](../../docs/tracks/041-shared-clipboard.md). Q1 `liveOnly`, Q2 texto plano y Q3 servicio privado siguen confirmadas. N1 no acredita integración shipping, E2EE ni entrega entre PCs; N1-A por sí solo nunca autorizó B/C.

## Resultado y frontera

Probar primitives Windows en un harness independiente: snapshot de texto, writer con owner válido, correlación nativa, barrera de pausa y protección DPAPI de fixtures. No integrar Tauri, watcher de producto, Actions/SDK, DB, startup ni red. Recibir no ejecuta paste, foco ni publicación; canal y recepción conservan identidades distintas de carpeta y clip deduplicado.

L1 permanece tal como está: modelo puro incluido sólo bajo `cfg(test)` y 25 tests reportados por la sesión anterior. N1 puede usar ese modelo mediante inclusión interna del archivo, sin ampliar su wiring de `lib.rs`. No acredita journal durable, entrega entre PCs, E2EE/enrollment, provider/costo ni US/SC completos.

## Archivos y features de N1-A

| Archivo | Cambio delimitado |
| --- | --- |
| `src-tauri/src/bin/shared_clipboard_n1.rs` | Binario standalone; sin `copicu_lib::run`. Modos explícitos y sin operación por defecto; supervisor de sus propios helpers. |
| `src-tauri/src/shared_clipboard/n1/mod.rs` | Dispatch del harness y tests `n1_pure`; incluye el modelo L1 sin modificarlo. Ningún test ordinario llama Win32/DPAPI. |
| `src-tauri/src/shared_clipboard/n1/clipboard.rs` | Owner oculto con message loop, reader/writer, observer nativo y fixtures producer/busy/delayed; checkpoints para carreras. |
| `src-tauri/src/shared_clipboard/n1/custody.rs` | Protect/unprotect de buffers y binding protegido de fixtures; referencias opacas, sin Settings/JSON de secretos. |
| `tests/manual/run-shared-clipboard-n1.ps1` | Wrapper focalizado: bootstrap GNU, offline/locked, permisos explícitos, directorios nuevos y cierre de recursos propios. No invoca el runner de suite completa. |
| `src-tauri/Cargo.toml` | Binario con `required-features = ["shared-clipboard-n1"]`; feature vacía por defecto, flags de `windows` abajo. |

Edición manual **autorizada/aplicada**: `[features]` con `shared-clipboard-n1 = ["windows/Win32_Graphics_Gdi", "windows/Win32_Security_Cryptography", "windows/Win32_System_JobObjects"]` y el `[[bin]]` anterior. Features actuales y versión `windows 0.62.2` preservadas; sin crates nuevos, HTTP/TLS/crypto E2EE ni `cargo add`. Gdi habilita la clase del owner, Cryptography DPAPI/CSPRNG y JobObjects contiene los procesos sintéticos bloqueables. Bindings compilados en Check/Build; futuras features/crates requieren presentar el delta antes de añadirlos.

`Cargo.lock` se exige intacto con `--locked`; si la resolución requiere modificarlo o falta cache, informar y pedir otro permiso. No descargar. No editar `lib.rs`, `build.rs`, `package.json`, código L1, frontend, migraciones, `AGENTS.md` ni `evidencia/`. El wiring opt-in no cambia la app instalada ni requiere arrancar/reiniciar app/dev.

## Permisos independientes

| ID | Autoriza exactamente | Efectos y requisito |
| --- | --- | --- |
| N1-A, autorizado/completo | Implementar sólo los archivos/features anteriores; Check, Build y Pure de abajo | Archivos del corte, compilación/cache local y target dedicado. Pure usa memoria/fixtures públicos; sin clipboard, HWND, DPAPI ni secretos. No implica N1-B/C. |
| N1-B | Ejecutar matriz Clipboard con tokens públicos sintéticos, helpers, HWND/observer y fallos controlados | **Vacía/reemplaza Windows clipboard**, incluidas pruebas que lo dejan parcial/vacío. Requiere destino Windows descartable identificado por JP; permite terminar únicamente helpers propios del run. No implica custody. |
| N1-C | Ejecutar matriz Custody con bytes aleatorios sintéticos y blobs temporales DPAPI | Usa DPAPI del usuario Windows de la sesión descartable, ACL del directorio nuevo y procesos propios. Puede activar almacenamiento interno de DPAPI del usuario; el harness no lo enumera ni lo borra. Sin clipboard ni claves/perfiles de Copicu existentes. No implica N1-B. |

Antes de B/C, identificar y autorizar equipo y sesión/VM Windows descartable, sin datos laborales/personales, Copicu activo ni sincronización/redirección de clipboard hacia otras sesiones/equipos. El encargo 2026-10-01 delegó al coordinador seleccionar y crear guests con el Sandbox ya habilitado en este host y establecer su sesión `ExistingLogin`; no autoriza crear usuarios persistentes, instalar software, cambiar políticas globales ni detener apps ajenas. Si no se puede asegurar la separación, parar; implementar A no habilita probar en el escritorio cotidiano. Los permisos de esta ejecución no son autorización permanente para futuros runs.

Un directorio nuevo separa artefactos, **no el clipboard de la window station**. No asumir que un escritorio distinto, perfil de app, RDP o Windows Sandbox con redirección constituyen aislamiento. No leer el clipboard inicial para verificarlo, guardarlo o restaurarlo: B acepta descartarlo intencionalmente en su sesión autorizada. Las lecturas posteriores sólo ocurren bajo guard y tras identificar owner/sequence de un producer propio por handshake; ante interferencia, abortar sin extraer payload ajeno. Marker no autentica apps.

## Comandos candidatos y alcance

Desde `C:/dev/copicu`, sólo después de aprobar el ID correspondiente. **Wrapper/binario implementados; Check/Build/Pure y matrices Clipboard/Custody ejecutados**, estas últimas únicamente dentro del Sandbox autorizado. N1-A precede a B/C. `SessionLabel` debe referirse al destino concreto aprobado, no sustituye comprobar aislamiento. El binario guarda la frontera del checkout de compilación: el traslado autorizado conserva `C:/dev/copicu` dentro del guest; no instala producto ni copia perfiles.

```powershell
# N1-A: código, features y checks sin efectos nativos
powershell -NoProfile -File tests/manual/run-shared-clipboard-n1.ps1 -Mode Check
powershell -NoProfile -File tests/manual/run-shared-clipboard-n1.ps1 -Mode Build
powershell -NoProfile -File tests/manual/run-shared-clipboard-n1.ps1 -Mode Pure

# N1-B: sólo la matriz Clipboard, en el destino descartable aprobado
powershell -NoProfile -File tests/manual/run-shared-clipboard-n1.ps1 -Mode Clipboard -RunId n1-clipboard-001 -SessionLabel JP-disposable-Windows -AllowClipboardMutation

# N1-C: sólo la matriz Custody, en el destino descartable aprobado
powershell -NoProfile -File tests/manual/run-shared-clipboard-n1.ps1 -Mode Custody -RunId n1-custody-001 -SessionLabel JP-disposable-Windows -AllowSyntheticSecrets
```

El wrapper fijará `CARGO_TARGET_DIR=C:/dev/copicu/src-tauri/target-codex-n1` sólo en proceso hijo. Para GNU copiará la preparación de PATH sin Miniconda y manifest common-controls v6 de [run-rust-tests.ps1](../../tests/manual/run-rust-tests.ps1); no lo ejecutará, pues lanza `cargo test` completo. Sin cambios globales de PATH/RUSTFLAGS/políticas. Windres/Rust/Cargo faltantes son stop, no permiso de instalación.

Operaciones Cargo exactas previstas dentro de ese entorno:

```text
cargo check --manifest-path src-tauri/Cargo.toml --offline --locked --bin shared-clipboard-n1 --features shared-clipboard-n1
cargo build --manifest-path src-tauri/Cargo.toml --offline --locked --bin shared-clipboard-n1 --features shared-clipboard-n1
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --bin shared-clipboard-n1 --features shared-clipboard-n1 n1_pure -- --list
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --bin shared-clipboard-n1 --features shared-clipboard-n1 n1_pure -- --test-threads=1
```

Check/Build no ejecutan el harness; Cargo sí ejecuta build scripts locales/cacheados. Pure enumera primero, exige selección no vacía y reporta nombres/cantidad. B/C ejecutan el `.exe` construido en `target-codex-n1/debug` con modo y permiso equivalentes; sin `cargo run`, arranque Tauri, suite completa ni rerun automático. CLI sin permiso, argumentos inválidos o modo ausente falla **antes** de crear HWND, leer sequence, abrir clipboard o generar secretos.

Cada B/C crea exclusivamente `.tmp/shared-clipboard-n1/<RunId>` nuevo: validar ruta absoluta dentro de esa raíz, rechazar existencia previa, traversal y reparse/symlinks; no resolver perfiles existentes. C restringe ACL en ese directorio nuevo al usuario de prueba y administradores/SYSTEM conforme al entorno, sin modificar padres. Guardar sólo blobs protegidos; plaintext nunca a disco/args/stdout, clipboard, Node/React ni logs. IDs/bindings de fixtures no son claves de producto. Evidencia durable: casos/outcomes/límites; no dumps, secrets ni logs de ejecución.

## Contrato nativo que debe someterse a prueba

1. **Owner:** crear HWND no visible y mantener su message loop en thread dedicado, sin activación. Registrar formato de marker y preparar buffers UTF-16 terminados + marker con `GMEM_MOVEABLE` antes de abrir/vaciar. Writer usa `OpenClipboard(owner)`; validar que es owner tras `EmptyClipboard`. Transferir ownership de cada handle sólo cuando `SetClipboardData` tiene éxito; liberar sólo los no transferidos. Cerrar guard, destruir HWND y handles propios correctamente. [SetClipboardData](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setclipboarddata).
2. **Fences y pausa:** conservar expected sequence/generation durante retries; bajo `OpenClipboard`, serializar guard final, invalidación de pausa y comienzo de `EmptyClipboard` en el executor. No liberar esa exclusión entre check y mutación. Pausa antes de comienzo cancela; durante write no responde ack hasta outcome o salida comprobada del executor. Recovery/deferred no escriben al reanudar. Sequence se compara por igualdad en tentativa acotada; cero deniega antes de mutar. [GetClipboardSequenceNumber](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber).
3. **Procedencia:** correlacionar sequence efectiva y marker de sesión bajo exclusión con observer del harness; observar una recopia de igual texto desde otro producer con sequence distinta como externa. No usar hash/TTL ni calcular `sequence + 1`. Si una carrera al cerrar/leer sequence impide atribuir causalmente el write, no suprimir contenido ajeno ni declarar correlación resuelta: detener ese gate. Esto no verifica el watcher shipping, excluido de esta ejecución.
4. **Delayed rendering:** producer sintético responde `WM_RENDERFORMAT` sin reabrir clipboard; caso lento/bloqueado en proceso aparte. Registrar sequence antes/después y rechazar snapshot si no conserva su fence; no publicar el contenido obtenido tardíamente. La lectura Win32 síncrona no gana cancelación dura por ponerle timeout. [Clipboard Operations](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-operations).
5. **Executor detenido:** un supervisor controla a lo sumo un executor y un producer/contender por caso, sin spawn ilimitado. Helpers esperan handshake antes de cualquier operación; asociarlos a Job Object propio sin breakaway y con kill-on-close antes de habilitarlos. Ante timeout invalidar generation, cerrar admisión y solicitar terminación sólo de esos helpers; esperar sus **handles de proceso señalizados**, no silencio/PID/salida de watchdog. Fallo de asociación o salida sin confirmar impide continuar. Nunca matar threads bloqueados ni procesos de usuario. [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
6. **Outcomes:** fallo confirmado antes de mutación = `failed/skipped`; tras vaciar/escribir algún formato o perder respuesta = `uncertain/partialWrite`. `Applied` exige ambos formatos y correlación comprobados. Muerte comprobada permite resolver ownership del executor, no reconstruye si el efecto ocurrió. No retry automático, nuevo claim por timeout, restauración ni clasificación de éxito por texto/hash iguales.

Presupuestos propuestos **del harness**, no defaults ni SLO de producto: retries de apertura 8/16/32/64 ms; watchdog de operación 1 s; ventana de comprobación de salida 2 s; máximo 30 s por matriz. Checkpoints/IPC deterministas fijan el orden de recopia/pausa/fallo; sleeps sólo producen la demora explícita. Exceder un presupuesto falla el caso; si no se comprueba fin de procesos, parar la matriz y reportar recurso pendiente, sin anunciar cleanup completo.

## Aceptación por matriz

| Matriz / caso | Evidencia necesaria y límite |
| --- | --- |
| Pure: CLI y selección | Falta de permiso/modo aborta sin callbacks nativos; filtro no vacío. No HWND, clipboard, DPAPI ni random secret. |
| Pure: cero/fences/generation | Sequence cero, stale y recovery/deferred deniegan; checkpoints inválidos no llegan a mutación. Cero se inyecta: no se cambian permisos de window station para provocarlo. |
| Pure: fallos/binding | Fallo previo/partial/resultado perdido y estados de pausa; tamaños y binding sintéticos públicos. Es modelo, no evidencia Windows. |
| Clipboard: owner/Unicode | HWND válido, texto con acentos/emoji/CRLF y marker; observer correlaciona escritura propia. Sin foco/paste; foreground observado estable en entorno controlado, sin hotkey/producto. |
| Clipboard: busy | Producer mantiene abierto: retry acotado, mantiene fence y deniega sin vaciar si sigue busy. También cubrir liberación dentro de presupuesto. |
| Clipboard: delayed | Producer rápido y bloqueado; sequence medida, snapshot coherente o stale/timeout. Resultado tardío no recupera elegibilidad; supervisor sigue respondiendo y confirma salida de helpers. |
| Clipboard: recopia | B copia mientras A espera: A no pisa B. B recopia mismo texto después de A con sequence nueva: observer no lo suprime por hash. |
| Clipboard: pausa | Checkpoints antes del guard, entre guard/comienzo (serialización obligatoria) y durante write; ack sólo cuando corresponde. Tras ack no empieza otro write; resume no aplica backlog. |
| Clipboard: parcial/crash | Fallo inyectado antes de vaciar, después de vaciar y entre texto/marker; matar helper propio tras posible write y antes de reporte. `uncertain` conserva claim, sin replay/restore; recopia posterior B permanece. Inyección no prueba todas las causas reales Win32. |
| Custody: roundtrip/restart | 32 bytes aleatorios sintéticos protegidos bajo usuario; otro helper del mismo usuario abre blob y valida binding. Igualdad comprobada en memoria, sólo resultado booleano reportado. Restart del helper, no reinicio de Windows/app. |
| Custody: tamper/missing | Blob truncado/alterado/ausente o versión no soportada: error visible, ningún secret aceptado/reemplazo silencioso. Validar contenido esperado aunque la API devuelva éxito; no exposición de buffers rechazados. |
| Custody: wrong binding | Binding versión/entorno/profile-fixture/identidad dentro del blob protegido, comparado con contexto host confiable; cambio externo de etiqueta no lo modifica. Rechazo es del harness, no aislamiento DPAPI entre perfiles. |
| Custody: copia bajo mismo usuario | Copiar blob y binding idénticos a otro directorio **sintético nuevo** puede permitir unprotect. Registrar ese límite como aceptación honesta; no afirmar anti-clone/anti-restore. Restore con identidad nueva queda para D1/enrollment. |
| Custody: cleanup | Sin plaintext persistido; buffers sensibles con borrado no elidible y output DPAPI liberado con `LocalFree` incluso en error. ACL y recursos propios comprobados; no prometer borrado seguro de SSD/pagefile ni de copias internas de Windows. |

Custody usa `CryptProtectData`/`CryptUnprotectData`, `CRYPTPROTECT_UI_FORBIDDEN`, sin `CRYPTPROTECT_LOCAL_MACHINE`, prompts ni audit opt-in. DPAPI protege bajo credenciales del usuario; hay excepciones roaming. Binding/ACL ayudan a evitar confusiones de dominio, no resisten por sí mismos a otro proceso del mismo usuario. No probar otro usuario/equipo/perfil real. Fuentes: [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata), [CryptUnprotectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata). N1-A implementa borrado no elidible de buffers propios mediante escrituras volátiles + compiler fence, sin añadir/importar `zeroize`. No acredita limpieza de copias internas de Windows, hashing, heap/pagefile o del sistema.

N1 se acepta por matriz, sin ocultar casos pendientes. B requiere resultados Windows y cierre comprobado de todos sus helpers; C requiere resultados DPAPI y límites explícitos. B aprobado sin C no cierra custody, y ninguno cierra integración watcher, hotkey real, lock/unlock/suspend, RDP, journal durable o pruebas de dos PCs. No medir SC-02 remoto con este harness.

## Riesgos, alternativa y rollback

- Riesgos A: grafo/features/build scripts y cache/MSRV, costo de compilación y errores `unsafe`. Offline/locked, target dedicado y revisión focalizada contienen cambios; cache faltante detiene. Alternativa: conservar sólo esta propuesta y L1.
- Riesgos B: pérdida intencional del clipboard, fallos parciales, bloqueo Win32 y efectos de sincronización externa. Sólo destino descartable separado, sin payload real; comprobar fin de helpers propios. Alternativa: Pure, que deja el gate Windows abierto.
- Riesgos C: artefactos DPAPI del usuario, buffers residuales y confianza excesiva en binding/perfil. Usuario descartable, blobs nuevos, ACL y limpieza propia; no protección anti-clone. Alternativa: fixtures públicos Pure, que deja custody abierta.
- Rollback de código: revisar y retirar sólo archivos y hunks N1/features/bin añadidos, contra baseline al iniciar N1-A; no `git reset/clean/checkout` global. Preservar todo WIP L1/docs/AGENTS/evidencia y Cargo.lock previo. No commit/push ni instalación.
- Rollback de ejecución: cancelar admisión, cerrar/terminar sólo Job/helpers del RunId y esperar handles; después retirar sólo directorio de ese run y target propio si se decide, verificando rutas absolutas/reparse. No tocar `.codex-run`, perfiles o almacenamiento interno DPAPI. Si falta prueba de fin, conservar estado pendiente y escalar; no borrar artefactos de un executor potencialmente activo.
- **El clipboard previo no tiene rollback prometido.** No leerlo ni restaurarlo; al terminar dejar último token sintético/parcial en esa sesión. No vaciar en cleanup sobre una recopia posterior. Descartar la sesión/VM corresponde al dueño del destino y requiere su autorización, no está implícito aquí.

## Evidencia N1-A y siguiente permiso

JP aprobó **únicamente N1-A** en respuesta a la solicitud concreta de este dossier. Ejecución directa en el checkout actual, sin nuevos agentes. [Binario](../../src-tauri/src/bin/shared_clipboard_n1.rs), [dispatch/tests](../../src-tauri/src/shared_clipboard/n1/mod.rs), [clipboard/supervisor](../../src-tauri/src/shared_clipboard/n1/clipboard.rs), [custody](../../src-tauri/src/shared_clipboard/n1/custody.rs) y [wrapper](../../tests/manual/run-shared-clipboard-n1.ps1) implementados dentro de la frontera aprobada. `lib.rs`, fuentes L1 y Cargo.lock preservados; nueva feature sólo opt-in, sin inicialización shared en la app ni necesidad de relanzar app/dev.

Checks propios: wrapper Check y Build offline/locked pasan en Rust 1.89.0 Windows GNU, target dedicado y bootstrap sólo en proceso hijo. Pure enumera y ejecuta **15 passed / 0 failed / 0 ignored / 25 filtered out**; los 25 L1 se compilan dentro del harness pero no se ejecutan por este filtro. Fixtures públicos deterministas en memoria, sin random secreto ni DPAPI/Win32. Rutas nativas están bajo `cfg(all(windows, not(test)))`: Pure no puede ejecutar ese backend incluso con flags válidos. Rustfmt focalizado y parser PowerShell pasan. No suite completa ni smoke Windows.

N1-A no ejecutó HWND/clipboard/Job helpers/DPAPI ni creó blobs/secretos/raíces de datos del harness; B/C se ejecutaron posteriormente según el resultado siguiente. No ampliar features ni repetir modos por inercia. E2EE/enrollment/versiones, proveedor/costo, D1/T1, integración shipping y dos PCs conservan sus gates separados.

## Ejecución Sandbox comprobada (2026-10-01)

Destino elegido bajo la delegación de JP: Windows Sandbox ya habilitado en este host Windows Pro build 26200, `wsb 0.8.107.0`. Dos scouts read-only revisaron paquete/fronteras y CLI; el coordinador escribió/ejecutó y contrastó resultados. [Track](../../docs/tracks/041-shared-clipboard.md#resultado-n1-bc-en-windows-sandbox-2026-10-01) conserva IDs de los dos guests propios y permisos del encargo.

- Paquete mínimo: exe existente (imports sólo DLL Windows/API sets), wrapper nativo, [runner guest](../../tests/manual/shared-clipboard-n1-sandbox-guest.ps1) y manifest SHA256. No Cargo, Rust, Node, fuente de producto, perfiles ni credenciales dentro del guest. La copia interna reproduce `C:/dev/copicu` porque el exe usa `CARGO_MANIFEST_DIR` compilado para el boundary de datos.
- Config `.wsb`: `Networking`, `ClipboardRedirection`, `VGpu`, `AudioInput`, `VideoInput`, `PrinterRedirection` = `Disable`; sólo paquete de entrada mapeado `C:/N1Input`, `ReadOnly=true`. Comprobación guest de WDAGUtilityAccount, hashes, rechazo de escritura y ausencia de adapter Up antes de las matrices. `RemoteSigned` sólo en los procesos guest que ejecutan scripts locales; no política global.
- CLI: `wsb list --raw` vacío antes de crear; `start --id <UUID-propio> --config <XML> --raw`, `connect --id <UUID-propio>` y `exec --run-as ExistingLogin`, nunca System para clipboard. Calibrar `exit 0`/`exit 73`: leer JSON `ExitCode`, pues el exit del proceso wsb es 0 en ambos. El cliente de conexión puede abrir UI; no requiere intervención de JP. [CLI oficial](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-cli), [config oficial](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file).
- Invocar en guest, por CLI, `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File C:/N1Input/shared-clipboard-n1-sandbox-guest.ps1 -Mode Prepare -RunId <ID>`; después modos `Clipboard`/`Custody` y `VerifyClipboard`/`VerifyCustody` con el mismo ID. El script exige sesión/paquete guest, conserva permisos separados del wrapper, rechaza repetir logs, aplica watchdog exterior 45 s, compara nombres/count/orden exactos y resumen, exige limpieza y ausencia de procesos del harness. No timeout como prueba de settlement.
- Reportes: carpeta host nueva por run, separada del input, compartida con permiso de escritura en `C:/N1Report`; exportar únicamente líneas `PASS [a-z-]+`, resumen nativo y marker verificado. No copiar logs completos, blobs, buffers/secretos o el directorio de datos. CLI sin stdout justifica esta salida acotada; el contenido durable son resultados y límites, no los archivos de ejecución ignorados.
- **Custody: 6 passed**, run `n1-sandbox-20261001T033401`. **Clipboard: 11 passed**, run `n1-sandbox-20261001T033401-r1`, con reparación nativa del writer del harness. Verify independiente del coordinador retornó `ExitCode:0` para cada matriz y se recuperaron sus eventos públicos exactos. Wrapper confirmó fin de helpers y retiró directorio/fixtures de cada matriz exitosa; el intento no aprobado de B se descartó al cerrar su guest. `stop --id` sólo a los dos UUID propios y lista final vacía. No recursos ajenos operados ni clipboard previo leído/restaurado.
- Reparación reusable: medir correlación tras `CloseClipboard`, reabrir bajo exclusión, exigir owner propio, marker y sequence no cero estable durante la lectura y después del segundo cierre. Una recopia/fallo conserva `Uncertain`; no arithmetic/hash/replay. HWND/marker no autentican procesos hostiles del mismo usuario. El writer shipping permanece pendiente.
- Build offline/locked y 15 Pure pasan tras la reparación; Cargo.toml/lock, lib.rs y L1 intactos. Exe probado SHA256 `88622271DDA8E49701A7E5E0DBE30A709EF9DD97C47E5693866098113C98097B` (rustfmt posterior sólo cambia layout de fuente). No nuevas dependencias, instalación, runtime app/dev, red de producto ni commit/push.

Aceptación acotada: matrices sintéticas de snapshot/writer/pausa/procedencia y custody DPAPI ejecutadas en Windows. Siguen sin prueba watcher/hotkey shipping, foco/paste de producto, lock/suspend/RDP, persistencia/journal, E2EE/enrollment, anti-clone y entrega/latencia entre PCs. El éxito de N1 no aprueba automáticamente otro corte ni repetir B/C en el escritorio cotidiano.
