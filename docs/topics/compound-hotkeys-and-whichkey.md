---
id: compound-hotkeys-and-whichkey
status: active
kind: decision-map
triggers:
  - hotkeys compuestos
  - hotkey sequence
  - key sequence
  - chord
  - whichkey
  - which key
primary_refs:
  - global-shortcut-and-tray.md
  - tag-management-hotkeys.md
  - ../tracks/012-tags-and-hotkeys.md
  - ../../specs/006-tags-and-hotkeys/spec.md
---

# Compound Hotkeys And WhichKey

Topic para el motor de hotkeys compuestos y el menu tipo WhichKey. Esto es distinto del caso de uso de tags: tags consume el motor, pero el motor tambien debe servir para scripts, comandos y acciones futuras.

## Entendimiento

JP quiere hotkeys del estilo:

```text
Alt+Space, J
```

Es decir: se presiona una combinacion global inicial, despues una segunda tecla decide la accion. Si el usuario demora despues del prefijo, Copicu muestra un menu tipo WhichKey con las opciones posibles.

## Research 2026-06-08

Fuentes consultadas:

- Context7 `/websites/v2_tauri_app`: `global shortcut plugin register Shortcut accelerator syntax Rust`.
- Tauri Global Shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Tauri JS global shortcut reference: https://v2.tauri.app/reference/javascript/global-shortcut/
- `tauri_plugin_global_shortcut` docs.rs: https://docs.rs/tauri-plugin-global-shortcut/latest/tauri_plugin_global_shortcut/
- `global-hotkey` docs.rs: https://docs.rs/global-hotkey/latest/global_hotkey/hotkey/index.html
- TanStack Hotkeys sequence guide: https://tanstack.com/hotkeys/latest/docs/framework/react/guides/sequences

Hallazgos:

- `tauri-plugin-global-shortcut` registra shortcuts globales y soporta API Rust y JS.
- La API oficial registra una combinacion tipo `CommandOrControl+Shift+C` y entrega eventos `Pressed`/`Released`.
- El crate Rust reexporta el modelo de `global-hotkey`.
- `global-hotkey` define un hotkey como modificadores opcionales mas una sola tecla fisica (`Code`).
- La sintaxis parser exige que los modificadores aparezcan antes de la tecla no-modificadora.
- No hay soporte nativo en Tauri/global-hotkey para una secuencia global multi-paso como `Alt+Space` seguido de `J`.
- Librerias frontend como TanStack Hotkeys si soportan sequences con timeout, modifiers por paso, ignorar modifier-only keydowns y metadatos, pero funcionan sobre eventos del webview; no capturan teclas globales mientras otra app tiene el foco.

## Decision Recomendada

Implementar el motor compuesto a mano, usando Tauri/global-shortcut solo como prefijo global.

Pattern:

1. Registrar globalmente solo prefijos/chords iniciales con `tauri-plugin-global-shortcut`.
2. Al recibir el prefijo en Rust:
   - recordar ventana previa;
   - entrar en estado `SequencePending`;
   - abrir/focus de una ventana propia liviana de command palette/whichkey o un modo del picker;
   - empezar timers de reveal y timeout.
3. Capturar las teclas siguientes dentro de la ventana Copicu, porque una vez abierto el UI el foco ya esta en Copicu.
4. Resolver la accion contra un trie/registry de secuencias.
5. Si no hay match o vence el timeout, cerrar/resetear sin tocar clipboard.

Esto evita hooks de teclado global crudos para todos los keydown. Si mas adelante se quiere que las teclas posteriores sean capturadas sin mostrar ni enfocar Copicu, eso ya es otro spike nativo Windows/macOS/Linux con riesgos de permisos y hooks.

## Modelo Conceptual

```ts
type HotkeyStep = {
  modifiers: string[];
  key: string;
};

type HotkeySequence = {
  id: string;
  scope: "globalPrefix" | "local";
  steps: HotkeyStep[];
  title: string;
  group?: string;
  route: ShortcutRoute;
};
```

Ejemplos:

```text
Alt+Space, J       -> open picker with tag or command J
Alt+Space, T, W    -> open tag work
Alt+Space, S       -> run script selector
```

## WhichKey Behavior

Timers iniciales recomendados:

- `revealDelayMs`: 250-450 ms despues del prefijo o del ultimo paso incompleto.
- `stepTimeoutMs`: 1200-2000 ms para completar el siguiente paso.
- `dismissOnEscape`: true.
- `dismissOnBlur`: true, salvo que el usuario haya pineado el menu.

UI:

- ventana compacta, always-on-top, keyboard-first;
- lista de proximas teclas validas para el prefijo actual;
- agrupar por tags/scripts/comandos;
- no explicar features ni mostrar texto promocional;
- soportar fuzzy filter solo si no interfiere con la captura de la siguiente tecla.

## Registry

Unificar picker, tags, scripts y comandos en un registry comun:

```text
ShortcutRoute
  PickerOpen
  TagOpen(slug)
  ScriptRun(action_id)
  Command(command_id)
```

Diagnosticos:

- prefijo global invalido;
- prefijo global ocupado por otra app;
- secuencia duplicada bajo el mismo prefijo;
- secuencia ambigua donde una accion es prefijo de otra;
- conflicto con shortcut local del picker;
- accion no disponible por capability o input requerido.

Regla propuesta: permitir ambiguedad solo si hay timeout/Enter explicito para ejecutar el match corto. Para primer corte, rechazar ambiguedades y mantener secuencias simples.

## Preguntas Abiertas

- Prefijo default inicial: `Alt+Space` puede chocar con el menu de ventana del sistema en Windows. Conviene validarlo manualmente antes de fijarlo.
- La UI WhichKey debe ser una ventana dedicada o reutilizar command palette/picker.
- Las secuencias deben configurarse por texto (`Alt+Space, J`) o con recorder visual desde el primer slice.
- Cuanto tiempo esperar antes de mostrar WhichKey sin que se sienta lento.
