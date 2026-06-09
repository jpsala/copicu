---
id: ui-host-custom-surface
status: first-slice-implemented
priority: 4
updated: 2026-06-06
---

# UI Host Custom Surface

Crear una superficie propia para UI auxiliar de Copicu: notificaciones custom, prompts y elementos interactivos que scripts o la app necesiten mostrar fuera del picker principal.

Este trabajo reemplaza la idea de seguir puliendo ad hoc la ventana `notifications`. La dirección correcta es una ventana deliberada `ui-host`, con contrato estable, request/response IDs y permisos Tauri explícitos.

## Objetivo

Permitir que scripts y host app muestren UI controlada por Copicu:

- toast custom con ubicación, stack, tema, duración y acciones;
- notificaciones visuales con formato propio para clips, código, URLs, imágenes y estados;
- confirm rico con botones y copy claro;
- input prompt para scripts;
- futuros menús/HUDs ligeros.

## Decisión

Usar dos capas:

- `ui.notify`: OS-native notification, ya disponible como fallback/background simple con `@tauri-apps/plugin-notification`.
- `ui-host`: WebView propia de Copicu para control fino de ubicación, formato, elementos, posiciones, motion y respuesta del usuario.

No depender de OS notifications cuando se necesite inspección visual, acciones, layout propio o consistencia.

## Research Base

Fuentes oficiales consultadas:

- Tauri `WebviewWindow`: permite ventanas independientes y APIs como `setAlwaysOnTop`.
  - https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/
- Tauri Core Permissions: Tauri 2 requiere capabilities explícitas para `show`, `hide`, `set_size`, `set_position`, `set_always_on_top`, etc.
  - https://v2.tauri.app/reference/acl/core-permissions/
- Tauri Positioner: posiciones conocidas y tray-relative placement, útil como helper opcional.
  - https://v2.tauri.app/ja/plugin/positioner/
- Tauri Notification: OS notifications son útiles, pero en Windows dev tienen poco control y pueden mostrar nombre/icono de PowerShell.
  - https://v2.tauri.app/es/plugin/notification/

## Producto Y Diseño

Registro: product UI. Debe sentirse como herramienta local rápida, discreta y precisa.

Principios:

- No landing, no decoración, no hero, no marketing.
- Densidad controlada: contenido útil, poco texto explicativo.
- Una sola familia tipográfica: seguir tokens actuales (`Aptos`, `Segoe UI`, `system-ui`).
- Tema usando Appearance vigente: `theme` (`system | light | dark`) + `themeId` desde `src/themeCatalog.ts`; `src/styles.css` queda como fallback/layout, no como fuente de presets.
- Motion 150-250 ms, solo para estado: entrada, salida, stack shift, focus.
- Respetar `prefers-reduced-motion`.
- No cards anidadas ni sombras decorativas grandes.
- Iconos solo cuando clarifican acción o estado.
- Texto nunca debe overflowear en ventanas angostas o payloads largos.

## Arquitectura Recomendada

Ventana:

- label: `ui-host`;
- transparente;
- undecorated;
- initially hidden;
- always-on-top;
- skip taskbar;
- resizable false para toast mode;
- focus false para toasts no interactivos si Tauri/Windows lo permite sin romper clicks;
- tamaño calculado por Rust o por UI con command `set_size`;
- posición por monitor/work area y placement pedido.

Permisos:

- crear capability dedicada para `ui-host`;
- declarar sólo permisos necesarios:
  - window show/hide;
  - set size;
  - set position;
  - set always-on-top si se usa desde frontend;
  - event listen/emit si aplica;
  - comandos propios de respuesta UI.
- No meter permisos amplios por comodidad.

Contrato de eventos/comandos:

```ts
type UiHostRequest =
  | {
      id: string;
      kind: "toast";
      title?: string;
      body: string;
      tone?: "info" | "success" | "warning" | "danger";
      durationMs?: number;
      placement?: UiPlacement;
      actions?: UiHostAction[];
    }
  | {
      id: string;
      kind: "confirm";
      title: string;
      body: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  | {
      id: string;
      kind: "input";
      title: string;
      body?: string;
      placeholder?: string;
      defaultValue?: string;
      submitLabel?: string;
      cancelLabel?: string;
    };

type UiPlacement =
  | "topRight"
  | "bottomRight"
  | "topLeft"
  | "bottomLeft"
  | "center"
  | "nearTray"
  | "nearCursor"
  | { monitor?: "active" | "primary"; x: number; y: number };
```

Request lifecycle:

1. Script llama `copicu.ui.confirm/input/toast`.
2. Runner manda host call con payload redacted.
3. Rust crea `requestId`, guarda pending request y emite evento a `ui-host`.
4. `ui-host` renderiza y responde con command/event:
   - confirm: `true | false`;
   - input: `string | null`;
   - toast: action id o dismissed.
5. Rust resuelve el host call y el script continúa.
6. Timeout/cancel limpia pending request.

