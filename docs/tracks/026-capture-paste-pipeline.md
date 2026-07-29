---
id: capture-paste-pipeline
status: parked
updated: 2026-07-29
related:
  - docs/tracks/016-architecture-hardening.md
  - docs/tracks/004-actions-scripting.md
  - docs/tracks/005-rich-mime-research.md
  - specs/008-clipboard-enrichment
---

# 026 Capture/Paste Pipeline

## Idea

Convertir captura y paste en pipelines explícitos con contratos tipados antes de considerar separar el monitor de clipboard en otro proceso.

## Problema

El watcher, storage, enrichment, dedupe, routing contextual, acciones y paste-to-previous-window evolucionan juntos. Si cada capacidad nueva se conecta directamente, aumenta el acoplamiento y se vuelve difícil razonar sobre atomicidad, orden, seguridad y fallas.

## Pipeline Candidato

```text
Clipboard event
→ decode representations
→ source/security policy
→ normalize + dedupe
→ enrichment
→ contextual metadata patch
→ atomic persistence
→ post-capture actions
```

```text
Stored item
→ destination profile
→ optional transform
→ write clipboard representations
→ restore focus
→ issue paste gesture
→ post-paste actions
```

## Contratos A Investigar

- `CaptureEnvelope`: payloads/representations, source app/window, timestamps y hashes.
- `CapturePolicyDecision`: allow, ignore, redact, expire o require-confirmation.
- `MetadataPatch`: tags/propiedades a agregar, quitar o establecer con merge explícito.
- `PersistedCaptureResult`: item, dedupe/recapture, evento y efectos post-commit.
- `PasteRequest`: item, destino, representación y transform opcional.
- `PasteResult`: clipboard write, focus, gesture y diagnóstico atribuible.

## Separación De Procesos

CopyQ separa GUI, monitor, filtros/display commands y clipboard ownership. Copicu no debe copiarlo literalmente.

Orden recomendado:

1. extraer contratos y funciones puras dentro del proceso actual;
2. observar latencia, crashes y continuidad real;
3. solo entonces evaluar un worker de captura durable;
4. mantener scripts/AI detrás de capabilities y procesos atribuibles.

## Límites

- No rewrite del backend.
- No message bus genérico.
- No plugins arbitrarios dentro del watcher.
- No proceso extra sin un fallo o requisito de continuidad que lo justifique.

## Preguntas

- ¿Qué etapas deben estar dentro de la misma transacción SQLite?
- ¿Qué efectos solo pueden correr después de commit?
- ¿Cómo representar múltiples formatos sin cargar blobs grandes en cada etapa?
- ¿Qué errores bloquean captura y cuáles degradan una etapa opcional?
- ¿La UI puede reiniciarse sin perder monitoreo y vale el costo operativo?

## Primer Corte Si Se Retoma

Documentar el flujo real actual y extraer un `CaptureEnvelope` + `MetadataPatch` internos sin cambiar comportamiento observable. Medir después si la separación de proceso sigue siendo necesaria.

## Fuentes

- CopyQ source overview: <https://github.com/hluk/CopyQ/blob/master/docs/source-code-overview.rst>
- CopyQ scripting API: <https://github.com/hluk/CopyQ/blob/master/docs/scripting-api.rst>

## Done Cuando

Hay una decisión sobre contratos, límites transaccionales y necesidad real de aislamiento; si implica migración grande, existe spec antes de código.
