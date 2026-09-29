---
id: release-0.5.0
status: active
updated: 2026-09-29
---

# Copicu v0.5.0 Release

## Scope and authorization

JP authorized commit, push, GitHub docs/demo refresh and v0.5.0 publication. No local installation. Includes all existing folder/query-editor and persistent-working-set changes; Explorer table remains proposed. Notes: [`docs/releases/v0.5.0.md`](../releases/v0.5.0.md).

## Acceptance

- [x] Strict Vite chunk gate green without threshold bypass; main 269.46 kB, cohesive CodeMirror vendor 399.80 kB at default 500 kB limit. Context show resolved and audit has zero errors (two existing topic-size warnings).
- [x] README/user/CHANGELOG refreshed; two actual React screenshots use synthetic mocked IPC, opt-in capture only. Previous GIF/video labelled earlier illustrations. Internal registry fixture labels excluded from public captures.
- [x] Helper has side-effect-free DryRun, Summary separate from rich NotesFile, immutable UTF8/no-BOM notes with actual hash/HEAD, and real SkipBuild requires nonempty signature. Only positively identified repo build executables can be stopped, not installed/unknown processes.
- [x] Coordinator full visual suite: 442 passed + 2 intentional screenshot skips. Last copy polish: 16 focused passed + 2 skips. Rust: 259 passed + 1 ignored. Search/snapshot: 27; helper: 7; chunk config: 2. Build/check and DryRun passed.
- [x] Final NSIS extracted without installation; executable and WebView2 loader verified present. Fresh synthetic native profile passed external app -> global hotkey -> untargeted global type -> visible active query token, external capture, UI folder creation/arming, hidden external WinForms copy into that folder, marks retained after hide/reopen. CDP used after the C0 oracle for product state/UI operations; not a native pointer/paste-target matrix. Original clipboard restored from RAM; smoke app/target stopped before restoration.
- [x] Versions/package/lock/Cargo/Tauri consistent at 0.5.0. Artifact signature verified cryptographically against configured public key; manifest signature/version/asset URL match.
- [ ] Complete inclusion/secret scan, commit/push origin/main and wait green CI on exact commit.
- [ ] Publish and verify tag/target/assets/hash/manifest/URL; no install.
- [ ] Restore repo built-dev with preserved profile, debugging disabled; close release operation.

Final installer SHA256: `79F716B9EF97A44DCC5A7064DA23E59139297B617FFF88AC19B323B4B674384E` (13,621,367 bytes). Evidence: `%TEMP%/copicu-release-{full-visual-final,final-node,final-rust,helper-final,strict-gate-final,native-smoke-final,prepare-final}.log`; final native result `.codex-run/release-smoke/1790717268708/result.json`, artifact result `.codex-run/release-smoke/artifact-verification.json`. Local logs/profile/keys/builds are excluded from Git.

## Supervision

Orca Run `run_6d807dbf58e5`. Coordinator and all four workers: Pi/openai-codex/gpt-6.1-sol medium, verified in session/response records without switches.

- Chunk config `ctx_6960ace346d3`: strict gate, config tests 2/2, focused preview tests 18/18; owns vite config only.
- Public docs/assets/capture `ctx_f925ef4ae904`: screenshot capture + three focused tests, verified normal-suite skip/no asset mutation; private/native profile never used for public assets.
- Helper `ctx_de3948e6a540`: six isolated/mock regressions, no actual publication/process stopping.
- Independent read-only reviewer `ctx_14d5d431a556`: eight lightweight tests and inspected release/config/docs/assets. Coordinator repaired missing-signature acceptance and screenshot fixture naming, with regression/checks.
- All four settled and released; no reclaimable resources. Coordinator owns integration, final signing/build, native evidence, commits and all remote effects.

## Durable release rules

A build passing does not imply the strict chunk gate passed. Release metadata describes actual shipped behavior and tested limits; updater signature is not Authenticode. Protected marked/Inbox/folder clips do not consume ordinary Root count, which is not a disk-size cap. Existing clips migrate to Root; back up SQLite and blobs before forward-only upgrades. Commit complete modules/tests/specs/assets, never local data/keys/logs. Publication and installation are separate authorizations.
