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
- Release vigente: `v0.3.2`, commit `ce27b55`, SHA256 `2E38ABC686DAD94F16DAAE16C2671F49281A5A84FCEDA3D14EF93D48E565110A`.
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

- Microsoft SmartScreen reputation: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Microsoft code signing options: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- SignPath Foundation: https://signpath.org/
- OSSign: https://ossign.org/

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
