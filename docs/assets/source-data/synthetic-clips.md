# Synthetic Clipboard Clips

Use these only as public demo data.

```text
npm run build
```

```text
https://example.test/docs/copicu-alpha
```

```markdown
## Alpha Feedback Notes

- Picker search should stay keyboard-first.
- Paste-to-previous-window needs more Windows target coverage.
- Scripts should use explicit capabilities.
```

```sql
select id, title, kind
from demo_clipboard_items
where tags like '%alpha%'
order by last_used_at desc
limit 20;
```

```text
Investigate synthetic auth retry loop in the fixture app.
Expected: one retry.
Actual: retry counter keeps increasing after timeout.
```

