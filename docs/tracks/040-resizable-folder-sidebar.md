---
id: resizable-folder-sidebar
status: active
updated: 2026-09-30
---

# Divisor Y Ancho Persistente Del Sidebar

## Pedido De JP

Continuar en una sesión nueva: agregar un divisor vertical entre la barra lateral izquierda de carpetas y el picker/feed, permitir ajustar el ancho y conservarlo después. JP mencionó 400 px como ejemplo tentativo; el mínimo no está decidido. No registrar 400 px como requisito fijo. Determinar límites razonables con el ancho del picker y validar/proponer el mínimo.

## Resultado Buscado

- Divisor visible y arrastrable, con cursor/hover/foco claros y ajuste inmediato del layout sin romper preview/virtualización.
- Ancho preferido persistido en el sistema existente de Settings/SQLite, restituido al reabrir y reiniciar. No confundir estado temporal con preferencia durable ni escribir Settings en cada movimiento del puntero.
- Limitar el ancho efectivo al espacio disponible manteniendo el feed útil; un clamp temporal por ventana pequeña no debe destruir la preferencia guardada. Conservar el overlay/collapse actual en ventanas estrechas.
- Accesibilidad keyboard-first: separator vertical enfocable, valores/etiqueta accesibles y ajustes por teclado sin secuestrar flechas del buscador o árbol. Pointer cancel/blur/unmount no dejan listeners ni arrastres activos.
- Mantener carpetas, selección/marcados, drag de clips, búsqueda, destino de captura y privacidad. No agregar una tabla tipo Explorador en este corte.

## Fuentes Y Estado Comprobado

- Repo `C:/dev/copicu`, main/origin/main; último HEAD al guardar `a43daac251d47bf662d4746deb503622ecfdd47e`, release v0.5.0 en `cc32a7c`. Release/CI/artefactos cerrados en `docs/tracks/039-release-0.5.0.md`.
- `src/styles.css` ~6860-6962: ancho actual `--folder-sidebar-width: 214px`; `.folder-tree` usa ese ancho y `.feed-panel` el mismo margin-left. A <=560 px el sidebar es overlay `min(250px, 78vw)` sin desplazar el feed.
- `src/ui/FolderWorkspace.tsx`: árbol y sus controles; `src/main.tsx`: montaje, foco, `folderTreeOpen`, Settings y layout. Persistencia: `src/shared/settings.ts`, defaults/validación Rust en `src-tauri/src/storage.rs` y tipos compartidos donde corresponda.
- Producto/UI: `docs/topics/picker-interaction.md`, `docs/topics/ui-surface-architecture.md`, `docs/topics/ui-design-and-impeccable.md`; skill local impeccable + registro product.
- Regresiones: `tests/visual/shell.spec.ts`; suite previa 442 pasó, Rust 259 + 1 ignored y Node 36. Son baseline del release, no aceptación del resize.
- Dev restaurada con perfil `.codex-run/dev-isolated/app-data`, debug remoto apagado; puede contener historial real. No tratarlo como fixture descartable. La app instalada no se actualizó.

## Implementación Y Límites

- Default 214 px conservado; mínimo 140 px según el rectángulo de JP, verificado con controles, nombre corto y conteo de cuatro dígitos sintéticos. Sangría 10 px/nivel en vez de 16; nombres profundos/largos se eliden sin perder tooltip/ruta. Máximo `min(600, workspaceWidth - 320)` px, con piso 140: reserva 320 px para previews/feed y evita que el árbol domine ventanas grandes. 400 px es elegible cuando cabe, no requisito ni mínimo. Overlay <=560 px intacto.
- División estándar: único borde recto de 1 px sobre el borde existente del sidebar, unido al header; hit target invisible de 8 px con `col-resize`. Hover no engrosa; foco keyboard resalta sin contorno doble. Test `sidebar divider` verifica geometría, unión superior y estados.
- `FolderSidebarLayout` reutiliza el árbol/feed existentes y una sola variable CSS; ResizeObserver mide el workspace sin escribir preferencias. Pointer capture con cancelación; teclado 10/40 px, Home/End y Escape; drag mantiene el foco del search y no dispara limpieza de selección.
- Settings/SQLite: `picker.folderSidebarWidth`, schema 1 compatible, default para campo ausente y clamp numérico 140–600; preferencias existentes (incluidas 180/400 px) se conservan. Comando main-only `set_picker_folder_sidebar_width`, actualización parcial bajo lock y broadcast a Settings. Guarda al finalizar pointer/keyboard, con cola serial frontend, rollback visual y error ante fallo; no localStorage ni escrituras por movimiento.
- Menú de carpetas en portal a `document.body`, fuera del sidebar transformado: ancla viewport al puntero, botón o fila de teclado sin sumar offset del header. Estilos/foco conservados y cierre al plegar. Regresión `folder context menu anchors` cubre 1000/600/420 px, click derecho/puntitos/Shift+F10, Escape/retorno y dismiss.
- Contrato durable: `docs/topics/picker-interaction.md`. Tests sintéticos: `tests/settings.test.mjs`, casos `sidebar resize` de visual y `sidebar_width_settings_default_normalize_and_survive_reopen` de Rust.

