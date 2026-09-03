---
id: windows-installer
status: active
kind: decision-map
triggers:
  - instalador
  - installer
  - NSIS
  - MSI
  - updater
  - release Windows
primary_refs:
  - ../DEVELOPMENT.md
  - ../DECISIONS.md
  - ../../src-tauri/tauri.conf.json
---

# Windows Installer

## Decision Actual

Usar **NSIS** como instalador Windows principal para Copicu.

Config base:

```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper",
        "silent": true
      },
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

## Motivo

Copicu es una herramienta local para dogfood y uso personal/power-user. Conviene un instalador `.exe` simple, por usuario, sin privilegios de administrador, con salida clara desde `npm run tauri:build`.

NSIS instala por usuario con `currentUser`, guardando metadata bajo `HKCU` y evitando `Program Files`/UAC. Esto coincide con el modelo de app local que corre en background, tray y shortcuts.

## Opciones Evaluadas

| Opcion | Uso recomendado | Tradeoff |
| --- | --- | --- |
| NSIS (`-setup.exe`) | Default para releases Windows de Copicu. | Mejor UX de instalacion personal; instalador unico y personalizable. |
| MSI (`.msi`) | Deployment corporativo, GPO, entornos administrados. | Mas friccion local; requiere WiX/VBScript y es Windows-only para build. |
| `targets: "all"` | Solo para comparar artefactos puntualmente. | En Windows genera MSI ademas de NSIS y agrega fallos/tiempo innecesario. |
| WebView2 offline/fixed | Entornos sin internet o maquinas controladas. | Aumenta mucho el tamano del instalador. |

## WebView2

Mantener por ahora:

```json
"webviewInstallMode": {
  "type": "downloadBootstrapper",
  "silent": true
}
```

Motivo: Windows 10/11 modernos suelen tener WebView2 disponible o pueden descargar el bootstrapper. Si aparece un target offline, cambiar a `offlineInstaller`; si aparece una maquina vieja o bloqueada, evaluar `embedBootstrapper`.

No usar `skip` salvo build interno muy controlado: Tauri lo marca como no recomendado porque la app depende de WebView2.

### `WebView2Loader.dll`

En Windows GNU, `webview2-com-sys` deja `WebView2Loader.dll` como dependencia dinamica junto al binario de Cargo. El instalador NSIS debe instalar esa DLL junto a `copicu.exe`; si falta, el primer launch instalado falla con:

```text
The code execution cannot proceed because WebView2Loader.dll was not found.
```

Patron vigente:

- `bundle.resources` incluye `target/release/WebView2Loader.dll`;
- `bundle.windows.nsis.installerHooks` usa `nsis-hooks.nsh`;
- el hook post-install copia `resources/WebView2Loader.dll` a `$INSTDIR/WebView2Loader.dll`;
- el hook tambien borra `bench_history_search.exe` si quedo de una build alpha anterior.

## Binario Sin Consola

El binario Windows debe compilar como Windows GUI app, no consola. Mantener en `src-tauri/src/main.rs`:

```rust
#![cfg_attr(windows, windows_subsystem = "windows")]
```

Motivo:

- el instalado publico no debe abrir terminal ni imprimir diagnosticos normales;
- el binario dev tambien debe ser GUI, porque el picker se activa con global hotkey y un binario console puede exponer momentaneamente la consola al cambiar foco;
- `npm run dev:restart` ya redirige stdout/stderr a `.codex-run/dev-restart/logs/`, asi que no se necesita una consola visible para diagnostico diario.

Los logs informativos de startup, clipboard watcher, foco anterior y shortcuts deben quedar detras de `debug_assertions` o un diagnostico explicito cuando se trate de release publica.

## Binarios Dev

No dejar herramientas de benchmark bajo `src-tauri/src/bin` si no deben distribuirse. Tauri enumera binarios Cargo y puede empaquetarlos. Para herramientas locales usar `src-tauri/examples/` y wrappers dev como `npm run perf:history`.

## Updater

Decision vigente: usar **Tauri Updater + GitHub Releases** para auto-update in-app.

Politica inicial:

- setting `autoUpdate.enabled` prendido por defecto;
- check automatico al iniciar la app instalada y luego cada 60 minutos;
- canal unico `stable`;
- endpoint publico: `https://github.com/jpsala/copicu/releases/latest/download/latest.json`;
- Windows `installMode: "passive"` para instalar sin interaccion;
- si hay update, Copicu descarga, verifica firma Tauri, instala y relanza.

