---
id: distribution-trust-code-signing
status: active-next
updated: 2026-06-30
---

# Distribution Trust And Code Signing

Track para reducir la friccion de instalacion publica de Copicu en Windows. El problema no es solo tecnico: Copicu es un clipboard manager con hooks/global shortcuts, por lo que un warning de Windows/SmartScreen impacta fuerte en confianza y conversion.

## North Star

Que una persona nueva pueda instalar Copicu con una cadena de confianza clara:

1. installer firmado con identidad verificable;
2. release reproducible/verificable desde GitHub Actions o pipeline equivalente;
3. README/release notes explican publisher, SHA256 y estado alpha sin sonar defensivos;
4. canal publico mejora progresivamente la reputacion SmartScreen;
5. si hace falta menor friccion, evaluar Microsoft Store/MSIX como canal complementario.

## Estado Actual

- Canal actual: GitHub Releases con NSIS `Copicu_*_x64-setup.exe`, `latest.json` firmado para Tauri Updater y SHA256 publicado.
- Release vigente: `v0.3.7`, SHA256 `C3629D6229A04BCFCDA41BDA7F5D969CC8F1E6FF8417A5490906223B447BBAAC`.
- `v0.3.7` rota la trust root Tauri Updater porque la private key anterior no estaba disponible; `<=0.3.6` requiere un salto manual. La nueva key local necesita backup externo.
- Instalador publico aun no esta Authenticode-signed; Windows/SmartScreen puede mostrar warning de publisher desconocido o app no reconocida.
- El warning es un problema real de producto, especialmente para usuarios nuevos y para una app que observa clipboard/shortcuts.

## Hechos Relevantes

- Firmar codigo reduce friccion y evita `Unknown publisher`, pero no garantiza eliminar SmartScreen desde el primer download.
- SmartScreen mira reputacion de publisher/certificado y tambien reputacion del hash del archivo.
- Certificados EV ya no deben asumirse como bypass instantaneo de SmartScreen; Microsoft documenta que tambien acumulan reputacion.
- Microsoft Store/MSIX es el camino mas confiable para evitar warnings de SmartScreen porque Microsoft re-firma el paquete.
- Para distribucion fuera de Store, Microsoft recomienda Artifact/Trusted Signing u OV tradicional; ambos acumulan reputacion con el tiempo.
- Para OSS hay opciones relevantes: SignPath Foundation ofrece signing gratis para proyectos open source calificados; OSSign tambien existe pero al 2026-06-30 indica aplicaciones suspendidas por backlog.

Fuentes:

- Microsoft SmartScreen reputation: <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- Microsoft code signing options: <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options>
- SignPath Foundation: <https://signpath.org/>
- OSSign: <https://ossign.org/>

## Decision De Direccion

No conformarse con GitHub Releases unsigned para un lanzamiento amplio. Mantener GitHub Releases como canal actual de alpha/dogfood mientras se prepara signing OSS o Store.

Prioridad recomendada:

1. **SignPath Foundation** para signing OSS gratuito, si Copicu califica.
2. **Microsoft Store/MSIX** como opcion de menor warning para usuarios generales, evaluar luego de entender compatibilidad con Tauri/NSIS/updater.
3. **Microsoft Artifact Signing / OV** si SignPath no califica o demora demasiado y se decide pagar.
4. **EV** no comprar solo para SmartScreen; no justifica premium si el objetivo unico es eliminar warning inicial.

## Workstreams

### A. Readiness Para SignPath

Objetivo: dejar el repo y el pipeline listos para aplicar a SignPath Foundation.

Tareas:

1. Confirmar licencia OSS y que el repo publico contiene todo lo necesario para auditar el build.
2. Mover el release Windows a GitHub Actions o pipeline verificable, evitando dependencias locales no documentadas.
3. Documentar inputs secretos: Tauri updater key, passwords, tokens, certificados futuros.
4. Asegurar checks publicos antes de release: frontend build, cargo check/test, tests relevantes, artifact hash.
5. Crear una release provenance minima: commit, tag, workflow run, artifact hash, installer name.
6. Revisar requisitos de SignPath: actividad del proyecto, licencia, build reproducible/verificable, proceso de aprobacion.
7. Preparar solicitud con links al repo, releases, workflow, README y razon de seguridad para signing.

