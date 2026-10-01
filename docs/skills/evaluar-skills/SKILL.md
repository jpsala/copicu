---
name: evaluar-skills
description: Audit Copicu's portable procedures and propose which workflows merit local skills without installing tools or governing the harness. Use when JP asks to revisar/evaluar qué se puede pasar a skills, promover algo a skill, crear slash commands desde el sistema agéntico, or inspect whether the repo has skill candidates.
---

# Evaluar Skills

## Workflow

1. Check the current request, repo/cwd and WIP. Discover candidates selectively by names/metadata and scoped searches, without Working Memory or an obligatory legacy catalog.
2. Open [local skills](../../topics/local-codex-skills.md) and only the relevant sections; treat it as the canonical rubric.
3. Inspect candidates without loading everything: search `AGENTS.md`, `docs/topics/`, `docs/tracks/`, and `docs/skills/README.md` for commands, repeated workflows, and named user intents.
4. Classify each candidate as `skill`, `hybrid skill`, `topic`, `active rule`, `track`, or `do not promote`.
5. Produce a shortlist with reason, trigger phrase, canonical source, and risk/cost.
6. If JP asks to implement, create or update only `docs/skills/<name>/`; keep durable logic in topics/scripts/docs and avoid duplicating long procedures.
7. Validate the changed metadata, references, procedure and gates. Do not run junction repair, install external validators, generate global indexes or certify OS2 with an AOS audit. Discovery changes require their own current authorization; report unverified harness behavior.

## Default Recommendation

Prefer hybrid skills for command-like operations. Do not promote global safety rules, broad project knowledge, or one-off work state just to make them discoverable.

Use this compact output shape:

| Candidate | Recommendation | Trigger | Canonical source | Why |
| --- | --- | --- | --- | --- |
| `name` | `hybrid skill` | user phrase | topic/script/doc | short reason |
