# Prueba local: instalada ↔ dev

## Smoke instalado v0.5.2-rc.1 (2026-10-02)

Origen: JP autorizó publicar la RC con commit/push y actualizar la instalación
local. El coordinador comprobó la instalación el **2026-10-02T20:00:58Z** con
el mismo NSIS firmado del checkpoint siguiente, `/S /UPDATE` y exit code 0.
`%LOCALAPPDATA%/Copicu/copicu.exe` reporta core **0.5.2**, **46.772.216 bytes** y
SHA256 `19E6E9F6E3D076AE1936174EDE4CEC76E52C6C0753FBE648A19664A14BE43292`,
idéntico al payload extraído. El exe anterior quedó respaldado en un destino
ignorado. Proof: `.codex-run/release-candidate-v0.5.2-rc.1/installation-result.json`.

La instalada se relanzó sobre el mismo receiver-profile sintético del fixture
`shared-product-20261002124908215-3df65772`, PID `52656`/CDP `9412`, con opt-ins
apagados. Las tres dev propias conservaron sus perfiles y se relanzaron como
`12432`/9421, `68860`/9422 y `30884`/9411. Referencias verificadas del cierre,
para revalidar antes de operar; no son permisos ni garantía de actividad futura.

Con el exe instalado, **10 casos de publicaciones pasan** en un fixture nuevo:
`.codex-run/shared-product-20261002200214945-db282702/sse-publication-results.json`.
Repiten la matriz del payload y no se suman como diez casos distintos nuevos.
Son IPC real de WebView2 y no implican por sí solos interacción nativa.
Computer Use del coordinador confirmó por separado el diálogo de nuevo clip y
el árbol selector de carpetas superpuesto correctamente. Ese recorrido breve
no acredita nuevas pruebas de publicación nativa, clipboard o paste.

Publicación GitHub y CI de este cierre aún requieren evidencia propia; instalar
el artefacto local no las acredita. Stable/latest y gates remotos se registran
por separado del smoke local.

## Candidata firmada v0.5.2-rc.1 (2026-10-02)

Core `0.5.2`, preparado sobre HEAD **base** `2b1b954` más WIP conservado;
ese HEAD no contiene por sí solo las fuentes compiladas. NSIS generado offline
con frontend normal, updater config y herramientas existentes. Los 219 inputs
de build conservan sus hashes antes/después del paquete; manifiesto de fuentes y
artefactos en `.codex-run/release-candidate-v0.5.2-rc.1/`.

- `Copicu_0.5.2_x64-setup.exe`: **14.341.637 bytes**, SHA256
  `23159C9E9119F90251965062BB494DD6816C845C98E73E625AE65DE9069C830E`.
- Firma updater verificada contra la trust root de Tauri `C0F4A03D8610A847`;
  `latest.json` coincide en core, URL RC y firma, UTF-8 sin BOM. Se usó la clave
  canónica local en el proceso, sin cambiar la variable global ni el pubkey.
  Authenticode sigue `NotSigned`.
- Payload extraído del mismo NSIS sin instalar: exe x64/GUI `0.5.2`,
  **46.772.216 bytes**, SHA256
  `19E6E9F6E3D076AE1936174EDE4CEC76E52C6C0753FBE648A19664A14BE43292`.
  DLL y seis recursos distribuidos coinciden con fuentes; no contiene executables dev.
- Regresión amplia: **379 Rust** pasan, un benchmark ignorado; **56 Bun TS** y
  **83 Node** pasan. Visual: 490 pasan en la matriz amplia y los cuatro checks
  restantes pasan tras actualizar dos assertions de la UI anterior; total **494**,
  dos capturas opt-in omitidas. No se suman repeticiones como casos distintos.
