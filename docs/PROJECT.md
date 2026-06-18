# Proyecto

Clipboard manager local inspirado en CopyQ, construido desde cero con Tauri 2.

## Objetivo

Crear una herramienta liviana y pulida para capturar, buscar, previsualizar y reutilizar historial del clipboard, con foco en velocidad, confiabilidad, metadata rica, extensibilidad personal y busqueda mas poderosa que un historial tradicional.

## Direccion Actual

El proyecto esta en fase inicial. La discusion inicial de producto y arquitectura ya fue integrada en `docs/`.

La direccion vigente es:

- tomar CopyQ como baseline funcional fuerte, pero no como clon ni como API compatible;
- usar Tauri 2 como shell desktop;
- usar TypeScript para UI;
- usar Rust para integraciones nativas y comportamiento sensible;
- persistir historial en SQLite;
- separar payload original de metadata estructurada;
- preparar arquitectura para plugins personales JavaScript/TypeScript, con Rust como host nativo interno y sin sandbox complejo inicial;
- dejar espacio claro para capacidades AI;
- usar animaciones modernas, sutiles y cuidadas para orientar foco, transiciones y feedback sin volver lenta ni ruidosa la herramienta;
- validar temprano clipboard monitoring, tray, global shortcuts y paste-to-previous-window.

## MVP Propuesto

- Tray app.
- Global shortcut para abrir picker.
- Captura de historial para texto primero; HTML e imagenes despues de estabilizar el flujo central.
- Metadata estructurada minima por item.
- SQLite persistence.
- Lista searchable.
- Search y filtering.
- Seleccion por teclado.
- Copiar o pegar item seleccionado.
- Pin/favorites.
- Borrado y edicion basica de items.
- Settings para retention limits e ignored apps/content.

Estimacion inicial: dificultad media, aproximadamente 2 a 6 semanas segun polish y cobertura de plataformas.

## No Objetivos Iniciales

- Paridad completa con CopyQ.
- Scripting engine completo.
- Plugin marketplace.
- Compatibilidad CLI/client-server estilo CopyQ.
- Soporte exhaustivo de formatos MIME y edge cases.
- Sync remota.
- Runtime completo de plugins antes de validar storage, busqueda y paste.
- Sandbox, marketplace, firma o modelo de permisos fino para plugins.

## Paridad CopyQ

La paridad completa con CopyQ es de dificultad alta o muy alta. Areas duras:

- preservacion exacta de formatos de clipboard;
- HTML/RTF/imagenes cross-platform;
- paste en ventana previa;
- scripting y plugins;
- CLI/client-server;
- acciones complejas;
- tabs/colecciones avanzadas;
- bugs y permisos por plataforma.

Estimacion inicial para paridad seria: 6 a 18 meses.

## Usuarios

Usuarios power de escritorio que copian y reutilizan texto, codigo, URLs, HTML o imagenes con frecuencia y necesitan una herramienta local rapida, privada y keyboard-first.

## Riesgos Principales

- APIs de clipboard diferentes por sistema operativo.
- Paste-to-previous-window depende de foco, permisos, timing e input sintetico.
- Fidelidad de HTML, RTF, imagenes y formatos custom puede ser costosa.
- Tauri plugins pueden no cubrir todo; probablemente hagan falta modulos Rust propios.

## Infraestructura Agentica

- `docs/skills/`: skills locales portables incluidas como parte de AOS.
- `.agents/skills`: junction de compatibilidad hacia `docs/skills/`.
- `scripts/ensure-skills-link.ps1`: recrea o valida la junction local `.agents/skills`.
- `scripts/agent-context-audit.ts`: auditor de docs, topics, tracks y skills.
