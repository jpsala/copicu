# Copicu Agentic OS Playbook

This guide explains what you can do with the Copicu agentic OS, and the safest way to use it.

The OS is not a separate product. It is the project memory, commands, prompts, skills, and Pi extensions that help agents work on Copicu without rereading everything or losing important decisions.

## Mental Model

Think of the OS as four layers:

1. **Rules** — `AGENTS.md` tells every agent how to behave in this repo.
2. **Memory** — `docs/WORKING_MEMORY.md`, topics, tracks, specs, and decisions store durable context.
3. **Routers** — `docs/.generated/context-index.md` and `docs/TOPICS.md` help agents open only the right files.
4. **Operations** — conversational commands, Pi commands, skills, and extensions help checkpoint, continue, compact, dogfood, and execute goals.

The important principle: **the docs are the memory, not the chat transcript**.

## Start A Normal Session

For ordinary work, just ask for what you want.

Good prompts:

```text
Continue the active actions modularization work.
```

```text
Review the next safe task from the tags and hotkeys spec, then implement it.
```

```text
Find the current state of the UI rethink track and recommend the next small step.
```

The agent should follow the lightweight route:

```text
docs/.generated/context-index.md -> docs/WORKING_MEMORY.md -> docs/TOPICS.md -> focused topic/track/spec -> code
```

If it starts reading too broadly, redirect it:

```text
Use the lightweight OS route. Do not open long docs unless the topic requires it.
```

## Command Cheat Sheet

### Conversational Commands

These are phrases you type to the agent.

| Command | Use when | What it should do |
| --- | --- | --- |
| `sigamos` | You want to keep working in the same session | Continue the active task. No checkpoint, no handoff, no new session. |
| `checkpoint` / `persistí estado` | Useful durable value appeared | Save only decisions, state, risks, checks, and next steps into docs. No transcript. |
| `cerrar sesion` | You are ending the session | Persist durable value and leave the repo resumable. |
| `continuar sesion` | You want a clean new session | First persist value, then prepare/open a new session with compact handoff. |
| `continuar sesion con gol` / `continuar con gol` / `siguiente` | You want the next session to start an execution loop | Same as continue session, but the next session should begin with `gol`. |
| `realinear os` | The docs/commands feel stale or inconsistent | Audit and repair the agentic layer only. Avoid product code unless explicitly asked. |
| `evaluar skills` | You want to improve local commands/skills | Inspect what should become a skill, command, topic, or workflow. |
| `repo commit push` | You want changes committed and pushed | Check inclusion, commit, push, and avoid missing generated/docs files. |

### Pi Slash Commands

These are Pi commands available in this repo.

| Command | Use when | Notes |
| --- | --- | --- |
| `/checkpoint` | Persist durable value without ending the session | Prompt template version of `checkpoint`. |
| `/os-status [audit]` | You need operational status | Shows session/git/context state. With `audit`, runs the context audit. |
| `/os-compact [focus]` | Context is high after checkpointing | Manual OS-aware compaction. Do checkpoint first if there is durable value. |
| `/os-continuar [objective]` | You want a clean Pi session | Creates a new session with handoff from live docs. Confirms checkpoint first. |
| `/os-sync` | You changed the OS layer | Ensures the skills link, regenerates the context index, and runs the context audit. |
| `/gol [objective]` | You want to execute a bounded task to completion | Prefills a safe `/until-done` command. Review before sending. |
| `/until-done <objective>` | You want a continuation loop | Provided by `pi-until-done`; use for bounded goals with verification. |
| `/checkpoint-nudge` | You want to inspect or control context nudges | Subcommands: `prefill`, `mute`, `unmute`, `test`. |
| `/reload` | You changed/installed Pi resources | Reloads extensions, prompts, skills, and package resources. |

## Best Workflow By Situation

### 1. Small Change In The Current Session

Use this when the task is small and low-risk.

```text
sigamos
```

or ask directly:

```text
Implement the smallest safe next step in docs/tracks/017-actions-modularization.md.
```

Best practice:

1. Agent reads the focused track/topic.
2. Agent edits only relevant files.
3. Agent runs the smallest meaningful check.
4. Agent reports files changed and verification.

Do not use `/until-done` for tiny tasks unless you specifically want the continuation loop.

### 2. Save Important State Without Stopping

Use checkpoint when the session produced durable value:

- a decision;
- a validated behavior;
- a discovered risk;
- a useful command/check;
- a next step that should survive compaction or a new session.

Command:

```text
/checkpoint
```

or:

```text
checkpoint
```

Best practice:

- Save value, not transcript.
- Keep `WORKING_MEMORY.md` short.
- Put reusable knowledge in topics.
- Put resumable work in tracks.
- Regenerate the context index if topics/tracks/skills/aliases changed.

### 3. Continue In A Clean Session

Use this when context is large or you are changing fronts.

```text
/os-continuar continue actions modularization
```

Best practice:

1. Run `/checkpoint` first if there is new durable value.
2. Use `/os-continuar <objective>`.
3. In the new session, send the prepared `sigamos`.