Validacion esperada:

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --tests
npm run release:windows -- -DryRun -SkipGithubRelease
```

### B. Integracion De Firma Windows

Objetivo: firmar `copicu.exe` y el instalador NSIS sin romper updater ni instalacion local.

Tareas:

1. Investigar configuracion Tauri 2 para signing Windows: `bundle.windows.certificateThumbprint`, `digestAlgorithm`, `timestampUrl` o `signCommand` segun proveedor.
2. Definir si firma ocurre via Tauri build, SignPath job externo o paso `signtool` posterior.
3. Verificar que modificar/firma post-build no rompe `.sig`/`latest.json` de Tauri Updater; ordenar firma vs updater artifact correctamente.
4. Confirmar que NSIS installer y binario embebido quedan firmados y timestamped.
5. Agregar verificacion local/CI con `Get-AuthenticodeSignature`.
6. Actualizar `scripts/dev/release-windows.ps1` para detectar signing configurado y fallar claro cuando se espera release firmado.

Validacion esperada:

```powershell
Get-AuthenticodeSignature src-tauri/target/release/copicu.exe
Get-AuthenticodeSignature src-tauri/target/release/bundle/nsis/Copicu_<version>_x64-setup.exe
```

### C. Store / MSIX Spike

Objetivo: saber si Microsoft Store/MSIX es viable como canal complementario sin desviar demasiado el producto.

Tareas:

1. Revisar soporte Tauri 2 para MSIX y Store submission.
2. Ver si Copicu puede mantener NSIS/GitHub Releases + updater y tambien Store/MSIX.
3. Evaluar implicancias de clipboard watcher, global shortcuts, startup registration y updater en Store.
4. Estimar esfuerzo de Partner Center, listing, privacy statement, screenshots y compliance.
5. Decidir si Store va antes o despues de signing OSS.

### D. Comunicacion Publica

Objetivo: que la pagina de instalacion no minimice el riesgo pero tampoco espante innecesariamente.

Tareas:

1. Actualizar README cuando haya signing: publisher, como verificar firma, SHA256, expected warning si aplica.
2. Agregar docs de `Verify installer` con PowerShell `Get-FileHash` y `Get-AuthenticodeSignature`.
3. En release notes, indicar si el instalador esta signed/unsigned y con que identidad.
4. Evitar claims como `no warning`, `secure`, `trusted` hasta verificar comportamiento real en maquinas limpias.

## Ask-Before Boundaries

Pedir confirmacion explicita antes de:

- aplicar a SignPath/OSSign o enviar informacion del proyecto a terceros;
- pagar Microsoft Artifact Signing, OV/EV o cualquier certificado;
- crear cuenta Microsoft Store/Partner Center o publicar Store listing;
- cambiar pipeline de release publico o requerir CI para publicar;
- publicar una release marcada como signed/trusted.

## Riesgos / Gotchas

- Un certificado nuevo puede seguir mostrando SmartScreen al principio; comunicarlo como reputacion gradual.
- Si cambiamos identidad/certificado, se resetea parte de la reputacion acumulada.
- Firmar despues de generar updater artifacts puede invalidar hashes/signatures; validar orden exacto.
- SignPath/OSSign pueden tener cola o rechazar proyectos jovenes; preparar fallback pago.
- Microsoft Store puede imponer restricciones o UX distinta para updater/shortcuts/startup.
- No commitear claves privadas, passwords, certificados ni tokens.

## Proximo Corte

1. Auditar requisitos de SignPath y mapear gaps concretos del repo/pipeline.
2. Diseñar release CI verificable para Windows sin mover todavia secretos reales.
3. Proponer a JP si aplicar primero a SignPath o hacer spike Microsoft Store/MSIX.

## Readiness SignPath / CI Verificable

Precheck 2026-07-09:

- `LICENSE` existe y es MIT, una licencia OSI-compatible.
- Al iniciar el precheck no habia workflow; ahora existe `.github/workflows/windows-release-signing.yml` como draft manual-only. El release real sigue siendo local con `scripts/dev/release-windows.ps1` hasta resolver SignPath y el orden Authenticode/updater.
- El script local ya hace `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml --tests`, build Tauri con updater artifacts, `latest.json` y SHA256.
- Falta Authenticode: no hay SignPath/Trusted Signing/signtool, verificacion `Get-AuthenticodeSignature` ni politica publica de code signing.
- `src-tauri/tauri.conf.json` produce NSIS `.exe`; SignPath soporta Authenticode para PE `.exe`, por lo que el instalador NSIS es firmable como `.exe` aunque no haya integracion NSIS especial.

Requisitos SignPath Foundation que afectan a Copicu:

- Proyecto OSS activo, releaseado y documentado; sin malware/PUA ni codigo propietario no permitido.
- MFA en SignPath y GitHub para miembros con rol de signing.
- Roles claros: authors/committers, reviewers y approvers; cada signing request requiere aprobacion manual.
- Publicar una seccion o pagina `Code signing policy` en homepage/download/release pages con el texto requerido: `Free code signing provided by SignPath.io, certificate by SignPath Foundation`, roles/miembros y privacidad.
- Trusted build + origin verification: para OSS, los jobs que llevan al signing request deben correr en GitHub-hosted runners; el artifact debe subirse como GitHub workflow artifact antes de enviarse a SignPath.
- Artifact configuration con metadata restrictions: product name = `Copicu`; product/file version consistente por build.

Diseño CI minimo propuesto, sin secretos reales:

1. `workflow_dispatch` + tag input para build Windows en `windows-latest`.
2. Checkout del tag/commit, instalar Node/Bun/Rust/Tauri prerequisites documentadas.
3. Ejecutar los checks actuales: `npm run build` y `cargo check --manifest-path src-tauri/Cargo.toml --tests`.
4. Build unsigned con updater artifacts usando secretos de updater solo en GitHub Actions cuando JP decida migrar release: `TAURI_SIGNING_PRIVATE_KEY` y password si aplica.
5. Subir `Copicu_<version>_x64-setup.exe` como artifact unsigned.
6. Enviar ese artifact a `signpath/github-action-submit-signing-request@v2` con `wait-for-completion: true`.
7. Descargar el artifact signed y verificar:

```powershell
Get-AuthenticodeSignature src-tauri/target/release/copicu.exe
Get-AuthenticodeSignature src-tauri/target/release/bundle/nsis/Copicu_<version>_x64-setup.exe
Get-FileHash src-tauri/target/release/bundle/nsis/Copicu_<version>_x64-setup.exe -Algorithm SHA256
```

Punto critico antes de implementar CI: definir y probar el orden **Tauri updater signature vs Authenticode**. Si Authenticode cambia bytes del instalador despues de crear `.sig`/`latest.json`, el updater puede fallar. El corte seguro es crear un dry-run que compare:

1. updater `.sig` antes de Authenticode;
2. Authenticode signing del instalador;
3. validacion real de update/install con el artifact final.

Si falla, el release pipeline debe firmar Authenticode antes de generar/publicar `latest.json` o regenerar updater signature/hash despues de Authenticode, segun permita Tauri.

Artefactos draft creados:

- `.github/workflows/windows-release-signing.yml`: workflow manual-only para checks, build opcional, upload de artifact, submit SignPath condicional y verificacion Authenticode condicional.
- `docs/reference/code-signing-policy.md`: politica publica draft, no activa hasta aprobacion SignPath/JP.

Gates antes de ejecutar:

- Pedir confirmacion a JP antes de mover release real a CI, cargar secretos en GitHub, instalar SignPath GitHub App, enviar signing requests, aplicar a SignPath Foundation, publicar release signed/trusted o pagar certificados.
