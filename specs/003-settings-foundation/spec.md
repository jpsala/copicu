# Settings Foundation

## Estado

Draft implementable. Primer corte para dejar de agregar constantes sueltas.

## Objetivo

Crear una superficie de settings completa en concepto, pero chica en implementacion inicial:

- settings typed con defaults versionados;
- persistencia local validada por Rust;
- UI searchable dentro de la app;
- export futura sin depender de React como fuente de verdad;
- espacio para settings declarados por actions/plugins.

## No Objetivos Del Primer Corte

- Runtime completo de profiles.
- Editor JSON avanzado.
- Import/export visual.
- Hot-reload completo de global shortcuts.
- Settings de plugins reales antes de tener actions/plugins.

## Persistencia

Usar SQLite como fuente de verdad inicial:

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at_unix_ms INTEGER NOT NULL
);
```

Razones:

- ya existe SQLite inicial y migraciones;
- las validaciones quedan en Rust;
- permite settings y estado local en una misma backup futura;
- evita un archivo paralelo antes de disenar profiles/portable mode.

El formato exportable futuro sera JSON, generado desde la API host.

## Schema Inicial

```ts
type AppSettings = {
  schemaVersion: 1;
  general: {
    globalShortcut: string;
  };
  picker: {
    hideOnFocusLost: boolean;
    enterAction: "copy" | "paste";
  };
  history: {
    retentionCount: number;
  };
  appearance: {
    theme: "system" | "light" | "dark";
  };
  scripts: {
    folderPath: string;
  };
};
```

Defaults:

- `general.globalShortcut`: `Ctrl+Shift+,`
- `picker.hideOnFocusLost`: `true`
- `picker.enterAction`: `copy`
- `history.retentionCount`: `1000`
- `appearance.theme`: `system`
- `scripts.folderPath`: `Documents/Copicu/Scripts`

## Validacion

Rust valida todo update:

- `schemaVersion` debe ser `1`;
- `globalShortcut` no puede estar vacio;
- `enterAction` solo `copy` o `paste`;
- `theme` solo `system`, `light` o `dark`;
- `retentionCount` entre `100` y `100000`.
- `scripts.folderPath` no puede estar vacio.

Valores desconocidos no entran en el schema typed. Cuando haya plugins, sus settings viviran bajo claves separadas y con schema propio.

## API Host

Comandos Tauri:

```ts
get_settings(): AppSettings
update_settings(settings: AppSettings): AppSettings
```

`update_settings` devuelve el settings normalizado persistido.

## UI

Primer corte:

- boton de settings en la barra de busqueda;
- panel modal liviano;
- search interno sobre labels/descripciones/secciones;
- controles concretos para los defaults;
- texto tecnico minimo: solo labels y hints necesarios.

La pantalla principal sigue siendo el picker util, no una landing ni preferencias gigantes.

## Wiring Inicial

- `theme` aplica en frontend con `data-theme`.
- `enterAction` decide si `Enter` copia o pega; `Shift+Enter` usa la alternativa.
- `hideOnFocusLost` se consulta en backend antes de ocultar por blur.
- `retentionCount` reemplaza el limite hardcodeado de pruning.
- `globalShortcut` queda persistido y visible; hot reload queda para el siguiente corte.
- `scripts.folderPath` queda persistido y visible; file watching/runtime queda para Actions And Scripting.

## Futuro

- Per-profile settings: normal/private/debug/portable.
- `settings.export` y `settings.import`.
- Declaracion de settings por action/plugin.
- Global shortcut editable con unregister/register.
- Advanced/debug como seccion searchable, no como pantalla separada.
