---
title: SQLite y persistencia local
summary: Schema, migraciones, carpetas, historial, blobs y protección de clips marcados frente a retención automática.
keywords:
  - SQLite
  - rusqlite
  - storage
  - persistence
  - database
  - historial
  - folders
  - carpetas
---

# SQLite Storage

Referencias de entrada: [desarrollo](../DEVELOPMENT.md), [spike](../../specs/001-mvp0-native-spike/spec.md), [research](../../specs/001-mvp0-native-spike/research.md) y [carpetas](../../specs/014-folders/spec.md).

Topic para persistencia local, schema, migrations y eleccion de librerias SQLite.

## Necesidad MVP 0

Guardar historial normalizado de texto, buscarlo, recargarlo al reiniciar y limitar el spike a 1000 items.

## Modelo Actual De Carpetas

La migración agrega `folders` y `clipboard_items.folder_id` nullable: `NULL` representa Root y conserva allí las filas preexistentes; no transforma tags, Inbox ni vistas guardadas. El ID de carpeta es estable y la ruta se deriva de sus ancestros. Crear, renombrar, reparentar y borrar validan hermanos y ciclos desde Rust; el borrado de árbol, su destino de clips y los conteos se resuelven en transacción. Los blobs de imágenes borradas se limpian después del commit. La retención automática excluye clips marcados, Inbox y clips en carpetas; mover a Root vuelve a hacerlos elegibles sólo si tampoco son marcados ni Inbox. El destino de captura armado vive en memoria del host, no en SQLite, y la deduplicación global conserva el `folder_id` del clip existente. Contrato: [`014-folders`](../../specs/014-folders/spec.md).

## Retención Del Conjunto Marcado

`is_marked != 0` protege el clip y sus blobs/thumbnail de la limpieza automática por cantidad. Marcados, Inbox y clips en carpetas no consumen el presupuesto de historial ordinario de Root. Count, limpieza de tags, borrado de filas y selección de blobs deben usar la misma regla. Quitar una marca o limpiar todas las marcas no borra clips inmediatamente: recuperan elegibilidad en el próximo pruning salvo otra protección. El borrado explícito sigue permitido. Regresiones: `marked_working_set_survives_count_retention_without_consuming_budget` y `explicitly_deleting_marked_image_removes_both_payload_paths` en `src-tauri/src/storage.rs`; contrato en [`015-persistent-working-set`](../../specs/015-persistent-working-set/spec.md).

## Opciones A Evaluar

| Opcion | Uso posible | Estado |
| --- | --- | --- |
| `rusqlite` | Storage controlado desde Rust native core. | Opcion inicial para MVP 0. |
| `rusqlite_migration` | Migrations simples sobre `rusqlite` usando `PRAGMA user_version`. | Opcion inicial para MVP 0. |
| `tauri-plugin-sql` | SQL expuesto a frontend via plugin. | Descartado para MVP 0; reconsiderar si queremos SQL desde UI. |
| `sqlx` SQLite | Async/query macros. | Probablemente excesivo para MVP 0. |

## Fuentes Consultadas

- Context7: `/websites/rs_rusqlite_rusqlite`, consulta `open SQLite database execute params query user_version Rust example`.
- Context7: `/websites/rs_rusqlite_migration`, consulta `rusqlite migration user_version Migrations example`.
- Context7: `/tauri-apps/tauri-plugin-sql`, consulta `Tauri 2 SQL plugin SQLite migrations setup Rust JavaScript`.
- Docs.rs rusqlite latest: https://docs.rs/crate/rusqlite/latest
- Docs.rs rusqlite features: https://docs.rs/crate/rusqlite/latest/features
- Docs.rs rusqlite_migration: https://docs.rs/rusqlite_migration
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Rusqlite GitHub: https://github.com/rusqlite/rusqlite
- Context7 previo: `/websites/v2_tauri_app`, consulta `SQL plugin sqlite setup Tauri 2`.

## Hallazgos

- `rusqlite` es una API Rust directa para SQLite con `Connection`, `execute`, `prepare`, `query_map` y `params!`.
- `rusqlite` tiene feature `bundled`, util cuando se quiere compilar SQLite junto con la app en vez de depender del SQLite del sistema.
- `rusqlite_migration` usa `PRAGMA user_version` para trackear schema sin crear tablas de migrations, y permite definir migrations como strings Rust.
- Tauri SQL plugin soporta SQLite, MySQL y PostgreSQL via `sqlx`, pero su modelo principal es que el frontend use JavaScript bindings para cargar DB y ejecutar SQL.
- Para Copicu, el historial del clipboard es dato sensible; exponer SQL al frontend no aporta para MVP 0 y aumenta superficie.
- Implementacion inicial 2026-06-05: DB creada en `app_data_dir` como `copicu.sqlite3`; en Windows dev resolvio a `%APPDATA%\dev.jpsala.copicu\copicu.sqlite3`.
- Connection model inicial: `Arc<Mutex<rusqlite::Connection>>` compartido por comandos Tauri y watcher de clipboard. Suficiente para MVP 0; reevaluar si aparece contencion.
- Migration v1 usa `rusqlite_migration` y `PRAGMA user_version = 1`.
- Validacion inicial con texto sintetico: watcher inserto 1 item, query SQLite mostro `item_count=1`, `synthetic_match_count=1`, `user_version=1`; no se imprimio payload.

## Pattern Recomendado Para MVP 0

- Usar `rusqlite` con feature `bundled` como primera opcion.
- Usar `rusqlite_migration` para schema v1 aunque sea una sola migration; evita inventar un mini framework propio.
- Crear DB en app data dir, no en repo. Nombre actual: `copicu.sqlite3`.
- Mantener schema simple:
  - `id`
  - `content_kind`
  - `text`
  - `normalized_hash`
  - `created_at`
  - `last_used_at`
- Agregar indice por `created_at`.
- Agregar indice por `normalized_hash` para dedupe.
- Compartir una connection inicial con `Mutex` y comandos de alto nivel `list_recent_items`/`search_items`.
- Usar `LIKE` para MVP 0; evaluar FTS5 despues si 1000 items no alcanza o busqueda se siente pobre.
- No guardar blobs ni rich formats en MVP 0.

## Riesgos

- No loguear texto real del clipboard.
- Evitar SQL desde frontend si no hace falta.
- Definir temprano path de DB por ambiente para no mezclar datos privados con repo.
- Una sola connection compartida desde varios threads puede exigir `Mutex` o worker de storage; resolver en scaffold segun arquitectura Tauri.
- `rusqlite_migration` usa `user_version`; no tocar ese PRAGMA fuera de migrations.

## Decision Actual

Decision inicial para MVP 0:

- Usar `rusqlite` con feature `bundled`.
- Usar `rusqlite_migration` para migration v1.
- No usar `tauri-plugin-sql` en MVP 0.
- Mantener comandos Tauri de alto nivel: list/search/insert/reuse, no SQL arbitrario desde frontend.

## Preguntas Abiertas

- Validar reload de historial despues de restart real.
- Evaluar FTS5 cuando el picker minimo exista.
