---
title: Excluir escrituras temporales de Fixvox
status: active
summary: Implementación y regresiones aprobadas para sentinel y restauraciones marcadas; pendiente instalación y aceptación de uso real.
last_worked: "2026-10-16T12:08:47Z"
next: Acordar instalación segura de Fixvox y validar inicio de grabación con datos sintéticos sin disparos por sentinel o restauración.
topics: [clipboard]
---

## Objetivo y alcance

JP autorizó implementar y documentar por ciclos. Reutilizar `Fixvox.TransientPaste.v1` / `dictation-tauri/v1\0` y la comprobación de propietario `dictation-tauri.exe`. Excluir antes de lectura de contenido, storage/recencia y actions. Sin IPC, ventanas temporales de silencio ni exclusión global por app. Las copias explícitas permanecen normales. La copia producida por otra app al recibir Ctrl+Insert queda fuera del alcance: no lleva la marca y no se promete excluirla.

## Ciclo 1 — Contrato y diagnóstico

Comprobado por lectura del código: inicio de sesión dispara captura de selección en paralelo al micrófono; UIA es el primer camino, luego fallback que guarda snapshot en memoria, publica sentinel, pide Ctrl+Insert y restaura si conserva ownership lógico. También se reutiliza desde transformaciones y correcciones. Snapshot no escribe; sentinel/restauración sí. El pegado de dictado ya marca su escritura. Sentinel y restauración abren sin propietario explícito y no agregan la marca. Agregar sólo el formato no cumple el gate actual de Copicu.

Aceptación: escrituras internas propias (sentinel, paste y restore de texto/imagen) llevan marca y owner de Fixvox; copias explícitas no. Copicu conserva contador/diagnóstico metadata-only pero no otros efectos al excluir. Tests con datos sintéticos, sin clipboard real, audio, providers ni hotkeys.

## Ciclo 2 — Implementación

Entregado en `../fixvox-tauri/src-tauri/src/desktop_delivery.rs` y `selection_capture.rs`: sentinel y restauraciones llevan marca y HWND vivo/propio; copia explícita sin marca; restore revalida secuencia con clipboard bloqueado. Snapshot None publica sólo marca, sin formatos de usuario; snapshot inválido falla antes de mutar. Una escritura parcial conserva secuencia para restauración protegida, sin reintento sobre la mutación fallida. HGLOBAL se libera en fallos y transfiere al OS sólo en éxito.

Implementador Pi headless `openai-codex/gpt-6.1-sol`, medium (modelo comprobado en eventos), sin subdelegación: un corte de hasta 12 minutos y una ronda reparadora de hasta 6. Ownership: código/tests del productor; conductor: Copicu, docs y revisión integrada. WIP preexistente preservado, en especial `desktop_delivery.rs` (+601/-69 antes del corte). Copicu estaba limpio. No se operaron terminales del host ni apps instaladas.

## Ciclo 3 — Verificación e integración

Consumidor: agregadas regresiones sintéticas de formato/payload/owner exactos y diagnóstico de exclusión para texto e imagen, sin cambiar runtime. `npm run rust:test`: 404 aprobados, 1 ignorado, 0 fallos. Verificación documental de ambos repos aprobada (Copicu: 3 avisos de longitud preexistentes). Lectura del gate confirma return antes de contenido, storage, Inbox y post-capture/actions; los tests de diagnóstico no acreditan por sí solos ese flujo completo.

Tests no equivalen a smoke instalado. Sólo se observaron procesos instalados (Copicu y Fixvox), no instancias dev; no se reinician por este corte ni se interrumpe dictado activo. Sin instalación/publicación, commits/push. Productor comprobado independientemente por conductor después de la reparación:

- `cargo check --offline --manifest-path ../fixvox-tauri/src-tauri/Cargo.toml --lib`: aprobado.
- `cargo test --offline --manifest-path ../fixvox-tauri/src-tauri/Cargo.toml --lib desktop_delivery::`: 47 aprobados.
- `cargo test --offline --manifest-path ../fixvox-tauri/src-tauri/Cargo.toml --lib selection_capture::`: 8 aprobados.
- Incluye 8 tests nuevos del productor: UTF-16/marca/owner, copia explícita, bytes de imagen/formatos, snapshots vacío/inválido, fallo de marca, fallo de formato, restauración tras escritura parcial y secuencia externa.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml --lib`: consumidor aprobado.
- `bun run docs:test`: 15 aprobados; `docs:check` de ambos repos y diff whitespace aprobados.

La regresión de escritura parcial usa emisor y secuencia sintéticos; no ejercita OpenClipboard real. Gate temprano y liberación HGLOBAL se revisaron en código. Instalación y smoke de dictado real pendientes: no declarar el problema resuelto en el binario operativo.

## Fuentes

- `src-tauri/src/clipboard.rs`: exclusión antes de lectura/procesamiento.
- `src-tauri/src/clipboard_probe.rs`: marca exacta y propietario.
- `../fixvox-tauri/src-tauri/src/selection_capture.rs`: sentinel y fallback.
- `../fixvox-tauri/src-tauri/src/desktop_delivery.rs`: paste, snapshots, restore y copia explícita.
- `../fixvox-tauri/src/desktop-control/controller.ts` y `src/App.tsx`: callers.