This keeps the new session grounded in docs instead of the old transcript.

### 4. Execute A Task Completely And Safely

Use `/gol` for a bounded implementation task that should continue until done or blocked.

Example:

```text
/gol implement the next bounded task from docs/tracks/017-actions-modularization.md
```

`/gol` does not immediately run the loop. It fills the editor with a safe `/until-done` prompt. Review it, adjust the objective if needed, then send.

Best use cases:

- implementing one specific spec task;
- finishing one small track slice;
- doing a contained refactor with tests;
- fixing a reproducible bug with verification.

Avoid `/gol` for:

- vague goals like "make Copicu better";
- broad roadmap work;
- tasks requiring product decisions from JP;
- risky native flows that need manual dogfood before completion.

If a risky native behavior appears — clipboard monitoring, global shortcut, previous-window focus, paste, installer, destructive migration — the agent should **block and ask**, not pretend it verified it.

### 5. Compact Context Safely

Use compaction only after durable value is saved.

Recommended flow:

```text
/checkpoint
/os-compact focus on the current implementation task and verification state
```

Do not compact as a substitute for documentation. Compaction helps the model; docs preserve the project.

### 6. Sync, Audit, Or Repair The OS

Use `/os-sync` after you or the agent change the OS layer:

- `docs/topics/` frontmatter or triggers;
- `docs/tracks/` state;
- `docs/skills/` or `.agents/skills`;
- `.pi/prompts/`;
- `.pi/extensions/`;
- aliases or generated context index inputs.

```text
/os-sync
```

It runs the normal hygiene sequence and prints the result into the session:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run context:index
bun run context:audit
```

If you edited or installed Pi resources, run this after sync:

```text
/reload
```

Use `realinear os` when commands, docs, generated index, or skills need a deeper repair:

```text
realinear os
```

For status only:

```text
/os-status audit
```

Best practice:

- Keep changes limited to the agentic/documentation layer.
- Do not touch product code unless JP explicitly asks.

### 7. Test The Running Copicu App From Pi

This repo has a local Pi tool for desktop dogfood:

```text
copicu_computer_use
```

Useful actions include:

- `self_test` — validate local AHK/MCP setup;
- `windows` — list Copicu windows;
- `open_picker` — open the picker;
- `focus`, `send`, `type`, `click` — interact with the app;
- `screenshot` — capture visual evidence;
- `debug_last` — inspect the last automation call.

Best practice:

- Prefer keyboard/focus/screenshot flows for Tauri WebView.
- UIA is limited inside the WebView.
- If app code changes, restart or reload the dev app so JP sees the latest version.

## How To Choose The Right Tool

| Goal | Best tool |
| --- | --- |
| Keep momentum in same session | `sigamos` |
| Save durable state | `/checkpoint` or `checkpoint` |
| Reduce context after saving state | `/os-compact` |
| Start clean with docs-based handoff | `/os-continuar` |
| Sync OS docs/index/audit after OS changes | `/os-sync` |
| Execute a bounded task until done/blocked | `/gol` -> review -> `/until-done` |
| Repair docs/OS drift | `realinear os` |
| Inspect operational health | `/os-status audit` |
| Dogfood Copicu UI | `copicu_computer_use` |
| Commit and push safely | `repo commit push` |

## Good `/gol` Objectives

Good objectives are narrow, verifiable, and tied to existing docs.

Good:

```text
/gol extract one mechanical module from the actions runner according to docs/tracks/017-actions-modularization.md, with tests/checks
```

```text
/gol fix the Vite chunk warning only if a safe code split can be restored without breaking WebView startup
```

```text
/gol implement one pending task from specs/006-tags-and-hotkeys/tasks.md and verify keyboard behavior where possible
```

Too broad:

```text
/gol finish the whole roadmap
```

```text
/gol make the UI perfect
```

```text
/gol implement all CopyQ features
```

## Definition Of Done For Agent Work

For most Copicu tasks, done means:

1. The requested behavior or doc change is implemented.
2. Relevant checks were run, or the reason they were not run is explicit.
3. App-visible changes were reloaded/restarted when needed.
4. Durable decisions or state were saved in the right docs.
5. No unrelated user changes were reverted.
6. Risks, manual verification needs, and next steps are clear.

For `/until-done`, done should be even stricter: the agent should provide evidence, or block.

## Common Anti-Patterns

Avoid these:

- turning `WORKING_MEMORY.md` into a transcript;
- adding every small thought to `AGENTS.md`;
- opening long docs by default;
- using `/gol` for vague or multi-week work;
- compacting before checkpointing valuable state;
- declaring native Windows behavior done without dogfood evidence;
- changing installed/dev data separation;
- touching product code during `realinear os` unless explicitly requested.

## If You Are Unsure

Use this safe sequence:

```text
/os-status audit
```

Then ask:

```text
Recommend the next bounded task using the lightweight OS route. Do not implement yet.
```

If the recommendation is good:

```text
/gol <that bounded task>
```

Review the prefilled `/until-done` command, then send it.

If the work changed the OS layer, finish with:

```text
/os-sync
/reload
```
