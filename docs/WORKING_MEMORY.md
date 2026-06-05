# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-04.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Direccion de producto | active | `docs/topics/product-direction.md` | Convertir recomendaciones en una spec o scaffold inicial. |
| Arquitectura inicial | draft | `docs/DEVELOPMENT.md` | Validar stack y crear spikes tecnicos. |
| MVP | draft | `docs/OPEN_QUESTIONS.md` | Definir primer milestone implementable. |

## Specs Activas

| Spec | Estado | Rol | Abrir |
| --- | --- | --- | --- |
| Ninguna | draft | Crear para scaffold inicial o primer spike. | `specs/` |

## Riesgos Que No Hay Que Olvidar

- Paste-to-previous-window es el flujo mas riesgoso.
- Clipboard rich content puede explotar el alcance.
- No persistir datos reales del clipboard en docs, tests o logs.
- No perseguir paridad CopyQ antes de estabilizar el MVP.

## Proximo Paso Probable

Crear una spec corta para el primer prototipo Tauri:

- tray;
- global shortcut;
- clipboard text capture;
- SQLite;
- searchable picker;
- paste/copy selected item.
