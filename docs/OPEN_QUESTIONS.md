# Preguntas Abiertas

- Cual es la plataforma primaria del primer MVP: Windows solamente o cross-platform desde el inicio?
- Se prefiere React/Vite o Solid para la UI?
- El primer prototipo debe incluir paste-to-previous-window o alcanza con copiar seleccionado al clipboard?
- Donde deben vivir la base SQLite y el directorio de blobs por ambiente/desarrollo?
- Que limites iniciales se quieren para cantidad de items, edad maxima y tamano total?
- HTML e imagenes entran en el primer MVP o en milestone posterior?
- Hace falta importar/exportar historial o settings desde el inicio?
- Cual es el schema minimo de metadata por item para no bloquear busqueda, plugins y AI?
- Cual es la API minima para plugins personales JavaScript/TypeScript sin sandbox complejo?
- Vale la pena soportar Python como runner externo opcional para scripts locales, o alcanza con JS/TS al inicio?
- Que operaciones AI personales conviene implementar primero?
- Que utilitario o estrategia se usara para screenshots/recortes de pantalla?
- MUI conviene como base visual o conviene una UI mas custom/headless para evitar look generico?
- TanStack Query/Table/Virtual aportan suficiente para adoptarlos desde el scaffold?

## Postergadas Explicitamente

- Politica fina de privacidad para plugins/AI.
- Sandbox, firma, marketplace o permisos granulares para plugins JavaScript/TypeScript.
- Manejo avanzado de secretos/password managers mas alla de no persistir datos reales en tests/logs.
