---
id: saved-views-scenarios-independent-model
status: implementation-validated
updated: 2026-07-30
execution_route: strong
related:
  - docs/tracks/028-active-scenarios-metadata.md
  - docs/tracks/029-picker-scenario-switcher.md
  - docs/tracks/031-saved-history-views-ux-followup.md
  - specs/009-saved-history-views/spec.md
---

# 032 Saved Views And Scenarios Independent Model

## Objetivo

Conservar Saved Views y Scenarios como conceptos públicos distintos, haciendo que cada Scenario sea propietario de su query sin crear o depender de una Saved View visible.

## Comportamiento Observable

- Saved Views siguen siendo filtros nombrados pasivos; Scenarios siguen siendo sesiones activas que filtran y aplican metadata a capturas nuevas.
- Crear o editar un Scenario no crea, renombra ni modifica entradas en Saved Views.
- Editar o borrar una Saved View no cambia un Scenario, y activar, cambiar o detener Scenarios conserva el comportamiento ya validado.
- Los Scenarios existentes conservan su query al adoptar el modelo independiente; sus Saved Views históricas permanecen como definiciones normales y no se borran.

## Límites Explícitos

- Sin fusionar ambos conceptos, rediseñar picker o Settings, ni ampliar metadata, sesiones o lenguaje de búsqueda.
- La migración local de SQLite copia la query vigente a cada Scenario y preserva todas las filas existentes; no elimina datos ni realiza efectos externos.
- Sin cambiar que Saved Views persisten como definiciones y que una sesión activa de Scenario no se restaura al reiniciar.

## Criterios De Terminado

1. Crear y editar Scenarios no altera la lista ni las definiciones de Saved Views.
2. Saved Views y Scenarios pueden modificarse o eliminarse independientemente sin perder sus queries.
3. Activar, cambiar y detener un Scenario sigue filtrando el picker y aplicando exclusivamente su metadata durante la sesión activa.

## Checks Focales Mínimos

- Tests Rust focales de migración, persistencia independiente y ausencia de efectos cruzados al crear, editar o borrar.
- Playwright focal de gestión separada y del flujo Scenario activate/switch/stop en desktop y narrow.
- `npm run build` y `cargo check` con target aislado.

## Resultado

- SQLite migra cada query histórica al Scenario y conserva intactas las Saved Views existentes.
- CRUD, contratos y activación usan la query propia del Scenario sin leer ni escribir Saved Views.
- El picker abre Views y Scenarios con el mismo patrón de menú compacto; ambos guardan la búsqueda actual desde allí y conservan diálogos de creación dedicados.
- Validado con tests Rust focales, Playwright desktop/narrow, build frontend y `cargo check` aislado.
