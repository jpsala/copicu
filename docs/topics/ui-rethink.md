---
id: ui-rethink
status: active
kind: decision-map
triggers:
  - UI fea
  - temas
  - ventanas dentro de ventanas
  - picker polish
  - surface architecture
  - theming
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/topics/mantine-ui-system.md
  - docs/topics/picker-interaction.md
  - docs/active-work/010-ui-rethink.md
  - src/styles.css
  - src/themeCatalog.ts
  - src/mantineTheme.ts
  - src/main.tsx
---

# UI Rethink

Tema durable para repensar la UI de Copicu como herramienta local rapida, discreta y keyboard-first.

No es una pasada de CSS. El problema actual mezcla arquitectura de superficies, sistema visual, temas y componentes.

Para reglas operativas de que abrir, que usar y como validar cada cambio UI, empezar por `docs/topics/ui-surface-architecture.md`.

## Problemas De Entrada

1. UI fea.
2. Sin temas reales.
3. Ventanas dentro de otra ventana.
4. Elementos UI poco cuidados.

## Hipotesis Inicial

La UI actual funciona como MVP, pero visualmente se siente provisional porque:

- casi todo vive en `src/main.tsx` y `src/styles.css`;
- settings, command palette, edicion y prompts se montan como overlays dentro del picker principal;
- el tema ya tiene `system/light/dark` + `themeId`, pero falta polish y posible preview/import-export;
- hay tokens CSS utiles, pero no hay contrato completo de componentes, estados, elevacion, iconos, densidad y motion;
- el picker ya intenta ser compacto, pero el marco visual general sigue pareciendo una webview con modales adentro.

## Research Inicial

Fuentes consultadas el 2026-06-06:

- Raycast Clipboard History: historial searchable, filtros por tipo, Enter para paste, action panel para opciones como paste plain, copy, edit, rename, pin y delete. Fuente: https://manual.raycast.com/clipboard-history
- Raycast Themes: temas instalables con light/dark separados, Theme Studio, export/import por URL o JSON. Fuente: https://manual.raycast.com/themes
- Paste: busqueda y filtros por tiempo, app, dispositivo o tipo; organizacion en pinboards; privacidad con datos bajo control del usuario. Fuente: https://pasteapp.io/help/explore-paste
- CleanClip: minimalismo operacional, mostrar solo lo necesario, quick menu cerca del cursor, menos shortcuts que recordar. Fuente: https://www.cleanclip.cc/
- Dittostack: estilo Spotlight, resultados a la izquierda y preview a la derecha, aparece en la pantalla activa/mouse, Enter pega y cierra. Fuente: https://www.dittostack.com/
- PasteCat: bottom drawer, multi-theme support, animaciones de tabs/preview y proteccion local. Fuente: https://apps.apple.com/us/app/pastecat-clipboard-tool/id6754803417?mt=12
- Tauri `WebviewWindow`: soporte para crear o manejar ventanas webview separadas por label. Fuente: https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/

## Lectura De Competidores

Patrones que sirven para Copicu:

- Picker como superficie de accion rapida, no como contenedor de todo.
- Preview util y cercana a la seleccion.
- Action panel o command mode para operaciones secundarias, sin ensuciar cada item.
- Temas como feature de producto, no solo dark mode.
- Ubicacion sensible al foco o monitor activo.
- Privacidad visible, pero compacta.

Patrones a evitar:

- Clonar CopyQ visualmente.
- Hacer un dashboard o landing.
- Glass/frosted como decoracion por defecto.
- Una "ventana principal" que simula muchas ventanas internas.
- Texto instructivo visible para explicar controles expertos.

## Modelo De Superficies Propuesto

Separar las superficies por intencion:

| Superficie | Rol | Forma Recomendada |
| --- | --- | --- |
| Picker rapido | Buscar, preview, copiar/pegar | Ventana flotante compacta, sin header pesado. |
| Command mode | Ejecutar acciones | Modo dentro del picker o palette dedicada, no modal grande dentro de panel. |
| Settings | Configuracion durable | Ventana standalone con layout de preferencias, no overlay dentro del picker. |
| Item editor | Editar contenido/metadata | Inspector o ventana dedicada segun tamano; evitar modal encima del feed. |
| UI host | Toast, confirm, input de scripts | Ventana auxiliar `ui-host`, ya iniciada. |
| History manager futuro | Revision larga, colecciones, bulk | Ventana task-oriented separada del quick picker. |

## Decision De Primer Corte

El picker rapido no debe tener una ventana nativa visible que contenga otra ventana visual.

Primer cambio:

- ventana Tauri principal sin decoraciones nativas;
- fondo del body/app shell transparente;
- `.picker-panel` ocupa toda la superficie de la ventana;
- Settings/editor/command palette siguen pendientes de separacion, pero ya no deben justificar agrandar el picker como app-shell.

Segundo cambio:

- Settings queda separado como ventana Tauri standalone label `settings`;
- el picker solo abre Settings con comando host, no monta overlay interno;
- Settings usa layout de preferencias con Mantine Tabs y controles Mantine;
- editor y command palette siguen pendientes de revisar como superficies.

## Modelo De Temas

Decision aplicada: el tema paso de `appearance.theme = system | light | dark` a:

- `theme`: `system | light | dark`;
- `themeId`: preset visual;
- presets built-in con light/dark pair;
- catalogo central en `src/themeCatalog.ts`;
- paletas Mantine consumidas por `src/mantineTheme.ts`;
- variables runtime Copicu y primarias Mantine aplicadas sobre `document.documentElement`.

