---
id: saved-history-views-ux-followup
status: waiting_gate
updated: 2026-07-29
execution_route: strong
related:
  - specs/009-saved-history-views/spec.md
  - docs/tracks/024-contextual-tag-capture.md
  - docs/tracks/028-active-scenarios-metadata.md
  - docs/tracks/029-picker-scenario-switcher.md
  - docs/topics/picker-interaction.md
---

# 031 Saved History Views UX Follow-up

## Motivo

Revisar el modelo y la UX de Saved History Views a partir de nuevos requerimientos de JP, sin asumir que el flujo actual de captura contextual debe conservar su forma visible.

## Estado Verificado En v0.4.1

- La gestión está en `Settings → History → Saved history views`, debajo del resto de opciones de History.
- Una view persiste `title`, `query`, `captureTags`, hotkey opcional y estado pinned; se crea o edita desde `New saved view`.
- Abrirla desde Settings o `Ctrl+K` aplica su query y mantiene en frontend la identidad de la view abierta.
- La barra de captura sólo existe si la view abierta tiene al menos un capture tag. Muestra `Capture tags ready` + `Capture here`; al armarse cambia a `Capturing here` + `Stop capture`.
- `Capture here` aplica los tags declarados a capturas y recapturas/dedupe por la ruta transaccional normal. `Stop capture` conserva la query abierta y deja de aplicar tags.
- Sólo hay un contexto de captura activo. Cambiar de view o escribir una query distinta abandona la view y detiene el contexto; reiniciar la aplicación no lo restaura silenciosamente.
- Una query manual no se convierte en Saved View ni muestra controles de captura. Un Scenario usa su propia sesión y patch automático, aunque internamente referencie una view.

## Problemas De UX Observados

- Saved History Views está enterrado dentro de History y no es descubrible como capacidad principal.
- Si `captureTags` está vacío, no aparece identidad de view abierta, explicación ni camino para configurar captura; parece que la funcionalidad no existe.
- `Saved history view`, filtro, filter lock, capture context y Scenario son conceptos distintos, pero la UI no explica bien sus límites.
- El control cotidiano está partido entre Settings, command palette y una barra condicional del picker.
- El término y el modelo final todavía no están decididos; no promover Saved Views a tab, fusionarlas con Scenarios ni cambiar persistencia antes de escuchar los requerimientos de JP.

## Gate De Requerimientos

Esperar que JP describa en la próxima sesión:

- qué representa para él una Saved History View;
- cómo espera crearla, abrirla, reconocerla y cerrarla;
- qué relación debe tener con captura, tags y Scenarios;
- qué debe persistir entre cierres o reinicios.

Después de aclararlo, convertir la decisión en un brief corto antes de tocar código. No implementar desde este track sin cerrar ese gate.

## Referencias De Código Y Evidencia

- UI de gestión: `src/windows/SavedHistoryViews.tsx` y sección History de `src/windows/secondaryWindows.tsx`.
- Estado y barra del picker: `openedSavedView`, `captureTagContext`, `Capture here` y `Stop capture` en `src/main.tsx`.
- Backend y contratos: comandos de capture context en `src-tauri/src/lib.rs`, persistencia en `src-tauri/src/storage.rs`, contratos en `src/shared/contracts.ts`.
- Test actual: `saved view capture context arms, stays distinct from filter lock, and stops without clearing the view` en `tests/visual/shell.spec.ts`.
- Release actual: `v0.4.1` estable, instalada local promovida.
