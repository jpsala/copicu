---
title: Implementación mínima y Ponytail
summary: Reusar y reducir superficie sin quitar seguridad, datos, accesibilidad, checks ni conocimiento durable.
keywords:
  - ponytail
  - minimal implementation
  - implementacion minima
  - solucion minima
  - yagni
  - over-engineering
  - bloat
  - boilerplate
  - dependencias innecesarias
  - diff minimo
  - revisar complejidad
---

# Implementacion Minima Y Ponytail

Copicu puede usar disciplina minimalista para implementar o revisar codigo, pero no la convierte en gobierno obligatorio del proyecto.

## Regla Local

Copicu conserva producto, datos, seguridad y efectos externos; OS2 organiza el conocimiento, independiente del harness. La disciplina minimalista orienta sólo la forma de implementar una solución dentro del pedido actual, una vez entendido el flujo y el estado real de Copicu.

Antes de escribir codigo, preferir en este orden:

1. No construir si la necesidad es especulativa.
2. Reusar helpers, tipos, patrones o comandos existentes en el repo.
3. Usar stdlib.
4. Usar capacidades nativas de Tauri, Rust, TypeScript o Windows cuando aplique.
5. Usar dependencias ya instaladas.
6. Resolver con una linea o el diff mas chico si sigue siendo correcto.
7. Solo entonces escribir codigo nuevo minimo.

La escalera corre despues de leer el contexto necesario. Un diff chico en el lugar equivocado no es una mejora.

## Ponytail

Ponytail (`DietrichGebert/ponytail`) figura como capacidad opcional bajo demanda para implementación/review minimalista. Esa decisión histórica no instala, habilita ni autoriza hoy una herramienta externa: respetar disponibilidad, privacidad y alcance actuales.

Uso recomendado:

- bugs y fixes con root cause compartida;
- refactors pequenos;
- reviews de over-engineering;
- reduccion de dependencias, wrappers, boilerplate o abstracciones especulativas;
- auditorias read-only del tipo "que podemos borrar/simplificar".

No usarlo como regla obligatoria always-on en Copicu ni instalarlo como dependencia local salvo pedido explicito. Si se usa desde Pi u otro harness global, debe poder apagarse y no reemplaza el playbook local.

## No Recortar

Nunca simplificar quitando:

- validacion en limites de confianza;
- manejo de errores que evita perdida de datos o historial de clipboard;
- seguridad, privacidad o separacion dev/instalada;
- accesibilidad basica y navegacion keyboard-first;
- verificaciones necesarias para logica no trivial;
- conocimiento durable, topics, tracks o docs necesarios para continuidad;
- requisitos explicitamente pedidos por JP o por una spec aceptada.

## Uso En Este Repo

Para tareas normales, aplicar esta politica como lente de review: menos superficie, menos dependencias y menos abstracciones nuevas, siempre preservando evidencia y checks. Para features grandes, sigue mandando el flujo de specs/tracks antes de optimizar el diff.

## Referencias

[Realinear documentación](agentic-os-operations.md), [OMP opcional](omp-agentic-os.md), [investigación técnica](technical-research-process.md) y [archivo de decisiones anteriores](../DECISIONS.md). No heredar permisos de esas referencias.