- Con ese payload exacto: **10 publicaciones** y **13 lifecycle catalog-denied**
  pasan con dos perfiles nuevos y relay loopback por recorrido. Incluyen burst de
  veinte con leases/receipts, pausa/resume sin backfill, desconexión SSE, snapshot
  tardío, fallback 55–59 s, cancelación idle 115 ms, quit/restart y denied sin retry.
  IPC real de WebView2 por CDP; no acredita instalación ni interacción nativa nueva.

Resultados: `shared-product-20261002194444440-ef61e75e/sse-publication-results.json`
y `shared-product-20261002194555211-322ec4b5/sse-lifecycle-results.json`, bajo
`.codex-run/`. Los recorridos cerraron sus propios procesos/relays y conservaron
fixtures; no tocaron clipboard Windows ni habilitaron captura/Actions/autoescritura.

Las tres dev propias se relanzaron con ese payload en sus mismos perfiles tras
verificar PID/exe, marker, Settings y CDP. Version `0.5.2` confirmada por IPC:
sender SSE `68472`/9421 y receiver `71196`/9422 live; dev anterior `15064`/9411
offline. Receiver conserva ambas pausas, cero conexiones/receipts y efectos off.
La instalada anterior `51044` se preservó. Son referencias para revalidar, no
permiso ni garantía de actividad futura; plan local en `.codex-run/sse-restart-plan.json`.

Este checkpoint de preparación no incluyó instalación, commit/push ni publicación.
JP autorizó después publicar la RC y actualizar la instalación local; sus resultados
requieren evidencia propia del cierre y no se infieren de este build.
Notas revisables: [v0.5.2-rc.1](../../docs/releases/v0.5.2-rc.1.md).
Stable/latest sigue v0.5.1; proveedor humano, servicio remoto, recovery y dos PCs
no están acreditados. La instalada anterior no prueba este NSIS.

## Aceptación SSE local (2026-10-02)

**S1–S6 cerrados localmente.** Continuación directa solicitada por JP sobre
`main`/HEAD `2b1b954`, con WIP y archivos sin seguimiento preservados. Evidencia
propia de esta continuación, sin instalación, commit/push, deploy ni datos reales.
No es una revisión independiente ni aceptación de un servicio remoto.

- Rust: **70** tests `shared_clipboard::` y **37** `storage::shared::` pasan sobre
  fuentes actuales. Incluyen HTTP/SSE reales, cifrado/DPAPI, burst de veinte,
  replay de publicaciones, pausa/resume sin backfill, dedupe/sin eco, control water
  independiente, `liveOnly`, leases, receipts, claims y fences existentes.
- Bun: **31** tests y **240** assertions pasan: 12 relay/feed y 19 UI. Los dos
  nuevos casos prueban publicación+aviso en la misma transacción, rollback sin
  aviso, respuesta perdida/restart/retry sin duplicar, audiencia con read grant
  vigente, burst y replay revocado que retira heads antiguos.
- Playwright: **10** casos desktop/angosto pasan. Retiro en Settings conserva
  conexión, ID, foco y borradores; bloquea controles/guardado del recurso retirado
  y no registra un intent ni habilita efectos. Build TypeScript/Vite normal pasa.
- Lifecycle shipping: **13 casos por modo** (`catalog-denied` y `events-denied`)
  pasan; son repeticiones de la misma matriz con distinto punto de denial, no
  26 casos distintos. Snapshot retenido ante pausa global o cambio de endpoint
  no restaura config/grants ni avanza cache/cursor de la identidad anterior.
  Cancelación idle observada en 114–116 ms; quit y stream terminan bajo dos
  segundos. Unsupported 404 reconcilia una vez a los 55–59 s; catálogo sin
  control entra en fallback sin abrir SSE. Denied 401/403 revoca grants, cierra
  el stream y no hace fallback/retry automático. Restart recupera rename con
  picker oculto; pausas preservadas, cero conexiones/receipts/opt-ins nuevos.
