# Security Policy

## Supported Versions

Copicu is currently early alpha. Security reports are accepted for the public repository and latest public prerelease, but there is no stable support window yet.

## Reporting A Vulnerability

Please do not open a public issue with exploit details, secrets, real clipboard payloads, or private logs.

Report security concerns privately through GitHub's private vulnerability reporting if it is available on the repository. If it is not available, open a minimal public issue that says you have a security report to share, without sensitive details.

Include:

- affected version or commit;
- platform and Windows version if relevant;
- impact summary;
- reproduction steps using synthetic data;
- whether AI, scripts, paste-to-previous-window, clipboard capture, or local storage is involved.

Do not include:

- real clipboard content;
- API keys;
- `.env` files;
- local SQLite databases;
- blob payloads;
- private screenshots;
- private logs.

## Security Model Notes

Copicu is local-first. History metadata is stored in local SQLite, and large payloads such as images are stored as local files.

Scripts are trusted local automation, not a secure sandbox or marketplace model. Only run scripts you trust.

AI features are optional and disabled by default. Some AI actions may send selected clipboard content to the configured provider, so they should remain explicit, reviewable, and capability-based.

## Out Of Scope For Early Alpha

The current alpha does not claim:

- secure sandboxed scripts;
- enterprise policy enforcement;
- encrypted sync;
- hardened multi-user isolation;
- compatibility with CopyQ scripts;
- stable security boundaries for third-party script distribution.

