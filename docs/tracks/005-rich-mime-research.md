---
title: Investigación de formatos rich MIME
status: paused
summary: Investigación propuesta de HTML, RTF, listas de archivos y formatos custom sin fidelidad CopyQ asumida.
last_worked: null
next: Acotar un formato rich y muestras sintéticas por app, documentar decisión y spec antes de tocar storage.
topics: [clipboard, copyq-technical-baseline, sqlite-storage]
---

# Rich MIME Research

**Importación OS2:** no hay UTC acreditada del trabajo registrado; `null` mantiene la incertidumbre, no inventa una fecha. Metadata original:

```yaml
id: rich-mime-research
status: pending
priority: 5
updated: 2026-06-05
```

Pausado como investigación pendiente, no implementada por esta importación. Preservar muestras sintéticas y gates de datos antes de cualquier ejecución autorizada.

Investigar preservación rich MIME antes de implementar HTML/RTF/file-list/custom formats.

## Decisión

Lo queremos investigar. No queremos implementar fidelidad CopyQ completa a ciegas.

## Preguntas

- Qué formatos aparecen en nuestro uso diario.
- Qué formatos vale la pena preservar para copy-back fiel.
- Qué formatos solo sirven para metadata/search.
- Cómo evitar inflar SQLite.
- Qué va inline y qué va a blob.
- Cómo previsualizar HTML de forma segura.
- Cómo copiar de vuelta múltiples MIME types.

## Modelo Candidato

Tabla futura:

```text
clipboard_item_formats
  item_id
  mime
  storage_kind: inline | blob
  blob_path
  text_preview
  byte_size
  hash
  is_primary
  preservation_policy
```

## Formatos A Estudiar

- `text/plain`
- `text/html`
- RTF
- image formats already normalized to PNG
- file-list / uri-list
- Windows custom formats
- browser/editor formats

## Done Cuando

- Hay captura de muestras sintéticas por app/formato sin payload real.
- Hay decisión de primer rich format a implementar.
- Hay spec antes de tocar storage durable.
