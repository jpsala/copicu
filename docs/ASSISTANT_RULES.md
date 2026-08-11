# Reglas Del Asistente


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

- Despues de cambios de frontend o backend, la app instanciada debe reflejar esos cambios. No cerrar la sesion dejando codigo actualizado pero una app vieja corriendo.
- Antes de arrancar o reiniciar `npm run tauri:dev`, buscar procesos viejos de Copicu/Vite/Tauri, especialmente instancias de otros worktrees (`copyq-tauri` vs `copyq-tauri-hotkeys`) y procesos escuchando `127.0.0.1:1420`.
- Si hay una instancia vieja del mismo producto ocupando el puerto o registrando shortcuts, cerrarla antes de relanzar. No matar procesos no relacionados.
- Tras relanzar, validar tres cosas en logs/procesos:
  1. Vite escucha en `127.0.0.1:1420`.
  2. `copicu.exe` corre desde el worktree actual.
  3. Los logs muestran shortcuts/estado esperado del cambio.
- Si la DB real de AppData no migra por estar adelantada respecto del branch, no tocar ni downgradear esa DB. Usar una carpeta de datos dev aislada con `COPICU_APP_DATA_DIR`.
- Si se usa target aislado para evitar binarios cruzados, setear `CARGO_TARGET_DIR` explicitamente y verificar la ruta final de `copicu.exe`.

## Actions/Scripting Y Skills

- Si se cambia Actions/Scripting API, revisar y actualizar la skill `copicu-scripts` cuando exista.
- Revisar la skill si cambian triggers, `defineAction` metadata, `ActionInput`, `ActionContext`, capabilities, bridge `copicu.*`, carpeta/default de scripts, comandos de validacion o ejemplos oficiales.
- Ubicaciones esperadas de la skill:
  - `C:\Users\jpsal\.codex\skills\copicu-scripts`;
  - `C:\dev\agent-infra\rules\skills\copicu-scripts`.
- Tras actualizar la skill, correr `quick_validate.py` sobre la carpeta de la skill y anotar el cambio en `docs/tracks/004-actions-scripting.md`.

## Investigacion Tecnica

- Confirmar detalles criticos, bugs, cambios recientes o comportamiento nativo por plataforma con fuentes primarias.
- Antes de elegir librerias para una necesidad importante, documentar opciones, evidencia y decisión en `docs/topics/`.
- Para features grandes, cada area tecnica debe tener un topic o seccion con discovery, opciones, pattern recomendado, decision y preguntas abiertas.
- La selección de tools, browser y agentes pertenece a OMP.

## Cambios Permitidos

El asistente puede modificar documentacion, codigo, configuracion, scripts, tests y estructura del proyecto, respetando reglas locales y cambios del usuario.

## Persistencia Durable

La capa local conserva sólo conocimiento durable y retomable; las decisiones de
ejecución de OMP no se duplican en el repo.

El objetivo no es archivar la conversación: es dejar el proyecto retomable con
la menor lectura posible. Promover únicamente:

- reglas críticas a `AGENTS.md`;
- foco y estado vivo a `docs/WORKING_MEMORY.md`;
- trabajo retomable a `docs/tracks/`;
- conocimiento reusable a `docs/topics/`;
- decisiones durables a `docs/DECISIONS.md`;
- features grandes a `specs/`.

No guardar transcript, razonamiento intermedio, intentos triviales, logs largos,
payload real del clipboard, secretos, bases locales ni rutas privadas
innecesarias. Regenerar índice/audit sólo cuando la capa documental cambie y
reportar checks de producto sólo si son relevantes para el corte.
