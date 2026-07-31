# Guía De Usuario Del Sistema Agentico

Copicu es downstream de AOS: consume el runtime global y conserva sólo contexto,
skills y adapters útiles para este producto. No copia registry, memoria, tracks o
gobierno del manager.

## Uso Diario

Usá `/flow` como única entrada cotidiana:

- **Pensar** explora y converge una decisión.
- **Planear** crea un brief liviano, declara una `execution_route` revisable y registra el foco.
- **Hacer** aplica la ruta, abre una sesión nueva enlazada con handoff documental revisable y ejecuta allí sin Agent ni auto-send; modelo o auth ausentes bloquean sin fallback.
- **Cerrar** guarda sólo valor durable faltante; es opcional si Hacer ya cerró.

`balanced` con Sol Medium es la ruta normal aun para trabajo multifile,
cross-layer o nativo acotado. `strong` con Sol High queda sólo para ambigüedad
material o fallos materiales difíciles de detectar; prioridad, cantidad de
archivos o un efecto externo autorizado no bastan. `economical` con Luna requiere
pedido explícito de JP por cuota y checks deterministas. `Ctrl+P` alterna Sol
Medium/High y `Ctrl+L` conserva la selección manual.

`realinear os` sigue disponible como operación para auditar la capa agentica. Las
skills de producto, SpecKit, release/research, taskflows y computer use no forman
parte del lifecycle `/flow`.

## Modelo Mental

- `AGENTS.md`: reglas mínimas.
- `docs/.generated/context-index.md`: índice generado.
- `docs/WORKING_MEMORY.md`: foco y estado vivo.
- `docs/TOPICS.md`: router humano.
- `docs/topics/`: conocimiento reusable.
- `docs/tracks/`: briefs y trabajo retomable.
- `docs/skills/`: skills locales portables.
- `docs/DECISIONS.md`: decisiones durables.
- `specs/`: features grandes.

La memoria principal son los docs versionados, no la conversación ni un prompt de
handoff. La ruta caliente debe permanecer corta.

## Verificación

```powershell
bun run context:index
bun run context:audit
bun run routing:check
npm run skills:status
```

Installs, commit, push, deploy, producción, credenciales, datos privados y efectos
externos conservan confirmación explícita.
