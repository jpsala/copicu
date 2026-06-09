---
id: image-capture-spike
status: validated
updated: 2026-06-05
---

# Image Capture Spike

Trabajo vivo para arrancar la próxima sesión con captura de imágenes.

## Decisión Tomada

Copicu va a seguir el patrón de CopyQ, adaptado al stack Tauri/Rust:

- modelo MIME-first;
- PNG normalizado como blob principal;
- metadata en SQLite;
- thumbnail separado para picker;
- preservar MIME original solo si aporta fidelidad real;
- límites de tamaño/dimensiones desde el primer corte;
- saltar imagen binaria cuando también hay texto, salvo modo rich explícito.

Fuente principal: `docs/topics/clipboard.md`, sección “Research CopyQ Sobre Imagenes” y “Decision Actual Para Imagenes”.

## Estado Actual

- Spec `specs/002-rich-image-capture/spec.md` marcada como `validated`.
- El watcher captura y persiste texto plano.
- El watcher captura imagen-only como `content_kind=image`.
- El probe Win32 detecta imagen metadata-only (`CF_BITMAP`, `CF_DIB`, `CF_DIBV5`).
- La UI diagnostics muestra `Image yes/no`.
- Hay blob store en app data para PNG normalizado y thumbnails.
- SQLite guarda metadata opcional de imagen en `clipboard_items`.
- El picker muestra thumbnail.
- Copy-back de imagen al clipboard funciona con `clipboard-rs`.
- Hay tests de unidad para rechazar rutas de blob absolutas o con `..`; `npm run rust:test` pasa.
- Fuentes comunes de imagen validadas con contenido sintético: screenshot, Paint, browser y Snipping Tool.
- No hay preservación exacta de MIME originales todavía.

## Próximo Corte

1. No agregar fallback Win32 `CF_DIB`/`CF_DIBV5` todavía; las fuentes comunes pasaron con `clipboard-rs`.
2. Mantener el harness `npm run image:sources` para regresiones de captura image-only.
3. Siguiente trabajo recomendado: cerrar pendientes generales de MVP 0 o empezar el próximo rich format con spec nueva.

## Preguntas Que Quedan

- Si una validación futura encuentra una fuente no cubierta, agregar fallback Win32 directo para `CF_DIB`/`CF_DIBV5`.
- Qué formato exacto usar para dedupe: hash de PNG normalizado o hash perceptual posterior.

## Validación 2026-06-05

- `npm run build`: pasó.
- `npm run visual:check`: pasó.
- `cargo check`: pasó.
- `npm run rust:test`: pasó 15/15. El fallo previo de arranque (`STATUS_ENTRYPOINT_NOT_FOUND`) quedó aislado a DLLs API-set de Miniconda en `PATH`; el wrapper remueve entradas `miniconda3` antes de ejecutar `cargo test`.
- `npm run image:sources`: pasó screenshot, Paint, browser y Snipping Tool con imágenes sintéticas. No hace falta fallback Win32 por ahora.
- Manual: imagen sintética 96x64 capturada como item `image`, con PNG blob y thumbnail.
- Manual: activar item de imagen dejó imagen 96x64 en clipboard y el watcher registró `self_write`.
- Manual: clipboard sintético con texto+imagen guardó texto y no creó segundo item `image`.
