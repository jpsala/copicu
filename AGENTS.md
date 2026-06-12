# AGENTS.md

Este proyecto es un clipboard manager inspirado en CopyQ, construido desde cero con Tauri 2, TypeScript y un nucleo chico en Rust.

## Lectura Inicial

Antes de trabajar en este proyecto, usar una ruta liviana:

1. `docs/.generated/context-index.md` si existe.
2. `docs/WORKING_MEMORY.md`.
3. `docs/README.md` solo si hace falta mapa documental.
4. `docs/TOPICS.md` o busqueda por triggers para elegir topic.
5. Topic, track, spec o codigo puntual segun el pedido.

No abrir por defecto docs largos como `docs/PROJECT.md`, `docs/ASSISTANT_RULES.md`, `docs/DEVELOPMENT.md`, specs completas ni referencias profundas. Abrirlos solo cuando el pedido o el topic lo requiera.

La discusion inicial del proyecto fue integrada en `docs/`. Si aparecen archivos preexistentes nuevos, no dejarlos sueltos: integrarlos, moverlos a una ubicacion documentada, archivarlos con estado claro o preguntar antes de borrarlos.

## Reglas Generales

- Respetar el stack objetivo salvo decision explicita en contrario: Tauri 2, TypeScript, frontend React/Vite o Solid, Rust y SQLite.
- No intentar paridad completa con CopyQ por defecto. El producto es CopyQ-inspired, no CopyQ-compatible.
- Validar temprano los comportamientos nativos dificiles: monitoreo de clipboard, global shortcut, tray, foco anterior y paste-to-previous-window.
- No commitear secretos, `.env`, bases locales, dumps de clipboard, rutas privadas ni datos sensibles capturados.
- No persistir contenido real del clipboard en ejemplos, tests o logs salvo que sea contenido sintetico.
- No revertir cambios de usuario sin pedido explicito.
- No dejar archivos de contexto preexistentes sin indexar ni sin destino claro.
- Mantener documentacion liviana: decisiones durables a docs estables; trabajos vivos en `docs/tracks/`.
- Para features grandes, crear o actualizar una spec en `specs/` antes de implementar.
- Despues de hacer cambios de codigo, configuracion, assets o frontend/backend, asegurarse de que la app que ve el usuario quede actualizada con los ultimos cambios: reiniciar o recargar la instancia dev segun corresponda, y no dejar una app vieja corriendo.
- No dejar que la capa agentica se convierta en transcript, backlog historico o lectura obligatoria amplia. Si crece, compactar, archivar o mover a referencia profunda.

## Comandos De Sistema

- Si JP dice `realinear os` o pide auditar/reparar el sistema agentico, abrir `docs/topics/agentic-os-operations.md`. Limitar cambios a la capa agentica salvo pedido explicito.
- Si JP dice `actualizar instalada`, `promover dev a instalada`, `crear instalador e instalar`, `instalar current` o pide que la app instalada quede igual a lo que le gusto en dev, ejecutar `npm run install:current`. Esto debe buildar Tauri, crear el instalador NSIS, cerrar instancias `copicu.exe`, instalar silencioso y relanzar `C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`. Mantener separacion vigente: instalada usa `%APPDATA%\dev.jpsala.copicu`; dev usa `.codex-run\dev-isolated`.
- Si JP dice `sigamos`, continuar el trabajo activo en la misma sesion. No hacer cierre, handoff, thread nuevo ni pedir `gol` salvo que el usuario cambie de objetivo.
- Si JP dice `cerrar sesion`, persistir el valor de la sesion en docs vivos antes de responder: tracks, topics, decisiones, working memory y specs si aplica. No crear transcript ni archivo historico por defecto.
- Si JP dice `continuar sesion`, hacer primero el mismo cierre de valor que `cerrar sesion` y despues abrir un thread visible nuevo con handoff compacto si la herramienta de la plataforma esta disponible; si no, devolver un prompt pegable. La memoria principal son los docs actualizados, no el prompt.
- Si JP dice `continuar sesion con gol`, `continuar con gol`, `siguiente`, `nueva sesion con gol` o equivalente, hacer el cierre de valor de `continuar sesion`, abrir un thread visible nuevo con handoff compacto y pedir que la nueva sesion arranque con el comando `gol` para el proximo lote acordado. No hay variante para seguir en la misma sesion con `gol`.

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

Las skills locales portables viven en `docs/skills/`; `.agents/skills` es solo compatibilidad tecnica. `impeccable` vive en `docs/skills/impeccable` para trabajos de interfaz.
