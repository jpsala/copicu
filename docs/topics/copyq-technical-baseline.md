---
id: copyq-technical-baseline
status: active
kind: reference
triggers:
  - CopyQ
  - copyq
  - copy-q
  - copycube
  - baseline
  - paridad
  - como lo hace CopyQ
  - enter item
  - paste selected item
primary_refs:
  - ../reference/copyq-feature-inventory.md
  - ../topics/picker-interaction.md
  - ../topics/windows-focus-and-paste.md
---

# CopyQ Technical Baseline

CopyQ es el baseline tecnico principal para dudas de comportamiento. Copicu no busca ser compatible ni copiar feature-for-feature, pero cuando un flujo de clipboard no sea obvio o falle, conviene mirar como lo resuelve CopyQ antes de inventar.

## Regla De Uso

Cuando haya duda sobre una accion de clipboard/picker/paste:

1. Consultar primero este topic.
2. Abrir el archivo fuente CopyQ puntual listado abajo.
3. Documentar solo el pattern durable que aplica a Copicu.
4. No copiar arquitectura completa Qt/CopyQ si el scope MVP no lo necesita.

## Fuentes Principales

Repo:

- https://github.com/hluk/CopyQ

Docs:

- Keyboard: https://copyq-docs.readthedocs.io/en/latest/keyboard.html
- FAQ: https://copyq.readthedocs.io/en/stable/faq.html
- Scripting API: https://copyq.readthedocs.io/en/latest/scripting-api.html
- Source overview: https://copyq-docs.readthedocs.io/en/latest/source-code-overview.html

Archivos fuente utiles:

- `src/gui/mainwindow.cpp`: acciones principales de UI, activacion de item, close/hide, foco y paste orchestration.
- `src/gui/clipboardbrowser.cpp`: lista de items, seleccion, navegacion, copia de uno/multiples items.
- `src/platform/win/winplatformwindow.cpp`: foco y paste en Windows (`SetForegroundWindow`, `AttachThreadInput`, `SendInput`).
- `src/platform/x11/x11platformwindow.cpp`: foco/paste en X11.
- `src/platform/mac/macplatformwindow.mm`: foco/paste en macOS.
- `src/common/appconfig.h`: defaults y knobs de comportamiento.
- `src/scriptable/scriptable.cpp` y `src/scriptable/scriptableproxy.cpp`: API scripting y funciones `copy()`/`paste()`.

## Enter En Un Item

Comportamiento observado/documentado:

- `Enter`/`Return` activa el item seleccionado.
- Activar un item primero lo copia al clipboard.
- Si hay un solo item seleccionado, copia el item completo con todos sus formatos.
- Si hay multiples items seleccionados, copia texto concatenado.
- Despues, segun settings, puede:
  - mover el item arriba;
  - cerrar/ocultar la ventana principal;
  - enfocar la ultima ventana;
  - pegar en la ventana previa.
- Para pegar, CopyQ manda un atajo de paste al target. Por defecto usa `Shift+Insert`; puede usar `Ctrl+V` por regla/regex de titulo de ventana.

Pattern interno importante:

```text
activate selected item
  -> copy selected item payload to clipboard
  -> maybe move selected item to top
  -> maybe hide main window
  -> maybe focus previous window
  -> maybe send paste shortcut
```

## Windows Focus/Paste Pattern

CopyQ en Windows:

- guarda una referencia a la ventana previa;
- al pegar, intenta levantarla con `SetForegroundWindow`;
- usa `AttachThreadInput` como workaround cuando el foreground thread no coincide;
- espera delays configurables antes/despues de enfocar;
- espera a que el usuario suelte modifiers (`Ctrl`, `Shift`, `Alt`, `Win`) antes de inyectar paste;
- usa `SendInput` para enviar `Shift+Insert` o `Ctrl+V`.

Esto confirma que paste-to-previous-window no debe acoplarse a `Enter` directamente: debe ser una accion opcional montada sobre una primitiva de `activate item`.

## Implicacion Para Arquitectura De Copicu

Las acciones del picker deben existir como API del host, no solo como handlers de React.

Primitivas esperadas:

- `clipboard.writeItem(itemId, mode)`: escribe payload del item al clipboard.
- `history.markUsed(itemId)`: actualiza uso/orden sin depender de UI.
- `picker.hide(reason)`: oculta ventana por accion, escape o focus-lost.
- `window.focusPrevious(targetHint)`: restaura foco previo cuando exista.
- `input.sendPasteShortcut(strategy)`: envia `Shift+Insert` por defecto o `Ctrl+V` por regla.
- `picker.activateItem(itemId, options)`: orquesta copy/hide/focus/paste.

Estas primitivas deben ser invocables por:

- UI React/Tauri commands;
- shortcuts globales;
- tray/menu;
- plugins personales JavaScript/TypeScript cuando exista runtime.

La API debe aceptar opciones explicitas en vez de inferir todo de la UI:

```text
activateItem({
  itemId,
  copy: true,
  hidePicker: true,
  focusPrevious: false,
  paste: false,
  pasteShortcut: "default"
})
```

Para MVP 0, `Enter` puede mapear a `copy=true`, `hidePicker=true`, `paste=false`. El siguiente corte debe agregar self-write suppression antes de habilitar `paste=true`.

## Notas

- No persistir ni documentar payload real al estudiar CopyQ o probar Copicu.
- Si CopyQ esta corriendo durante pruebas de Copicu, puede reaccionar al clipboard y robar foco; cerrarlo antes de validar.
- Usar CopyQ como baseline de comportamiento, no como contrato de compatibilidad.