- Superficies shipping: **8 casos** pasan con ventanas abiertas y ocultas.
  Hidden cache, Library, selector y Settings reciben cambios remotos; mantienen
  búsqueda/foco/selección/dirección/draft. Revoke muestra retiro en ambos diálogos
  y Settings marca la conexión conservada como unavailable. Disconnect explícito
  y Cancel dejan cero conexiones/receipts, sin guardar el borrador de Settings.
- Computer Use de esta continuación: retiro nativo visible en Library,
  selector y Settings; query/dirección/selección conservadas, Connect deshabilitado,
  conexión unavailable y Save channel deshabilitado. El shortcut sin guardar
  `Ctrl+Alt+Y` permanece. Captura/updater/AI y efectos Windows apagados. Las
  imágenes son evidencia de las herramientas, no archivos de screenshot guardados.
- Publicaciones shipping: **10 casos** pasan con relay nuevo y dos perfiles
  nuevos. Hints mínimos no conectan/importan ni avanzan catalog water. Una
  conexión receive explícita admite veinte publicaciones una vez, con leases
  live firmados; pausa/resume omite el rango previo. Ticks entregan durante
  desconexión SSE y reconnect no duplica ni hace eco. Al desconectar quedan las
  22 copias/receipts admitidas por la conexión explícita; cero backfill, Actions
  o opt-ins Windows. No se leyó/escribió el clipboard Windows.
- Build shipping normal `--offline --locked` y reinicio selectivo de los tres
  procesos dev pasan, sobre sus mismos perfiles sintéticos. La instalada anterior
  permanece intacta. `bun run check`: 15 tests/93 assertions, cero errores y dos
  avisos preexistentes. `git diff --check` pasa.

El exe de esta continuación es debug del producto normal, con frontend sin bridge
de test; no acredita un build release/NSIS nuevo. La instalación local documentada
abajo pertenece al corte anterior a SSE.

Defectos resueltos: un 401 de catálogo durante SSE live ahora aborta y espera
el stream antes de marcar denied; se ignora un error tardío de otra identidad.
Settings y el estado de conexión distinguen recursos retirados sin borrar
conexiones, copias o drafts ni permitir guardar configuración del recurso.

### Repros y procedencia

`tests/manual/shared-sse-lifecycle.mjs SOURCE EXE MODE` crea relay y perfiles
nuevos sintéticos, clona sólo schema base/settings saneados del source y aplica
faults loopback internos. MODE: `catalog-denied`, `events-denied` o
`publications`. Provisión, conexiones, publicación, pausa y quit usan IPC real;
la pausa global legacy y cambio de endpoint se inyectan sólo en su fila SQLite
propia, porque no tienen un intent de UI equivalente. `SOURCE` debe tener marker
sintético; `EXE` es el shipping normal, sin bridge mock.

Fixtures de resultados en `.codex-run/` (ignorados; sólo nombres/outcomes en JSON):

| Recorrido | Fixture / resultado |
| --- | --- |
| Denied catálogo, build final | `shared-product-20261002190533140-8edf0774/sse-lifecycle-results.json` |
| Denied SSE, build final | `shared-product-20261002190718006-d0880bf6/sse-lifecycle-results.json` |
| Publicaciones S6, build final | `shared-product-20261002190433295-41feebdb/sse-publication-results.json` |
| Superficies S3–S5, build final | `shared-product-20261002153910298-abc1e877/sse-surfaces-results.json` |

Los fixtures nuevos cierran sus propios procesos/relays al terminar y conservan
archivos. `shared-sse-surfaces.mjs SOURCE` usa CDP 9421/9422 del fixture SSE
original para UI. Sus repeticiones y las del lifecycle no se suman como casos nuevos.

Checks: `bun test tests/shared-clipboard-control.test.mjs
tests/shared-clipboard-events.test.mjs tests/shared-clipboard-ui.test.ts`,
`cargo test --offline --locked --lib shared_clipboard::`,
`cargo test --offline --locked --lib storage::shared::`,
`bunx --no-install playwright test --grep 'shared product' --workers=2`,
`bun run build` y `bun run check`. Tras visuales reconstruir frontend normal
antes de Cargo: el harness visual genera un dist con bridge de test.

