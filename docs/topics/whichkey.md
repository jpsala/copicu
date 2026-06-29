---
id: whichkey
status: active
kind: decision-map
triggers:
  - whichkey
  - which key
  - menu de hotkeys
  - cheat sheet
  - shortcut menu
primary_refs:
  - hotkeys.md
  - ui-surface-architecture.md
  - ../tracks/012-tags-and-hotkeys.md
  - ../../specs/006-tags-and-hotkeys/spec.md
---

# WhichKey

Topic para la superficie visual tipo WhichKey: un menu keyboard-first que muestra las teclas posibles para el prefijo o contexto actual.

## Separacion Del Motor

WhichKey no es el motor de hotkeys compuestos.

El motor decide:

```text
prefix pendiente -> opciones validas -> match -> ruta
```

WhichKey muestra:

```text
opciones validas para el prefijo actual
```

Por lo tanto:

- hotkeys compuestos deben funcionar sin WhichKey;
- WhichKey puede observar una secuencia pendiente;
- WhichKey tambien puede abrirse explicitamente por un hotkey simple o compuesto.

## Modos De Apertura

1. Automatico por pausa:
   - usuario pulsa un prefijo compuesto;
   - si no completa la siguiente tecla antes de `revealDelayMs`, aparece WhichKey.
2. Asignado a hotkey:
   - usuario asigna un hotkey simple o compuesto a `WhichKeyOpen(prefix)`;
   - ejemplo: `Ctrl+Alt+C, ?` muestra todas las opciones bajo `Ctrl+Alt+C`.
3. Contextual futuro:
   - desde picker, command palette, tags o scripts, mostrar comandos disponibles para el contexto actual.

## Quick Actions Dentro Del Picker

Actualizacion 2026-06-29: se agrego un primer slice seguro como overlay dentro de `main`, no como ventana secundaria WhichKey. `Ctrl+Alt+Q` abre **Quick Actions** cuando el search del picker tiene foco; `Alt+Q` se descarto porque Windows/dev reporto `HotKey already registered` y `Ctrl+Shift+Q` porque mutea en el entorno de JP. La lista se calcula desde el registry de actions/scripts y muestra solo acciones compatibles con el contexto actual:

- seleccion activa o multiple;
- `kinds`/MIME compatibles;
- diagnostics sin errores;
- capabilities soportadas;
- triggers declarados en prioridad `localShortcut` -> `itemMenu` -> `commandPalette`.

El overlay permite buscar, ejecutar con Enter o pulsar `1`-`9` para las primeras acciones. Esto reduce la necesidad de asignar un shortcut global/local a cada script y evita por ahora el problema abierto de composicion de la ventana secundaria `whichkey`.

## UI Recomendada

- Ventana compacta dedicada o modo dedicado de una superficie existente.
- Always-on-top mientras esta activa.
- No promocional; solo comandos y teclas.
- Agrupar por dominio:
  - picker;
  - tags;
  - scripts;
  - commands;
  - settings/debug si aplica.
- Mostrar tecla, label corto y estado si hay diagnostico.
- Escape cierra.
- Blur cierra, salvo modo pineado futuro.

## Timers Iniciales

- `revealDelayMs`: 300 ms.
- `stepTimeoutMs`: 1500 ms.
- `dismissAfterExecute`: true.
- `dismissOnEscape`: true.
- `dismissOnBlur`: true.

Los valores deben vivir como settings o constantes faciles de cambiar. En el primer corte pueden ser constantes.

## Relacion Con Foco

Primer corte:

- WhichKey aparece despues de que Copicu tomo foco por el prefijo global.
- No intentar mostrar WhichKey sin foco ni capturar globalmente teclas posteriores.
- En el flujo actual, `Ctrl+Alt+C` no debe mostrar `main`; debe mostrar una superficie WhichKey dedicada o una alternativa visual que no sea el picker principal.

Razon:

- evita hooks globales permanentes;
- reduce superficie OS-specific;
- mantiene control sobre Escape/timeout;
- preserva paste-to-previous-window usando el tracker de foco previo existente.

## Datos Que Necesita

```ts
type WhichKeyEntry = {
  key: string;
  label: string;
  group: string;
  routeId: string;
  disabled: boolean;
  diagnostic?: string;
};

type WhichKeyState = {
  prefix: string;
  entries: WhichKeyEntry[];
  expiresAtUnixMs: number;
};
```

No debe incluir payload de clipboard.

## Proximo Corte

Despues del parser/registry de hotkeys:

- crear estado visible de WhichKey desde el registry;
- renderizar una lista compacta para un prefijo sintetico;
- cerrar por Escape/timeout;
- agregar smoke visual para que no se rompa en ancho chico.

## Estado Actual 2026-06-08

Contrato estable:

- WhichKey observa `get_compound_hotkey_pending`.
- Rust no emite eventos pending hacia el WebView principal.
- No se registran next-step globals temporales.
- El renderer captura el segundo paso con `document keydown`.
- `get_compound_hotkey_pending` expone `entries` con `key`, `label`, `group`, `routeId`, `disabled`, `diagnostic` y `expiresAtUnixMs`.

Surface intentada:

- Ventana Tauri secundaria label `whichkey`, titulo `Copicu WhichKey`.
- Size objetivo: 440x260.
- Posicion actual: centrada horizontalmente y cerca del borde inferior del monitor activo.
- `Ctrl+Alt+C` debe listar solo `Copicu WhichKey` como ventana visible de Copicu, no `Copicu`.

Aprendizaje:

- La ventana principal no es buen baseline tecnico para una secundaria creada en caliente: `main` ya esta cargada al mostrarse; WhichKey no.
- Un refresh de actions al cargar renderers puede ocurrir durante el pending. Ese refresh no debe limpiar `CompoundShortcutRuntime.pending`.
- Logs `whichkey-sync pending=Ctrl+Alt+C entries=2` prueban que el estado y el IPC estan disponibles aunque la captura visual salga negra.
- La ausencia de segunda pagina en CDP no prueba por si sola que WhichKey no cargo; los logs de renderer por label son la fuente primaria.
- `CustomWindowFrame` compartido puede introducir variables/layout/chrome no necesarios para una utility; para aislar problemas conviene probar surface minima.

Problema abierto:

```text
WhichKey HWND visible y estable
+ renderer label=whichkey vivo
+ whichkey-sync pending=Ctrl+Alt+C entries=2
+ captura visual negra/sin contenido
= problema probable de composicion/render de ventana secundaria WebView2/Tauri
```

No cerrar WhichKey hasta resolver ese render o elegir explicitamente otra superficie, por ejemplo overlay dentro de `main` con `main` oculto/no picker, o una ventana HTML/host dedicada mas simple.

Checklist de diagnostico:

- `list_apps` debe mostrar `Copicu WhichKey` y no `Copicu`.
- Screenshot debe mostrar contenido, no solo fondo.
- Logs deben incluir `module-load label=whichkey`.
- Logs deben incluir `whichkey-sync pending=<prefix> entries=<n>`.
- No debe aparecer `pending cleared` ni `pending expired` antes del timeout real.
- `T` debe ejecutar `jp.compoundHotkeyToast` y cerrar WhichKey.
