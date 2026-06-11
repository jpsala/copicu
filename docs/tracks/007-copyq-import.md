---
id: 007-copyq-import
status: imported
updated: 2026-06-05
---

# 007 CopyQ Import

Investigacion para importar datos existentes de CopyQ desde `C:\tools\copyq` hacia Copicu.

## Resultado Corto

Si, se puede importar.

Import real ejecutado el 2026-06-05 contra `C:\tools\copyq`, sin imprimir payloads. Resultado final en `C:\Users\jpsal\AppData\Roaming\dev.jpsala.copicu\copicu.sqlite3`:

- 1071 items totales en Copicu.
- 941 items `text`.
- 130 items `image`.
- 116 items con tag originado desde tabs CopyQ.
- Settings actualizados a `history.retentionCount = 0` (`0` significa ilimitado).

La fuente completa no es `C:\tools\copyq\data\copyq_data.db`; esa base es un mirror parcial creado por un script previo. La fuente completa esta en la instancia viva de CopyQ y sus archivos nativos:

- CLI: `C:\tools\copyq\copyq.exe`
- Config/data nativa: `C:\tools\copyq\config\copyq\copyq_tab_<base64>.dat`
- Data path para payloads grandes si aplica: normalmente `items\` en portable, o lo que devuelva `info('data')` en versiones nuevas.
- Mirror parcial existente: `C:\tools\copyq\data\`

Los `.dat` y los exports de CopyQ no son SQLite. El source de CopyQ muestra serializacion binaria con `QDataStream`, `QVariantMap`, headers `CopyQ v2/v4/v5`, version Qt stream `Qt_4_7`/`Qt_5_15`, MIME comprimidos y soporte de referencias `FILE:<mime>` a payloads grandes. Parsearlo desde Rust implicaria reimplementar internals Qt y tracking de versiones/encryption. Para Copicu conviene importar usando la API publica de CopyQ (`tab`, `size`, `read`) y tratar los `.dat`/`exportData` solo como backup o fallback.

## Tabs Detectados

El CLI `copyq.exe tab` lista:

```text
&clipboard
pass
save
temp
context
work
IRC
0
25-04-06
nde
images
test
test2
```

Conteos observados por `tab(name); size()`:

| Tab | Items |
| --- | ---: |
| `&clipboard` | 800 |
| `pass` | 52 |
| `save` | 10 |
| `temp` | 0 |
| `context` | 4 |
| `work` | 0 |
| `IRC` | 1 |
| `0` | 0 |
| `25-04-06` | 1 |
| `nde` | 1 |
| `images` | 0 |
| `test` | 18 |
| `test2` | 27 |

No se imprimio contenido de items durante la investigacion.

## Formats Observados

CopyQ expone formatos por item con:

```powershell
copyq.exe tab <tab> read ? <row>
```

Ejemplos de formats observados:

- `text/plain`
- `text/html`
- `image/png`
- `application/x-copyq-item-notes`
- `application/x-copyq-itemsync-basename`
- `application/x-copyq-itemsync-mime-to-extension-map`
- `application/x-copyq-itemsync-sync-path`

La API oficial relevante:

- `tab()` lista tabs.
- `tab(tabName)` cambia el tab actual del script.
- `size()` / `count()` devuelve cantidad de items del tab actual.
- `read("?", row)` lista MIME types del item.
- `read(mimeType, row)` lee bytes/texto de un formato.
- `pack`/`unpack` serializan/deserializan `application/x-copyq-item`, util para inspeccionar item completo si hace falta.
- `exportTab(fileName)` y `exportData(fileName)` existen, pero producen formatos binarios CopyQ; no depender de parsearlos para el primer importador.

Referencias:

- Scripting API: https://copyq-docs.readthedocs.io/en/latest/scripting-api.html
- Backup/export/import: https://copyq.readthedocs.io/en/latest/backup.html
- Source `serialize.cpp`: https://github.com/hluk/CopyQ/blob/master/src/item/serialize.cpp
- Source `mainwindow.cpp`: https://github.com/hluk/CopyQ/blob/master/src/gui/mainwindow.cpp

## Mapping Recomendado

No implementar tabs CopyQ-style como entidad primaria. Importar a un historial unico con metadata:

- Tab `&clipboard` => item normal, sin tag de tab obligatorio.
- Otros tabs => tag normalizado con formato `#<tab>`.
- Notas CopyQ (`application/x-copyq-item-notes`) => `notes`.
- `text/plain` => `text`, `mime_primary = text/plain`.
- `text/html` => guardar como texto HTML en el primer corte o esperar a `clipboard_item_formats` para copy-back fiel.
- `image/png` => blob PNG principal usando el storage actual de imagenes.