### Instancias y entorno al guardar

Build: target `D:/copicu-shared-c1-target`, config `tauri.built-dev.conf.json`,
`RUSTFLAGS=-C link-arg=C:/dev/copicu/src-tauri/target-codex-n1/test-manifest/common-controls-v6.res`.
PATH Windows GNU sin Miniconda; para el binario test existente incluir debug con
`WebView2Loader.dll`. No instalar herramientas ni cambiar flags innecesariamente.

Reinicio selectivo tras verificar executable, marker, perfil, config y CDP;
quitar sólo instancias propias mediante `quit_app` antes de recompilar una DLL
cargada. Referencias finales para **revalidar**, no prueba de actividad futura:

| Instancia | Referencia |
| --- | --- |
| SSE sender | PID `60532`, CDP `9421`, sender-profile del fixture SSE original. |
| SSE receiver | PID `46648`, CDP `9422`, receiver-profile del mismo fixture. |
| Dev previa | PID `64988`, CDP `9411`, sender-profile de `shared-product-20261002124908215-3df65772`; control offline al revalidar, no cliente de esta aceptación. |
| Relay SSE original | Listener loopback `62524`, PID `55136` comprobado; baseline de catálogo, no evidencia del relay S6. |
| Instalada previa | PID `51044`, `AppData/Local/Copicu/copicu.exe`, preservada; no acredita cliente SSE nuevo. |

Los tres debug usan `D:/copicu-shared-c1-target/debug/copicu.exe`; sender/receiver
SSE informan control live al cierre y el receptor conserva ambas pausas, cero
conexiones y cero receipts. Captura/startup/
updater/AI y opt-ins Windows apagados. Revalidar puertos/PIDs/perfiles antes de
continuar; nunca cerrar por nombre todos los copicu ni tocar un perfil habitual.

### Checkpoint previo y límites

Origen anterior: coordinador `01a0fc61-f021-71d2-bb60-6aa28029bf5d`: 29 Bun,
106 Rust, ocho visuales y diez casos shipping, rename nativo en selector/Settings.
Su build/restart acreditaban evidencia del autor; el rebuild propio encontró
la DLL ocupada. Esta continuación sí reconstruyó y reinició sus instancias.
La supervisión anterior quedó `PAUSED` y no se reactivó con esta tarea directa.

SSE conserva ticks de 500 ms para outbox/retención/fallback: no se acreditó una
reducción de polling/idle. Proveedor humano, recovery E2EE, HTTPS/proxies remotos,
dos PCs y condiciones reales de lock/suspend/crash conservan aceptación separada.

## Aceptación instalada ↔ dev (anterior a SSE)

Fecha: 2026-10-02. Origen: JP pidió instalación local y probar con Computer Use
las combinaciones relevantes. Se compiló e instaló el WIP local sobre 0.5.1;
no es un release público. El perfil habitual no se abrió ni se usaron datos reales.

## Resultado y niveles de evidencia

**39 casos pasan entre dos procesos shipping reales**, con SQLite, DPAPI,
firmas/HPKE y relay HTTP local: 27 de conexiones/entrega y 12 de acceso.
La matriz automatizada invoca IPC Tauri desde WebView2 por CDP; no usa bridge
mock y no acredita interacción nativa por sí sola. Los recorridos de abajo
se hicieron además con Computer Use (`@oai/sky`), screenshots y accesibilidad.

