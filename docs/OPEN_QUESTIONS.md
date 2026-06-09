# Preguntas Abiertas

- Cual es la plataforma primaria del primer MVP: Windows solamente o cross-platform desde el inicio?
- Donde deben vivir la base SQLite y el directorio de blobs por ambiente/desarrollo?
- Que limites iniciales se quieren para cantidad de items, edad maxima y tamano total?
- Para imagenes: que limite inicial de tamano/dimensiones evita inflar disco y memoria?
- Para imagenes: hay que soportar paste/write-back de imagen en MVP de rich content o alcanza con preview + copy como archivo/blob?
- Hace falta importar/exportar historial o settings desde el inicio?
- Cual es el schema minimo de metadata por item para no bloquear busqueda, plugins y AI?
- Cual es la API minima para plugins personales JavaScript/TypeScript sin sandbox complejo?
- Vale la pena soportar Python como runner externo opcional para scripts locales, o alcanza con JS/TS al inicio?
- Que operaciones AI personales conviene implementar primero?
- La UI de busqueda debe mostrar chips/facets editables o alcanza con un summary "Interpreted as"?
- La semantica de fechas de query syntax debe ser UTC, timezone local o configurable?
- Cuando conviene migrar de `LIKE` a SQLite FTS5 y que ranking usar?
- Como capturar source process/window para habilitar `app:` sin filtrar datos privados?
- Que modelo de OpenRouter conviene usar por defecto para AI query planning barato y rapido?
- Como validar y explicar planes AI de busqueda antes de ejecutarlos?
- Que logs redacted guardar para prompts/responses AI sin persistir payload real?
- Que utilitario o estrategia se usara para screenshots/recortes de pantalla?
- MUI conviene como base visual o conviene una UI mas custom/headless para evitar look generico?
- TanStack Query/Table/Virtual aportan suficiente para adoptarlos desde el scaffold?

## Postergadas Explicitamente

- Politica fina de privacidad para plugins/AI.
- Sandbox, firma, marketplace o permisos granulares para plugins JavaScript/TypeScript.
- Manejo avanzado de secretos/password managers mas alla de no persistir datos reales en tests/logs.
