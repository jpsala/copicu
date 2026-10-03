# Bun version matches local protocol acceptance. The official registry digest
# fixes the image; fetching/building/deploying still needs operator approval.
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
WORKDIR /app
COPY scripts/shared-clipboard/service.mjs scripts/shared-clipboard/relay.mjs scripts/shared-clipboard/control.mjs scripts/shared-clipboard/events.mjs scripts/shared-clipboard/identity.mjs scripts/shared-clipboard/oidc.mjs /app/
USER bun
CMD ["bun", "/app/service.mjs", "--config", "/run/secrets/service.json"]
