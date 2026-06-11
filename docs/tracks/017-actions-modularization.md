---
id: actions-modularization
status: active
updated: 2026-06-11
---

# Actions Modularization

Trabajo vivo para reducir el tamano y acoplamiento de `src-tauri/src/actions.rs` sin cambiar contratos de scripts, capabilities ni protocolo del runner.

## Estado

Cortes aplicados:

- extraido discovery/parsing de `defineAction({...})` a `src-tauri/src/actions/discovery.rs`;
- extraida normalizacion de shortcuts a `src-tauri/src/actions/shortcuts.rs`;
- extraidos helpers de URL/open-url a `src-tauri/src/actions/url.rs`;
- extraidos helpers de logging de runs, input summary, redaccion de errores y timestamp a `src-tauri/src/actions/logging.rs`;
- extraida validacion de input de acciones a `src-tauri/src/actions/input.rs`;
- `actions.rs` conserva la fachada publica de acciones y cache;
- `actions::normalize_shortcut_string` sigue siendo la API publica usada por `lib.rs`;
- tests de discovery siguen cubiertos desde el modulo `actions`;
- no se cambio shape de `ActionDefinition`, `RunActionRequest`, host API ni capabilities.

## Checks

2026-06-11:

- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions` paso: 14 tests verdes.
- `npm run rust:test` paso: 72 tests verdes, 1 ignored.
- `npm run build` paso.

2026-06-11, corte URL:

- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions` paso: 14 tests verdes.
- `npm run rust:test` paso: 72 tests verdes, 1 ignored.
- `npm run build` paso.

2026-06-11, corte logging:

- `cd src-tauri; cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions` paso: 14 tests verdes.
- `npm run rust:test` paso: 72 tests verdes, 1 ignored.
- `npm run build` paso.

2026-06-11, corte input validation:

- `cd src-tauri; cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions` paso: 14 tests verdes.
- `npm run rust:test` paso: 72 tests verdes, 1 ignored.
- `npm run build` paso.

## Proximos Cortes Posibles

Mantener cortes mecanicos y verificables:

1. Extraer helpers builtin de seleccion/paste/join solo si queda una frontera simple.
2. No mover runtime del Node runner hasta tener un test enfocado que cubra timeout, stdout y errores redacted.

## Reglas

- No cambiar el contrato publico de scripts.
- No agregar capabilities nuevas como parte de modularizacion.
- No mover tests fuera del modulo hasta que haya una frontera estable.
- Correr `cargo test actions` despues de cada extraccion.
