---
title: Clipboard compartido y backup futuro
summary: "Arquitectura draft de canales compartidos, suscripciones y envío explícito scriptable entre equipos."
keywords:
  - clipboard compartido
  - shared clipboard
  - portapapeles compartido
  - cloud clipboard
  - suscripciones
  - sincronizacion entre equipos
  - backup cloud
---

# Clipboard compartido y backup futuro

Entrada al diseño, **sin contrato shipping implementado**. JP confirmó Q1 `liveOnly`, Q2 texto plano y Q3 servicio privado. L1/N1 sintéticos y D1 SQLite candidato comprobados; C1/T1 opt-in incorpora cifrado, HPKE, DPAPI y relay HTTP/SQLite con interop real sobre datos nuevos sintéticos. Cinco dependencias aprobadas con «avancemos». Runtime/enrollment humano/watcher/UI/dos PCs siguen abiertos; sin deploy autorizado.

- Producto y decisiones Q1–Q3: `specs/016-shared-clipboard/spec.md`.
- Arquitectura, APIs tentativas, cifrado y gates técnicos: `specs/016-shared-clipboard/plan.md`.
- Preflight: `specs/016-shared-clipboard/research.md`. Recomienda evaluar store único para texto, TLS existente, custody DPAPI y candidatos E2EE; registra L1/N1 sin dependencias nuevas y límites de sus tests. No acredita protocolo auditado, writer shipping, persistencia durable ni cuenta cloud.
- N1/repro: `specs/016-shared-clipboard/n1-native-custody.md`. Correlacionar el writer después de `CloseClipboard`, bajo nueva exclusión con owner/marker/sequence estable. Una window station tiene su propio clipboard: otro desktop/carpeta no lo aísla; Sandbox exige redirección desactivada. HWND/marker públicos no autentican apps hostiles del mismo usuario.
- Implementación local, checks y comandos de dependencias aprobados: `specs/016-shared-clipboard/local-implementation.md`. Distingue tests de bytes opacos del recorrido criptográfico real; el SQL candidato no se ejecuta sobre perfiles existentes ni autoriza efectos nativos.
- Estado/próximo paso y permisos: `docs/tracks/041-shared-clipboard.md`.

Primer objetivo: Trabajo ↔ Casa, copiar y publicar por atajo/script; suscripción local configurable que puede actualizar Windows. Publicar no significa compartir todas las copias locales; recibir no significa pegar ni enfocar ventanas.

Backup puede reutilizar identidad/custody/almacenamiento, pero no la retención/replay del canal. Drive, imágenes, publicación automática por carpeta/tag y biblioteca mutable no se consideran implementados ni aprobados por esta propuesta.

Contratos existentes que deben preservarse: `docs/topics/actions-and-scripting-api.md`, `docs/topics/clipboard.md`, `docs/topics/sqlite-storage.md` y `specs/014-folders/spec.md`.

## Procedencia documental

Metadata importada del principal el 2026-10-01; propuesta draft conservada en el cuerpo, sin nueva aceptación de producto ni permisos históricos transferidos. Referencias originales preservadas:

```yaml
id: shared-clipboard
status: draft
kind: decision-map
summary: Arquitectura draft de canales compartidos, suscripciones y envío explícito scriptable entre equipos.
triggers:
  - clipboard compartido
  - shared clipboard
  - portapapeles compartido
  - cloud clipboard
  - suscripciones
  - sincronizacion entre equipos
  - backup cloud
primary_refs:
  - specs/016-shared-clipboard/spec.md
  - specs/016-shared-clipboard/plan.md
  - specs/016-shared-clipboard/research.md
  - specs/016-shared-clipboard/local-implementation.md
  - docs/tracks/041-shared-clipboard.md
```
