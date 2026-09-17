---
description: Publicar e instalar un release Windows completo de Copicu y devolver sus URLs
argument-hint: "[patch|minor|major|rc] [notas opcionales]"
---
Ejecutá un release completo de Copicu desde `C:/dev/copicu`, usando
`docs/topics/windows-installer.md` y la skill `repo-commit-push` como contratos.
Argumentos recibidos: $ARGUMENTS

La invocación explícita de `/release` autoriza exactamente estos efectos sobre
`jpsala/copicu`: incluir los cambios necesarios del repo, crear el commit de
release, pushear la rama `main` a su upstream `origin`, crear el siguiente GitHub
Release, subir el instalador NSIS y los artifacts del updater, instalar localmente
ese mismo corte y relanzar Copicu. No extiendas esa autorización a otro repo,
remote, rama, tag, asset o secreto.

## Preflight obligatorio

1. Cargá el contexto liviano del repo y revisá `docs/WORKING_MEMORY.md`,
   `CHANGELOG.md` y `docs/topics/windows-installer.md` sólo en lo necesario.
2. Verificá el estado completo del worktree, diffs staged/unstaged y untracked.
   Preservá cambios del usuario, incluí todo lo necesario para el corte y excluí
   secretos, `.env`, bases locales, logs, dumps, exports y artifacts transitorios.
3. Confirmá mecánicamente antes del efecto externo:
   - cwd `C:/dev/copicu`;
   - rama `main` con upstream claro;
   - remote `origin` correspondiente a `jpsala/copicu`;
   - `gh auth status` válido para ese destino;
   - signing key y password canónicos disponibles por las rutas/variables ya
     soportadas, sin leer, imprimir ni copiar sus valores;
   - ningún warning de mismatch entre private key y trust root;
   - tag calculado todavía ausente en Git y GitHub.
4. Interpretá `$ARGUMENTS`: sin bump explícito, release estable patch; `minor`,
   `major` o `rc` se pasan como `-Bump`; el resto se usa como notas concisas.
   No inventes un tag manual ni muevas/republiques uno existente.
5. Derivá notas verificables del cambio real. No afirmes arreglos no medidos.
   Actualizá `CHANGELOG.md`, documentación durable y `WORKING_MEMORY.md` sólo si
   falta estado real del corte.
6. Ejecutá las validaciones relevantes del batch antes de publicar. Como mínimo:
   `npm run build`, `npm run visual:check`, `cargo check --manifest-path
   src-tauri/Cargo.toml --tests` y `bun run context:audit`. Corré tests focales
   adicionales exigidos por los archivos modificados. Ante cualquier fallo,
   corregí si pertenece al alcance; si no, detenete sin publicar.

No pidas otra confirmación rutinaria: esta invocación ya autoriza el destino y
los efectos exactos anteriores. Detenete antes de publicar si el destino es
ambiguo, hay cambios ajenos inseguros, faltan credenciales, aparece un secreto,
falla una salvaguarda o el corte no está verificable.

## Ejecución canónica

Usá una sola vez el wrapper todo-en-uno; no ejecutes primero `release:windows`:

```powershell
npm run release:install -- <argumentos PowerShell derivados>
```

El wrapper canónico debe actualizar versión, validar, generar el NSIS y su
SHA256, crear `.sig` y `latest.json`, actualizar el bloque de release, commitear,
pushear, crear el GitHub Release con `--latest`, subir exactamente estos assets e
instalar localmente el mismo build:

- `Copicu_<version>_x64-setup.exe`
- `Copicu_<version>_x64-setup.exe.sig`
- `latest.json`

Nunca uses flags `Skip*`, `DryRun` o un fallback manual en una ejecución real de
`/release`. Si el helper falla después de publicar parcial o totalmente, no lo
repitas a ciegas, no borres/muevas el tag y no crees otro release: inspeccioná el
estado, terminá sólo pasos locales inequívocos cuando sea seguro y reportá el
punto exacto de corte.

## Postflight obligatorio

Verificá mediante Git/GitHub CLI y filesystem/proceso, no por inferencia:

1. commit de release en `main`, pusheado al upstream, y worktree final limpio o
   con cada resto explicado;
2. GitHub Release apuntando al commit esperado y marcado latest cuando sea
   estable;
3. presencia remota de los tres assets, con nombres y tamaños no vacíos;
4. `latest.json` sin BOM, con la versión, URL y firma del tag nuevo;
5. SHA256 local del instalador y el publicado informado por las notas;
6. instalación local desde el artifact construido, ejecutable en
   `%LOCALAPPDATA%\\Copicu\\copicu.exe`, versión exacta y proceso activo desde esa
   ruta;
7. smoke mínimo de la app instalada según el cambio publicado, usando sólo datos
   sintéticos y sin confundir dev con instalada.

## Entrega

Respondé con:

- versión y tag;
- commit y rama/remoto;
- resultado de validaciones y smoke instalado;
- SHA256;
- lista de assets verificados;
- URL de la página del release;
- URL directa HTTPS del `.exe`, lista para descargar e instalar en otra PC;
- versión/ruta/PID de la instalación local;
- cualquier limitación o resto del worktree.

No declares éxito sin URL directa del instalador y evidencia de los assets
remotos y de la versión instalada.
