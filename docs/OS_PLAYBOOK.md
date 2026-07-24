# Copicu OS Playbook

Guía humana mínima para trabajar con la capa agentica local sin duplicar el
runtime global de AOS.

## Ruta Diaria

Usar `/flow` como única entrada cotidiana:

1. **Pensar** — explorar y converger una decisión.
2. **Planear** — registrar un brief liviano, `execution_route: economical | balanced | strong` y un foco válido.
3. **Hacer** — aplicar esa ruta (`balanced` por defecto), abrir una sesión nueva enlazada y ejecutar el foco sin Agent ni auto-send; modelo o auth ausentes bloquean sin fallback.
4. **Cerrar** — persistir sólo valor durable faltante; no inicia otro batch.

Los downstreams declaran `aos.requirements.json` y consumen el package global de
`AOS_HOME`. No copian `.pi/extensions/aos-flujo.ts`.

## Evidencia Y Gates

Elegir antes la evidencia mínima suficiente y ejecutar sólo checks relevantes,
sin duplicarlos. El brief orienta intención y límites; no es checklist exhaustiva.
Si falta una decisión, volver a `/flow → Planear` en vez de inventarla.

`ask_user` es obligatorio para instalar, commitear, pushear, desplegar, tocar
producción, usar credenciales o datos privados, ejecutar acciones destructivas o
enviar efectos externos. Browser, CUA, hotkeys, clipboard y apps visibles
requieren el aviso inicial de `AGENTS.md`.

## Copicu Local

Se preservan las skills de producto y operaciones, los prompts de release/research,
los taskflows y `.pi/extensions/copicu-computer-use.ts`. Este adapter sólo se usa
para pruebas explícitas de la aplicación y no agrega comandos lifecycle.

## Checks

```powershell
bun run context:index
bun run context:audit
bun run routing:check
npm run skills:status
git diff --check
```

No hacer commit, push, deploy, instalación ni iniciar otro batch como parte de una
verificación rutinaria.
