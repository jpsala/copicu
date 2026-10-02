---
title: Selector y navegador compartidos de carpetas
status: closed
summary: Árbol y metadata distribuidos en v0.5.2 normal/latest con el payload instalado y validado de la RC.
last_worked: 2026-10-02T20:23:49Z
topics: [shared-folder-controls, picker-interaction]
---

# Selector y navegador compartidos

JP aprobó implementar el concepto discutido de selección/búsqueda/exploración y creación por ruta, con trabajo paralelo cuando acelere el resultado. Aquel encargo no autorizó release, instalación, commit ni push; la preparación de la candidata no convierte esa autorización histórica en permiso para distribuir.

## Estado

Implementado `FolderSelect`, separado `FolderNavigator` del picker y compartido ranking de búsqueda. Metadata, editor, nuevos clips y mover clips usan el selector; reparenting excluye destinos inválidos y admite sólo carpetas existentes. Creación y movimiento al guardar son atómicos. Contrato durable en [controles de carpetas](../topics/shared-folder-controls.md); alcance en [spec](../../specs/017-shared-folder-controls/spec.md).

JP aprobó reemplazar la navegación por niveles con un árbol compacto tipo file manager. `FolderTree` comparte filas con el sidebar; el filtro conserva ancestros y resalta nombres. Un clic marca, Enter/doble clic/«Choose folder» confirma. «New folder» inserta una fila editable bajo el candidato y Escape recupera el filtro. El diálogo de nuevo clip cubre el sidebar. Nombres y búsqueda no usan corrector ortográfico.

El control forma parte del NSIS firmado `v0.5.2-rc.1`, core `0.5.2`, preparado y
validado localmente. Regresión amplia y artefacto exacto en
[aceptación de la candidata](../../specs/016-shared-clipboard/local-acceptance.md#candidata-firmada-v052-rc1-2026-10-02).
Actualización local del mismo artefacto comprobada por hash/payload; Computer Use
confirmó el diálogo de nuevo clip, el árbol selector superpuesto correctamente y Cancel sin guardar.
[Smoke instalado](../../specs/016-shared-clipboard/local-acceptance.md#smoke-instalado-v052-rc1-2026-10-02).
[v0.5.2-rc.1 publicada](https://github.com/jpsala/copicu/releases/tag/v0.5.2-rc.1)
desde el source/tag inmutable `b8d7d83bdc671f3ef0351b86cc2d3599f95d3481`;
[Agentic Validation 37059318392](https://github.com/jpsala/copicu/actions/runs/37059318392)
SUCCESS para esa fuente, con documentación/chunks aprobados.
[v0.5.2 normal/latest](https://github.com/jpsala/copicu/releases/tag/v0.5.2)
se publicó después a `2026-10-02T20:22:36Z` desde el mismo commit, con EXE/firma
idénticos y manifest dirigido al tag normal. El endpoint real latest entrega
`0.5.2`; tres assets descargados y digests comprobados, sin repetir el smoke ni
atribuir instalación a otra PC.
[Recibo de distribución](../../specs/016-shared-clipboard/local-acceptance.md#release-normal-v052-2026-10-02).

## Verificación

Resultados del corte de implementación, no nuevas ejecuciones al preparar la
candidata. El renderer sintético y Computer Use tienen alcances distintos;
estas pruebas no acreditan un instalador nuevo.

- Build TypeScript/Vite aprobado, sin warnings de chunks grandes.
- Revisión del árbol: 36 pruebas Playwright aprobadas en desktop y ventana estrecha, incluyendo filtro con ancestros, creación inline, metadata, reparenting, navegación por teclado y superposición del diálogo.
- 20 tests de modelo/reducer aprobados, incluidos filtrado jerárquico, orden y exclusiones. Backend sin cambios en esta revisión; validación anterior: 323 tests Rust aprobados, 1 benchmark ignorado y cargo check aprobado.
- Capturas sintéticas `.codex-run/folder-selector-new-chromium-narrow-window.png` y `.codex-run/folder-selector-search-chromium-desktop.png` inspeccionadas. Chromium cubre el renderer con backend simulado.
- Computer Use en Windows con el árbol final: filtrar «Notas» conserva `/ → test → Prueba UX → Notas`; crear muestra una fila hija, Escape restaura el filtro y una creación nueva empieza vacía bajo el padre encontrado. Enter prepara la carpeta; guardar un clip sintético y abrir metadata confirmó `/test/Prueba UX/Notas/Arbol compacto`. Selector dejado abierto en esa rama para feedback. No se modificaron clips preexistentes ni se guardaron capturas del historial real como fixtures.
- La instancia built-dev del corte servía `dist` en 1430: recompilar y recargar para aplicar cambios de frontend; editar código por sí solo no la actualiza. Perfil existente conservado; puerto, executable, PID y hotkey son referencias que se deben revalidar antes de operar.

## Próximo paso

La implementación local y distribución v0.5.2 normal/latest están cerradas. Si JP aporta feedback de rapidez,
exploración o creación, ajustar el componente compartido sin ampliar a un
administrador general de carpetas. Revalidar la dev y su perfil antes de operar;
no borrar ni inspeccionar su historial como fixture.