Para toasts no interactivos, se puede permitir fire-and-forget sin bloquear script.

## Primer Slice Propuesto

1. Crear ventana `ui-host` en Rust, hidden, transparent, undecorated, always-on-top, skip-taskbar.
2. Crear capability dedicada para `ui-host` con permisos mínimos.
3. Reemplazar lógica ad hoc de `notifications` sólo para un nuevo camino `ui.host.toast`; no borrar todavía la ventana vieja hasta validar.
4. Agregar store Rust de pending UI requests.
5. Implementar eventos:
   - `copicu://ui-host/request`;
   - command `resolve_ui_host_request`.
6. Implementar `copicu.ui.toast` hacia `ui-host` cuando venga de background/global scripts.
7. Implementar `copicu.ui.confirm` con request/response ID.
8. Implementar `copicu.ui.input` después de confirm.
9. Tests:
   - unit para request lifecycle;
   - visual desktop/narrow para stack toast y prompt;
   - Playwright screenshot de `ui-host` aislado con payloads sintéticos largos.

## Implementado 2026-06-06

- Ventana `ui-host` creada desde Rust:
  - hidden;
  - transparent;
  - undecorated;
  - always-on-top;
  - skip-taskbar;
  - resizable false;
  - tamaño según prompt confirm/input.
- Capability Tauri actualizada para incluir `ui-host`.
- Store Rust de pending requests con IDs `ui-*`, `mpsc` one-shot y timeout de 120s.
- Evento hacia frontend: `copicu://ui-host/request`.
- Comando frontend -> Rust: `resolve_ui_host_request`.
- Bridge scripts implementado:
  - `copicu.ui.confirm(options)` -> `boolean`;
  - `copicu.ui.input(options)` -> `string | null`.
- Frontend `UiHostApp` renderiza confirm/input, enfoca input, permite submit con Enter y cancela con Escape.
- Visual checks cubren `ui-host` compacto y dark mode con payload sintético.

No implementado todavía:

- Toast custom global sobre `ui-host`.
- `ui.alert`.
- Placement avanzado (`nearTray`, `nearCursor`, monitor activo) y stack de toasts.
- Dogfood real de scripts con prompts en app viva.
- Migracion visual del toast stack heredado a wrappers/tokens Mantine.

## No Hacer En El Primer Slice

- No seguir puliendo la ventana `notifications` de forma ad hoc; si se toca, migrar internamente a wrappers/tokens y mantener posicionamiento por ventana Tauri.
- No meter notificaciones OS como UX principal si se necesita control visual.
- No implementar acciones complejas en notificaciones antes de cerrar request/response.
- No capturar payload real del clipboard en tests o docs.
- No depender de índices visibles; todo request debe usar IDs estables.
- No usar modal dentro del picker principal para prompts de scripts background.

## Riesgos

- Windows/WebView2 puede tener bordes, foco o z-order raros en ventanas transparentes.
- Always-on-top puede interferir con paste-to-previous-window si se usa mal.
- `focus false` y click handling pueden variar por plataforma.
- DPI/multi-monitor requiere medir work area real, no asumir 1920x1080.
- Permisos Tauri por ventana pueden fallar en runtime si falta una capability.
- Prompts interactivos necesitan resolver durante la ejecución, no al final como los efectos actuales.

## Criterios De Aceptación

- Un script puede mostrar un toast custom desde `clipboardChange` sin abrir el picker principal.
- El toast respeta placement, tema, duración, stack y texto largo sin overflow.
- Un script puede llamar `copicu.ui.confirm` y continuar según respuesta.
- Un script puede llamar `copicu.ui.input` y recibir `string | null`.
- Los requests tienen IDs únicos, cleanup por timeout/cancel y logs redacted.
- Visual checks cubren desktop y ventana angosta.
- `ui.notify` nativo sigue disponible como fallback simple.

## Prompt Para Próxima Sesión

```text
Estamos en c:\dev\chat\copyq-tauri. Leer AGENTS.md y docs iniciales.

Continuar Actions/Scripting UI auxiliar con el active work:

docs/active-work/009-ui-host-custom-surface.md
docs/active-work/004-actions-scripting.md
docs/topics/actions-and-scripting-api.md
specs/004-actions-scripting-api/spec.md
docs/WORKING_MEMORY.md

Objetivo: implementar primer slice de ui-host propio para UI auxiliar controlada por Copicu.

Dirección:
- No seguir puliendo la ventana ad hoc notifications.
- ui.notify nativo queda como fallback/background simple.
- UI custom propia = ventana ui-host.
- Implementar request/response IDs para confirm/input.
- Toast custom puede ser fire-and-forget, pero debe usar el mismo ui-host.
- Mantener privacidad: payloads sintéticos en tests/logs/docs.
- Revisar/actualizar skill copicu-scripts si cambia bridge/capabilities.

Antes de codear, revisar capabilities Tauri para ui-host y definir permisos mínimos.
```
