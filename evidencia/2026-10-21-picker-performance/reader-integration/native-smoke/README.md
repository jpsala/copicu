# Reinicio aislado y smoke nativo del lector

Ejecutado el 2026-10-22 después del «sí» explícito de JP al reinicio de la instancia dev sintética y smoke Win32 visible. No amplía permisos de instalación/publicación ni autoriza operaciones futuras sobre PIDs narrados.

## Resultado y procedencia

- Binario: `src-tauri/target-reader-integration/release/copicu.exe`, SHA256 `dd0ffc6897b43cbe04eed634f34890112fab8463eb1ed1dc4bce2522c0bed96d`. Se revalidaron los 13 hashes de fuente del corte y ambos binarios antes de operar; no cambió producto durante este smoke.
- `stopped-previous-instance.json`: sólo se detuvo el PID 30272 tras comprobar exe, CreationDate/StartTime y marker del perfil sintético. No se usó kill por nombre/árbol ni el reinicio general del repo; no se abrió su DB.
- `native-window-checks.json`: salida original del harness `tests/manual/validate-window-interaction.mjs`, perfil temporal nuevo. **11 casos pasan**, incluido C0 externo→hotkey→type global→token visible, foco entre ventanas, capas, minimize y retorno. Paste omitido; no clipboard real. El harness cerró únicamente sus dos procesos propios al terminar.
- `native-reader-ipc.json`: **5 verificaciones** sobre una segunda instancia de la misma build, con perfil nuevo de 10k textos/100 tags sintéticos. Feed fresco, flags apagados, request opt-in real con descriptor/conteos correctos, generación obsoleta rechazada, Settings impedido de iniciar sesión o usar el lector, y sesión original todavía funcional después de esos rechazos.
- `interactive-session.json`: identidad de la instancia nueva que se dejó corriendo, observada PID 31132, shortcut `Ctrl+Shift+F10`, captura/AI/updater apagados. Registro operativo: `.codex-run/picker-reader-integration/interactive-session.json`; **revalidar** PID/exe/CreationDate antes de cualquier operación posterior.
- `runtime-probe.mjs`: snapshot del launcher/probe usado, no una segunda implementación del producto. Exige perfil recién preparado con marker, DB vacía y flags seguros; no acepta el perfil instalado. Es evidencia de método, no autorización para ejecutarlo otra vez.
- `verification.json` y `manifest.json`: resultado, límites y hashes de esta etapa.

## Observación IPC y privacidad

En WebView2/Tauri real, `__TAURI_INTERNALS__.invoke` es una propiedad no writable; no trasladar el monkey-patch del mock renderer como prueba de llamadas reales. El probe observa `Network.requestWillBeSent`/`loadingFinished` por CDP, sólo en la WebView sintética propia y el endpoint local `ipc.localhost/history_search`, sin sustituir requests/respuestas. Retiene únicamente token, cursor, cantidades, primer ID y presencia de descriptor. **No conserva headers** (contienen la clave IPC del frame), texto de clips, queries ni respuestas completas. Se desconectó el observador antes de dejar la app para JP.

C0 se verificó aparte con input global Win32 antes de targetear Copicu por CDP. Las acciones posteriores de CDP no se presentan como otra prueba de foco/input nativo.

## Vigencia y límites

Los archivos de la carpeta padre `reader-integration/` se preservan como evidencia de la fase previa al smoke: su `verification.json` con gate pendiente era correcto en esa fecha, pero **este resultado lo sustituye para el estado actual de reinicio/smoke**. Conocimiento vigente: [lector](../../../../docs/topics/picker-history-reader.md), trabajo: [track](../../../../docs/tracks/014-performance-memory.md).

No hubo instalación, publicación, commit, operación de la instalada ni paste. Esto cierra el gate técnico de reinicio/smoke del lector, **no aceptación humana ni medición hotkey→input/feed**. La otra PC, memoria/idle y optimización de retención siguen pendientes.
