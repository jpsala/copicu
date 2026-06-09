# Fixvox Reference Rethink

Estado: paused
Ultima actualizacion: 2026-06-05

## Objetivo

Estudiamos `C:\dev\electro-bun-1` como referencia para una futura herramienta nueva construida con el stack de este proyecto: Tauri 2, TypeScript, Rust y SQLite.

La decision compartida es no hacer un port literal. Vamos a tomar funcionalidades, aprendizajes, decisiones de producto y evidencia tecnica de Fixvox/Assistant, pero vamos a repensar la arquitectura para aprovechar mejor lo que Copicu ya valido en Tauri/Rust.

## Decision Principal

No vamos a copiar el proyecto fuente ni arrastrar su arquitectura Electrobun/Bun.

Vamos a usarlo como referencia funcional:

- que problemas resuelve;
- que flujos ya demostraron valor;
- que edge cases Windows encontro;
- que contratos de runtime conviene conservar;
- que tests y specs expresan conocimiento durable;
- que errores evitar.

El proyecto nuevo debe nacer como producto Tauri/Rust-first, con UI TypeScript como cliente de una API host clara.

## Lectura Del Proyecto Fuente

El proyecto fuente es una app desktop de asistencia de texto llamada Fixvox/Assistant. Combina:

- dictado por voz;
- post-procesamiento de transcripciones;
- prompts/presets Markdown;
- hotkeys globales;
- captura de seleccion;
- reemplazo o insercion en la app origen;
- picker de presets;
- voice dock flotante;
- settings;
- historial de ejecuciones;
- debug events y telemetry;
- policy/control plane y proxy.

El codigo activo vive principalmente en:

- `C:\dev\electro-bun-1\src\app\backend`
- `C:\dev\electro-bun-1\src\app\views`
- `C:\dev\electro-bun-1\.specify\specs`
- `C:\dev\electro-bun-1\docs\active-work`

Los roots viejos `src\bun` y `src\views` existen como referencia/legacy, pero el mapa activo apunta a `src\app`.

## Findings Tecnicos

La parte mas valiosa no es el codigo UI ni el scaffold Electrobun. Lo valioso es el conocimiento acumulado sobre workflows nativos:

- capturar seleccion antes de abrir UI propia;
- preservar/restaurar clipboard;
- liberar modifiers antes de enviar shortcuts sinteticos;
- distinguir target inicial y target final;
- no asumir que `SetForegroundWindow` enfoca un WebView2 interno;
- tratar paste en Chromium/WebView como "enviado" salvo que haya verificacion visible;
- modelar ejecuciones con stages, intent, output action y delivery class;
- registrar debug events suficientemente ricos para auditar fallos de foco, paste, STT o LLM.

Muchos problemas del proyecto fuente vienen de tener que implementar Win32 desde TypeScript con `bun:ffi`, servidores HTTP locales por ventana, polling/fallbacks para hotkeys, y mucha logica runtime mezclada con delivery nativo.

En Tauri/Rust podemos convertir esas piezas en primitivas host mas limpias y testeables.

## Lo Que Copicu Ya Tiene A Favor

Este repo ya valido piezas que Fixvox tuvo que resolver con mucho trabajo manual:

- clipboard watcher event-driven;
- self-write suppression;
- SQLite inicial;
- picker keyboard-first;
- copy selected item;
- paste-to-previous-window;
- reglas target-aware para `Ctrl+V` vs `Shift+Insert`;
- captura y copy-back de imagenes;
- tests Rust y validaciones manuales de targets Windows.

Eso cambia el planteo: el nuevo producto no deberia arrancar desde "como reimplementar Fixvox", sino desde "que nuevas acciones inteligentes puede ejecutar Copicu sobre clipboard, seleccion, voz y contexto".

## Funcionalidades Fuente Que Conviene Recuperar

Prioridad alta:

