# Pi Agentic OS Command Surface

Estado canónico: AOS 1.1.

## Superficie Diaria

| Entrada | Tipo | Resultado |
| --- | --- | --- |
| `/flow` | package global | `Pensar | Planear | Hacer | Cerrar`; Planear declara `execution_route` y Hacer la aplica antes del handoff documental en sesión nueva, sin Agent ni auto-send. |
| `/new` | Pi | Sesión limpia manual fuera del handoff automático de Hacer. |
| `/reload` | Pi | Recarga recursos cuando cambia el package/extensión. |
| `/model` | Pi | Cambia el modelo explícitamente. |

## Capabilities Locales

- `copicu_computer_use` vive en `.pi/extensions/copicu-computer-use.ts` y sólo
  opera la app local cuando el usuario pide probarla.
- Prompts de research/release, taskflows de producto y skills locales no forman
  parte del lifecycle `/flow`.

## Contrato

Copicu declara `aos.requirements.json` con `aos.flow-first@1.1.0`, scope `user`,
cardinalidad `1` y provenance esperado `package`. La ruta por defecto es
`balanced`; modelo o auth ausentes bloquean sin fallback. No debe existir una
copia `.pi/extensions/aos-flujo.ts` ni aliases locales para pensar, planear,
implementar, continuar o cerrar.