No implementado todavia:

- preview compacta en Settings;
- import/export JSON;
- editor visual custom.

Tokens minimos:

- background: app, panel, surface, surface-raised, surface-muted;
- text: ink, ink-soft, muted, inverse;
- border: line, line-strong;
- accent: primary, primary-hover, primary-soft, selected;
- state: success, warning, danger, info;
- controls: focus-ring, button, input, switch, menu;
- elevation: none, popover, floating, modal;
- content: code-bg, image-bg, checker-a, checker-b.

## Libreria UI Candidata

Comparacion inicial 2026-06-06:

- MUI: muy completo, con `ThemeProvider`, `createTheme`, `colorSchemes`, CSS variables y modo dark/light. Riesgo: arrastra estetica Material y dependencias `@emotion/*`; puede hacer que Copicu parezca una web app de administracion si no se customiza fuerte.
- Mantine: componentes y hooks completos, React 19 compatible en version actual, buen sistema de color scheme, `theme.colors`, `primaryColor` y CSS variables. Riesgo: hay que customizar para que no parezca dashboard generico.
- Radix Themes: buen sistema de tokens/light-dark y primitives accesibles; menos opinionado en app shell. Riesgo: obliga a componer mas componentes propios.

Recomendacion inicial:

- Usar Mantine si el objetivo es "no pensar tanto" en controles, settings, selects, menus, switches y tabs.
- No usar MUI como primera opcion salvo que aceptemos una direccion Material deliberada.
- Para el picker/feed principal, mantener componentes propios o wrappers muy finos: la UI es demasiado especifica para delegarla completa a una libreria.

Decision aplicada:

- Mantine queda adoptado como infraestructura base. Ver `docs/topics/mantine-ui-system.md`.

## Direcciones Visuales Candidatas

### A. Native Utility

Mas cercana a una herramienta Windows/macOS seria: bordes claros, densidad alta, acciones iconicas, settings como preferencias nativas.

Ventaja: confiable y rapida.
Riesgo: si se ejecuta pobremente, queda gris y aburrida.

### B. Command Surface

Inspirada en Raycast/Spotlight: picker como command surface central, lista y preview, action mode compacto, tema fuerte pero sobrio.

Ventaja: encaja con keyboard-first y actions.
Riesgo: puede parecer clon de launcher si se pierde el foco clipboard.

### C. Clipboard Workbench

Quick picker minimo y una ventana manager separada para colecciones, scripts, bulk edit y privacidad.

Ventaja: resuelve "no meter todo en el picker".
Riesgo: mas arquitectura y mas estados entre ventanas.

## Issues A Estudiar

### 1. Feo

Preguntas:

- Que partes se sienten mas feas: picker, settings, menus, editor, toasts, colores, espaciado, botones?
- El problema es falta de identidad, exceso de bordes, mala jerarquia, o todo junto?
- Que tan denso debe ser el feed sin parecer tosco?

Soluciones candidatas:

- rehacer tokens y estados de componentes antes de mover pixeles;
- reducir bordes dobles y sombras grandes;
- usar iconos consistentes para settings, command, menu, mark, paste, copy, delete;
- mejorar selected/hover/focus como sistema, no por selector aislado;
- separar preview/feed/actions en una composicion mas clara.

### 2. Temas Reales

Preguntas:

- Los 8 presets actuales tienen contraste suficiente en desktop/narrow?
- Settings necesita preview compacta para elegir tema o alcanza el selector?
- Cuando haya custom themes, conviene import/export JSON, editor visual, o ambos?

Soluciones candidatas:

- primer slice aplicado: presets built-in y selector desde `themeCatalog.ts`;
- siguiente slice: polish de contraste y preview si aporta valor;
- futuro: custom JSON import/export y editor visual simple.

### 3. Ventanas Dentro De Otra Ventana

Preguntas:

- Settings debe ser ventana standalone normal, flotante siempre-on-top, o task window regular?
- Editar un item grande debe abrir inspector dedicado o expandir inline?
- Command palette debe ser un modo del picker o otra ventana?

Soluciones candidatas:

- settings como ventana Tauri separada;
- editor como inspector separado o panel lateral solo en history manager;
- command mode integrado al picker sin backdrop;
- ui-host para prompts/toasts, no overlays ad hoc.

### 4. Elementos UI Poco Bonitos

Preguntas:

- Que set de componentes necesitamos formalizar ya?
- Conviene traer `lucide-react` para iconos o mantener cero dependencia?
- Separamos componentes React antes o despues del restyle?

Soluciones candidatas:

- extraer Button, IconButton, Input, SegmentedControl, Switch, Menu, Dialog/Panel, Toast, Row;
- documentar estados obligatorios: default, hover, focus-visible, active, disabled, loading, selected, danger;
- crear smoke visual para cada superficie.

## Proximo Paso

Hacer una pasada guiada con screenshots actuales:

1. Capturar picker, settings, command palette, editor y ui-host.
2. Marcar issues concretos por superficie.
3. Elegir direccion visual entre A/B/C o una mezcla explicita.
4. Definir surface model definitivo.
5. Convertir en spec antes de implementar cambios grandes.

Proximo corte concreto tras Settings:

- pulir contraste de los 8 presets built-in;
- migrar `ToastStack` internamente a wrappers/tokens sin perder ventana Tauri propia;
- decidir si editor grande sale del picker como inspector/window o queda en edicion inline limitada.
