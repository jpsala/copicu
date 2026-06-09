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

1. Consultar Context7 para documentacion actual de frameworks/librerias.
2. Confirmar detalles criticos con web usando fuentes primarias: docs oficiales, docs.rs, crates.io, GitHub del proyecto, issues relevantes o Microsoft Learn para Win32.
3. Documentar el resultado en un topic especifico.
4. Registrar decisiones durables en `docs/DECISIONS.md`.
5. Linkear la decision o pattern desde la spec correspondiente.

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
