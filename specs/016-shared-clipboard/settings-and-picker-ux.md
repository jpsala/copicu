# Claridad de Settings, Sharing y menús del picker

Plan aprobado por JP el 2026-10-04; implementación local autorizada en paralelo.

## Contrato

- Quit Copicu se ofrece sólo en el tray. La X del picker oculta la ventana y
  conserva el proceso. Settings tiene un engranaje al extremo izquierdo de la
  barra; sus botones no inician arrastre y conservan foco/lifecycle nativo.
- Menú de texto: Quick edit y Edit metadata primero; copiar, pegar y preview
  siguen accesibles. Organize agrupa carpeta, marcas e Inbox; More actions agrupa
  editores avanzados, Assistant y scripts. Delete va al final. Imágenes y selección
  múltiple muestran sólo acciones aplicables. Filas compactas para mouse, teclado
  completo y submenús contenidos en desktop y ventana angosta. Los submenús
  abren con clic, toque o teclado; Escape devuelve foco al disparador y mantiene
  el cierre aunque el puntero permanezca sobre él.
- General precede Sharing en Settings. Sharing responde, en este orden: qué
  equipo/cuenta está vinculado, qué carpeta local comparte con qué recurso y en
  qué dirección, y qué ocurrió recientemente. Estados de cuenta, pausa y error no
  se confunden con una conexión activa.
- Edición de conexiones reutiliza el selector existente y muestra nombres de
  carpeta local y portapapeles compartido por separado. Guardar en Copicu y copiar
  automáticamente a Windows son decisiones distintas. Efectos, atajos, scripts y
  diagnóstico se revelan progresivamente; una automatización activa deja un
  resumen visible. Etiquetas evitan Channel, Publish y local effects en el flujo
  habitual. Los botones dejan claro qué cambios guardan.
- Mantener conexiones y políticas existentes, `liveOnly`, un único escritor de
  Windows, permisos, pausa, ausencia de backfill/eco y cambios de duplicados por
  carpeta. Una reorganización visual no activa opciones por inferencia ni pierde
  borradores durante refresh/retiro de acceso.

## Verificación

Build TypeScript/Vite y checks documentales; Playwright con fixtures sintéticas
para desktop/narrow, teclado/submenús, acceso a Settings sin Quit, jerarquía de
Sharing, edición conservadora de conexiones, borradores, errores, efectos y foco.
Verificar comportamiento nativo con perfil sintético si se cambia lifecycle.
No publicar, instalar ni migrar el perfil real dentro de este trabajo.

## Resultado local — 2026-10-04

- 214 pruebas de interfaz pasan en Chromium desktop y ventana de 420 px, con
  fixtures sintéticas. Cubren menús, teclado y toque, Settings, conexiones,
  permisos, traslado explícito de recepción, borradores y efectos separados.
- 30 ejecuciones repetidas de menú contextual, navegación y toque pasan;
  Escape mantiene cerrado el submenú con el puntero estacionario.
- 31 pruebas unitarias de UI compartida y modelo de carpetas pasan. TypeScript,
  Vite y checks documentales pasan; se regenera el frontend normal al terminar.
- La revisión visual incluye el menú compacto, Sharing y el editor de conexión
  en ambos tamaños. No cambia el lifecycle nativo ni se ejecuta una nueva prueba
  física PC ↔ notebook. Publicación e instalación quedan fuera de este corte.
