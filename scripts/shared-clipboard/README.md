# Sharing service

`service.mjs` starts the account service over the existing V1 publications and
V2 catalogue/SSE. It uses Bun and SQLite, has no npm dependencies, and listens
only on loopback. `relay.mjs` without an identity adapter remains the synthetic
test fixture; importing a bundle is not the normal user setup.

The concrete contract, provider proposal and external gates live in
[identity-service-plan.md](../../specs/016-shared-clipboard/identity-service-plan.md).
These files do not deploy a service. JP authorized deployment/distribution on
2026-10-02; the selected destination is the existing VPS/Traefik and Google OIDC.
JP approved Google terms/OAuth credentials, DNS and the pinned Bun image in this
session. The service is running at `https://sharing.jpsala.dev/` with Google OIDC,
Traefik HTTPS and persistent SQLite. Credentials and account configuration stay
outside Git; this guide grants no future permission. Remote evidence and limits
are recorded in [identity acceptance](../../specs/016-shared-clipboard/identity-acceptance.md#servicio-remoto-activo).

The next client uses that fixed internal URL; Settings asks for the PC name and
browser sign-in only. Any authenticated Google account is the target admission
policy, with all its PCs at the same level. The current deployment still uses the
initial allowlist and `v0.5.3` device approval. The replacement key-custody model
needs JP's decision before deployment; do not silently weaken E2EE.

## Prepare for operator review

1. Use the fixed product hostname `sharing.jpsala.dev` and a private copy of
   `deploy/service.example.json`. Alternative remote URLs are not client settings.
2. Register an OIDC **web application** with that exact
   `https://HOST/v3/auth/callback`. Discovery must advertise S256 and RS256.
   Only `openid email` are requested. No Google Drive/clipboard permission.
3. Put the client ID in private config and the client secret in its protected file.
   `oidc.admission: "authenticated"` admits any account whose provider token passes
   signature, issuer, audience, time and nonce checks, with empty admission lists.
   The optional `"allowlist"` mode (also the legacy default) requires admitted
   verified emails or provider subjects. A missing policy with empty lists fails
   closed. Identity is keyed by issuer/subject, not email.
4. Generate a fresh Ed25519 service issuer with
   `bun scripts/shared-clipboard/service.mjs --init-issuer ABSOLUTE_NEW_KEY`.
   Never replace an existing issuer to fix startup: SQLite pins its public key.
5. Protect config/secret files with owner-only permissions (0600 on Linux).
   The service checks these before reading them. Keep them outside Git/build
   context. Do not paste keys, tokens or real clipboard data into diagnostics.
6. Review the appropriate Compose file and pin external images to approved digests before
   deployment. Prepare the data volume for Bun UID 1000 and use secret files
   owned/readable by that UID; Compose local file secrets preserve host modes.
   Fetching images, changing ownership and creating volumes require approval.

`Dockerfile` pins official Bun 1.3.14 to registry digest
`sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4`.
Its context includes only the six service modules and Dockerfile, without
synthetic bootstrap/issuer fixtures, npm dependencies or private configuration.

Proposed launch commands after approval: `docker compose -f
scripts/shared-clipboard/deploy/compose.yaml build`, then `docker compose -f
scripts/shared-clipboard/deploy/compose.yaml up -d`. The Caddy container shares
the service network namespace, so the Bun port stays on loopback. Review runtime
logs for code-free readiness only; do not enable access logs for auth URLs.
The equivalent existing-runtime launch is `bun service.mjs --config
ABSOLUTE_PRIVATE_CONFIG`.

If the VPS already has Coolify/Traefik occupying ports 80/443, use
`deploy/compose.traefik.yaml` and the separate `deploy/traefik.example.yaml`
file-provider route instead of starting another HTTPS proxy. The Bun container
shares `coolify-proxy`'s namespace and keeps its listener on loopback. Check the
proxy's actual container name, entrypoints, certificate resolver and watched
directory. Disable access logs for the auth route and preserve all existing
routes. After the proxy container is recreated during an upgrade, recreate this
service too so it joins the new namespace; verify health and SSE afterwards.
Do not add Traefik buffering middleware to this route; it buffers responses too.
The service enforces finite request/body limits: 36 MiB per body/page and 25 MiB
+ 16 KiB per encrypted payload, with cumulative channel quotas retained. Update
the service and both PCs before sending images; older clients can reject a whole
page containing a large image and delay later text publications.

## Verify and use

Verify HTTPS certificate, `/health`, the configured public origin, OIDC callback,
SSE streaming (proxy buffering disabled), unauthorized V1/V2 denial, persistence
after service restart and revocation. The next client uses Settings → Sharing:
enter the PC name and sign in in the system browser with the same account.
The distributed `v0.5.3` still asks for the HTTPS URL and requires comparing the
complete fingerprint on both PCs and approving in Devices. Create/connect a
clipboard explicitly on each PC; select direction. Windows updates and Actions
stay off until enabled.

Generate and store the recovery code outside Copicu. Recovery needs account login
and that code, retires older devices and requires key rotation before sending
resumes. A snapshot contains only available authorized content keys, not desktop
history. Without an approved PC or saved code the service cannot recover keys.

## Backup and rollback

Stop the service cleanly for a consistent SQLite copy, or use SQLite's online
backup mechanism, such as `VACUUM INTO` into a fresh owner-only path. Preserve DB,
issuer identity, private config and encrypted
snapshots together. WAL/SHM must not be discarded while the service is running.
Recovery codes remain user-owned and are not part of server backup.

Before upgrade, keep the previous image/source and a consistent database copy.
Rollback stops the new service, restores a compatible database/issuer pair and
starts the previous version. Do not reset identity tables, substitute an issuer,
delete downloaded desktop copies or silently lower retained authorization water.
Schema compatibility and a rollback rehearsal belong to remote acceptance.

Local protocol checks: `bun test tests/shared-clipboard-identity.test.mjs
tests/shared-clipboard-control.test.mjs tests/shared-clipboard-events.test.mjs
tests/shared-clipboard-relay.test.mjs`. These do not prove HTTPS on a remote host
or traffic between two physical PCs.
