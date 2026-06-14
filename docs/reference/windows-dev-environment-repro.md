# Windows Dev Environment Repro For Copicu

Este documento esta pensado para copiar/pegar a otro LLM o usar como checklist para dejar otra PC Windows lista para desarrollar y validar Copicu.

## Objetivo

Dejar una maquina Windows capaz de ejecutar:

```powershell
npm run build
cd src-tauri; cargo check
npm run dev:restart
```

Stack esperado:

- Node/npm ya instalado o instalable aparte.
- Rust MSVC toolchain.
- Visual Studio Build Tools con C++ workload.
- Tauri 2 usando WebView2.

## Instalacion base

Ejecutar en PowerShell normal o elevado si winget lo pide.

```powershell
winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements --silent
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements --silent --override '--wait --quiet --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
```

Si `winget install Rustlang.Rustup` dice que ya esta instalado pero `cargo` no existe, instalar rustup manualmente:

```powershell
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP 'copicu-rustup'
New-Item -ItemType Directory -Force $dir | Out-Null
$exe = Join-Path $dir 'rustup-init.exe'
Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $exe
& $exe -y --profile minimal --default-toolchain stable
```

Cerrar y abrir la terminal despues de instalar Rust para que `%USERPROFILE%\.cargo\bin` entre al PATH.

Validar:

```powershell
cargo --version
rustc --version
```

## Linker MSVC correcto

En Git Bash / Pi puede aparecer un conflicto con `C:\Program Files\Git\usr\bin\link.exe`. Rust MSVC necesita el `link.exe` de Visual Studio, no el de Git.

Sintoma:

```text
link: extra operand ...
Try 'link --help' for more information.
```

Fix persistente recomendado:

```powershell
$msvcLink = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe'
[Environment]::SetEnvironmentVariable('CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER', $msvcLink, 'User')
```

Si la version exacta `14.44.35207` cambia, encontrar el linker asi:

```powershell
Get-ChildItem 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC' -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1 |
  ForEach-Object { Join-Path $_.FullName 'bin\Hostx64\x64\link.exe' }
```

Para una sesion actual de Git Bash sin reiniciar:

```bash
export PATH="$USERPROFILE/.cargo/bin:$PATH"
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe'
```

## Wrappers opcionales para Pi/Git Bash

Si Pi o Git Bash no heredan el PATH nuevo, crear wrappers en `C:\Users\<user>\.local\bin`, que ya suele estar en PATH de Pi.

`cargo`:

```bash
cat > "$USERPROFILE/.local/bin/cargo" <<'SH'
#!/usr/bin/env bash
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER="${CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER:-C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64\\link.exe}"
exec "$USERPROFILE/.cargo/bin/cargo.exe" "$@"
SH
chmod +x "$USERPROFILE/.local/bin/cargo"
```

`rustc`:

```bash
cat > "$USERPROFILE/.local/bin/rustc" <<'SH'
#!/usr/bin/env bash
exec "$USERPROFILE/.cargo/bin/rustc.exe" "$@"
SH
chmod +x "$USERPROFILE/.local/bin/rustc"
```

Para PowerShell/Windows commands, crear tambien `cargo.cmd`:

```powershell
$localBin = Join-Path $env:USERPROFILE '.local\bin'
New-Item -ItemType Directory -Force $localBin | Out-Null
@'
@echo off
if not defined CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe"
"%USERPROFILE%\.cargo\bin\cargo.exe" %*
'@ | Set-Content -Encoding ASCII (Join-Path $localBin 'cargo.cmd')
```

Preferencia en una PC limpia: reiniciar terminal/Pi despues de instalar Rust. Los wrappers son para sesiones largas que no heredaron PATH.

## WebView2Loader.dll en cargo check frio

Este repo referencia en `src-tauri/tauri.conf.json` el recurso:

```json
"target/release/WebView2Loader.dll": "WebView2Loader.dll"
```

En un target frio, `cargo check` puede fallar con:

```text
resource path `target\release\WebView2Loader.dll` doesn't exist
```

Despues de que compile `webview2-com-sys`, copiar el loader x64 generado:

```powershell
New-Item -ItemType Directory -Force src-tauri\target\release | Out-Null
Copy-Item src-tauri\target\debug\build\webview2-com-sys-*\out\x64\WebView2Loader.dll src-tauri\target\release\WebView2Loader.dll -Force
```

Luego reintentar:

```powershell
cd src-tauri
cargo check
```

## Validacion completa

Desde la raiz del repo:

```powershell
npm install
npm run build
cd src-tauri
cargo check
cd ..
npm run dev:restart
```

Resultado esperado de `dev:restart`:

```text
frontend build completed
main window started hidden
React renderer module loaded
copicu pid: <pid>, responding=True, path=<repo>\src-tauri\target\debug\copicu.exe
```

## Diagnostico rapido

### `cargo metadata ... program not found`

`cargo` no esta en PATH del proceso que lanza Tauri. Cerrar/reabrir terminal o agregar `%USERPROFILE%\.cargo\bin` al PATH de la sesion.

### `link.exe` usa Git en vez de Visual Studio

Verificar:

```powershell
where link
```

Debe aparecer primero algo como:

```text
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\...\bin\Hostx64\x64\link.exe
```

O definir `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` al linker MSVC exacto.

### `npm run dev:restart` tarda mucho la primera vez

Es normal si cargo compila todo desde cero. Una vez caliente, `cargo check` deberia bajar a pocos segundos y `dev:restart` deberia completar mucho mas rapido.
