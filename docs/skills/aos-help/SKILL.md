---
name: aos-help
description: Show the available Agentic OS (AOS) commands and when to use each one. Use when JP says `os help`, `ayuda os`, `comandos os`, or asks what command to use.
---

# OS Help

Mostrar el mapa corto de comandos AOS.

Fuente canonica: `docs/topics/os-quality.md`, `docs/topics/pi-agentic-os.md` y `docs/.generated/context-index.md` para recursos actuales.

## Respuesta

Listar comandos locales por intencion: continuar en esta sesion (`aos-sigamos`, `aos-gol`/`aos-gol-lite`), usar threads seguros (`aos-orquestar`, `aos-fanout`), guardar valor (`aos-guardar-sesion`), cortar contexto (`aos-nueva-sesion`, `aos-nueva-sesion-con-gol`), calidad OS (`aos-realinear-os`, `aos-perfect-os`), commit/push y comandos Pi (`/aos-status`, `/aos-sync`, `/aos-compact`, `/aos-continuar`, `/aos-skills`, `/aos-checkpoint-nudge`). Mostrar `aos-checkpoint`, `aos-cerrar-sesion`, `aos-continuar-sesion` y `aos-siguiente` solo como aliases.

No ejecutar cambios salvo que JP pida un comando concreto.