Config base en `src-tauri/tauri.conf.json` mantiene `plugins.updater.pubkey`, endpoint y modo pasivo. Los artifacts de updater se habilitan solo en release con config mergeada:

```powershell
npm run tauri:build -- --config src-tauri/tauri.updater-artifacts.conf.json
```

Ese config agrega:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

El helper `npm run release:windows` ahora usa ese config, exige `TAURI_SIGNING_PRIVATE_KEY` o `TAURI_SIGNING_PRIVATE_KEY_PATH`, lee `Copicu_<version>_x64-setup.exe.sig`, genera `latest.json` y sube instalador, firma y manifest al GitHub Release.

Las claves privadas deben venir por variables de entorno o rutas locales secretas, nunca por `.env` commiteado ni por archivos versionados. El pubkey en config es publico; perder la private key impide publicar updates para instalaciones ya distribuidas.

Estado historico 2026-07-09: `v0.3.7` publico con assets `Copicu_0.3.7_x64-setup.exe` y `latest.json`; SHA256 `C3629D6229A04BCFCDA41BDA7F5D969CC8F1E6FF8417A5490906223B447BBAAC`. Mejoro estabilidad de search/paginacion/seleccion y mantuvo el instalador NSIS unsigned con updater Tauri firmado.

Estado 2026-07-30: release estable `v0.4.3`, asset `Copicu_0.4.3_x64-setup.exe`, firma y `latest.json`; SHA256 público `A3E3AEAEBDC3FBD144DF0B355302B004664B60BE85553245A3508E0F5B1AF636`. Restaura el editor compacto de metadata con `#tags` y properties como tokens inline, y mantiene todo visible al redimensionar hasta el mínimo soportado. Release: <https://github.com/jpsala/copicu/releases/tag/v0.4.3>.

Estado 2026-09-03: release estable `v0.4.11`, asset `Copicu_0.4.11_x64-setup.exe`, firma y `latest.json`; SHA256 `6C54A2D131FF8E996B47E7A248831E2E41E35169E1B735E6DBE3005451D3B85B`. Corrige el refresh de tags creados desde otra ventana y define busqueda jerarquica por padre para slugs con `/`. Release: <https://github.com/jpsala/copicu/releases/tag/v0.4.11>.

La private key anterior no estaba disponible al cortar `v0.3.7`, por lo que JP aprobo rotar la trust root del updater. Consecuencia: instalaciones `v0.3.6` o anteriores no pueden verificar `latest.json` de `v0.3.7` y necesitan instalar este corte manualmente; desde `v0.3.7`, futuros updates vuelven a funcionar con la nueva clave. No rotar otra vez salvo perdida/compromiso explicito.

La ventana Settings incluye seccion `About` desde `v0.2.7`, con descripcion, version local, target y estado de auto-update. `Check now` consulta el manifest firmado y, cuando encuentra una version nueva, habilita `Update now`; esa accion vuelve a validar el canal, descarga, verifica la firma Tauri, instala y relanza aunque `autoUpdate.enabled` este apagado. El modo automatico conserva el mismo pipeline sin quitarle al usuario el control manual.

`v0.2.8` agrego diagnostics persistente para release/instalada en `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` con rotacion simple a `diagnostics.previous.jsonl` al pasar ~5 MB. Registra eventos sin payloads: `app.startup`, `storage.ready`, `window.*`, `updater.*`, `clipboard.event.*` con duracion/outcome/tamano y `renderer.heartbeat` cada ~30 s. Si una instancia instalada vuelve a quedar `Hung=True`, revisar el ultimo heartbeat/evento antes de reiniciar; el dump local del incidente previo quedo en `.codex-run\hang-dumps\copicu-installed-hung-20260623-113818.dmp`.

## Scripts Incluidos

El instalador NSIS distribuye una seleccion minima de scripts utiles:

- `030-extract-urls-copy.ts`;
- `031-join-selected-markdown-copy.ts`;
- `copicu-action.d.ts`, necesario para tipos/autocomplete al editarlos.

