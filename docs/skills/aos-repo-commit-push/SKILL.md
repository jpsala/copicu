---
name: aos-repo-commit-push
description: Commit and push all needed repository changes with an inclusion checklist. Use when JP asks to hacer commits, push, publicar cambios, dejar todo incluido en la repo, or verify nothing necessary is missing before pushing.
---

# Repo Commit Push

## Workflow

Use this skill to close a repository batch cleanly.

1. Read the repo's lightweight agent context first if present: context index, working memory, and project instructions.
2. Inspect `git status --short --branch`, staged and unstaged diffs, and untracked files.
3. Verify that generated or moved project assets that should be versioned are included, and that ignored/local files are intentionally excluded.
4. Run the repo's relevant validation commands. For AOS repos, prefer:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

5. Scan for obvious secrets before staging, especially `.env`, keys, tokens, databases, exports, and private local data.
6. Stage complete file versions with `git add -A`, then re-check status and the staged diff.
7. Create the minimum sensible commits. Prefer one commit when the batch is tightly coupled; split only when commits stay individually coherent and valid.
8. Push the current branch to its upstream or explicit remote.
9. Confirm the final status is clean and report commit hash, branch, push target, and validation result.

## Guardrails

- Do not revert user changes unless explicitly asked.
- Do not commit secrets, `.env`, local databases, logs, private exports, or transient runtime data.
- If pushing `main`, confirm the branch already tracks the intended remote. If no upstream exists, use an explicit `git push -u origin <branch>` only when the target is clear.
- If validation fails, fix the issue when it is in scope; otherwise report the blocker and do not hide the failure.
