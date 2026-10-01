# Specs

Specs para features grandes, milestones o spikes que necesiten plan antes de implementacion.

## Sugerencia Inicial

Spec inicial creada:

- [MVP 0 Native Spike](001-mvp0-native-spike/spec.md)
- [Rich Image Capture](002-rich-image-capture/spec.md)
- [Settings Foundation](003-settings-foundation/spec.md)
- [Actions Scripting API](004-actions-scripting-api/spec.md)
- [Conversational Assistant Prototype](013-conversational-assistant/spec.md)
- [Persistent Marked Working Set](015-persistent-working-set/spec.md)
- [Clipboard compartido configurable](016-shared-clipboard/spec.md), alcance confirmado, [arquitectura draft](016-shared-clipboard/plan.md), [preflight/L1/N1](016-shared-clipboard/research.md) y [implementación local D1/C1/T1](016-shared-clipboard/local-implementation.md); fixtures SQLite, matrices Windows y cifrado/HPKE/DPAPI/relay con interop real, sin sharing runtime.

El prototipo Tauri valida:

- tray;
- global shortcut;
- clipboard text capture;
- SQLite persistence;
- searchable picker;
- copy/paste selected item.

## Estructura Recomendada

```text
specs/<feature>/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```
