# Implementación local de clipboard compartido

Fecha local: 2026-10-02. JP autorizó implementación y pruebas sintéticas, y luego
instalación local con Computer Use. La prueba vigente instalada ↔ dev y sus
límites están en [local-acceptance.md](local-acceptance.md). Sin publicación,
commit/push, deploy, uso del perfil habitual ni datos laborales. El WIP previo
de carpetas y tags se conserva. Los cortes paralelos anteriores usaron Sol 6.1 high.

## Estado y contrato vigente

Runtime, carpetas, Actions/SDK, UI y host Windows están conectados. El capability
`shared-clipboard` se compila por defecto; sin configuración no crea tablas de
sharing, conecta al relay ni lee clipboard para sharing. Las tablas auxiliares
se inicializan explícitamente al vincular el perfil, fuera de MIGRATIONS.

## Corte de producto local (2026-10-02)

- Catálogo V2 aislado por persona provisionada sintética; recursos propios o
  compartidos autorizados, metadata cifrada y operaciones firmadas idempotentes.
  Intents privados se persisten con temp exclusivo, sync y rename antes de HTTP;
  respuestas perdidas se recuperan tras reopen desde catálogo/operación guardada.
- Invitaciones read/write, aceptación y aprobación HPKE del transcript completo
  de cada equipo; historial anterior requiere permiso separado y paquete de keys.
  Nuevos lectores sin historial requieren epoch nuevo. Revocar cierra grants;
  rotar conserva las claves y firmas históricas autorizadas. Revisión de equipos
  muestra SHA-256 completo, nunca bearer/keys en renderer. No es login humano.
- Carpeta exacta o All history: conexión send/receive/both, un receptor por recurso
  y perfil; mover recepción exige intención explícita. Migración durable preserva
  opt-ins anteriores. General publica ingresos nuevos según `unfiled`/`all`, no
  movimientos ni backfill; solapamiento con carpeta se agrupa por canal.
- Pausas persistentes por equipo/recurso y dirección. Envío bloquea admisión y
  nuevos dispatches; cola anterior se conserva y requests en vuelo retienen su
  resultado real. Recibir se reanuda desde head preparado fuera de locks y commit
  transaccional config/fence/head; revalida identidad, input y generación (incluido
  ABA). La primera publicación posterior al head entra incluso antes del primer
  poll. Fallo de preparación offline conserva la conexión/pausa anterior.
- Consulta histórica independiente, oldest-first y cursor decimal sin pérdida:
  no importa ni cambia delivery. Copiar/guardar son explícitos; guardar deduplica
  sin mover metadata y conserva provenance. Copia autentica nuevamente bajo la
  barrera nativa si cambia el acceso después del fetch. Windows y Actions siguen
  opt-in separados. Nueva audiencia pausa envío para revisión.
- UI desde carpeta/general: búsqueda, crear sólo tras confirmación, estado de
  conexión, administración, historial, publicación manual, pausas, revisión de
  acceso, salida/eliminación y recuperación de intents. Teclado, focus trap y
  ventana angosta comprobados. Preparación técnica sintética queda en Settings
  con su límite visible; no se simula un proveedor humano.
- SDK: destino configurable por Action; `target`/`state` requieren `shared:read`,
  publish mantiene grant exacto. History añade `shared:history:<id>`, request
  acotado y rechazo inmediato si transporte ocupado. Forwarding de un salto con
  ID firmado `forwarded_v1_*`, ramas permitidas y segundo salto rechazado.
- TLS: cliente ring explícito con verifier de plataforma, independiente del
  provider global de Tauri/updater. `rustls-platform-verifier =0.7.0` ya existía
  en lock/cache y ahora es dependencia directa; ningún paquete nuevo ni descarga.

Evidencia del coordinador con datos sintéticos nuevos: **65 shared_clipboard**
(incluye HTTP/Bun/SQLite/DPAPI, dos personas/tres equipos HPKE, respuesta perdida,
historial sin efectos, revocación después de fetch, conexión/resume antes del
primer poll y retención con reportes liquidados), **35 storage::shared**,
**27 Actions**, **8 folders**, **30 metadata**. Filtros solapados: no sumar como
casos distintos. Integraciones multi-poll comparten un lock de tests porque el
transporte shipping es singleton; pruebas puras/storage permanecen paralelas.