- presets/prompts Markdown con metadata simple;
- picker de acciones/presets;
- captura de seleccion como input;
- accion de transformar seleccion y reemplazarla;
- accion de insertar en cursor;
- historial de ejecuciones recuperables;
- debug events por ejecucion;
- settings locales para hotkeys, providers y comportamiento de delivery;
- modelo de execution stage: `capturing`, `recording`, `transcribing`, `processing`, `pasting`, `completed`, `failed`, `incomplete`;
- output action explicita: insert, replace, copy, open follow-up.

Prioridad media:

- dictado por voz;
- postprocess STT;
- voice routing por app/target;
- result history;
- quick chat contextual;
- assistant mode;
- wake words.

Postergar:

- control plane remoto;
- proxy como data plane obligatorio;
- installer/release/admin;
- Discord/support alpha;
- sync multi-device;
- monetizacion;
- policy cohorts.

## Arquitectura Recomendada

Backend Rust como host:

- clipboard;
- seleccion;
- focus previous/current target;
- paste shortcuts;
- audio capture cuando llegue el corte de voz;
- SQLite;
- execution log durable;
- APIs compuestas tipo `activateItem`, `runAction`, `deliverText`.

TypeScript frontend como cliente:

- picker;
- settings;
- action editor;
- history/result inspector;
- voice dock si se decide conservar ese patron.

TypeScript runtime de producto:

- parsing de presets;
- armado de prompts;
- llamadas LLM/STT;
- policy local;
- evaluadores y tests de dominio.

La regla de diseño es que la UI no sea dueña exclusiva de acciones durables. Las acciones deben poder dispararse desde picker, hotkey, tray, plugin futuro o voice command.

## Riesgos A Evitar

- Copiar carpetas del proyecto fuente sin separar responsabilidades.
- Meter `bun:ffi` o patrones Electrobun en el nuevo proyecto.
- Portar control plane/proxy antes de tener un producto local solido.
- Hacer UI primero y dejar foco/paste/audio para despues.
- Guardar contenido real del clipboard o dictados reales en docs/tests/logs.
- Confundir "paste enviado" con "paste observado".
- Perseguir paridad completa antes de estabilizar el workflow central.

## Plan De Trabajo Sugerido

1. Crear una spec nueva para "Assistant Actions" o "Smart Actions".
2. Definir modelo minimo: preset, execution, target, delivery, debug event.
3. Implementar presets Markdown en SQLite.
4. Agregar picker/action mode encima del picker actual.
5. Implementar transform selected text: capture selection -> LLM -> replace.
6. Implementar insert at cursor: LLM/free text -> focus target -> paste.
7. Agregar execution history y recoverable result.
8. Migrar tests de dominio desde los contratos del proyecto fuente, reescritos para el nuevo modelo.
9. Recién despues hacer spike de audio capture en Rust.
10. Despues de audio, sumar STT y postprocess con medicion de latencia/costo.

## Opinion Tecnica

El port puede estar muy bueno si se trata como una reinterpretacion, no como una mudanza.

Fixvox tiene mucho aprendizaje real de producto: flujos utiles, edge cases de Windows, UX de dictado, presets y delivery. Pero su stack actual empuja demasiada complejidad al lugar incorrecto. Copicu, en cambio, ya tiene una base nativa chica y controlada para clipboard/foco/paste, que son justamente las partes mas fragiles.

La oportunidad es fusionar dos ideas:

- Copicu como base nativa local, privada, rapida y keyboard-first.
- Fixvox como referencia de acciones inteligentes sobre texto, voz y seleccion.

El producto resultante deberia sentirse menos como "un clon de Fixvox en Tauri" y mas como una herramienta local de acciones inteligentes construida sobre un clipboard manager confiable.

## Próximo Paso Concreto

Antes de crear codigo nuevo, escribir la spec de la primera feature:

`specs/003-smart-actions-foundation/`

Contenido minimo:

- `spec.md`: comportamiento usuario y no objetivos.
- `plan.md`: arquitectura Rust host + TS runtime.
- `tasks.md`: cortes pequenos verificables.
- `verification.md`: tests y validaciones manuales con datos sinteticos.

Primer slice recomendado:

`preset Markdown -> picker action -> transform selected text -> replace in previous/current target -> execution row`

Ese slice prueba el valor del port sin tocar audio, proxy ni control plane.