El hook copia estos archivos a `$DOCUMENTS\Copicu\Scripts` solo cuando cada destino no existe. Una actualizacion nunca sobrescribe scripts modificados por el usuario y el uninstall no los borra. Los demas archivos bajo `scripts/examples/` son fixtures y contratos de desarrollo, no contenido instalado.

## Launch On Windows Startup

La opcion Settings -> General -> `Launch on Windows startup` usa un backend Windows directo sobre `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` con el app name de Tauri (`Copicu`) y `Explorer\StartupApproved\Run`.

Hardening vigente:

- Settings consulta `get_autostart_status` y muestra el estado real del OS, no solo el valor persistido en SQLite.
- El toggle queda deshabilitado si la app corre en dev/debug/`COPICU_APP_DATA_DIR`/`COPICU_TAURI_DEV`, para no pisar el autostart de la instalada con una ruta dev.
- `update_settings` bloquea cambios desde perfiles no instalados, sincroniza el registro antes de persistir y revierte el registro si falla la persistencia.
- Enable crea las claves faltantes, guarda `current_exe` entre comillas y escribe `StartupApproved` como `REG_BINARY` habilitado de 12 bytes. Esto evita que perfiles o rutas con espacios queden registrados pero no ejecutables.
- Disable elimina `Run` y `StartupApproved` de forma idempotente, incluso si Windows habia marcado la entrada como deshabilitada.
- `get_autostart_status` solo informa enabled cuando `Run` apunta al ejecutable instalado actual y `StartupApproved` no esta deshabilitado.
- Al sincronizar, se limpian entradas legacy conocidas `Copicu`/`copicu` que no coincidan con el nombre canonico.

Estado diagnosticado 2026-08-29: `StartupApproved\Run\Copicu` seguia enabled, pero `Run\Copicu` no existia; por eso Windows no podia iniciar Copicu aunque quedara un approval residual.

