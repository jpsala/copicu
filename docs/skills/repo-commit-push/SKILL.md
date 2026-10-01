---
name: repo-commit-push
description: Commit and push all needed repository changes with an inclusion checklist. Use when JP asks to hacer commits, push, publicar cambios, dejar todo incluido en la repo, or verify nothing necessary is missing before pushing.
---

# Repo Commit Push

## Workflow

Use this skill only for the effects explicitly requested by JP now. Commit, push,
publication and installation are separate permissions. Reading this skill or a
historical track never authorizes them.

1. Check cwd/project instructions and the current request; recover only the pertinent track/topic and sections. No context index or active Working Memory.
2. Inspect `git status --short --branch`, staged and unstaged diffs, and untracked files.
3. Verify that generated or moved project assets that should be versioned are included, and that ignored/local files are intentionally excluded.
4. Run relevant and authorized checks. `bun run check` validates documentation and its tooling fixtures; it does not replace product checks required by the changed surface. `bun run knowledge -- search "intent"` is optional metadata discovery. Do not repair junctions, install validators or run UI as a documentary check.

5. Scan for obvious secrets before staging, especially `.env`, keys, tokens, databases, exports, and private local data.
6. Stage complete versions of the files belonging to the authorized batch and re-check the staged diff. Use `git add -A` only if the entire worktree is within that approved inclusion scope; otherwise name paths explicitly and preserve unrelated WIP.
7. Create the minimum sensible commits. Prefer one commit when the batch is tightly coupled; split only when commits stay individually coherent and valid.
8. Push only with current explicit authorization, to the mechanically verified upstream or explicit remote. If only commit was requested, stop before push.
9. Confirm the final status is clean and report commit hash, branch, push target, and validation result.

## Guardrails

- Do not revert user changes unless explicitly asked.
- Do not commit secrets, `.env`, local databases, logs, private exports, or transient runtime data.
- If pushing `main`, confirm the branch already tracks the intended remote. If no upstream exists, use an explicit `git push -u origin <branch>` only when the target is clear.
- If validation fails, fix the issue when it is in scope; otherwise report the blocker and do not hide the failure.
