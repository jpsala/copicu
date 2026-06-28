---
name: aos-gol-lite
description: Execute the next small, verifiable AOS work batch without using Pi until-done. Use when JP says `gol`, `aos-gol-lite`, `avancemos`, `ejecutar lote`, or wants lightweight progress with context and verification.
---

# Gol Lite

Ejecutar el proximo lote chico y verificable sin activar `/until-done` ni otro loop autonomo pesado.

## Flujo

1. Leer solo la ruta minima necesaria: `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md` y el topic, track o spec puntual que aplique.
2. Nombrar el lote: objetivo corto, archivos probables y criterio de verificacion.
3. Si el lote es ambiguo o riesgoso, preguntar antes de ejecutar; si es claro, avanzar.
4. Implementar cambios acotados, evitando mezclar frentes.
5. Verificar con el comando mas barato suficiente; si no hay comando, hacer revision estructural y decirlo.
6. Persistir solo conocimiento durable cuando cambie el estado vivo, una decision, un topic, una track o una spec.
7. Responder con cambios, verificacion y proximo paso sugerido.

## Guardrails

- No usar `/until-done` salvo pedido explicito de JP.
- No crear contratos formales, judge model ni `tasks.yaml` autonomo.
- No hacer guardado de sesion, handoff ni thread nuevo; para eso usar `guardar sesion` o `nueva sesion`.
- No pedir `gol` al final; dejar un proximo paso concreto.
- Si el trabajo crece, cortar el lote y proponer SpecKit, track o pregunta de alcance.
