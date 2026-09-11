---
id: active-scenarios-metadata
status: implementation-validated
updated: 2026-09-11
execution_route: strong
related:
  - docs/tracks/024-contextual-tag-capture.md
  - specs/009-saved-history-views/spec.md
---

# 028 Active Scenarios And Metadata

## Objetivo

Implementar capture modes explícitos que abren una saved view y aplican tags mientras su sesión está activa.

## Comportamiento Observable

- Los scenarios son entidades SQLite separadas: cada uno tiene nombre, query y tags opcionales.
- Settings ofrece un editor mínimo junto a Saved history views para crear y modificar esos datos; no convierte la view en propietaria de la metadata.
- Activar un scenario abre su view y muestra una única sesión activa; cambiarlo hace switch atómico y `Stop` conserva la view sin aplicar tags posteriores.
- Captura y recaptura unen los tags al item deduplicado y registran provenance de scenario, sesión y revisión o snapshot. Rige `manual > scenario > enrichment`: una remoción manual suprime el tag hasta restaurarlo manualmente.
- Ocultar y reabrir el picker conserva la sesión; salir de Copicu la termina y el siguiente proceso no la restaura.

## Límites Explícitos

- Reusar saved views y el contexto de captura de `024`; sin sidebar, collections ni administración general de scenarios.
- Sin schema editor, enrichment nuevo ni automatización de activación.
- Sin pausa, actions de entrada/salida, scripts, Paste Queue, perfiles, policies nuevas, restauración entre procesos ni explorador histórico de provenance.

## Criterios De Terminado

1. El usuario puede crear, activar, cambiar y detener scenarios, con una única sesión activa visible.
2. Captura y dedupe aplican tags y guardan provenance por evento sin duplicar el item.
3. Las ediciones manuales prevalecen y una supresión manual persiste frente a recapturas hasta restauración manual.
4. Ocultar el picker conserva el scenario; detenerlo o reiniciar evita patches posteriores y restauración silenciosa.

## Checks Focales Mínimos

- Tests Rust focales de scenario persistence, dedupe, unión de tags, suppressions y provenance.
- Playwright focal de creación, activate/switch/stop, indicador visible y hide/reopen.
- `npm run build` y smoke nativo de captura con picker oculto, Stop y reinicio sin restauración.

## Resultado

Implementado el corte completo: scenarios SQLite separados conservan query y tags; una sesión transitoria abre la view, hace switch atómico y permanece visible hasta `Stop`; captura y dedupe aplican tags con provenance por evento. Las suppressions mantienen `manual > scenario > enrichment`.

La clasificación fija adicional fue retirada el 2026-09-11. El capture mode actual usa únicamente tags como patch de metadata.
