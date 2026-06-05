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

## Cambios Permitidos

El asistente puede modificar documentacion, codigo, configuracion, scripts, tests y estructura del proyecto, respetando reglas locales y cambios del usuario.