Para el primer corte, tags como string alcanzan porque `clipboard_items.tags` ya existe. Futuro recomendado: migrar a tags normalizados cuando se implementen smart collections.

## Importador Recomendado

Crear un comando/script local de importacion, no una UI primero. No parsear `.dat`:

```text
importCopyQ({
  copyqExe: "C:\\tools\\copyq\\copyq.exe",
  includeClipboardTab: true,
  includeTabs: "all",
  tagNonClipboardTabs: true,
  dryRun: true
})
```

Pipeline:

1. Pausar watcher o ignorar self-writes durante la importacion.
2. Listar tabs por CLI.
3. Para cada tab, usar `tab(tabName); size()`.
4. Para cada row, leer solo formats disponibles con `read("?", row)`.
5. Leer payloads soportados:
   - `text/plain`
   - `text/html`
   - `image/png`
   - `application/x-copyq-item-notes`
6. Construir `normalized_hash` por contenido principal + tab opcional segun politica de dedupe.
7. Insertar en SQLite con timestamps aproximados.
8. Escribir PNGs como blobs.
9. Mostrar resumen: items vistos, importados, omitidos, duplicados, errores por tab.

Para binarios, llamar a CopyQ y capturar stdout como bytes. Evitar convertir `image/png` a string. Para `text/plain`, `text/html` y notas, convertir UTF-8.

Si queremos item completo para debug sin payload visible, se puede pedir `read(mimeItems, row)` y `unpack(...)` dentro de CopyQ, pero el importador no necesita eso para los formatos iniciales.

## Dedupe

Decision pendiente:

- Si dos tabs tienen el mismo contenido, importar una sola fila con multiples tags.
- Alternativa mas simple para primer corte: permitir duplicados entre tabs y dedupe solo dentro del mismo tab/hash.

Recomendacion: primer corte permite duplicados entre tabs para no perder estructura. Luego se puede normalizar a multi-tag.

## Timestamps

El CLI no expone claramente created-at para cada row. Opciones:

1. Usar orden de row y asignar timestamps decrecientes desde `now`.
2. Si el item tiene sync metadata con basename/path, parsear `copyq_YYYYMMDDHHMMSSmmm` cuando exista.
3. Leer `.dat` nativo solo si necesitamos fidelidad historica exacta y aceptamos escribir un parser Qt-stream o helper C++.

Recomendacion: parsear timestamp desde sync basename si existe; si no, usar orden estable del tab.

## Riesgos

- Tabs con nombres sensibles: no imprimir payloads ni logs con contenido.
- `pass` puede contener secretos; importarlo debe requerir confirmacion explicita o modo dry-run visible.
- HTML copy-back fiel necesita tabla de formatos crudos; hoy Copicu no tiene `clipboard_item_formats`.
- PNG importado necesita thumbnail o al menos preview via blob principal.
- CopyQ corriendo puede cambiar durante el import; conviene snapshot/dry-run y luego import real rapido.

## Proximo Corte

Antes de implementar:

1. Crear spec `specs/004-copyq-import/`.
2. Agregar API de storage para insertar item importado con metadata/timestamp/blobs.
3. Implementar dry-run CLI/Tauri command que no imprime payload.
4. Ejecutar dry-run contra `C:\tools\copyq`.
5. Importar primero un subset no sensible, por ejemplo `save` o `test`.
