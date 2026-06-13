# Feature Spec: Clipboard Enrichment V1

Status: draft

## User Need

As a Copicu user, I want captured clipboard items to receive useful automatic metadata such as `path`, so I can search and organize history without manually tagging every item.

## Current Slice

This slice implements internal, deterministic enrichment for captured text items, a minimal host API for scripts, and minimal settings/policies.

Flow:

1. User copies text into the clipboard.
2. Copicu captures and persists the item normally.
3. An internal post-capture enrichment step evaluates the stored item.
4. If the captured text matches enabled built-in detectors, Copicu computes deterministic enrichment results.
5. Existing manual tags are preserved.
6. If enrichment is enabled and policy is `autoApply`, Copicu applies normalized rule tags.
7. Clipboard-change scripts continue to run after the internal enrichment step.

## Requirements

- Enrichment runs after persistence and must not block clipboard capture on slow external work.
- The first slice is internal product logic, not script-defined logic.
- Built-in detectors in this slice are `path`, `url`, `json`, `code`, and `secret-risk`.
- Built-in detection is deterministic and local; it must not call AI or network services.
- Built-in enrichment must use normalized tags (`tags` + `clipboard_item_tags`).
- Existing manual tags on an item must be preserved when built-in tags are added.
- Legacy `clipboard_items.tags` must stay in sync for compatibility with current UI and search.
- Built-in tags should be stored with `source = rule`; confidence is per-detector and durable on the tag relation.
- Clipboard payload text must not be logged.
- Clipboard-change scripts should see the enriched item state when they run.
- Minimal settings must exist for:
  - global `enabled`;
  - per-detector toggles;
  - a clear `suggestOnly` vs `autoApply` policy.
- Minimal script host API must exist for:
  - `copicu.enrichment.runForItem(itemId, options?)`;
  - `copicu.enrichment.getResult(itemId)`.

## Non-Goals

- User-defined rule DSL.
- Automatic AI classification.
- Rich metadata key/value fields.
- Image enrichment.
- AI enrichment.
- Rule DSL or complex metadata key/value storage.

## Built-In Detectors

### Path

The first detector should recognize common local path shapes:

- Windows drive paths such as `C:\dev\chat\copyq-tauri`
- Windows drive paths using `/`
- UNC paths such as `\\server\share\folder`
- Unix absolute paths such as `/usr/local/bin`

It should reject:

- URLs such as `https://example.com/file.txt`
- multiline text
- empty strings

### URL

This slice should recognize clear standalone URLs such as:

- `https://example.com/path`
- `http://localhost:1420`
- `mailto:user@example.com`

It should avoid colliding with local drive paths such as `C:\...`.

### JSON

This slice should detect standalone JSON object or array payloads that parse locally through the JSON parser.

### Code

This slice should detect obvious code-like text using deterministic heuristics only, for example common language keywords and syntax markers. It does not need to be a parser.

### Secret Risk

This slice should detect obvious secret/token risk patterns deterministically, such as private key blocks, common token prefixes, JWT-like blobs, or secret-style assignments. It should not log or exfiltrate matched payloads.

## Policies

Settings in this slice live under app settings and are intentionally minimal:

- `enabled`
- detector toggles
- `applyMode`

Meaning:

- `autoApply`: watcher applies normalized rule tags post-capture.
- `suggestOnly`: watcher computes results but does not auto-apply tags; scripts or future UI can inspect results manually.
- `enabled = false`: watcher does not auto-apply tags even if `applyMode = autoApply`.
- Manual script application is explicit: `enrichment.runForItem(itemId, { apply: true })` can apply detected rule tags for an item.

## Architecture

The first slice should keep the logic in core product code:

- clipboard watcher persists the item;
- built-in enrichment runs;
- history changed event is emitted;
- clipboard-change scripts run afterwards.

Scripts remain an extension point, but they are not the source of truth for universal detectors.

Minimal scriptability in this slice reuses the host API bridge:

- `enrichment.getResult(itemId)` returns the deterministic result for an item;
- `enrichment.runForItem(itemId, options?)` can apply tags when requested or when policy auto-apply is active.
- `EnrichmentResult` exposes `autoApplyEnabled` and `manualApplyAllowed` so scripts can distinguish applied tags from suggestions without inferring policy from settings fields.

## Acceptance Criteria

- Copying a Windows or Unix path results in a `path` tag on the stored item when enrichment is enabled and `applyMode = autoApply`.
- Copying a standalone URL results in a `url` tag when enabled.
- Copying standalone JSON results in a `json` tag when enabled.
- Copying obvious code-like text results in a `code` tag when enabled.
- Copying obvious secret-risk text results in a `secret-risk` tag when enabled.
- Existing tags are preserved when `path` is added.
- Re-copying the same path does not create duplicate tag links.
- Search `tag:path` finds enriched items.
- Script host can fetch a deterministic enrichment result for an existing item by stable item ID.
- Current build and Rust checks pass.
