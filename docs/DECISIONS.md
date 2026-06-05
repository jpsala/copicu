# Decisiones

## Decididas Inicialmente

| Decision | Estado | Motivo | Fuente |
| --- | --- | --- | --- |
| Tomar CopyQ como baseline funcional fuerte, sin compatibilidad feature-for-feature | accepted | Evita caer en clon/paridad completa, pero reconoce que CopyQ define muchas capacidades base que Copicu debe absorber o superar. | Discusion inicial + aclaracion 2026-06-04 |
| Usar Tauri 2 como shell desktop | accepted | Mejor fit de largo plazo para una app local liviana. | Discusion inicial integrada |
| Usar Rust para integraciones nativas | accepted | Clipboard, foco, paste y storage sensible necesitan control nativo. | Discusion inicial integrada |
| Usar SQLite para historial persistido | accepted | Adecuado para busqueda local, metadata y estado offline. | Discusion inicial integrada |
| Plugins personales primero, sin sandbox/permisos complejos | accepted | El sistema de plugins es para uso propio al inicio; evitar sobreingenieria de privacidad, marketplace o terceros no confiables. | Aclaracion 2026-06-04 |
| Descartar Electrobun para el arranque | accepted | El proyecto necesita APIs maduras de clipboard, shortcut global, tray, paste e integraciones nativas. | Discusion inicial integrada |

## Pendientes

| Decision | Estado | Proximo paso |
| --- | --- | --- |
| React/Vite vs Solid | pending | Elegir al crear scaffold UI. |
| Plugin SQL vs modulo Rust propio | pending | Resolver tras spike de SQLite y busqueda. |
| Estrategia exacta de paste-to-previous-window por OS | pending | Resolver con spike nativo, empezando por Windows si no se define otra prioridad. |
| Alcance inicial de HTML e imagenes | pending | Agregar solo despues de validar flujo de texto. |
