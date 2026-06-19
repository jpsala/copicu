---
description: Ejecutar release Windows completo; si no pasas tag, el script calcula el próximo release
argument-hint: "[tag|patch|minor|major|rc] [notas]"
---
Release Windows.

Usa la lógica durable del script local `scripts/dev/release-windows.ps1` vía `npm run release:windows`. El prompt Pi es solo adapter fino.

Argumentos recibidos: `$ARGUMENTS`

Procedimiento:

1. Si `$1` parece tag (`vX.Y.Z`, `vX.Y.Z-rc.N`), pasarlo como `-Tag $1` y usar `${@:2}` como notas.
2. Si `$1` es `patch`, `minor`, `major` o `rc`, pasarlo como `-Bump $1` y usar `${@:2}` como notas.
3. Si no hay argumentos, ejecutar sin tag ni bump: el script debe calcular el próximo release mirando versión actual, tags locales y GitHub releases. Default: patch release.
4. Si el script detecta ambigüedad entre patch/minor/major/rc, debe preguntar con opciones.
5. No agregar `-Yes` salvo que JP lo pida explícitamente. El script debe pedir confirmación antes de commit, push, GitHub release y subida de assets.

Comandos base:

```powershell
npm run release:windows
npm run release:windows -- -Bump patch -Notes "${@:2}"
npm run release:windows -- -Tag $1 -Notes "${@:2}"
```

Dry-run:

```powershell
npm run release:windows -- -DryRun -SkipBuild -SkipValidation -SkipCommit -SkipPush -SkipGithubRelease
```

Guardrails:

- No mover ni reutilizar tags publicados.
- No commitear `.env`, bases locales, blobs, `.codex-run`, installers bajo `src-tauri/target`, logs ni secretos.
- Si `gh auth status` falla, detener y reportar el bloqueo; no inventar release.
- Si validación/build falla, detener y reportar comando + error relevante.
