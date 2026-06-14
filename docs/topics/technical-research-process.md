---
id: technical-research-process
status: active
kind: how-to
triggers:
  - librerias
  - library choice
  - dependencies
  - Context7
  - web research
  - investigacion tecnica
primary_refs:
  - docs/ASSISTANT_RULES.md
  - docs/DEVELOPMENT.md
  - specs/
---

# Technical Research Process

Antes de elegir o implementar una libreria para una necesidad tecnica importante, hacer una pasada corta de investigacion y dejarla documentada.

## Regla

Para cada necesidad del MVP o arquitectura:

1. Usar `code_search` para ejemplos concretos, API references y patrones de uso cuando la pregunta sea de programacion o librerias.
2. Usar `web_search`/`fetch_content` para confirmar detalles criticos con fuentes primarias: docs oficiales, docs.rs, crates.io, GitHub del proyecto, issues relevantes o Microsoft Learn para Win32.
3. Usar la skill `librarian` cuando haya que entender internals de una libreria OSS, cambios historicos, commits, blame o comportamiento respaldado por lineas exactas de codigo.
4. Documentar el resultado en un topic especifico.
5. Registrar decisiones durables en `docs/DECISIONS.md`.
6. Linkear la decision o pattern desde la spec correspondiente.

`pi-web-access` y la skill `librarian` son herramientas de research; no reemplazan el criterio del proyecto ni las fuentes durables. Si el hallazgo afecta arquitectura, privacidad, dependencias o roadmap, promoverlo a topic, decision o spec.

## Que Cuenta Como Necesidad Tecnica

- Clipboard access y monitoring.
- Global shortcuts.
- Tray y lifecycle de ventana.
- SQLite/storage.
- Focus previous window.
- Paste/input injection.
- UI stack y librerias frontend.
- Virtualizacion/search/indexing.
- Imagenes, HTML, RTF o formatos ricos.

## Forma Recomendada Del Topic

Usar un topic por area:

```text
docs/topics/clipboard.md
docs/topics/global-shortcut-and-tray.md
docs/topics/sqlite-storage.md
docs/topics/windows-focus-and-paste.md
```

Si el topic crece, agregar subdocumentos de referencia o research log bajo `docs/topics/<area>/` y dejar el topic principal como indice.

## Secciones Minimas

- Necesidad.
- Opciones evaluadas.
- Fuentes consultadas.
- Pattern recomendado para este proyecto.
- Riesgos.
- Decision actual.
- Preguntas abiertas.

## Criterio

La investigacion debe ser suficiente para evitar elegir librerias por memoria o intuicion. No necesita convertirse en paper: tiene que dejar claro por que una opcion se adopta, se descarta o queda pendiente.