| Grupo | Comprobación real instalada ↔ dev |
| --- | --- |
| Direcciones | Las nueve combinaciones send/receive/both; envío inverso instalada → dev; sin eco. |
| Destino | General `all`/`unfiled`, carpeta exacta, exclusión de hijos, solapamiento sin duplicados, segundo receptor rechazado y traslado explícito. |
| Pausas | Cuatro combinaciones de pausa de envío global/recurso; recepción global/recurso; reanudar sin backfill; pausa de recurso persiste al reanudar global. |
| Historial | Leer no importa ni produce receipts; guardar repetido deduplica; texto Unicode y conexión conservados tras reemplazo/reinicio de la instalada. |
| Ráfagas | 20 publicaciones admitidas desde el host, recibidas una vez cada una. |
| Acceso | Recurso privado por persona; rename del owner; aceptar requiere aprobación; lector con historial explícito descifra, pero no publica. |
| Audiencia | Cambio pausa envío; revocación impide leer; rotación conserva historial del owner; eliminación del recurso sintético. |
| Escritor | Invitación sin historial excluye contenido previo; puede publicar; no puede renombrar un recurso ajeno. |

Recorridos **nativos** comprobados:

- Conectar All history desde UI y publicar dev → instalada, conservando `ñ`/emoji.
- Captura nativa en ambas direcciones: Ctrl+C en Notepad, captura/publicación
  automática en dev y recepción única en instalada; luego captura/publicación
  en instalada y recepción única en dev. Se verificó texto exacto Unicode por
  búsqueda del host. Sólo un monitor estaba activo por vez: ambos procesos
  comparten el clipboard físico de esta PC. Captura desactivada al terminar.
- Consultar historial, Copy text y pegar el texto exacto en la pestaña sintética
  de Notepad. El texto real previo del clipboard no se inspeccionó ni se guardó.
- Autoescritura Windows activada: recepción live aplicada y pegado exacto en
  Notepad. Desactivada: otra recepción se guarda sin sustituir ese clipboard.
  El opt-in se preparó por IPC de Settings; el pegado/verificación fue nativo.
- Desde Notepad, los atajos globales abren dev e instalada. Send active y Send
  Windows publican textos diferentes: clip seleccionado versus texto copiado
  desde Notepad. Se verificó contenido autenticado en historial y luego se
  retiraron esos dos atajos de publicación temporales.
- Después de instalar el build final y repetir los 39 casos, publicación manual
  desde instalada → dev: `synthetic-native-final-installed-to-dev-ñ-🙂`, visible
  exactamente en el picker dev mediante Computer Use.

## Correcciones descubiertas y verificación

1. **Empaquetado:** Tauri encontraba los helpers físicos en `src/bin` aunque
   Cargo declarase `autobins = false`. Se movieron a `examples/` y se actualizaron
   targets/wrappers. El NSIS final compila, metadata Cargo sólo tiene el binario
   shipping `copicu` y la instalación no contiene ejecutables `shared*`.
2. **Ráfagas:** un dispatch por poll envejecía leases de textos recién encolados.
   El worker drena FIFO hasta 32 requests, con presupuesto de un segundo para
   iniciar el siguiente; revalida pausa/permisos antes de cada dispatch, sin
   cambiar envelopes ni rejuvenecer leases. Regresión integrada de 20 textos y
   pausa/reanudación pasa; también la ráfaga entre los dos hosts reales.
3. **Estado:** ordenar el resumen global por ordinal de cada canal ocultaba las
   publicaciones de un recurso nuevo tras actividad en otro. Se prioriza outbox
   activa y orden local de inserción; regresión con 105 filas antiguas pasa.
4. **Reinstalación:** NSIS `/S` podía salir con 0 conservando el ejecutable de la
   misma versión. `/S /UPDATE` lo reemplazó. `install:current` ahora añade
   `/UPDATE` cuando ya existe el exe; una instalación inicial conserva `/S`.

Build final: debug y release shipping compilados offline/locked; NSIS local
generado con `--ci --no-sign`. Exe instalado y release: **46.497.256 bytes**,
idénticos salvo los tres bytes del marcador de bundle (`NSS` instalado / `UNK`
en el output de Cargo). No se confió únicamente en el exit code del instalador.

