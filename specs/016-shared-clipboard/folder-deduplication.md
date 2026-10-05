# Duplicados por carpeta y recepción visible

Decisión de JP, 2026-10-04: implementar copias independientes entre carpetas y
deduplicación dentro de cada destino. Sustituye la unicidad global y la regla de
conservar exclusivamente el clip de otra carpeta al recibir contenido repetido.

## Contrato

- La identidad local es un ítem; contenido igual puede existir en carpetas
  distintas, incluido Root. Dentro de una carpeta hay como máximo un ítem por
  contenido normalizado. All history muestra las copias independientes.
- Captura, creación manual, copia a carpeta y guardado de publicaciones buscan
  duplicados sólo en el destino. Editar título, notas, tags o texto de una copia
  no modifica las demás. Las imágenes pueden compartir blobs inmutables; borrar
  una copia no elimina un blob todavía referenciado.
- Recibir contenido nuevo crea el ítem en la carpeta conectada. Recibirlo otra
  vez reutiliza el ítem de esa carpeta, conserva sus metadatos y registra actividad
  de recepción. El orden por recientes incluye esa actividad; otros órdenes,
  selección y foco se conservan. No se simula una copia de Windows.
- El resultado de recepción distingue «guardado en carpeta» y «ya estaba en
  carpeta, recibido nuevamente». Debe verse junto a la conexión y en recepciones,
  persistir al reabrir y no depender exclusivamente de un toast.
- Copiar a carpeta conserva el original y reutiliza un duplicado del destino sin
  sobrescribir sus metadatos. Mover conserva su significado. Si un movimiento o
  borrado de carpeta con traslado a Root colisiona con otro ítem, se rechaza toda
  la operación con feedback: no fusionar ni borrar metadatos silenciosamente.
- Recepciones/importaciones/copia de origen remoto no producen eco. Conectar no
  importa retrospectivamente publicaciones ni reubica las recepciones previas.
- La migración preserva IDs, ubicaciones, metadatos, receipts y contenido; cambia
  índices y añade actividad de recepción. No ejecutarla sobre el perfil instalado
  durante desarrollo ni instalar/publicar sin pedido actual de JP.

## Verificación

Usar perfiles sintéticos: migración del esquema anterior, Root y carpetas,
captura de texto/imagen, copias y ediciones independientes, colisiones atómicas,
blobs compartidos, recepción nueva/repetida, ausencia de eco, orden reciente frente
a otros órdenes, replay idempotente, feedback y flujo de teclado en ambos tamaños.

Validación local del 2026-10-04:

- `cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --lib`:
  401 pasan, 1 benchmark omitido; incluye integración con relay cifrado sintético,
  recepción repetida, copia emisora y procedencia migrada sin eco.
- `cargo check --manifest-path src-tauri/Cargo.toml --offline --locked`:
  host Windows y nuevo comando Tauri válidos.
- `npm run build`: TypeScript/Vite válidos y frontend normal regenerado.
- Playwright, filtro `folder copy|folder reception|shared clipboard|shared product|shared folder selector`:
  48 pasan en desktop y ventana angosta; screenshots inspeccionados, foco/selección
  preservados y feedback visible después de reabrir.
- `bun test tests/shared-clipboard-ui.test.ts tests/folder-model.test.ts`: 31 pasan.
  `bun run check`: 0 errores documentales y 15 pruebas pasan. `git diff --check` válido.

Alcance: fuente local y perfiles sintéticos. No se migró el perfil instalado ni se
publicó este cambio; falta aceptación física entre las dos PCs con el nuevo corte.
