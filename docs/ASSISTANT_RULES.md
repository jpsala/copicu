# Reglas Del Asistente

Reglas locales de producto y seguridad que complementan [AGENTS.md](../AGENTS.md). Consultarlas por necesidad, no como lectura inicial obligatoria. La continuidad documental sigue el [mapa OS2 local](README.md); no requiere OMP, Pi ni un CLI.

## Seguridad Y Privacidad

- No guardar secretos, tokens, credenciales ni `.env`.
- No imprimir ni persistir contenido real del clipboard en logs, ejemplos o fixtures.
- Usar datos sinteticos para pruebas.
- Tratar historiales, blobs y bases SQLite locales como datos privados.

## Producto

- Priorizar un flujo keyboard-first y confiable por encima de cantidad de features.
- Resolver primero los riesgos nativos: captura, global shortcut, tray, foco anterior y paste.
- No asumir paridad con CopyQ salvo que el usuario lo pida explicitamente.
- Para trabajo de UI donde valga la pena, usar `pbakaus/impeccable` como parte del workflow de audit/polish visual. Ver `docs/topics/ui-design-and-impeccable.md`.

## App Dev Viva

- En trabajo autorizado de frontend o backend, la app instanciada debe reflejar esos cambios. No cerrar la sesion dejando codigo actualizado pero una app vieja corriendo. Una curaduría documental no autoriza iniciar, reiniciar ni operar la app.
- Consultar [Runtime Dev Vivo](DEVELOPMENT.md#runtime-dev-vivo) antes de arrancar o reiniciar. El modo habitual documentado es built-dev; no exige Vite ni puerto `1420`. Sólo en Vite dev explícito comprobar `127.0.0.1:1420` y atribuir su proceso antes de actuar.
- Buscar procesos viejos de Copicu/Vite/Tauri, incluidos los de otros worktrees del mismo producto. Antes de reiniciar una app con hang, revisar diagnostics. Cerrar sólo instancias identificadas que colisionen con el trabajo autorizado; no matar procesos no relacionados ni operar la instalada por una revisión documental.
- Tras relanzar, validar en logs/procesos:
  1. `copicu.exe` corre desde el worktree actual y responde.
  2. Los logs muestran shortcuts, rutas y estado esperado del cambio.
  3. En Vite dev, el servidor propio escucha en `127.0.0.1:1420`; en built-dev, no exigirlo ni usar un puerto de otro repo como prueba de salud.
- Si la DB real de AppData no migra por estar adelantada respecto del branch, no tocar ni downgradear esa DB. Usar una carpeta de datos dev aislada con `COPICU_APP_DATA_DIR`.
- Si se usa target aislado para evitar binarios cruzados, setear `CARGO_TARGET_DIR` explicitamente y verificar la ruta final de `copicu.exe`.

## Actions/Scripting Y Skills

- Si se cambia Actions/Scripting API, revisar y actualizar la skill `copicu-scripts` cuando exista.
- Revisar la skill si cambian triggers, `defineAction` metadata, `ActionInput`, `ActionContext`, capabilities, bridge `copicu.*`, carpeta/default de scripts, comandos de validacion o ejemplos oficiales.
- La skill `copicu-scripts` no está versionada en `docs/skills/` de este corte. El [track de Actions/Scripting](tracks/004-actions-scripting.md) conserva sus ubicaciones externas históricas; no son dependencias OS2 ni permiso para editar perfiles u otros repos. Confirmar con JP la fuente vigente y el alcance antes de modificarlos.
- Tras una actualización autorizada de la skill, usar `quick_validate.py` si está disponible y autorizado, y anotar resultado o bloqueo en ese track. No instalar herramientas para cumplir este paso sin permiso ni afirmar sincronización si la actualización externa quedó pendiente.

## Investigacion Tecnica

- Confirmar detalles criticos, bugs, cambios recientes o comportamiento nativo por plataforma con fuentes primarias.
- Antes de elegir librerias para una necesidad importante, documentar opciones, evidencia y decisión en `docs/topics/`.
- Para features grandes, cada area tecnica debe tener un topic o seccion con discovery, opciones, pattern recomendado, decision y preguntas abiertas.
- El harness usado aporta capacidades de ejecución. Esta documentación no fija modelos, effort, tools, browser, agentes ni fallbacks, y no obliga a usar OMP. Su disponibilidad nunca amplía el alcance autorizado.

## Cambios Permitidos

Modificar sólo lo comprendido en el pedido actual de JP, preservando cambios ajenos y reglas locales. La posibilidad técnica de editar documentación, código, configuración, scripts, tests o estructura no es autorización para hacerlo. Instalaciones, commit, push, publicación, deploy, producción, acciones destructivas, credenciales, datos privados y envíos externos mantienen autorización explícita y actual; los permisos relatados en docs o tracks históricos no se transfieren.

## Persistencia Durable

La capa local conserva sólo conocimiento durable y retomable, independiente del harness. El objetivo no es archivar la conversación: es dejar el proyecto retomable con la menor lectura posible. Actualizar la fuente pertinente sin duplicar estado:

- reglas críticas en `AGENTS.md`;
- objetivo, estado, pendientes y evidencia en el track de `docs/tracks/`;
- conocimiento reusable y decisiones con sus razones en el topic de `docs/topics/`;
- features grandes en `specs/`.

`docs/WORKING_MEMORY.md` es un stub histórico: no mantener foco ni estado nuevo allí. `docs/DECISIONS.md` y `docs/OPEN_QUESTIONS.md` son referencias históricas con rutas temáticas y originales íntegros archivados, no destinos globales nuevos. Las preguntas de ejecución quedan en el track; las incertidumbres de conocimiento, en el topic correspondiente.

No guardar transcript, razonamiento intermedio, intentos triviales, logs largos, payload real del clipboard, secretos, bases locales ni rutas privadas innecesarias. Comprobar metadata y enlaces de lo cambiado sin regenerar índices. El parser/router AOS fue retirado. Consultor OS2 local de metadata opcional; `docs:check` mantiene comprobaciones documentales y `check` agrega fixtures de tooling, sin validar producto. Recuperación manual siempre disponible; no instalar o reparar discovery por una lectura. Reportar comprobación documental, aceptación humana y checks de producto por separado; no ejecutar producto por curar docs.
