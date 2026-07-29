---
id: destination-paste-profiles
status: parked
updated: 2026-07-29
related:
  - docs/topics/picker-interaction.md
  - docs/tracks/019-paste-queue.md
  - docs/tracks/005-rich-mime-research.md
---

# 027 Destination Paste Profiles

## Idea

Reemplazar heurísticas dispersas de paste-to-previous-window por perfiles explícitos y diagnosticables según la aplicación destino.

## Caso Observable

El mismo clip puede requerir comportamientos distintos:

- navegador/editor normal: `Ctrl+V`;
- terminal: gesto o modo compatible con el terminal;
- aplicación especial: shortcut alternativo;
- aplicación lenta: delay antes del gesto;
- destino que solo acepta plain text: elegir representación o transform apropiado.

## Modelo Candidato

```text
DestinationPasteProfile
- id
- title
- executable_match
- window_class_match optional
- paste_gesture
- focus_strategy
- pre_paste_delay_ms
- representation_preference
- plain_text_policy
- enabled
```

La resolución debe producir además un `why`: perfil exacto, familia conocida o fallback global.

## UX Posible

- Defaults internos para browser, editor y terminal.
- Overrides locales en Settings por executable/window class.
- Diagnóstico desde metadata inspector: destino detectado, perfil elegido, delay y gesto.
- Acción temporal `Paste as plain text` que no cambia el perfil durable.

## Límites

- No macro recorder.
- No secuencias largas en v1.
- No automatización destructiva sin confirmación.
- No guardar paths o títulos sensibles innecesarios.
- No mezclar perfiles destino con escenarios activos: un escenario puede referenciar un perfil, pero son conceptos distintos.

## Preguntas

- ¿Match por executable alcanza o hace falta window class/title?
- ¿Cómo distinguir terminales y shells embebidos sin lista frágil?
- ¿Qué representación gana cuando el item tiene plain/HTML/RTF?
- ¿Los perfiles son globales o pueden tener override por escenario?
- ¿Qué evidencia mínima demuestra mejora frente a heurísticas actuales?

## Primer Corte Si Se Retoma

Instrumentar la decisión actual de paste y convertir las familias ya conocidas en una tabla interna tipada, sin UI configurable. Agregar UI solo después de dogfood con un destino que necesite override.

## Fuente

Ditto permite gestos y delays por aplicación: <https://github.com/sabrogden/Ditto/wiki/Custom-Key-Strokes>

## Done Cuando

Hay perfiles internos verificables para los destinos reales de JP, fallback seguro y diagnóstico de por qué se eligió cada estrategia.
