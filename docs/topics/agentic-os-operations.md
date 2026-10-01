---
title: Realinear la documentación y capacidades locales de Copicu
summary: Auditar y curar contexto dentro del pedido actual, sin importar permisos ni runtime de AOS, OMP u OS2.
keywords:
  - realinear os
  - auditar sistema agentico
  - reparar sistema agentico
  - drift de contexto
  - actualizar sistema agentic
  - migrar sistema agentico
  - adopción OS2
  - upstream downstream
  - context bloat
  - actualizar omp
  - sistema agentico
  - omp
  - init os
  - adopt os
  - update os
  - metasistema
  - manager-only
---

# Operaciones Del Sistema Documental

Usar ante un pedido de JP para auditar, reparar o realinear la capa documental de Copicu. `realinear os` es una intención conversacional y la skill local es una ayuda portable, no prueba de un comando instalado ni autorización permanente.

## Frontera Y Razón

OS2 aporta recuperación selectiva y fuentes durables independientes del harness. Copicu conserva producto, dominio, datos, seguridad y efectos externos. AOS y `C:/dev/os` son antecedentes, no upstream obligatorio ni configuración a instalar; OMP/Pi sólo aportan capacidades cuando se usan.

Comparar mejoras por necesidad concreta y reescribir sólo las aplicables. No copiar registry, perfiles, inventarios, memoria, decisiones/tracks de otros proyectos ni políticas de modelos, tools o permisos. No adoptar otro repo, configurar un runtime ni modificar `.omp/`, scripts o junctions por el mero hecho de curar docs.

## Lectura Mínima

1. Comprobar el repo/cwd, [AGENTS.md](../../AGENTS.md), pedido actual y cambios ajenos.
2. Buscar por intención en nombres y metadata. Abrir el track pertinente y sólo las secciones necesarias de topics; el [mapa](../README.md) ayuda cuando haga falta.
3. Consultar código, specs, scripts o referencias profundas sólo para una inconsistencia concreta que el encargo permita investigar. No abrir archivos históricos como paquete inicial.

No leer ni mantener Working Memory como foco. La consulta CLI OS2 local es opcional y sólo devuelve metadata; el parser/router AOS se retiró sin trasladar foco, scoring o autoridad de runtime.

## Revisar

- Entrada liviana, sin transcript ni lectura obligatoria de catálogo.
- Un track por trabajo retomable: objetivo, estado, próximo paso y evidencia, sin router global duplicado.
- Topics: conocimiento y decisiones con razones; planes y permisos históricos no se vuelven reglas actuales.
- Referencias útiles con destino claro; formatos heredados y fechas desconocidas señalados, no convertidos por intuición.
- Skills portables en `docs/skills/`; discovery del harness opcional, sin dos carpetas canónicas ni reparación automática de junctions.
- Invariantes de clipboard, Tauri, datos dev/instalados, foco, updater e instalación preservadas. Para dogfood, [gates de tools](agent-tool-routing.md); no ejecutar UI como audit documental.
- Sin defaults de runtime importados ni garantía de que un script antiguo detecte todo drift.

## Corregir Dentro Del Pedido

Con alcance de edición autorizado: compactar duplicaciones, reparar referencias comprobadas, actualizar fuentes y promover conocimiento reusable al topic pertinente. Conservar evidencia útil antes de archivar y dejar enlaces de compatibilidad cuando correspondan. Los tracks cerrados OS2 permanecen en `docs/tracks/`, no se archivan por ceremonia.

Un pedido de estudiar o sólo leer no autoriza estas escrituras. No ampliar el alcance porque una corrección parezca pequeña. Preguntar ante pérdida de memoria dudosa, una decisión nueva de producto/sistema, instalación, configuración externa, scripts con efectos o un permiso faltante.

## Cierre

1. Curar sólo el delta útil: estado y pendientes en el track; reglas/decisiones reutilizables en su topic. No mantener documentos globales de foco, decisiones o preguntas.
2. Revisar diff, metadata aplicable, referencias y coherencia semántica. Separar evidencia anterior de comprobación propia; no llamar OS2 al audit AOS ni declarar catálogo válido si hay metadata legacy pendiente.
3. Informar hecho, comprobado, pendiente y límites. Guardar no cambia de sesión; un handoff prepara un kickoff copiable sin lanzar otra sesión. Procedimiento en [continuidad documental](docs-knowledge-system.md#guardar-y-preparar-un-handoff).

Instalar, commit, push, publicación, deploy, producción, acciones destructivas, datos privados, credenciales y envíos externos requieren autorización explícita y actual. La curaduría no los habilita.

## Criterio De Éxito

Encontrar y comprender objetivo, estado y próximo paso con lectura selectiva, sin depender del harness ni perder gates locales. Metadata/enlaces válidos son una comprobación estructural; comprensión desde una sesión realmente nueva y uso del producto requieren evidencia distinta. No garantizar “perfecto” ni aceptación humana por pasar un audit.

## Referencias

- [Sistema de conocimiento](docs-knowledge-system.md), [calidad documental](os-quality.md), [skills locales](local-codex-skills.md) y [adopción OS2](../tracks/os2-adoption.md).
- [Consultor local](../../scripts/knowledge.ts) y [check documental](../../scripts/docs-check.ts): sin dependencia del procedimiento manual, harness, instalación o reparación de discovery. `check` incluye fixtures temporales, no producto.
