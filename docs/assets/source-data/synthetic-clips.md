# Synthetic Clipboard Clips

Use these only as public demo data. Every clip below is generated/fake and safe for screenshots, GIFs, docs, and reproduction steps.

## Terminal Commands

```text
npm run build && npm run visual:check
```

```text
cargo check --manifest-path src-tauri/Cargo.toml --tests
```

```powershell
Get-Content .\synthetic-report.md | Set-Clipboard
```

## URLs

```text
https://example.test/docs/copicu-alpha?utm_source=newsletter&utm_medium=demo&fbclid=synthetic123#install
```

```text
https://issues.example.test/projects/CLIP/bugs/1842?utm_campaign=alpha-feedback&gclid=demo-token
```

```text
https://docs.example.test/windows/clipboard-focus#paste-targets
```

## Markdown Notes

```markdown
## Alpha Feedback Notes

- Picker search should stay keyboard-first.
- Paste-to-previous-window needs more Windows target coverage.
- Scripts should use explicit capabilities.
- Public demos must use synthetic clipboard data only.
```

```markdown
### Release Checklist Draft

- [ ] Verify installer SHA256.
- [ ] Smoke-test picker open/search/paste.
- [ ] Confirm AI is disabled by default.
- [ ] Review screenshots for private data.
```

## Bug Notes And Logs

```text
Investigate synthetic auth retry loop in the fixture app.
Expected: one retry.
Actual: retry counter keeps increasing after timeout.
Target app: ExampleEditor 1.0 fixture.
```

```text
[2026-06-23T14:12:03Z] WARN fixture-api request_id=req_demo_1842 route=/v1/demo/auth retry=3 elapsed_ms=812
[2026-06-23T14:12:04Z] INFO fixture-api request_id=req_demo_1842 fallback=cache status=ok
```

```text
Error: SyntheticPaymentGatewayTimeout
    at chargeDemoCard (C:\demo\checkout\payment-fixture.ts:42:11)
    at async submitDemoOrder (C:\demo\checkout\order-fixture.ts:88:5)
    at async runSyntheticCheckout (C:\demo\checkout\scenario.ts:17:3)
```

## Code Snippets

```ts
export function normalizeClipboardTitle(input: string) {
  return input.trim().replace(/\s+/g, " ").slice(0, 80);
}
```

```rust
fn is_synthetic_clip(text: &str) -> bool {
    text.contains("example.test") || text.contains("Synthetic")
}
```

```sql
select id, title, kind
from demo_clipboard_items
where tags like '%alpha%'
order by last_used_at desc
limit 20;
```

## Image-Like Placeholder

```text
SYNTHETIC SCREENSHOT · placeholder image clip for public README demos, no real desktop content
```

## JSON

```json
{"event":"demo_clip_captured","kind":"text","tags":["alpha","synthetic"],"source":"fixture"}
```

```json
{
  "title": "Synthetic release note",
  "checks": ["build", "visual", "rust:test"],
  "privacy": { "usesRealClipboardData": false }
}
```

## Draft Messages

```text
Can you review the synthetic paste workflow and confirm the target app receives the selected clip after Copicu hides the picker?
```

```text
Short launch note: Copicu is a local-first, scriptable clipboard manager for Windows power users. Looking for feedback on paste targets and script workflows.
```
