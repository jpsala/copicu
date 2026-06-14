# Computer Use battery for Copicu

Bateria manual/repetible para validar el tool `copicu_computer_use` contra Copicu real. A diferencia de `npm run dogfood:battery`, esta bateria se ejecuta desde el agente llamando directamente las acciones del tool.

## Precondiciones

- Copicu debe estar corriendo en la sesion interactiva de Windows.
- Hotkey dev esperada: `Ctrl+Shift+.`.
- Target preferido para la ventana visible: `Copicu ahk_class Tauri Window`.
- Si aparecen dialogs `.ahk` residuales, limpiar con:

```powershell
Get-Process AutoHotkey64 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
```

## Secuencia completa

1. `self_test` con target `Copicu`.
   - Esperado: `AHK_OK` y ventana `Copicu` listada si el picker esta visible.
   - Nota: `uia_find(Edit)` puede fallar; UIA no es confiable dentro del WebView/Session 0.
2. `open_picker`.
   - Esperado: envia `Ctrl+Shift+.` y muestra/oculta picker.
3. `windows`.
   - Esperado: lista `Copicu` con clase `Tauri Window`.
4. `focus` con `Copicu ahk_class Tauri Window`.
   - Esperado: no error y acciones siguientes impactan Copicu.
5. `window_info` con `Copicu ahk_class Tauri Window`.
   - Esperado: titulo `Copicu`, clase `Tauri Window`, proceso `copicu.exe`, controles WebView.
6. `read` con `Copicu ahk_class Tauri Window`.
   - Esperado: texto Win32 basico (`TAURI_DRAG_RESIZE_WINDOW`, `Chrome Legacy Window`).
7. `screenshot` con `Copicu ahk_class Tauri Window`.
   - Esperado: PNG legible de picker/WebView.
8. `send` + `type`.
   - Secuencia recomendada: focus, `^a{Backspace}`, type `json-fixture`.
   - Esperado: search input contiene `json-fixture`, lista muestra `1 / 6 matches`.
9. `click` sobre menu `...` de item.
   - Esperado: menu de acciones visible (`Activate`, `Paste`, `Open URL`, `Edit`, etc. segun item).
10. `send` navegacion.
    - Recomendado: `{Escape}`, `^a{Backspace}`, type otro fixture, `{Down}{Up}`.
    - Esperado: seleccion visual se mantiene/navega sin crashear.
11. `uia_find` / `uia_tree`.
    - Esperado actual: puede devolver `[Error] Window not found`. Registrar como limitacion conocida, no bloquear la bateria mientras AHK/screenshot funcionen.
12. `open_picker` final para ocultar si quedo visible.

## Ultima corrida directa

Fecha: 2026-06-14.

Resultados:

- `self_test`: PASS parcial. AHK OK; windows ve escritorio; UIA falla como limitacion conocida.
- `open_picker`: PASS. Mostro y oculto picker con `Ctrl+Shift+.`.
- `windows`: PASS. Detecto `Copicu` / `Tauri Window` pid `35008`.
- `focus`: PASS. Target `Copicu ahk_class Tauri Window` usable.
- `window_info`: PASS. Titulo/clase/proceso/controles correctos.
- `read`: PASS limitado. Lee controles Win32, no DOM interno.
- `screenshot`: PASS. Evidencia guardada en `.codex-run/computer-use/battery-01-open.png`.
- `type`: PASS. `url-fixture` filtro a `1 / 6 matches`; evidencia `.codex-run/computer-use/battery-02-type-url.png`.
- `click`: PASS. Menu de item abierto; evidencia `.codex-run/computer-use/battery-03-click-menu.png`.
- `send`: PASS. `json-fixture` filtro a `1 / 6 matches`; evidencia `.codex-run/computer-use/battery-05-json-nav.png`.
- `uia_find`: FAIL esperado/known limitation: `Window not found`.

## Hallazgos importantes

- El tool debe ejecutarse en sesion interactiva. Desde Session 0 no puede tomar foco ni registrar hotkeys.
- Para Copicu, UIA no debe ser la fuente primaria: usar `windows`, `focus`, `send`, `type`, `click`, `screenshot`.
- Algunos `focus`/`send`/`type` pueden devolver salida vacia aunque el efecto ocurra; verificar con screenshot cuando importe.
- Target estable: `Copicu ahk_class Tauri Window`; target solo `Copicu` puede confundirse con otras ventanas que contienen Copicu en el titulo.

## Evidencia de screenshots

- `.codex-run/computer-use/battery-01-open.png`
- `.codex-run/computer-use/battery-02-type-url.png`
- `.codex-run/computer-use/battery-03-click-menu.png`
- `.codex-run/computer-use/battery-04-after-enter.png`
- `.codex-run/computer-use/battery-05-json-nav.png`
