---
id: active-scenarios-metadata
status: implementation-validated
updated: 2026-07-29
execution_route: strong
related:
  - docs/tracks/024-contextual-tag-capture.md
  - specs/009-saved-history-views/spec.md
---

# 028 Active Scenarios And Metadata

## Objetivo

Implementar en un solo corte el piloto `Cliente ACME / Proyecto Web` como scenario explícito que abre una saved view y aplica metadata estructurada mientras su sesión está activa.

## Comportamiento Observable

- Los scenarios son entidades SQLite separadas: cada uno tiene nombre, referencia una saved view existente y define un patch add-only con properties multivalor `client`, `project`, `activity` y tags opcionales.
- Settings ofrece un editor mínimo junto a Saved history views para crear y modificar esos datos; no convierte la view en propietaria de la metadata.
- Activar un scenario abre su view y muestra una única sesión activa; cambiarlo hace switch atómico y `Stop` conserva la view sin aplicar metadata posterior.
- Captura y recaptura unen el patch al item deduplicado y registran provenance de scenario, sesión y revisión o snapshot. Rige `manual > scenario > enrichment`: una remoción manual suprime el valor hasta restaurarlo manualmente.
- Ocultar y reabrir el picker conserva la sesión; salir de Copicu la termina y el siguiente proceso no la restaura.

## Límites Explícitos

- Reusar saved views y el contexto de captura de `024`; sin sidebar, collections ni administración general de scenarios.
- Limitar properties a `client`, `project` y `activity`; sin schema editor, enrichment nuevo ni automatización de activación.
- Sin pausa, actions de entrada/salida, scripts, Paste Queue, perfiles, policies nuevas, restauración entre procesos ni explorador histórico de provenance.

## Criterios De Terminado

1. El usuario puede crear, activar, cambiar y detener scenarios, con una única sesión activa visible.
2. Captura y dedupe aplican properties/tags multivalor y guardan provenance por event sin duplicar el item.
3. Las ediciones manuales prevalecen y una supresión manual persiste frente a recapturas hasta restauración manual.
4. Ocultar el picker conserva el scenario; detenerlo o reiniciar evita patches posteriores y restauración silenciosa.

## Checks Focales Mínimos

- Tests Rust focales de scenario persistence, dedupe, unión multivalor, suppressions y provenance.
- Playwright focal de creación, activate/switch/stop, indicador visible y hide/reopen.
- `npm run build` y smoke nativo de captura con picker oculto, Stop y reinicio sin restauración.

## Resultado 2026-07-29

Implementado el corte completo: scenarios SQLite separados referencian saved views y patches multivalor; una sesión transitoria abre la view, hace switch atómico y permanece visible hasta `Stop`; captura y dedupe aplican tags/properties con provenance por evento. El editor conserva el convenio de un único textbox: además de `#tags`, acepta tokens inline repetibles como `client:ACME`, `project:Web` y `activity:"Code review"`; las suppressions mantienen `manual > scenario > enrichment`.

Evidencia: 5 tests Rust focales pasaron; Playwright focal desktop+narrow pasó creación, activate/switch/stop, hide/reopen y edición de properties; `npm run build` y `cargo check` pasaron. Smoke nativo con watcher: captura oculta activa recibió `client=ACME`, `project=Web`, `activity=Native smoke`, tag y sesión/revisión; tras `Stop` la siguiente captura no recibió patch; tras reiniciar `get_active_scenario_session` devolvió `null`. El ajuste inline y responsive se publicó en `v0.4.3`; la suite visual final pasó 206/206 y la instalada local `0.4.3` quedó respondiendo. Sin gates externos pendientes.
