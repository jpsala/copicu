---
id: product-direction
status: active
kind: explanation
triggers:
  - producto
  - MVP
  - CopyQ
  - recomendaciones
  - alcance
  - roadmap
primary_refs:
  - ../PROJECT.md
  - ../DEVELOPMENT.md
  - ../DECISIONS.md
  - ../OPEN_QUESTIONS.md
  - ../reference/copyq-feature-inventory.md
  - product-ambition.md
---

# Direccion De Producto

## Resumen

El proyecto debe arrancar como un clipboard manager local que toma CopyQ como baseline funcional fuerte, pero no como un port ni una implementacion compatible feature-for-feature.

La ambicion actual esta mejor capturada en `docs/topics/product-ambition.md`: mas rapido, UI/UX mas moderno, busqueda mas poderosa, metadata estructurada, plugins en TypeScript/Rust e integracion de AI.

La apuesta es validar rapido un flujo pequeno pero dificil:

- capturar clipboard text;
- persistir historial;
- abrir picker con shortcut global;
- buscar y navegar por teclado;
- reutilizar un item copiandolo o pegandolo en la app anterior.

## Principio De Alcance

Primero confiabilidad, despues poder.

No agregar scripting, plugins, CLI compatible, sync ni fidelidad exhaustiva de formatos hasta que el flujo central este estable.

CopyQ debe usarse como inventario concreto de capacidades, no como promesa implicita de paridad. Para features nuevas, consultar `docs/reference/copyq-feature-inventory.md` y declarar si se absorben, adaptan, posponen o excluyen.

El MVP debe ser chico pero no debe borrar la ambicion: metadata, imagenes/screenshots, hotkeys y arquitectura preparable para plugins tienen que aparecer temprano como decisiones de diseno, aunque algunas piezas sean spikes o versiones minimas.

## Stack Recomendado

- Tauri 2 para desktop shell.
- TypeScript con React/Vite o Solid para frontend.
- Rust para clipboard monitoring, paste behavior, OS integration y helpers sensibles.
- SQLite para historial persistido.
- Tauri plugins maduros cuando alcancen: clipboard manager, global shortcut, SQL, autostart, single-instance y window state.

Electron podria acelerar un prototipo, pero Tauri es mejor fit de largo plazo si la prioridad es una app local liviana y pulida.

Electrobun queda como opcion interesante pero demasiado riesgosa para este arranque.

## Dificultad

MVP: dificultad media, estimacion inicial de 2 a 6 semanas segun polish y plataformas.

Paridad CopyQ completa: dificultad alta o muy alta, estimacion inicial de 6 a 18 meses.

## Primeros Spikes

1. Clipboard monitor reliability.
2. Paste-to-previous-window.
3. SQLite y blob storage.
4. Tray y comportamiento de ventanas.

## Milestones Sugeridos

1. Skeleton: app Tauri 2, tray, global shortcut, picker y settings basicos.
2. Clipboard capture: texto, SQLite, history list y deduplicacion.
3. Picker workflow: search, keyboard navigation, copiar y pegar item seleccionado.
4. Rich content: HTML, imagenes, thumbnails y retention policy.
5. Power features: favorites, collections/tabs, item editing y acciones basicas.

## Riesgos

- Clipboard APIs varian por OS.
- Paste-to-previous-window es el flujo mas riesgoso.
- Rich clipboard fidelity es dificil para HTML, RTF, imagenes, file lists y formatos custom.
- Tauri probablemente necesite modulos Rust propios para cerrar gaps.
- CopyQ parity es una trampa de alcance si no se acota explicitamente.

## Proximo Paso Recomendado

Crear un prototipo Tauri 2 chico enfocado solo en:

- tray;
- global shortcut;
- clipboard text capture;
- SQLite persistence;
- searchable picker;
- paste/copy selected item.

## Senales Para Promover A Decision

Actualizar `docs/DECISIONS.md` cuando se defina:

- frontend framework;
- plataforma primaria;
- estrategia de paste;
- schema SQLite inicial;
- estructura de blobs;
- alcance de rich content.
