# AGENTS.md

Copicu es un clipboard manager inspirado en CopyQ, con Tauri 2, TypeScript, Rust y SQLite.

Es downstream de AOS: recibe una capa agentica local adaptada, no el metasistema completo del manager upstream. No copiar registry global, tracks/decisiones del kit, inventarios ni docs que lo hagan parecer upstream canonico.

## Lectura Inicial

Antes de trabajar en este proyecto, usar una ruta liviana:

1. Consultar `docs/.generated/context-index.md` si existe; no volcarlo entero si solo hace falta elegir ruta.
2. Leer `docs/WORKING_MEMORY.md`.
3. Leer `docs/README.md` solo si hace falta mapa documental.
4. Consultar `docs/TOPICS.md` o buscar por triggers para elegir topic.
5. Abrir solo el topic, track, spec o codigo puntual segun el pedido.

No abrir por defecto docs largos (`PROJECT`, `ASSISTANT_RULES`, `DEVELOPMENT`, specs completas, referencias). En OMP, preferir búsquedas scoped (`src`, `src-tauri/src`, `docs/topics`); `docs/skills/impeccable/` es solo para UI/impeccable.

## Reglas Generales

- Usar web/internet libremente por defecto cuando conocimiento externo o cambiante evite adivinar: docs oficiales, releases, issues/source, metadata de paquetes, errores, APIs y comparativas. No enviar secretos, `.env`, codigo privado sensible, datos personales ni credenciales a servicios externos.
- Browser visible/desatendido usa la capacidad nativa del harness activo; AXI, adapters y Lavish quedan como fallback manual de OMP únicamente. Vivaldi personal sólo si JP lo pide.
- No usar OMP Browser Relay/`app.relay`; login nuevo y efectos externos sensibles conservan los gates locales. Referencia local: `docs/topics/agent-tool-routing.md`.
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

## Control plane portable

- Traycer con el harness nativo activo es la ruta cotidiana: conversar no implementa, planear no ejecuta e implementar actúa en esta sesión.
- OMP queda standalone/manual para compatibilidad de producto; Traycer no lo invoca automáticamente y Pi sólo aplica a producto/laboratorio si un gate local lo permite.
- El repo no depende de `.traycer` ni de artifacts del manager. El owner mantiene la rama/worktree; simultaneidad exige aislamiento y el handoff bajo demanda contiene objetivo, rama/worktree, decisiones, archivos/cambios, checks y siguiente gate.
- Usar tools mínimas; todos para trabajo multietapa y subagentes sólo por pedido de JP en slices independientes.
- Default `Sol Medium`; High sólo por ambigüedad/riesgo material, seguridad, irreversibilidad o producción. Sin fallback de modelo/provider/auth.
- Sin sesión nueva, handoff ni auto-send rutinarios; persistir una vez sólo valor durable. Campos de control del foco en `WORKING_MEMORY.md` ocupan una línea física.
- `aos-realinear-os` / `realinear os` es operación manager: abrir `docs/topics/agentic-os-operations.md`; no crear prompt.
- `computer` built-in vive sólo en `.omp/config.yml`: avisar UI visible, inspeccionar `read_only`, AX no basta para WebView2 y C0 exige app externa -> hotkey foreground -> type global sin targetear Copicu -> token visible.
- Capacidades en `docs/skills/`, discovery en `.agents/skills` y único comando local `.omp/commands/research.md`; cero superficie activa `.pi`.
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
