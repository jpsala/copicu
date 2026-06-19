---
id: ai-vague-search
status: first-planner-slice-implemented
priority: 6
updated: 2026-06-07
---

# AI Search, Metadata And Command Planning

AI metadata, busqueda vaga/semantica y comandos asistidos son objetivos definitivos. El primer corte util debe ser busqueda y filtros en lenguaje natural, antes de permitir ejecucion amplia de comandos.

## Decisión

Lo vamos a implementar, pero por fases.

AI debe ser una capa sobre metadata/actions, no magia pegada encima del picker. La AI traduce intencion a planes estructurados y el host ejecuta esos planes con APIs normales.

Provider externo actual: endpoint OpenAI-compatible configurable. El contrato de credenciales acepta Settings local (`ai.apiKey`) o `.env`/entorno con claves fijas: `COPICU_AI_API_KEY` para el secreto y, opcionalmente, `COPICU_AI_ENDPOINT`/`COPICU_AI_MODEL` para elegir provider/modelo. Settings ya no pide ni guarda nombres de variables de entorno, pero sí permite guardar la key localmente para usuarios no técnicos. No guardar el valor de la key en docs/logs/tests y tratar DB/settings como almacenamiento local sensible.

Decision 2026-06-06:

- usar Vercel AI SDK + Zod para el primer planner estructurado, con posibilidad de cambiar luego;
- usar OpenRouter como default de ejemplo (`https://openrouter.ai/api/v1`, `openai/gpt-4.1-mini`) y mantener OpenAI/Groq como bloques comentados en `.env.example`;
- primer planner manual implementado sobre `history_search`: el picker usa prefijo `ai:` para llamar `mode: "ai"`, Rust invoca `scripts/ai-query-planner.mjs`, valida salida estructurada y ejecuta la query resultante localmente con `mode: "structured"`;
- si AI esta deshabilitada, falta la key o el planner falla, se usa fallback estructurado local con warning;
- en este corte no se manda contenido de clips al modelo: solo texto de intencion, query actual vacia y sintaxis soportada.

Topic tecnico: `docs/topics/ai-search-and-actions.md`.

## Primer Corte Propuesto

AI Query Planner:

- input: texto libre del usuario + contexto del picker;
- output: `AiSearchPlan` JSON validado;
- execution: search paginado local con filtros por texto, tag, tipo, app/origen, fechas y metadata;
- fallback: query syntax deterministica (`tag:foo`, `kind:image`, `mime:image/*`, `has:notes`, `after:yesterday`) para no depender siempre de AI;
- UI: modo/comando manual, no jobs automaticos.

Estado 2026-06-06: base deterministica implementada antes de AI. El backend parsea query syntax en `src-tauri/src/storage.rs` y la ejecuta con SQLite paginado. Soporta texto/frases/negacion, `tag:`/`#tag`, `kind:`, `mime:`, `has:`, `after:`, `before:`, `on:` y relativos simples. `app:` sigue pendiente porque todavia no se captura source process/window. La API host reusable ahora es `history_search(HistorySearchRequest)`, usada por el picker y por scripts via `copicu.history.search`.

Primer planner AI implementado 2026-06-06:

- dependencia agregada: `@ai-sdk/openai-compatible`;
- runner: `scripts/ai-query-planner.mjs` con Vercel AI SDK v6 (`generateText` + `Output.object`) y Zod;
- host: `src-tauri/src/ai_planner.rs`, que lee la API key desde env real o `.env` local del project root por clave fija `COPICU_AI_API_KEY`, luego `ai.apiKey` de Settings, y como fallback final compat legacy `GROQ_API_KEY`/`OPENROUTER_API_KEY`/`OPENAI_API_KEY`; endpoint/model siguen teniendo overrides opcionales;
- comando Tauri `history_search` intercepta `mode: "ai"` y ejecuta el plan sobre `storage.history_search`;
- UI manual: prefijo `ai:` en el search input, por ejemplo `ai: textos largos de ayer con notas`.

Dogfood/hardening 2026-06-06:

