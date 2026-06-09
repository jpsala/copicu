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
- Tras actualizar la skill, correr `quick_validate.py` sobre la carpeta de la skill y anotar el cambio en `docs/active-work/004-actions-scripting.md`.

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

## Cierre De Sesion

Cuando el usuario pida "cerrar sesion", "guardar sesion", "compactar", "seguir en una sesion nueva" o equivalente, no crear un archivo historico de sesion por defecto.

No usar un skill externo de session saver para este proyecto. El cierre se maneja con documentacion viva del repo: `active-work`, topics, decisiones y memoria corta.

Actualizar solo el conocimiento que sirve para continuar:

1. `docs/active-work/` para trabajos vivos, estado actual, checklist y proximo corte.
2. `docs/topics/` para descubrimientos, research, patterns y decisiones por area.
3. `docs/DECISIONS.md` para decisiones durables.
4. `docs/WORKING_MEMORY.md` para el estado operativo corto.
5. Specs relevantes si cambio el alcance, plan o tareas.

No duplicar documentacion estable: linkear topics/specs/active-work en vez de copiar contenido.

No guardar historial largo salvo que ayude a preservar una decision, error, tradeoff o preferencia de colaboracion. No guardar secretos, datos reales del clipboard, bases locales, logs sensibles ni rutas privadas innecesarias.

Al final, si es util para continuar en una sesion nueva, devolver una sintesis compacta en la respuesta final con:

- archivos actualizados;
- decisiones tomadas;
- estado actual;
- proximo paso concreto;
- prompt corto opcional para pegar en una sesion nueva.

El objetivo del cierre no es archivar la conversacion: es dejar `active-work` y topics correctos, mas una sintesis barata si el usuario la quiere usar.
