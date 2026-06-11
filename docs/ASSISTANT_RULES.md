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

## Cierre De Sesion

Cuando el usuario pida "cerrar sesion", "guardar sesion", "compactar", "continuar sesion", "seguir en una sesion nueva", "continuar con goal", "continuar sesion con goal" o equivalente, ejecutar un cierre de valor. No crear un archivo historico de sesion por defecto.

No usar un skill externo de session saver para este proyecto. El cierre se maneja con documentacion viva del repo: `tracks`, topics, decisiones y memoria corta.

### Protocolo Comun

El objetivo no es archivar la conversacion: es dejar el proyecto retomable con la menor lectura posible.

1. Extraer valor:
   - cambios de codigo, docs, configuracion, tests o scripts;
   - decisiones y tradeoffs;
   - checks corridos y resultados;
   - bloqueos reproducibles;
   - riesgos del worktree o datos locales;
   - preferencias nuevas de JP;
   - proximo paso concreto.
2. Filtrar ruido:
   - no guardar transcript;
   - no guardar razonamiento intermedio;
   - no guardar intentos fallidos triviales;
   - no guardar logs largos, payload real del clipboard, secretos, bases locales ni rutas privadas innecesarias.
3. Rutear memoria:
   - regla critica para todos los agentes -> `AGENTS.md`;
   - estado vivo o proximo paso -> `docs/WORKING_MEMORY.md`;
   - trabajo retomable -> `docs/tracks/`;
   - conocimiento reusable, research o pattern -> `docs/topics/`;
   - decision durable -> `docs/DECISIONS.md`;
   - alcance, plan o tareas de feature grande -> `specs/`.
4. Verificar:
   - regenerar `docs/.generated/context-index.md` con `bun run context:index` cuando cambien docs indexados;
   - correr `bun run context:audit` cuando se toque la capa agentica o haya riesgo de drift;
   - reportar checks de producto solo si se tocaron codigo/tests o si ya se habian corrido.
5. Sintetizar:
   - responder con archivos actualizados, decisiones, estado actual, checks, riesgos y proximo paso;
   - incluir prompt compacto solo si sirve para otra sesion.

### Cerrar Vs Continuar

`cerrar sesion` significa persistir valor y cerrar. No crea otra sesion.

`continuar sesion` significa persistir valor, cerrar el corte actual y seguir el trabajo pendiente en una sesion limpia:

1. ejecutar el Protocolo Comun;
2. construir un handoff compacto que apunte a docs actualizados;
3. crear un thread nuevo si la herramienta esta disponible y el usuario pidio continuar en nueva sesion;
4. si no hay herramienta, devolver el prompt para pegar manualmente.

El prompt de continuacion nunca es la memoria principal. La memoria principal son los docs actualizados.

`continuar con goal` significa ejecutar el Protocolo Comun y despues crear un Goal en la misma sesion para el proximo paso acordado.

`continuar sesion con goal` significa ejecutar el Protocolo Comun, crear un thread nuevo con handoff compacto y pedir que la nueva sesion cree un Goal para el proximo lote acordado. Usarlo cuando el plan ya esta acordado y conviene reducir context bloat.

### Destinos De Memoria

Actualizar solo el conocimiento que sirve para continuar:

1. `docs/tracks/` para trabajos vivos, estado actual, checklist y proximo corte.
2. `docs/topics/` para descubrimientos, research, patterns y decisiones por area.
3. `docs/DECISIONS.md` para decisiones durables.
4. `docs/WORKING_MEMORY.md` para el estado operativo corto.
5. Specs relevantes si cambio el alcance, plan o tareas.

No duplicar documentacion estable: linkear topics/specs/tracks en vez de copiar contenido.

No guardar historial largo salvo que ayude a preservar una decision, error, tradeoff o preferencia de colaboracion.

Al final, si es util para continuar en una sesion nueva, devolver una sintesis compacta en la respuesta final con:

- archivos actualizados;
- decisiones tomadas;
- estado actual;
- checks corridos o no corridos;
- riesgos y cosas que no hay que hacer;
- proximo paso concreto;
- prompt corto opcional para pegar en una sesion nueva.

Formato recomendado del handoff:

```text
Continuar en <repo>. Leer primero <ruta liviana>.
Estado actual:
Fuentes actualizadas:
Decisiones tomadas:
Checks:
Worktree / riesgos:
No hacer:
Objetivo de la nueva sesion:
Primer paso:
```
