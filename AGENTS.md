# AGENTS.md

Este proyecto es un clipboard manager inspirado en CopyQ, construido desde cero con Tauri 2, TypeScript y un nucleo chico en Rust.

## Lectura Inicial

Antes de trabajar en este proyecto, leer:

1. `docs/README.md`
2. `docs/WORKING_MEMORY.md`
3. `docs/PROJECT.md`
4. `docs/ASSISTANT_RULES.md`
5. `docs/DEVELOPMENT.md`

Para temas puntuales, usar `docs/TOPICS.md` como router y abrir solo los topics necesarios.

La discusion inicial del proyecto fue integrada en `docs/`. Si aparecen archivos preexistentes nuevos, no dejarlos sueltos: integrarlos, moverlos a una ubicacion documentada o preguntar antes de borrarlos.

## Reglas Generales

- Respetar el stack objetivo salvo decision explicita en contrario: Tauri 2, TypeScript, frontend React/Vite o Solid, Rust y SQLite.
- No intentar paridad completa con CopyQ por defecto. El producto es CopyQ-inspired, no CopyQ-compatible.
- Validar temprano los comportamientos nativos dificiles: monitoreo de clipboard, global shortcut, tray, foco anterior y paste-to-previous-window.
- No commitear secretos, `.env`, bases locales, dumps de clipboard, rutas privadas ni datos sensibles capturados.
- No persistir contenido real del clipboard en ejemplos, tests o logs salvo que sea contenido sintetico.
- No revertir cambios de usuario sin pedido explicito.
- No dejar archivos de contexto preexistentes sin indexar ni sin destino claro.
- Mantener documentacion liviana: decisiones durables a docs estables; trabajos vivos en `docs/active-work/`.
- Para features grandes, crear o actualizar una spec en `specs/` antes de implementar.

## Persistencia

Hasta que exista implementacion, asumir:

- SQLite para metadata e historial normalizado.
- Directorio de blobs para imagenes o payloads grandes.
- Hashes de contenido para deduplicacion.
- Politicas de retencion por cantidad, edad y tamano total.

Estas reglas deben revisarse cuando se cree la primera arquitectura real.

## Design Context

La UI debe ser una herramienta local rapida, discreta y keyboard-first. Priorizar:

- picker searchable;
- navegacion por teclado;
- previews utiles para texto, codigo, URLs, HTML e imagenes;
- bajo consumo en idle;
- controles de privacidad claros.

Evitar una landing page o UI promocional. La primera pantalla debe ser el producto util.