## Checklist De La Nueva Sesión

- [x] Verificar cwd, git state y fuentes; explicar el objetivo y el mínimo aún tentativo antes de editar.
- [x] Elegir layout/mínimos y política de persistencia reutilizando Settings, sin dependencia nueva.
- [x] Implementar divisor + pointer/keyboard + límites responsive y persistencia compatible con settings antiguos.
- [x] Tests de resize/límites/reopen y persistencia, narrow overlay, cancel/foco/drag y no overflow.
- [x] Build, visual suite, Rust si cambia contrato Settings y strict release chunk gate; recargar/reiniciar dev según alcance.
- [x] Actualizar contrato durable y dejar límites de smoke explícitos para dogfood de JP.

## Aceptación Y Dogfood

- Build y gate estricto de chunks: pasan, cero large-chunk warnings. Visual completa: 454 pasan, 2 skipped; focalizados resize/minimum: 10 pasan, menú finales: 2 pasan (ambos proyectos, posiciones/foco/dismiss en 1000/600/420 px). Node Settings/search-snapshot/structured-search: 30 pasan. Rust: 260 pasan + 1 ignored; cargo check pasa. Context audit: 0 errores, 2 warnings por tamaño de topics existentes. Evidencia local en `.codex-run/sidebar-140-*` y `.codex-run/folder-menu-*`, incluidos screenshots sintéticos.
- Dev built reiniciada sin reemplazar/borrar el perfil `.codex-run/dev-isolated/app-data`; proceso 22508 responde, debug remoto apagado. Log startup confirma picker hotkey `Ctrl+Shift+.`. Estado previo al cierre de release; instalación/publicación actuales se verifican abajo.
- Límites de aceptación: tests de renderer Chromium usan mock backend sintético; Rust verifica SQLite real y reopen en perfil temporal sintético. No se certifica drag nativo WebView2, restart de preferencia end-to-end Tauri ni C0 con estos checks.
- Dogfood pendiente: con perfil separado y clips exclusivamente sintéticos, probar drag/teclado a 140/400/máximo, hide/show, reinicio del proceso, reducir/ampliar ventana sin perder ancho preferido, overlay <=560, cancelar por pérdida de foco y mover un clip sintético a carpeta; verificar caret/search, selección/marcados y capture destination. No usar el perfil dev existente como fixture descartable.

## Permisos Y Ownership

JP autoriza implementar/verificar la mejora y ahora pide explícitamente release, actualización completa e instalación: cierre patch estable v0.5.1 en `jpsala/copicu`, commit/push de main, publicación e instalación del mismo artefacto vía `npm run release:install`. Es permiso actual, no heredado de v0.5.0. No instalar dependencias ni usar historial/clipboard reales como fixtures. El origen transfirió ownership y dejó de editar este alcance.

## Propuesta Anterior Conservada, Fuera De Scope

La vista tipo Explorador sigue sin autorización de implementación. Propuesta del asistente: tabla complementaria para Todo el historial/cualquier carpeta, preferentemente en Administrar historial separado del picker; columnas iniciales contenido/título, tipo, tags, última captura, carpeta y marcado; otras opcionales y preview para notas/imágenes. Orden por cabecera debe abarcar todos los resultados desde backend, no sólo páginas cargadas. Una configuración compartida de columnas primero; preferencias por carpeta sólo si el uso las justifica. Son recomendaciones pendientes, no decisiones cerradas de JP.