- OpenRouter real con `OPENROUTER_API_KEY` local valido el runner y el IPC Tauri sin enviar contenido de clips; luego se agrego compatibilidad fija `COPICU_AI_API_KEY` para evitar que el usuario configure nombres de variables en Settings;
- bug corregido: structured outputs strict de OpenAI/OpenRouter requiere que todas las propiedades del schema sean `required`; `needsClarification` ahora es `string | null` y `warnings` siempre es array;
- bug corregido: despues de una busqueda `ai:`, Enter quedaba deshabilitado porque la UI comparaba el input original con la query interpretada; ahora guarda tambien el input ejecutado;
- agregado timeout de 30s al proceso Node del planner para que el picker caiga a fallback local con warning si el provider cuelga;
- UI discreta muestra `AI interpreted`, query interpretada, explicacion y warnings bajo la barra de search.

Hardening adicional 2026-06-06:

- el runner `scripts/ai-query-planner.mjs` ahora atrapa errores de JSON/Zod/provider y escribe un unico `[AI_PLANNER_ERROR] ...` redacted, sin stack trace, code frame ni payload de input;
- `src-tauri/src/ai_planner.rs` clasifica fallos del planner antes de mostrarlos como warning UI; un error de schema ya no expone `ZodError`, `requestSchema.parse(...)` ni campos sensibles;
- agregado modo offline `COPICU_AI_PLANNER_MOCK_PLAN` para probar el contrato del planner sin red ni provider real;
- agregado `npm run ai:planner:test`, que cubre plan mock valido y error de schema redacted.
- hardening UI: `refreshHistory` ahora captura errores del comando `history_search`, apaga el estado pending y muestra un error/interpretacion visible; la linea `AI interpreted` vuelve a mostrarse para modo AI, incluidos warnings de fallback. Esto evita que una falla del planner deje el picker aparentando estar colgado.

Recap de interaccion AI 2026-06-06:

- `Enter` no debe disparar busqueda AI porque ya activa el item seleccionado. Mantenerlo para copy/paste preserva el flujo keyboard-first del picker.
- Opcion actual: prefijo `ai:` con busqueda al tipear/debounce. Es rapida de dogfoodear pero puede disparar llamadas remotas parciales si el usuario escribe lento.
- Opcion recomendada siguiente: modo AI explicito con `Ctrl+J` o boton/segmento en la barra de search. El usuario escribe lenguaje natural y confirma con ese gesto; `Enter` sigue activando el resultado.
- Opcion secundaria: Command Palette (`Ctrl+K`) con comando "AI search current query". Encaja con acciones, pero es un paso extra para uso frecuente.
- Opcion futura: chip `AI` dentro del search input que alterna modo, con `Esc` saliendo del modo antes de ocultar si hay query.
- Regla de error: si AI falla, timeout, key ausente o provider responde schema invalido, Copicu debe quedarse usable, ejecutar fallback local estructurado cuando sea posible y mostrar un warning corto, redacted y accionable.

Actualizacion de interaccion implementada:

- `ai:` ahora es un draft, no un filtro live. Mientras el usuario escribe, la UI muestra `AI draft` y no llama al planner ni queda en `Filtering`.
- Primer `Enter` con `ai:` pendiente llama al planner, aplica la query interpretada y muestra `AI interpreted`.
- Despues de aplicar la interpretacion, `Enter` vuelve a activar el item seleccionado.
- El polling automatico de historial nunca relanza AI; si ya hay una query interpretada, refresca con la query estructurada local.
- Timeout del planner reducido a 8s para que un provider lento no bloquee el picker.
- `AI planning` muestra spinner en el badge mientras espera respuesta del provider.
- Decision 2026-06-07: no agregar fallback deterministico por frases (`ayer`, `imagenes`, etc.) porque duplica semantica del planner. Se midieron candidatos OpenRouter/OpenAI-compatible con query sintetica `todas las de ayer`: `google/gemini-3.1-flash-lite` tardo ~8.1s; `deepseek/deepseek-v4-flash` ~1.7s; `mistralai/mistral-small-2603` ~1.2s; Groq `openai/gpt-oss-120b` via `https://api.groq.com/openai/v1` respondio ~1.4s. Default actual: Groq por pedido de JP.

Validaciones:

