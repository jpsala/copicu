---
id: mvp0-definition
status: historical
updated: 2026-06-05
---

# MVP 0 Definition

Trabajo histórico usado para definir el primer spike funcional de Copicu.

La spec formal fue creada en `specs/001-mvp0-native-spike/spec.md`.

## Objetivo

Definir un MVP 0 que pruebe los riesgos nativos centrales antes de invertir en UI/UX:

- tray;
- global shortcut;
- clipboard text capture;
- SQLite persistence;
- picker minimo searchable;
- copy selected item;
- paste-to-previous-window.

## Criterio De Producto

Este MVP no busca verse bien ni cubrir paridad CopyQ. Busca responder una pregunta:

> Podemos capturar, persistir, buscar y reutilizar texto del clipboard de forma confiable en una app Tauri local?

## Flujo Manual De Exito

1. Abrir la app y dejarla corriendo en background/tray.
2. Copiar 20 textos sinteticos desde varias apps.
3. Confirmar que el historial guarda items sin duplicados consecutivos.
4. Abrir el picker con shortcut global.
5. Buscar un item por texto.
6. Navegar resultados con teclado.
7. Copiar el item seleccionado al clipboard.
8. Pegar el item seleccionado en la ventana previa.

## Alcance Candidato

### Incluido

- Windows como plataforma primaria del spike, salvo decision contraria.
- Texto plano solamente.
- Dedupe consecutivo por hash de texto normalizado.
- SQLite local para historial.
- Picker minimo con input, lista y preview textual.
- Shortcut global configurable por constante inicial.
- Tray con abrir/ocultar/salir.
- Paste-to-previous-window con delay y supresion temporal de recaptura propia.

### Excluido Por Ahora

- HTML, RTF, imagenes y file lists.
- UI/UX polish.
- Settings completas.
- Plugins.
- AI.
- Import/export.
- Sync.
- Retention avanzada.
- Password manager detection.

## Riesgos A Validar

| Riesgo | Pregunta |
| --- | --- |
| Clipboard monitor | Detecta cambios reales sin CPU alto ni loops propios? |
| Global shortcut | Funciona cuando la app esta oculta o sin foco? |
| Tray/background | La app vive en tray sin cerrarse accidentalmente? |
| SQLite | Persiste y busca rapido con volumen minimo razonable? |
| Focus previous window | Podemos recordar/restaurar ventana anterior en Windows? |
| Paste injection | Set clipboard + Ctrl+V es confiable sin recapturar item propio? |

## Preguntas Para Cerrar Antes De Spec

- Confirmar Windows-first o cross-platform desde el primer spike.
- Confirmar React/Vite como frontend inicial.
- Plugin SQL de Tauri vs Rust propio con `rusqlite` para el spike.
- Clipboard monitor: polling con plugin oficial vs plugin comunitario con eventos vs Rust propio.
- Shortcut inicial: `Alt+V`, `Ctrl+Shift+V` u otro.
- Restaurar clipboard anterior despues de paste: si/no para MVP 0.
- Limite inicial de historial para el spike: 100, 1000 o 10000 items.

## Research Notes

Context7 CLI verificado:

```powershell
npx ctx7 library tauri "global shortcut plugin"
npx ctx7 docs /websites/v2_tauri_app "global shortcut register Tauri 2"
npx ctx7 docs /websites/v2_tauri_app "clipboard manager permissions read text write text Tauri 2"
npx ctx7 docs /websites/v2_tauri_app "SQL plugin sqlite setup Tauri 2"
```

Notas:

- `clipboard-manager` requiere permisos explicitos como `clipboard-manager:allow-read-text` y `clipboard-manager:allow-write-text`.
- SQL plugin con SQLite requiere `cargo add tauri-plugin-sql --features sqlite`.
- Context7 sirve como primera pasada; confirmar detalles criticos con docs oficiales/GitHub/issues.

## Proximo Paso

Usar la spec formal para implementación:

```text
specs/001-mvp0-native-spike/
├── spec.md
├── plan.md
├── research.md
└── tasks.md
```
