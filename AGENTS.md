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

- Usar web/internet libremente por defecto cuando conocimiento externo o cambiante evite adivinar: docs oficiales, releases, issues/source, metadata de paquetes, errores, APIs y comparativas. No enviar secretos, `.env`, codigo privado sensible, datos personales ni credenciales a servicios externos.
- Si evidencia online contradice el repo local, docs del proyecto o comportamiento observado, consultar a JP antes de decidir; presentar ambas evidencias, fuentes e impacto practico.
- Antes de instalar dependencias, CLIs globales, paquetes de sistema, herramientas de package-manager o binarios/scripts remotos, pedir autorizacion explicita con comando exacto, alcance, motivo, riesgos, alternativa, cambios esperados y rollback. Tratar `curl | sh`/scripts remotos como alto riesgo y preferir alternativas auditables.
- Respetar el stack objetivo salvo decision explicita en contrario: Tauri 2, TypeScript, frontend React/Vite o Solid, Rust y SQLite.
- No intentar paridad completa con CopyQ por defecto. El producto es CopyQ-inspired, no CopyQ-compatible.
- Validar temprano los comportamientos nativos dificiles: monitoreo de clipboard, global shortcut, tray, foco anterior y paste-to-previous-window.
- No revertir cambios de usuario sin pedido explicito.
- Para bugs/refactors/reviews, usar `docs/topics/minimal-implementation.md` como politica liviana: preferir reusar y reducir superficie, sin quitar seguridad, privacidad, accesibilidad, checks ni memoria durable.
- No dejar archivos de contexto preexistentes sin indexar ni sin destino claro.
- Mantener documentacion liviana: decisiones durables a docs estables; trabajos vivos en `docs/tracks/`.
- Para bugs/debugging, documentar solo conocimiento reusable para el futuro: regla vigente, invariant, repro minimo, smoke/check util, decision de diseño o referencia externa necesaria. No guardar narrativa historica, intentos fallidos ni diagnosticos negativos salvo que cambien una regla operativa durable.
- Para features grandes, crear o actualizar una spec en `specs/` antes de implementar.
- Tras cambios de codigo/config/assets/frontend/backend, reiniciar o recargar la instancia dev segun corresponda; no dejar una app vieja corriendo.
- No dejar que la capa agentica se convierta en transcript, backlog historico o lectura obligatoria amplia. Si crece, compactar, archivar o mover a referencia profunda.

## Comandos De Sistema

- `aos-realinear-os` / `realinear os`: abrir `docs/topics/agentic-os-operations.md` y reparar solo la capa agentica salvo pedido explicito.
- `aos-perfect-os` / `perfect os`: abrir `docs/topics/os-quality.md`, aplicar checklist, regenerar indice/audit.
- `aos-sigamos` / `sigamos`: seguir en esta sesion; no cerrar, compactar ni abrir thread nuevo.
- `aos-guardar-sesion` / `aos-checkpoint` / `checkpoint`: persistir valor durable en docs vivos sin transcript ni handoff.
- `aos-cerrar-sesion` / `cerrar sesion`: guardar valor durable y cerrar, sin transcript por defecto.
- Continuidad Pi: JP guarda primero; luego `/aos-continuar [objetivo]` abre sesion nueva desde docs vivos (`--preview` para revisar).
- Comandos Pi locales documentados en `docs/topics/pi-agentic-os.md`: `/aos-status`, `/aos-sync`, `/aos-compact`, `/aos-continuar`, `/aos-skills`, `/aos-checkpoint-nudge`, `/aos-gol`.
- App instalada: si JP pide promover dev a instalada/crear instalador/instalar current, ejecutar `npm run install:current`; toca procesos Copicu instalados, asi que avisar y verificar evidencia.

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
