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

## Produccion Sin Consola

El binario de release debe compilar como Windows GUI app, no consola. Mantener en `src-tauri/src/main.rs`:

```rust
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]
```

Los logs informativos de startup, clipboard watcher, foco anterior y shortcuts deben quedar detras de `debug_assertions` o un diagnostico explicito. El instalador publico no debe abrir terminal ni imprimir diagnosticos normales.

## Binarios Dev

No dejar herramientas de benchmark bajo `src-tauri/src/bin` si no deben distribuirse. Tauri enumera binarios Cargo y puede empaquetarlos. Para herramientas locales usar `src-tauri/examples/` y wrappers dev como `npm run perf:history`.

## Updater

Para updates futuros con Tauri Updater:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

En Windows, Tauri genera instalador NSIS y firma `.sig` cuando hay key de updater. No activar todavia hasta decidir canal de releases, endpoints y manejo de claves. Las claves privadas deben venir por variables de entorno, no por `.env`.

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

## Fuentes

- Tauri v2 Windows Installer: https://v2.tauri.app/distribute/windows-installer/
- Tauri v2 configuration reference: https://v2.tauri.app/reference/config/
- Tauri v2 updater: https://v2.tauri.app/plugin/updater/

## Preguntas Abiertas

- Cuando haya release publico: que estrategia de signing usar.
- Si Copicu necesita installer offline para maquinas sin WebView2/internet.
- Si conviene `createUpdaterArtifacts: true` junto con el primer canal de releases.