Gotcha 2026-07-09: si la clave de updater tiene password, `tauri build` espera `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; con solo `TAURI_SIGNING_PRIVATE_KEY_PATH` puede quedar detenido en `Decrypting updater signing key, expect a prompt for password`. El script carga el contenido de `TAURI_SIGNING_PRIVATE_KEY_PATH`, pero el password sigue siendo necesario. La clave nueva de `v0.3.7` vive localmente en `.codex-run/secrets/copicu-updater.key` con password en `.codex-run/secrets/copicu-updater.password`; ambos estan ignorados y deben respaldarse juntos fuera del repo. Si el archivo de password tiene BOM UTF-8, decodificarlo como `utf-8-sig` antes de exportarlo: Tauri interpreta el BOM como parte del password y rechaza la clave.

Gotcha 2026-09-03: Windows PowerShell 5.1 agrega BOM al usar `Set-Content -Encoding utf8`; Tauri Updater rechaza ese `latest.json` con `error decoding response body`. `New-UpdaterManifest` debe escribir UTF-8 sin BOM mediante `System.IO.File.WriteAllText`. El asset de `v0.4.10` fue reemplazado sin cambiar su contenido JSON y el check nativo volvio a informar `Copicu is up to date`.

Gotcha 2026-06-23: en PowerShell, `@($json | ConvertFrom-Json | ForEach-Object { $_.tagName })` puede envolver el array de releases como un solo item y hacer que el auto-tag ignore GitHub releases recientes. El helper `scripts/dev/release-windows.ps1` debe primero asignar `$items = $json | ConvertFrom-Json` y luego enumerar `$items | ForEach-Object`; esto evita repetir un tag ya publicado cuando el clon local no tiene tags frescos.

## Signing

Para distribuir fuera de la maquina local, el siguiente problema real no es NSIS vs MSI sino reputacion/firma:

- firmar el binario y el instalador reduce warnings de SmartScreen/Defender;
- sin firma, Windows puede mostrar advertencias aunque el instalador sea correcto;
- no commitear certificados, passwords ni claves.

## Comandos

Build normal:

```powershell
npm run tauri:build
```

Salida esperada:

```text
src-tauri/target/release/bundle/nsis/*-setup.exe
```

Release Windows local todo-en-uno:

```powershell
npm run release:windows
```

Antes de cortar release publico, refrescar tags para evitar resolver un tag viejo si el clon local esta desactualizado:

```powershell
git fetch --tags origin
```

Sin `-Tag`, el helper calcula el proximo release mirando version actual (`package.json` + `src-tauri/tauri.conf.json`), tags locales y releases de GitHub. Default: patch estable. Si hay una linea prerelease mas nueva que el ultimo estable, pregunta con opciones entre patch, rc, promover estable, minor o major. Tambien acepta overrides explicitos:

```powershell
npm run release:windows -- -Bump minor -Notes "Windows installer refresh."
npm run release:windows -- -Tag v0.2.2-rc.1 -Notes "Windows installer refresh for v0.2.2 RC 1."
```

Esto actualiza version de proyecto, corre validaciones, builda el instalador NSIS, calcula SHA256, actualiza `README.md`, commitea, pushea y crea el release GitHub con `gh release create`. Pide confirmacion antes de commit, push y release/subida de asset; `-Yes` solo si JP pide modo automatico. Para dry-run:

```powershell
npm run release:windows -- -DryRun -SkipBuild -SkipValidation -SkipCommit -SkipPush -SkipGithubRelease
```

Release candidate publico manual si se necesita depurar paso a paso:

```powershell
npm run tauri:build
Get-FileHash src-tauri/target/release/bundle/nsis/Copicu_0.2.0_x64-setup.exe -Algorithm SHA256
gh release create v0.2.0-rc.N src-tauri/target/release/bundle/nsis/Copicu_0.2.0_x64-setup.exe --target main --title "Copicu 0.2.0 RC N" --prerelease --notes-file <notes.md>
```

Usar siempre un tag nuevo para un corte nuevo (`rc.N+1`). No mover ni
republicar un tag ya publicado salvo decision explicita, porque el tag debe
seguir representando el binario que se publico originalmente.

Gotcha 2026-06-20: si el helper intenta crear un release cuyo tag ya existe en
GitHub, detenerse y usar el siguiente tag semver; no mover el tag publicado ni
reemplazar assets del release previo. En esa fecha `v0.2.2` y `v0.2.3` ya estaban
publicados; el corte posterior de polish de borrado fue `v0.2.4`.

Promover el estado actual del repo a la app instalada:

```powershell
npm run install:current
```

Uso conversacional esperado: si JP dice `actualizar instalada`, `promover dev a instalada`, `crear instalador e instalar` o equivalente, ejecutar ese comando. El script builda, genera el NSIS, cierra `copicu.exe`, instala silencioso y relanza el ejecutable instalado.

## Datos Runtime

La app instalada debe usar el perfil normal de Tauri para `dev.jpsala.copicu`, hoy bajo:

```text
%APPDATA%\dev.jpsala.copicu\copicu.sqlite3
```

Los comandos dev no deben usar esa DB por defecto. `npm run tauri:dev`, `npm run dev:isolated`, `npm run dev:built` y `npm run dev:restart` apuntan a:

```text
.codex-run\dev-isolated\app-data
.codex-run\dev-isolated\scripts
```

El hotkey default del perfil dev aislado es `Ctrl+Shift+.` para no competir con la instalada. Si alguna investigacion necesita reproducir contra el perfil real, debe ser opt-in explicito, no default.

Dev aislado mantiene app-data/scripts separados y hotkey propio, pero el clipboard watcher queda habilitado por defecto para que dogfood/dev capture como la instalada. Si una prueba necesita estabilidad sin captura real, debe deshabilitarlo explicitamente con `COPICU_DISABLE_CLIPBOARD_WATCHER=1`.

El tray de dev debe distinguirse de la instalada:

- tooltip `Copicu Dev`;
- menu `Toggle Copicu Dev`;
- icono `src-tauri/icons/tray-dev.png` con badge `D`.

La instalada conserva tooltip/icono normal `Copicu`.

## Fuentes

- Tauri v2 Windows Installer: <https://v2.tauri.app/distribute/windows-installer/>
- Tauri v2 configuration reference: <https://v2.tauri.app/reference/config/>
- Tauri v2 updater: <https://v2.tauri.app/plugin/updater/>

## Preguntas Abiertas

- Cuando haya release publico: que estrategia de signing usar.
- Si Copicu necesita installer offline para maquinas sin WebView2/internet.
- Si conviene `createUpdaterArtifacts: true` junto con el primer canal de releases.