**66 tests Rust shared_clipboard y 36 storage::shared pasan** después de las
correcciones. `cargo check --examples --features shared-clipboard-n1 --offline
--locked` pasa. El script de instalación se verificó por parser PowerShell y
por la ejecución equivalente del instalador; no se ejecutó el wrapper que abre
el perfil habitual. Las demás suites del corte anterior están en
[local-implementation.md](local-implementation.md#corte-de-producto-local-2026-10-02).

Regresiones reproducibles en el repo:

```powershell
# Usar el entorno Windows GNU/manifest de tests/manual/run-rust-tests.ps1.
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib runtime_drains_twenty_publications_without_aging_live_lease_and_respects_pause
cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib summary_does_not_compare_ordinals_from_different_channels
```

## Instancias para revisión local

Fixture privado e ignorado:
`.codex-run/shared-product-20261002124908215-3df65772/`.
Bundles, bearer, keys, SQLite y WebView permanecen allí; no copiar al repo ni
a servicios externos. Resultados sintéticos: `matrix-results.json` (27) y
`access-results.json` (12). Scripts locales `matrix.mjs`/`access.mjs` contienen
las aserciones de esta ronda y conectan exclusivamente a CDP loopback.

| Instancia | Perfil aislado | Ejecutable / acceso |
| --- | --- | --- |
| Dev A | `sender-profile` | `D:/copicu-shared-c1-target/debug/copicu.exe`; Ctrl+Shift+F7; CDP 9411. |
| Instalada B | `receiver-profile` | `%LOCALAPPDATA%/Copicu/copicu.exe`; Ctrl+Shift+F8; CDP 9412. |

Relay propio en `127.0.0.1:52568`. Ambas conexiones generales quedan en `both`
al recurso **Synthetic local clipboard**, sin pausas en ese recurso/equipo.
Captura, startup, updater, AI y autoescritura Windows quedan apagados.
Abrir Shared clipboards, elegir ese recurso, escribir en **Send new text** y
enviar; el texto debe aparecer en All history del otro perfil. Esto permite
revisión sin capturar contenido personal. Las apps conservan sus perfiles al
reiniciar; un launch ordinario desde el acceso directo usa el perfil habitual,
por lo que no sustituye estos procesos preparados.

Además del picker, los atajos de Inbox/Paste next deben ser distintos entre
procesos: el fixture usa Ctrl+Alt+F7/F9 en dev y Ctrl+Alt+F8/F10 en instalada;
pin global/editor externo se dejaron sin atajo. Así actualizar Settings no
falla por intentar registrar los mismos defaults en dos procesos de Windows.
Estado final comprobado por IPC: una conexión general `both` por perfil,
sin pausas, autoescritura/captura/startup/updater/AI falsos y atajos de publicación
temporales nulos.

El exe previo está respaldado dentro del fixture como
`previous-installed-copicu.exe`; el perfil normal permanece intacto. Los procesos
y relays previos ajenos a esta ronda no se terminaron de forma indiscriminada.

## Límites observados

- Dos procesos en el mismo Windows con personas sintéticas no acreditan dos PCs,
  identidad humana, recovery E2EE ni un servicio HTTPS remoto.
- El file picker de enrollment no expuso una ventana inspeccionable en esta
  ronda; Escape canceló el intento. Provisioning se hizo por IPC real de Settings.
- Los intentos de rename rechazados por permisos a través de IPC dejan intents
  recuperables visibles en el fixture receptor. El permiso sí se deniega; la
  presentación/limpieza de esos rechazos definitivos requiere seguimiento.
- Esta ronda no añade prueba nativa de lock/suspend/crash, fallas prolongadas de
  red, latencia ni consumo en idle. La evidencia automática previa de fences,
  respuesta perdida y recovery sigue separada de esos escenarios nativos.
