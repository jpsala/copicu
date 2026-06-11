---
id: markdown-output-surface
status: active
kind: explanation
triggers:
  - markdown output
  - salida markdown
  - ai-output
  - informes
  - summaries
  - reportes
  - export markdown
primary_refs:
  - actions-and-scripting-api.md
  - ../user/scripts.md
  - ../tracks/004-actions-scripting.md
---

# Markdown Output Surface

## Qué Es

Copicu tiene una superficie propia para mostrar resultados largos en Markdown: la ventana `ai-output`.

No es la lista de historial del portapapeles. Es una ventana de revisión para contenido generado o compuesto a partir del historial, por ejemplo:

- un resumen de varios clips;
- un informe basado en resultados de búsqueda;
- una traducción;
- una compilación de snippets;
- una respuesta generada por AI que conviene revisar antes de copiar, pegar, guardar o convertir en item.

La idea es que AI y scripts no tengan que meter todo de vuelta en el picker ni escribir archivos directamente. Primero muestran una salida legible, revisable y accionable.

## Cómo Se Usa

Scripts y AI pueden abrir la ventana con:

```ts
await copicu.ui.markdownOutput({
  title: "Clipboard summary",
  summary: "Generated from 5 recent text clips",
  source: "my.summaryScript",
  suggestedFileName: "clipboard-summary",
  markdown: "# Clipboard summary\n\n- First finding\n- Second finding",
});
```

Capability requerida:

```ts
"ui:markdown-output"
```

La ventana renderiza Markdown con soporte GFM y resaltado básico de código. Desde ahí el usuario puede:

- copiar el Markdown al clipboard;
- agregar el Markdown como nuevo item del historial;
- exportar un archivo `.md`.

## Exportación

La exportación no habilita filesystem crudo para scripts ni para AI.

El host de Copicu escribe archivos Markdown en una ruta controlada:

```text
Documents/Copicu/Exports
```

El nombre sugerido se sanea antes de escribir. Si ya existe un archivo, Copicu crea una variante numerada.

Esto mantiene el poder útil, generar documentos desde el portapapeles, sin dar acceso general a `fs`, shell, rutas arbitrarias o imports externos.

## Relación Con El Historial

Hay dos superficies distintas:

- `history`: items capturados del clipboard, buscables y persistidos en SQLite;
- `markdownOutput`: documento temporal/revisable generado desde clips, búsquedas, selección o AI.

El output puede convertirse en item con la acción `Add item`, pero hasta ese momento no es un item del historial.

Para comandos AI futuros, conviene pasar contexto explícito:

```ts
{
  activeSurface: "picker" | "ai-output",
  selectedHistoryItemIds: string[],
  visibleHistoryItemIds: string[],
  currentHistoryQuery: string,
  currentOutputId?: string,
  currentOutputTitle?: string
}
```

Regla recomendada:

- si el usuario habla de clips, items, historial, portapapeles, seleccionados, marcados o búsqueda, el target por defecto es `history`;
- si habla de salida, informe, resumen, documento, Markdown, texto generado o la ventana, el target por defecto es `markdownOutput`;
- si dice “esto”, usar la superficie enfocada;
- si la acción es destructiva o irreversible y el target no está claro, preguntar o pedir confirmación.

## Cuándo Usarlo

Usar `markdownOutput` cuando el resultado sea un documento o texto largo que necesita revisión.

Buenos casos:

- “haceme un informe con los clips marcados”;
- “resumí estos snippets”;
- “traducí lo seleccionado y mostrámelo prolijo”;
- “juntá los resultados de esta búsqueda en Markdown”;
- “armá una respuesta para mandar”.

No usarlo para:

- feedback corto de acción, usar `ui.toast`;
- prompts interactivos chicos, usar `ui.confirm` o `ui.input`;
- cambiar la lista visible del picker, usar `picker.filter`;
- guardar directamente archivos desde scripts, usar export controlado desde la ventana.

## Estado Actual

Implementado 2026-06-07:

- ventana Tauri `ai-output`;
- renderer Markdown con GFM y código;
- acciones Copy, Add item y Export;
- API `copicu.ui.markdownOutput`;
- capability `ui:markdown-output`;
- ejemplo `scripts/examples/018-markdown-output-summary.ts`;
- export controlado a `Documents/Copicu/Exports`.

Pendiente:

- asignar IDs durables a outputs si se quiere referenciarlos en comandos AI posteriores;
- agregar contexto `activeSurface` al planner AI;
- permitir editar el Markdown antes de copiar/exportar;
- diseñar confirmación/preview para acciones AI que produzcan o modifiquen outputs largos.
