# AGENTS.md

Copicu es un clipboard manager inspirado en CopyQ, con Tauri 2, TypeScript, Rust y SQLite.

Es downstream de AOS: recibe una capa agentica local adaptada, no el metasistema completo de `C:\dev\os`. No copiar registry global, tracks/decisiones del kit, inventarios ni docs que lo hagan parecer upstream canonico.

## Lectura Inicial

Antes de trabajar en este proyecto, usar una ruta liviana:

1. Consultar `docs/.generated/context-index.md` si existe; no volcarlo entero si solo hace falta elegir ruta.
2. Leer `docs/WORKING_MEMORY.md`.
3. Leer `docs/README.md` solo si hace falta mapa documental.
4. Consultar `docs/TOPICS.md` o buscar por triggers para elegir topic.
5. Abrir solo el topic, track, spec o codigo puntual segun el pedido.

No abrir por defecto docs largos (`PROJECT`, `ASSISTANT_RULES`, `DEVELOPMENT`, specs completas, referencias). En Pi, preferir `map/search` scoped (`src`, `src-tauri/src`, `docs/topics`); `docs/skills/impeccable/` es solo para UI/impeccable.

Si aparecen archivos de contexto nuevos, integrarlos, moverlos, archivarlos con estado claro o preguntar antes de borrarlos.

## Reglas Generales

- Respetar el stack objetivo salvo decision explicita en contrario: Tauri 2, TypeScript, frontend React/Vite o Solid, Rust y SQLite.
- No intentar paridad completa con CopyQ por defecto. El producto es CopyQ-inspired, no CopyQ-compatible.
- Validar temprano los comportamientos nativos dificiles: monitoreo de clipboard, global shortcut, tray, foco anterior y paste-to-previous-window.
- No revertir cambios de usuario sin pedido explicito.
- No dejar archivos de contexto preexistentes sin indexar ni sin destino claro.
- Mantener documentacion liviana: decisiones durables a docs estables; trabajos vivos en `docs/tracks/`.
- Para features grandes, crear o actualizar una spec en `specs/` antes de implementar.
- Tras cambios de codigo/config/assets/frontend/backend, reiniciar o recargar la instancia dev segun corresponda; no dejar una app vieja corriendo.
- No dejar que la capa agentica se convierta en transcript, backlog historico o lectura obligatoria amplia. Si crece, compactar, archivar o mover a referencia profunda.

## Comandos De Sistema

- Si JP dice `aos-realinear-os`, `realinear os` o pide auditar/reparar el sistema agentico, abrir `docs/topics/agentic-os-operations.md`. Limitar cambios a la capa agentica salvo pedido explicito.
- Si JP dice `aos-perfect-os`, `perfect os` o pide dejar el OS en condiciones, abrir `docs/topics/os-quality.md` y aplicar el checklist sin tocar producto/runtime salvo pedido explicito.
- Si JP dice `actualizar instalada`, `promover dev a instalada`, `crear instalador e instalar`, `instalar current` o pide que la app instalada quede igual a lo que le gusto en dev, ejecutar `npm run install:current`. Esto debe buildar Tauri, crear el instalador NSIS, cerrar instancias `copicu.exe`, instalar silencioso y relanzar `C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`. Mantener separacion vigente: instalada usa `%APPDATA%\dev.jpsala.copicu`; dev usa `.codex-run\dev-isolated`.
- Si JP dice `aos-sigamos` o `sigamos`, continuar el trabajo activo en la misma sesion. No hacer cierre, handoff, thread nuevo ni pedir `aos-gol` salvo que el usuario cambie de objetivo.
- Si JP dice `aos-guardar-sesion`, `aos-checkpoint`, `checkpoint`, `persistí estado` o pide guardar lo valioso antes de seguir, persistir solo valor durable en docs vivos sin cerrar sesion, sin handoff, sin thread nuevo, sin pedir `aos-gol` y sin compactar salvo pedido explicito.
- En Pi, los comandos locales del OS usan prefijo `aos-*` (`/aos-checkpoint-nudge`, `/aos-status`, `/aos-compact`, `/aos-continuar`, `/aos-sync`, `/aos-gol`) y estan documentados en `docs/topics/pi-agentic-os.md`.
- Si JP dice `aos-cerrar-sesion` o `cerrar sesion`, persistir el valor de la sesion en docs vivos antes de responder: tracks, topics, decisiones, working memory y specs si aplica. No crear transcript ni archivo historico por defecto.
- Si JP dice `aos-nueva-sesion`, `aos-continuar-sesion` o `continuar sesion`, hacer primero el mismo cierre de valor que `cerrar sesion` y despues abrir un thread visible nuevo con handoff compacto si la herramienta de la plataforma esta disponible; si no, devolver un prompt pegable. La memoria principal son los docs actualizados, no el prompt.
- Si JP dice `aos-nueva-sesion-con-gol`, `aos-continuar-sesion-con-gol`, `aos-siguiente`, `continuar sesion con gol`, `continuar con gol`, `siguiente`, `nueva sesion con gol` o equivalente, hacer el cierre de valor de `continuar sesion`, abrir un thread visible nuevo con handoff compacto y pedir que la nueva sesion arranque con `aos-gol` para el proximo lote acordado. No hay variante para seguir en la misma sesion con `aos-gol`.

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

Evitar una landing page o UI promocional. La primera pantalla debe ser el producto util.

Las skills locales portables viven en `docs/skills/`; `.agents/skills` es solo compatibilidad tecnica. `impeccable` vive en `docs/skills/impeccable` para trabajos de interfaz.
