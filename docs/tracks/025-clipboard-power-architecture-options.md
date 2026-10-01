---
title: Opciones arquitectónicas de clipboard
status: active
summary: Recomendaciones por evaluar una a una, con destino temático existente y sin rewrite, foco global ni paridad CopyQ.
last_worked: null
next: Elegir con JP un caso observable y su fuente pertinente antes de convertir una opción en spec o implementación.
topics: [product-ambition, copyq-technical-baseline, actions-and-scripting-api]
---

# 025 Clipboard Power Architecture Options

**Importación OS2:** UTC histórica desconocida; `null` conserva recomendaciones sin fecharlas como avance reciente. Metadata original:

```yaml
id: clipboard-power-architecture-options
status: active-roadmap
updated: 2026-07-29
related:
  - docs/tracks/005-rich-mime-research.md
  - docs/tracks/026-capture-paste-pipeline.md
  - docs/tracks/027-destination-paste-profiles.md
  - docs/tracks/028-active-scenarios-metadata.md
  - docs/tracks/004-actions-scripting.md
  - docs/tracks/019-paste-queue.md
  - docs/tracks/020-secure-clips-password.md
  - specs/008-clipboard-enrichment
```

Se conserva abierto el trabajo de evaluación. La tabla dirige opciones a sus fuentes, no mantiene estado/foco de otros tracks ni reactiva prioridades históricas. El orden tentativo no autoriza producto o un rewrite.

## Objetivo

Mantener un mapa corto de las recomendaciones arquitectónicas surgidas al comparar Copicu con CopyQ, Ditto y otros productos, para evaluarlas una por una sin convertirlas en un único rewrite.

## Regla

Cada opción debe pasar por decisión y, si es grande, spec antes de implementación. No buscar paridad total con CopyQ ni crear tracks duplicados cuando ya existe uno.

## Opciones

| Opción | Continuidad | Desbloquea |
| --- | --- | --- |
| Item con múltiples representaciones/MIME | `005-rich-mime-research.md` | HTML/RTF/file-list, paste fiel, previews y dedupe por representación |
| Pipeline formal capture/paste y posible aislamiento del monitor | `026-capture-paste-pipeline.md` | políticas, enrichment, routing, seguridad y separación de fallas |
| Hooks seguros before/after capture/paste | `004-actions-scripting.md` | transformaciones y automatización capability-scoped |
| Perfiles de paste por aplicación destino | `027-destination-paste-profiles.md` | paste-to-previous-window más confiable |
| Vault seguro y políticas sensibles | `020-secure-clips-password.md` | clips cifrados, auto-lock y redaction |
| Paste Queue | `019-paste-queue.md` | flujos secuenciales y formularios |
| OCR y enrichment local | `specs/008-clipboard-enrichment/` | búsqueda de imágenes y metadata derivada |
| Escenarios activos y metadata contextual | `028-active-scenarios-metadata.md` | trabajar dentro de cliente/proyecto/tarea con comportamiento explícito |
| Sync cifrado y plugins más amplios | sin track dedicado | portabilidad o extensibilidad solo con necesidad real |

## Orden Tentativo

1. Investigar escenarios activos y metadata porque extiende una necesidad ya dogfoodeada.
2. Decidir el modelo multi-representación antes de ampliar storage durable.
3. Formalizar pipeline capture/paste antes de separar procesos.
4. Endurecer perfiles de paste por aplicación.
5. Retomar hooks, queue, enrichment y vault solo con un caso observable.
6. Sync o plugin UI quedan fuera hasta tener demanda concreta.

## Fuentes Base

- CopyQ source overview: <https://github.com/hluk/CopyQ/blob/master/docs/source-code-overview.rst>
- CopyQ scripting API: <https://github.com/hluk/CopyQ/blob/master/docs/scripting-api.rst>
- CopyQ security: <https://github.com/hluk/CopyQ/blob/master/docs/security.rst>
- Ditto: <https://github.com/sabrogden/Ditto>
- Ditto custom keystrokes: <https://github.com/sabrogden/Ditto/wiki/Custom-Key-Strokes>

## Done Cuando

- Cada opción tiene un destino documental sin duplicación.
- JP puede elegir una opción y abrir solo su track/spec.
- Las decisiones aceptadas se promueven a spec o docs durables; este mapa no acumula transcript.