```powershell
npm run ai:planner:test
npm run build
npm run visual:check
cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Nota de validacion 2026-06-06: `npm run visual:check -- --workers=2` paso 58/58 despues de agregar mock de `plugin:event|listen` al harness visual. `npm run rust:test` compila pero vuelve a fallar al arrancar el binario con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

Dogfood real por IPC:

- "text clips from yesterday about sqlite with notes" -> `kind:text on:yesterday "sqlite" has:notes`;
- "image clips with notes" -> `kind:image has:notes`.

No se imprimieron ni enviaron contenidos reales de clips; solo intencion del usuario y sintaxis soportada.

## Cierre 2026-06-07: Debug De Summary AI Sobre Items Chequeados

Se estuvo dogfoodeando el pedido: "tomá todos los items chequeados y hacé un summary".

Hallazgos:

- El planner primero tradujo "chequeados" como `is:marked`; esto puede coincidir con el estado de la UI, pero no era suficiente para distinguir selección chequeada visible vs marcados globales.
- `history_search` en modo AI no pasaba `selectedItemIds`, `visibleItemIds` ni `currentItemId` al backend; se agregó `aiContext` al request y el frontend lo llena desde refs para no desestabilizar el refresh/scroll.
- El runner temporal fallaba si `input.context.selectedItemIds` o `input.selectionItems` venían ausentes; ahora usa defaults seguros.
- El planner podía generar código que pasaba un objeto item completo donde una API esperaba ID, causando `invalid item id: [object Object]`; el runner ahora normaliza IDs aceptando `id` directo u objeto `{ id }`, y el prompt de `ai-script-planner` instruye usar `item.id`.
- El primer "summary" real no era semántico: el script podía concatenar contenido y mostrarlo en Markdown. Se agregó y luego se expandió la capability/API `ai:summarize` hacia `copicu.ai.respondMarkdown({ instruction, items, context })`, con runner `scripts/ai-markdown-summary.mjs`, para generar Markdown obligatorio usando el provider AI configurado y luego mostrarlo con `copicu.ui.markdownOutput`.

Privacidad/riesgo:

- `ai:summarize` sí envía el contenido de los items provistos al provider configurado. Mantenerlo como capability explícita y no usarla automáticamente fuera de pedidos manuales de AI.
- El límite actual del runner de summary es hasta 200 items y truncado por item en `scripts/ai-markdown-summary.mjs`.
- `summarizeMarkdown` queda como alias transitorio; los planners/scripts nuevos deben usar `respondMarkdown` para summaries, reportes, traducciones, comparaciones, extracciones o respuestas libres sobre items.

Checks pasados:

```powershell
npm run build
node --test tests/ai-script-planner.test.mjs
npm run visual:check
cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

`npm run rust:test` compila pero sigue fallando al arrancar el binario de tests con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

Próximo debug:

1. Reiniciar `npm run tauri:dev` para asegurar que Rust y scripts nuevos estén cargados.
2. Repetir el prompt de summary con pocos items chequeados sintéticos primero.
3. Si falla, capturar solo error/status/capabilities/script summary, no payload real. Revisar especialmente si el script usa `ctx.selectedItemIds` o vuelve a buscar `is:marked`.
4. Endurecer tests con mock de plan que use `copicu.ai.respondMarkdown` sobre `ctx.selectedItemIds`.

## Ideas

- Titular clips largos.
- Resumir clips.
- Taggear automáticamente.
- Detectar lenguaje de código.
- OCR/caption de imágenes.
- Extraer entidades y tareas.
- Búsqueda por intención:
  - “el snippet de sqlite que copié ayer”;
  - “la imagen del error de chrome”;
  - “el texto para mandarle a Andrés”.
- Interpretar filtros complejos:
  - “todos los mensajes que tienen el tag X y contienen Y”;
  - “clips sin tag de esta semana”;
  - “imagenes con notes que mencionan error”.
- Planear comandos sobre la API host:
  - buscar candidatos;
  - agregar tags/metadata;
  - resumir seleccion;
  - ejecutar series de actions con capabilities explicitas.

## Requisitos Previos

- Privacy gates.
- Actions/logging.
- Metadata estructurada.
- Query backend paginado.
- Storage para embeddings o índices externos/locales.
- Settings AI: provider/model, enable/disable, privacy policy y costo/logging.
- Validador de planes JSON antes de ejecutar cualquier accion.

## No Hacer En El Primer Corte

- No dar acceso crudo a SQL, shell, filesystem, clipboard o input nativo.
- No automatizar envio de todos los clips a AI.
- No mutar metadata sin confirmacion o action explicita.
- No guardar payload real en logs de prompts/responses.
- No mandar contenido de clips al provider remoto.

## Done Cuando

- Hay spec separada.
- Hay política clara de qué items pueden ir a AI.
- Hay primer comando manual de AI search que genera y ejecuta un plan validado.
- Hay primer job manual “AI this item” antes de automatizar metadata.
