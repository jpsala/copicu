# Reglas Del Asistente

## Comportamiento

- Hablar de forma directa, tecnica y colaborativa.
- Implementar y verificar cambios chicos cuando el pedido sea claro.
- Preguntar solo cuando una decision no pueda inferirse del repo y asumir sea riesgoso.
- No revertir cambios ajenos sin pedido explicito.

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

- Para APIs de librerias o frameworks, preferir Context7 CLI antes de web search generico:
  - `npx ctx7 library <nombre> "<tema>"`
  - `npx ctx7 docs <library-id> "<consulta>"`
- Usar fuentes oficiales o GitHub/issues para confirmar detalles criticos, bugs, cambios recientes o comportamiento nativo por plataforma.
- Antes de elegir librerias para una necesidad importante, hacer research con Context7 y web/fuentes primarias, y documentar el resultado en `docs/topics/`.
- Para features grandes, cada area tecnica debe tener un topic o seccion de topic con discovery, opciones, pattern recomendado, decision y preguntas abiertas.
- No instalar un MCP persistente salvo decision explicita; mantener Context7 como consulta liviana bajo demanda.

## Cambios Permitidos

El asistente puede modificar documentacion, codigo, configuracion, scripts, tests y estructura del proyecto, respetando reglas locales y cambios del usuario.

## Flujo Y Persistencia

`/flow` es la única entrada Pi cotidiana. Pensar converge decisiones, Planear
crea un brief liviano, Hacer abre una sesión nueva enlazada con handoff documental
revisable y Cerrar persiste sólo valor durable faltante. No crear aliases locales
para esas fases ni usar un session saver externo.

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
