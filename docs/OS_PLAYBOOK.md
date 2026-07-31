# Copicu OS Playbook

Guía humana mínima para trabajar con la capa agentica local sin duplicar el
runtime global de AOS.

## Ruta Diaria

Usar `/flow` como única entrada cotidiana:

1. **Pensar** — explorar y converger una decisión.
2. **Planear** — registrar un brief liviano, una `execution_route` revisable y un foco válido.
3. **Hacer** — aplicar la ruta, abrir una sesión nueva enlazada y ejecutar el foco sin Agent ni auto-send; modelo o auth ausentes bloquean sin fallback.
4. **Cerrar** — persistir sólo valor durable faltante; no inicia otro batch.

`balanced` con Sol Medium es la ruta normal aun para trabajo multifile,
cross-layer o nativo acotado. `strong` con Sol High queda sólo para ambigüedad
material o fallos materiales difíciles de detectar; prioridad, cantidad de
archivos o un efecto externo autorizado no bastan. `economical` con Luna requiere
pedido explícito de JP por cuota y checks deterministas. `Ctrl+P` alterna Sol
Medium/High y `Ctrl+L` conserva la selección manual.

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
