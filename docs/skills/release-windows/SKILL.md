---
name: release-windows
description: Preparar y ejecutar releases Windows de Copicu coordinando documentación, GitHub y build/checks en paralelo. Usar cuando JP pide un release, una RC o cerrar/publicar un corte de Copicu; una consulta de estado sólo requiere evaluación, no publicación.
---

# Release Windows de Copicu

La fuente es `docs/skills/release-windows`; usar la compatibilidad `.agents/skills`
existente sin duplicarla. El procedimiento coordina los helpers del repo y los
agentes disponibles; ejecutar un script de terminal solo no inicia agentes.

## Alcance y preparación

Leer `AGENTS.md`, glosario imprescindible, track del corte y las secciones
pertinentes de [Windows installer](../../topics/windows-installer.md). Comprobar
checkout, upstream, WIP y ownership. Recuperar sólo evidencia pertinente; no
promover pruebas locales a validación de infraestructura/otros PCs.

Distinguir preparación/build, commit/push, publicación e instalación conforme
al pedido actual. Conservar permisos ya otorgados y no preguntar otra vez por
ellos. Si falta un efecto, completar primero el artefacto revisable y explicar
el gate local antes de pedirlo; no invocar `release:install` por inercia.
Los efectos expresamente excluidos quedan fuera del encargo y no disparan una
solicitud automática de permiso al terminar la preparación.

Verificar tags/releases remotos y resolver el candidato con el helper existente,
sin adivinar versión. Un pedido de release para actualizar las PCs usa el canal
normal/latest; usar RC cuando JP la elija expresamente y conservar esa elección.
El endpoint actual `releases/latest/download/latest.json` excluye prereleases:
una RC no aparece en **Check for updates**. El helper usa la versión core en package/Cargo/Tauri/NSIS incluso
cuando el tag GitHub tiene sufijo RC.
Resolver una sola vez y registrar tag/core; pasar `-Tag` explícito en fases y
reintentos. Repetir `-Bump rc` después de cambiar el core puede saltar otra versión.

## Trabajo en paralelo

Por defecto, repartir las ramas independientes entre agentes cuando el harness
los permita. Ajustar el número a slots/costo; si JP excluye agentes o no existen,
hacer el mismo trabajo secuencialmente sin instalar ni configurar un runtime.
Conservar modelo/effort efectivos. Fijar un corte finito y ownership antes de
lanzar; no crear chats de sidebar, worktrees sin WIP ni campañas automáticas.

- **Documentación:** curar estado/contratos/evidencia del corte y preparar notas
  basadas en resultados reales. No cambiar versiones, artefactos ni afirmar una
  publicación o smoke todavía pendiente.
- **GitHub:** comprobar remote/upstream, tags/releases y CI; preparar notas,
  inclusión de archivos y actualizaciones remotas pertinentes. Leer antes de
  mutar; no cerrar issues ni enviar comentarios no pedidos. Conservar latest
  estable al publicar RC (`--prerelease --latest=false`).
- **Build/checks:** revalidar herramientas, caches, perfiles/procesos; ejecutar
  regresiones pertinentes y producir NSIS firmado con dependencias existentes.
  No compilar sobre DLL cargada ni tocar una instalada ajena a su alcance.

Para firmar, comprobar la fuente canónica local del helper y el trust root del
proyecto: una clave global de otro proyecto puede producir `.sig` inválida aun
con build exitoso. Cargar key/password sólo en el proceso del build/firma, sin
imprimirlos ni cambiar pubkey/env global. Verificar criptográficamente los bytes
finales; no aceptar sólo la existencia de `.sig` o el exit code.

El coordinador posee versiones/locks, README/notas finales, Git index y efectos
de publicación/instalación. Los workers reportan evidencia, paths y límites;
ninguno cambia archivos de otro ni ejecuta el helper completo por separado.

Fijar versión antes del paquete final. Calentar caches puede avanzar mientras
se revisan docs/GitHub, pero un artefacto con versión/config anterior no es el
candidato. Freeze de producto/config antes de checks finales y packaging; cambios
posteriores invalidan la evidencia afectada. Mantener build e index serializados.

## Integración y salida

Contrastar entregas con archivos, tests y comportamiento observado. Reutilizar
[repo-commit-push](../repo-commit-push/SKILL.md) para inclusión/scaneo y efectos
Git autorizados; preservar WIP ajeno, fixtures privados y secretos. El helper
`scripts/dev/release-windows.ps1` puede hacer `git add -A`, commit, push, publicar
y parar procesos: usar sus flags por fase o ejecutar pasos explícitos; no delegar
esos efectos simultáneamente. `-DryRun` es evaluación read-only, no un build.

Una preparación de RC conserva README estable y excluye los efectos Git/remotos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev/release-windows.ps1 -Tag <tag-fijado> -PreRelease -SkipReadme -SkipCommit -SkipPush -SkipGithubRelease -NotesFile <notas-revisadas>
```

Adaptar el comando al alcance y preflight: el helper puede parar procesos dev;
no ejecutarlo si esos procesos o perfiles no fueron identificados. Usar
`release:install` sólo con pedido vigente de instalación.

Verificar el NSIS, DLL/recursos/helpers empaquetados, firma y manifest contra el
tag/version/fuentes exactos. Si el candidato incluye WIP sin commit, registrar
HEAD **base**, manifiesto y digest de fuentes/config (incluidos untracked),
versiones, comando/toolchain y hashes de los artefactos. HEAD solo no identifica
el código compilado. Para publicar, integrar esas fuentes en un commit inmutable
y revalidar cualquier cambio posterior al freeze.
Tras visuales generar frontend normal antes del
shipping; el bridge visual no se distribuye. Ante descarga/instalación de tools
faltantes aplicar el gate local; no instalar por desbloquear el corte.

Si la instalación está autorizada, probar **el mismo artefacto** con perfil
sintético y smoke nativo pertinente; exit code no prueba reemplazo ni arranque.
Si no lo está, conservar artefacto/evidencia y dejar ese paso explícito. Revalidar
el proceso instalado y relanzar instancias propias según corresponda.

Publicar sólo el candidato verificado y cubrir cada efecto con el pedido actual.
Evitar que RC cambie README/current stable o latest del updater. Comprobar URL,
assets/hash/firma, CI y estado Git después del efecto; si un paso falla, no seguir
con el dependiente ni repetir una publicación sin comprobar resultado remoto.

Si JP pide que una RC llegue al actualizador, publicar el tag normal de su core
con `--latest`, conservando la RC. Reusar EXE/.sig sólo si los bytes y las fuentes
siguen verificados; generar un manifest con la URL del tag normal sin volver a
incrementar versión. Comprobar además el endpoint HTTP real del updater, su
versión, URL, firma y hash. Disponibilidad pública no prueba que otra PC ya lo
haya instalado. Curar README/guía/notas y recibos del canal elegido.

Cierre compacto: versión/tag, commit/target, artefacto/URL, checks/smoke propios,
pendientes y límites. Curar delta en track/topic, sin transcript de agentes ni
backlog histórico. Un check de YAML valida estructura, no ejecución del release.
