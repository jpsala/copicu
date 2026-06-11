---
id: post-mvp-hardening
status: active
updated: 2026-06-06
---

# Post-MVP Hardening

Trabajo vivo para convertir el MVP 0 validado en una herramienta local confiable de uso diario.

## Estado Actual

Copicu ya no es solo un spike conceptual. El núcleo nativo está implementado y validado con datos sintéticos:

- tray, hide-on-close y shortcut global;
- clipboard watcher event-driven;
- SQLite local con migraciones;
- picker preview-first;
- copy selected item;
- paste-to-previous-window;
- self-write suppression;
- captura y copy-back de imágenes image-only;
- lista virtual/infinite scroll y búsqueda paginada;
- settings typed en SQLite, ventana standalone de Settings y wiring inicial;
- actions/scripts locales con command palette, shortcuts locales/globales, clipboardChange y `ui-host` confirm/input en primer slice.

Sigue siendo MVP/dogfood porque aún faltan controles de privacidad, drag/manual order, pin/favorites, retention por edad/tamaño, distribución instalable y políticas claras de error.

## Objetivo

Salir de la fase MVP cuando el uso diario en la máquina del autor sea confiable, recuperable y configurable sin depender de código o de sesiones de desarrollo.

## Checklist Principal

### Confiabilidad diaria

- [ ] Validar manualmente picker real: always-on-top, tema dark, mover/redimensionar sin cierre, click afuera oculta tras delay.
- [ ] Ejecutar una semana de dogfood con datos reales del usuario sin guardar payloads en docs/logs.
- [ ] Definir política visible para errores de paste: foco denegado, target inválido, `SendInput` parcial, target elevado.
- [ ] Revisar si el delay post-focus de paste de 700 ms queda como constante temporal, setting o regla por app.
- [ ] Mantener `tests/manual/validate-paste-targets.ps1` como harness de regresión para paste.

### Historial y storage

- [x] Implementar deduplicación no solo consecutiva: si un hash ya existe, mover arriba o actualizar uso en vez de insertar duplicado.
- [x] Implementar lista virtual/infinite scroll para no cargar todo el historial en React.
- [x] Agregar búsqueda paginada contra SQLite/FTS en vez de filtrar solo items cargados.
- [ ] Agregar drag & drop para cambiar posición de un item, compatible con virtualización.
- [x] Definir y documentar semántica de `created_at` vs `last_used_at` vs `last_copied_at`.
- [x] Implementar retention por cantidad (`retentionCount`) en settings/storage.
- [ ] Investigar retention por edad, tamaño total y reglas sobre blobs.
- [ ] Implementar retention por tamaño total y/o edad, además del límite por cantidad.
- [x] Borrar blobs asociados al borrar un item.
- [ ] Limpiar blobs al prunear historial y reparar blobs huérfanos.
- [ ] Agregar verificación o reparación liviana de DB/blobs si falta un archivo.

### Controles básicos

- [x] Diseñar settings core: estructura, UX inicial, storage y defaults.
- [x] Primer corte settings: shortcut global persistido, hide-on-focus-lost, acción de `Enter`, retention y tema.
- [ ] Hot reload completo del shortcut global editado por el usuario.
- [ ] Export/import JSON de settings.
- [ ] Pausar captura desde tray o picker.
- [ ] Excluir apps o targets sensibles como primera protección de privacidad.
- [x] Menú de item con activate, paste, paste plain, open URL, edit, metadata, delete y scripts compatibles.
- [ ] Agregar details/formats y pin/unpin si entran en el siguiente corte de producto.

### Distribución local

- [ ] Single instance.
- [ ] Autostart opcional.
- [ ] Build instalable local con icon/tray/window lifecycle prolijo.
- [ ] Documentar comando de build/release local.
- [ ] Definir dónde viven DB y blobs para dev vs build instalable.

### Observabilidad segura

- [ ] Mostrar errores de operación sin exponer payload.
- [ ] Mantener logs útiles para debugging sin contenido real del clipboard.
- [ ] Agregar vista/debug command para estado: watcher activo, DB path, conteos, último error seguro.

### Rich content siguiente

- [ ] Mantener `npm run image:sources` como regresión para cambios de imágenes.
- [ ] No agregar fallback Win32 `CF_DIB`/`CF_DIBV5` hasta encontrar una fuente concreta que falle.
- [ ] Crear spec separada antes de HTML/RTF/file-list o preservación exacta de MIME.

## Criterio Para Salir De MVP

Marcar Copicu como post-MVP cuando:

1. el usuario lo use una semana sin corrupción de historial ni crashes relevantes;
2. paste-to-previous-window tenga fallos comprensibles y recuperables;
3. dedup, pin/favorites y retention estén implementados;
4. existan settings mínimos para comportamiento diario; ya existe primer slice, falta completar export/hot reload/perfiles si bloquea dogfood;
5. exista build instalable o flujo local reproducible sin depender de `tauri:dev`.

## Próximo Corte Recomendado

1. Validar manualmente comportamiento real de ventana/picker y dogfood diario con datos reales sin registrar payloads.
2. Cerrar privacidad mínima: pausa de captura y exclusiones de apps/targets sensibles.
3. Diseñar drag/manual order (`manual_rank`) sobre selección por id y lista virtual.
4. Definir política visible de errores de paste y si el delay post-focus queda configurable o por app.
5. Mantener actions/scripting en dogfood; no abrir rich MIME amplio hasta cerrar controles de privacidad y retention.
