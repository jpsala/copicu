---
title: Guardar clips como archivos o ZIP con nombres AI opcionales
status: active
summary: Selección y marcados a TXT/PNG o ZIP, naming AI de texto y diálogo limpio implementados; preparación del release estable 0.5.10.
last_worked: "2026-10-17T01:24:19Z"
next: Verificar paquete firmado, publicar stable/latest e instalar el mismo artefacto; mantener separada la aceptación AI/otra PC.
topics:
  - actions-and-scripting-api
  - ai-search-and-actions
---

## Objetivo y estado

Guardar conjuntos explícitos sin modificar originales ni clipboard. Contrato
vigente en [spec 018](../../specs/018-clip-file-export/spec.md), arquitectura y
pendientes en [plan](../../specs/018-clip-file-export/plan.md).

Implementados selección y todos los marcados desde cualquier filtro; archivos
sueltos o ZIP Deflate; UTF-8 TXT y PNG real validado; nombres convencionales seguros
sin sobrescritura; apertura de destino opcional y naming AI de texto con modelo
independiente/confirmación/fallback. Progreso, detalles y Open destination folder
viven sólo en un diálogo transitorio. Cerrar deja limpio el picker y restaura foco.

Modelos generales/export se eligen por nombre con catálogo explícito. Cargar usa
el draft actual de proveedor y AI enabled, sin exigir Save/reabrir ni activar
naming por listar; no se necesita memorizar IDs. Imágenes no van al modelo.

Destino siempre confirmado: predeterminada → última exitosa → ubicación nativa.
Elegir otro no cambia el setting; última carpeta se actualiza sólo tras éxito real.
IDs/config se congelan por sesión. ZIP no cuenta prepared como saved hasta commit;
abort descarta el paquete. Sueltos conservan completados al detenerse.

## Evidencia de implementación

- Suite Rust completa: 423 aprobados, 1 benchmark omitido; pruebas sintéticas de
  representación, no mutación, colisiones/carreras/cleanup, ZIP y naming.
- Renderer focalizado: 46 casos desktop/narrow sobre menús, marcados paginados,
  diálogo/foco, modelos/draft/reintento y Settings. Ocho tests Node de export/settings.
- Build frontend y cargo check offline aprobados. El request AI real de los tests
  sólo va a un mock localhost con datos/credencial sintéticos, sin tools.
- Dev Windows: ZIP real con dos textos y PNG, HTML omitido; extracción .NET estándar
  y bytes idénticos, originales intactos; segundo ZIP cancelado sin publicar.
- JP ejercitó guardar en dev y confirmó funcionamiento; su feedback motivó reemplazar
  feedback inline por diálogo y mejorar modelos. Esto no acredita provider/visión,
  input nativo universal ni actualización efectiva en otra computadora.

Implementación: `src-tauri/src/clip_export.rs` y `clip_export/`; comandos en `lib.rs`,
settings en `storage.rs`/`src/shared/settings.ts`; UI `ClipFileExport.tsx`,
`AiModelSelect.tsx` y `ExportNamingSettings.tsx`; integración en `src/main.tsx` y
`src/windows/secondaryWindows.tsx`. Regresiones en `tests/visual/shell.spec.ts` y
`tests/clip-file-export.test.mjs`.

El corte inicial fue revisado por coordinador/worker Sol medium; las iteraciones
posteriores fueron directas con JP, sin subdelegación. WIP ajeno de clipboard se
preservó; su diff son tests/documentación, no runtime del exportador.

## Distribución

JP autorizó ahora documentación, GitHub/release estable, instalación local y cierre
de procesos Copicu. Candidato resuelto una sola vez por el helper: **v0.5.10**, core
**0.5.10**, canal normal/latest. Firma y publicación no se infieren de builds previos.
Recibos finales y gates del paquete: [notas v0.5.10](../releases/v0.5.10.md).

## Pendientes

- [ ] Recibos del paquete/release/instalación actual y comprobación del endpoint updater.
- [ ] Calidad de nombres/proveedor real y naming visual con capacidades acreditadas.
- [ ] Recuperación directa si desaparece la carpeta sugerida; hoy se informa el error.
- [ ] Carpeta/búsqueda completa y API pública de Actions según el plan, sin ampliar
  permisos por analogía. Sin ZIP cifrado, backup recuperable ni paridad CopyQ.