**66 Bun / 363 asserts**, **12 Node runner + 2 planner**, **10 Playwright**
desktop/angosto (bridge mock), build TypeScript/Vite y cargo check normal
offline/locked pasan. Screenshots de selector carpeta/general e historial se
inspeccionaron; mocks no acreditan Win32 ni un servicio remoto. Repro Cargo con
el entorno de fixtures descrito abajo; tests nuevos se ejecutan con feature
shipping por defecto, no `shared-clipboard-n1`.

Walkthrough previo a la instalación (procesos/rutas de ese corte, sustituidos
por las [instancias de aceptación](local-acceptance.md#instancias-para-revisión-local)):
build normal `cargo build --offline --locked --bin copicu` con TAURI_CONFIG de
`tauri.built-dev.conf.json` completado; dev reiniciada como PID **35464**, exe en
`D:/copicu-shared-c1-target/debug/copicu.exe`. Perfil nuevo marcado
`.codex-run/shared-product-20261002121715685-8f613680/receiver-profile`, relay propio
loopback **63327**, WebView aislado/CDP local **9338**. El helper de preparación
preexistente sólo desactivó captura/startup/updater/AI; el producto se ejecuta
con features shipping por defecto. Instalada PID **24760** y su ruta preservados.
En ese corte dev y relay quedaron activos; bundles/DB/logs privados
permanecen ignorados y locales, fuera de documentación versionable.

Walkthrough real WebView2/host, sin bridge mock: preview/configure invocados en
la superficie Settings sobre bundle sintético nuevo (no se probó el file picker
nativo); catálogo mostró modo synthetic y captura/updater falsos. UI creó un
recurso propio desde All history en send, publicó texto `synthetic-*` y observó
aceptación; leyó historial sin receipts ni importación. Desde menú de una carpeta
exacta eligió el mismo recurso en both; snapshot confirmó general send + carpeta
both, cero receipts y cero writers Windows. Guardado manual en Root crea una
copia; repetir muestra dedupe. Pausar/reanudar recepción conserva envío pausado;
luego envío se reanuda aparte. No se leyó ni escribió el clipboard real en este
walkthrough. Capturas shipping del selector y el historial se inspeccionaron;
las pruebas Playwright desktop/angosto anteriores siguen siendo mock.

Origen confirmó independientemente 65 Rust sharing, 35 storage y 66 Bun en este
código integrado. Audit documental: cero errores y dos avisos previos de tamaño;
diff whitespace limpio. No son nuevas pruebas nativas de lock/suspend/crash,
latencia ni acceptance de dos PCs. El repro TLS no atribuye retrospectivamente
la captura original a un endpoint/credencial sin evidencia de ese perfil.

## Contrato anterior conservado

- Provisioning local: archivo privado preparado por owner, huella SHA-256 completa
  confirmada y claves/bearer bajo DPAPI current-user. React y scripts reciben
  identidad, policies y estado; nunca semillas, keys ni token. Este método no
  acredita enrollment humano remoto HPKE.
- Carpeta publicadora exacta, incluido Root explícito: captura/creación nueva y
  movimiento efectivo. Sin backfill, herencia a subcarpetas, envío por edits/tags
  ni eco automático de contenido remoto, aunque se mueva después.
- Outbox cifrada y byte-inmutable, FIFO/ordinal, retry idempotente y aceptación
  por servicio distinta de entrega. HTTP acotado fuera del mutex de admisión
  local; error durable visible si una operación local no entra en cola.
- Recepción, guardado en carpeta y escritura Windows independientes. Dedupe
  preserva tags/folder del clip existente. Recuperado/deferred/self no provoca
  autoescritura ni Action automática; copia manual tiene intención durable propia.
- Send active captura el ID seleccionado antes del worker; Send Windows captura
  sequence antes de cold Node y lee texto con ese fence. SDK admite texto
  generado y canal elegido con scopes explícitos. Forward requiere allowlist
  del binding, capacidades source/target y grant de publicación actual.
- Una Action receptora puede transformar/generar texto para Windows con
  `receiveActionWritesClipboard` explícito y capability `clipboard:write`.
  Excluye el writer original y otros canales; admite una salida `writeText`,
  después de éxito del runner y revalidación de lease/sequence/policy. No
  `writeItem`, paste, foco ni mutación de historial en recepción. El hash de
  salida transformada conserva provenance antes del intento nativo.
- Writer Windows en child propio con pipes privados, Job object, timeout 2 s,
  sequence actual, desktop desbloqueado, deadlines wall/monotónico, marker y
  ledger de procedencia. No paste/foco. Pausa/configuración comparten barrier
  con el writer; claim/interrupción incierta no se repite automáticamente.
- Retención cada 60 s, incluso pausado: expira queued y elimina payloads
  terminales; receipts acotados por TTL/100 con protección de claims/reportes
  pendientes. Conserva origen, ordinal, high-water, IDs y provenance. Metadata
  y tombstones pueden crecer; no se promete secure-delete de SQLite.

## Evidencia del corte 2026-10-01

Comprobaciones locales con datos nuevos/sintéticos:

- 52 tests `shared_clipboard`, incluido runtime real HTTP/Bun/SQLite/DPAPI,
  hooks de carpeta, dedupe/tags, claims, pausa/recovery y prune con origen durable.
- 34 tests `storage::shared`; 27 Actions y regresiones focalizadas de carpetas y
  metadata. Bun: relay/UI/foldermodel/metadata; UI final 19 tests/58 assertions. Node: runner/
  planner. Los filtros se solapan; no sumar conteos como pruebas distintas.
- Playwright: Sharing y feed en desktop y ventana angosta, errores, policies y
  preview inmutable. Son pruebas con bridge mock, separadas de Windows real.
- Build TypeScript/Vite y app/bin sintético offline/locked. Audit documental sin
  errores, dos avisos previos. No installer, release ni recursos remotos.
- Smoke Windows con Computer Use y app compilada sobre perfil receptor nuevo:
  vinculación simulada por UI, recepción live guardada y pegada en Notepad con
  token exacto; pausa/resume guarda recovery y conserva texto Windows anterior;
  copia manual pega recovery. Hotkeys activos desde Notepad enviaron clip A del
  picker y texto B de Windows como publicaciones distintas; lector Rust del
  peer autentica/descifra ambos. Receipt/outbox metadata confirma resultados.
- Settings puede consultar carpetas sin permiso de mutación; el smoke nativo
  cubre esa frontera que los mocks no acreditaban.
- Smoke final de Action receptora: script local sintético elegido en Settings,
  permiso explícito y writer original apagado; llegada nueva guarda texto
  original y pega exactamente la salida con sufijo `-transformed` en Notepad.
  Receipt registra Action y clipboard `applied`. Playwright final: cuatro
  recorridos Settings/Action writer desktop y angosto pasan.

## Repro y frontera de fixtures

`bun tests/manual/shared-product-fixture.mjs` crea relay loopback y directorios
nuevos con markers bajo `.codex-run`. Su stdout entrega sólo rutas/metadata;
los bundles privados permanecen ahí. Mantener stdin abierto y enviar `stop` al
cerrar. No copiar bundles/logs/DB a servicios externos.

`shared-clipboard-product` requiere `shared-clipboard-n1` además del capability
y acepta únicamente perfiles propios marcados. `--prepare-profile PROFILE BUNDLE`
desactiva captura/updater/AI/startup; `--publish PROFILE BUNDLE synthetic-text`
restringe publicaciones al sender nuevo; `--inspect` devuelve metadata y
`--read-relay` descifra exclusivamente texto prefijado synthetic- sin poll/recovery
del executor de la app. No es una CLI administrativa del producto instalado.

Conservar PATH sin Miniconda sólo en shell hijo,
`CARGO_TARGET_DIR=D:/copicu-shared-c1-target` y RUSTFLAGS exacto
`-C link-arg=C:\dev\copicu\src-tauri\target-codex-n1\test-manifest\common-controls-v6.res`.
Usar Cargo `--offline --locked`, filtros `shared_clipboard`,
`storage::shared`, `actions`, `folders` y `metadata`, seriales en el target.
Para app dev con frontend compilado, `TAURI_CONFIG` toma
`src-tauri/tauri.built-dev.conf.json`; `COPICU_APP_DATA_DIR`, scripts y WebView
apuntan al fixture nuevo. Nunca `install:current`/`release:install` para este smoke.

## Gates todavía abiertos

Servicio privado desplegado, DNS/HTTPS/costos, proveedor y enrollment humano,
recuperación E2EE e invitaciones entre cuentas remotas, retención remota y
aceptación en dos PCs siguen pendientes. Revocación/rotación desde controles
locales sintéticos sí están implementadas; no sustituyen esos gates.
No cerrar SC de latencia remota, veinte eventos reales, lock/suspend ni crash de
executor por pruebas locales/puras. Las matrices previas de Sandbox pertenecen
al harness N1, no a este smoke shipping.

## Dependencias autorizadas e incorporadas

Versiones/features contrastados con fuentes primarias; rustc local 1.89 satisface MSRV 1.85 de las tres nuevas crates criptográficas. Transporte conserva reqwest/rustls ya transitivos en el lock, evitando otro provider TLS por defaults. Las crates conservan features mínimos. El capability se compila por defecto; la actividad de sharing requiere configuración explícita.

Comandos exactos ejecutados desde `C:/dev/copicu` tras la aprobación:

```powershell
cargo add --manifest-path src-tauri/Cargo.toml chacha20poly1305@=0.11.0 --no-default-features --features alloc,zeroize --optional
cargo add --manifest-path src-tauri/Cargo.toml ed25519-dalek@=3.0.0 --no-default-features --features fast,zeroize --optional
cargo add --manifest-path src-tauri/Cargo.toml hpke@=0.14.1 --no-default-features --features alloc,x25519,chacha --optional
cargo add --manifest-path src-tauri/Cargo.toml reqwest@=0.13.4 --no-default-features --features json,blocking,rustls-no-provider --optional
cargo add --manifest-path src-tauri/Cargo.toml rustls@=0.23.40 --no-default-features --features ring,std,tls12 --optional
```

- Alcance/cambios: Cargo.toml/Cargo.lock y cache Cargo del usuario; descarga desde crates.io de librerías y transitivas requeridas, sin CLIs/herramientas globales ni software de sistema. Cargo puede ejecutar build scripts de dependencias al verificar/compilar.
- Motivo: cifrado AEAD de publicaciones, identidad firmada/verificación estricta, transferencia de keys mediante HPKE RFC 9180 y cliente HTTPS con provider ring explícito. BCryptGenRandom nativo ya disponible para CSPRNG; revisar adapter HPKE rand_core y manejo de fallos antes de usarlo. No agregar otra dependencia RNG por reflejo.
- Riesgos: grafo/lock/MSRV/features y build scripts transitivos; cobertura histórica de auditorías no equivale a auditoría del protocolo ni de estas versiones. HPKE no declara auditoría pagada y cita revisión histórica de 0.8. Mantener flags mínimos, verificar vectores conocidos y tamper/weak keys/context swap/replay/epoch, sin etiquetar la composición Copicu como auditada.
- Alternativa sin instalación: completar D1-A/fixtures persistentes con dependencias actuales y conservar C1/T1/wiring como pendientes. Nunca implementar cifrado casero para eludir el gate.
- Rollback: snapshot local/diff antes de resolver; retirar únicamente entradas/features y cambios propios del lock, preservando todo WIP anterior. La cache Cargo añadida puede permanecer; no borrarla globalmente ni usar git reset/clean. No efectos sobre producto instalado, servicios, credenciales o recursos remotos.

Fuentes: [chacha20poly1305 0.11.0](https://docs.rs/crate/chacha20poly1305/0.11.0/features) (MIT/Apache-2.0), [ed25519-dalek 3.0.0](https://docs.rs/crate/ed25519-dalek/3.0.0/features) (BSD-3-Clause), [HPKE 0.14.1](https://docs.rs/crate/hpke/0.14.1/features) y [README](https://github.com/rozbb/rust-hpke) (MIT/Apache-2.0), [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180), [reqwest 0.13.4](https://docs.rs/crate/reqwest/0.13.4/features), [rustls 0.23.40](https://docs.rs/crate/rustls/0.23.40/features). No enviar fuentes privadas ni secrets a servicios externos para esta revisión.
