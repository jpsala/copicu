---
title: Investigación técnica y elección de librerías
summary: Contrastar patrones locales y fuentes primarias antes de decidir dependencias, documentando razones sin fijar tools del harness.
keywords:
  - librerias
  - library choice
  - dependencies
  - Context7
  - web research
  - investigacion tecnica
---

# Technical Research Process

Antes de elegir o implementar una libreria para una necesidad tecnica importante, hacer una pasada corta de investigacion y dejarla documentada.

## Regla

Para cada necesidad del MVP o arquitectura:

1. Ubicar ejemplos concretos, APIs y patrones ya usados en el código.
2. Verificar detalles cambiantes con fuentes primarias: documentación oficial, repositorios, issues relevantes o referencias de plataforma.
3. Documentar el resultado en un topic especifico.
4. Conservar la decisión durable y sus razones en ese topic, sin duplicarla en un registro global; incertidumbres del tema allí y pendientes de ejecución en el track.
5. Linkear la decisión o pattern desde la spec correspondiente cuando el encargo autorice actualizarla.

El harness aporta tools y agentes disponibles; esta regla no obliga a OMP, Context7 ni un browser concreto. Las fuentes y conclusiones pertenecen al proyecto cuando afectan arquitectura, dependencias o roadmap. Instalar herramientas requiere autorización actual; si evidencia externa contradice el repo, presentar ambas y consultar a JP antes de decidir.

`.omp/commands/research.md` documenta un recurso opt-in del entorno legado. No instalarlo ni llamarlo comando disponible por leer esta referencia; el procedimiento manual no lo requiere.

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

Si el topic crece, consultar por encabezados/secciones antes de dividir. Mantener `docs/topics/` plano, sin subcarpetas ni logs de investigación; detalle histórico o profundo útil a `docs/reference/` con enlace desde su fuente.

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

## Referencias

[Reglas locales](../ASSISTANT_RULES.md), [desarrollo](../DEVELOPMENT.md) y `specs/` en la raíz del repo. No ejecutar producto ni instalar dependencias por una revisión documental.
