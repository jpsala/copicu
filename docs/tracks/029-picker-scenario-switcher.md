---
id: picker-scenario-switcher
status: implementation-validated
updated: 2026-07-29
execution_route: balanced
related:
  - docs/tracks/028-active-scenarios-metadata.md
  - docs/topics/picker-interaction.md
---

# 029 Picker Scenario Switcher

## Objetivo

Hacer que crear, activar, cambiar y detener scenarios ocurra desde el picker, sin exigir pasar por Settings en el flujo cotidiano.

## Comportamiento Observable

- El picker ofrece un trigger compacto de scenarios junto al query; abre un switcher buscable con recientes, estado activo, `Stop`, acceso a administración y navegación completa por teclado.
- El trigger muestra claramente el scenario activo y permite switch atómico. `Alt+S` abre el switcher y escribir `> escenario <nombre>` en el query ofrece la misma activación como acción; al elegirla, el comando desaparece y queda el query real de la view.
- `Crear desde la búsqueda actual` abre un formulario breve con nombre, `client`, `project`, `activity` y tags; guarda una view vinculada de forma transparente y ofrece `Guardar y activar`.
- Settings permanece como editor avanzado, mientras captura, dedupe, suppressions, provenance y duración de sesión conservan el comportamiento validado en `028`.

## Límites Explícitos

- Un solo corte sobre el picker y los comandos existentes; sin rediseñar Settings, el lenguaje general de búsqueda ni la arquitectura de scenarios.
- El prefijo `>` ejecuta acciones y no se persiste como filtro; sin activación automática por contenido, hotkey global por scenario ni restauración entre procesos.
- Sin nuevas properties, sidebar, onboarding, importación, sincronización ni administración masiva.

## Criterios De Terminado

1. Crear y activar un scenario desde el query actual requiere un flujo breve dentro del picker y no una visita previa a Settings.
2. Mouse y teclado permiten buscar, activar, cambiar y detener; siempre hay como máximo una sesión y su estado es inequívoco también en picker angosto.
3. `> escenario` activa desde el query sin dejar sintaxis residual, y el scenario creado aplica la metadata ya validada por `028`.
4. Settings continúa editando los mismos scenarios sin duplicar entidades ni divergir del switcher.

## Resultado

Implementado y validado en un corte: trigger compacto, switcher buscable y keyboard-first, `Alt+S`, activación `> escenario`, Stop, acceso a Settings y creación desde el query mediante una transacción atómica de view vinculada + scenario.

## Refinamiento UX

El editor de Settings trata cada scenario como un workspace simple: nombre, query editable y tags opcionales. La saved view vinculada queda como detalle interno compatible; `client`, `project` y `activity` permanecen disponibles bajo `Advanced metadata`. Edit reemplaza la lista con una pantalla dedicada y vuelve explícito que la query controla lo visible, mientras tags/metadata solo se aplican a nuevas capturas. Al crear desde una búsqueda, los filtros positivos `tag:x` y `#x` se precargan como tags automáticos; exclusiones y filtros no-tag no se copian.

## Evidencia

- Playwright desktop+narrow: switch, create/edit/activate/stop, `Alt+S` y `> escenario` pasaron.
- Rust focal: creación y actualización atómicas de scenario + view vinculada, incluido rollback ante query inválido.
- `npm run build` pasó; smoke nativo confirmó navegación directa, lista simplificada y editor dedicado.
