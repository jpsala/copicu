---
id: rich-mime-research
status: pending
priority: 5
updated: 2026-06-05
---

# Rich MIME Research

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
