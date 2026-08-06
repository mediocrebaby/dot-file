# Prompting and agent selection

## Discovery first

Run `subagent({ action: "list" })` before every delegation workflow. The runtime discovers agents only from Markdown definitions supplied by installed packages, the user, or the current project. There are no builtin roles or fallback agent names.

Use `subagent({ action: "get", agent: "<name>" })` when the list description is not enough. Inspect:

- description and source;
- declared tools and extensions;
- model, thinking, and fallback models;
- `defaultContext`;
- `acceptanceRole` and launch defaults;
- output, skills, permissions, and memory settings.

Choose by declared capability, not by a conventional name. If no discovered agent satisfies the task, ask the user to add or approve creation of a Markdown agent rather than inventing a role.

## Strong task contracts

A delegated task should state:

- **Goal**: the concrete outcome.
- **Context**: relevant files, diffs, URLs, decisions, and constraints.
- **Success criteria**: observable completion conditions.
- **Hard boundaries**: read-only versus writer authority, allowed scope, and decisions that require escalation.
- **Validation**: commands or user flows to exercise.
- **Output**: expected summary or configured artifact.
- **Stop rules**: when to ask the supervisor and when enough evidence has been gathered.

Do not over-script routine steps. Let the selected Markdown agent use its declared expertise and tools.

## Role metadata instead of name heuristics

Agent names have no hidden behavior. Encode intent explicitly in Markdown frontmatter:

```markdown
---
name: change-review
description: Independently review a diff for correctness and regressions.
tools: read, bash
acceptanceRole: read-only
defaultContext: fresh
---

Review the requested change and return evidence-backed findings. Do not edit files unless explicitly assigned a fix pass.
```

Use `acceptanceRole: writer` for agents whose ambiguous tasks should default to writer evidence, and `acceptanceRole: read-only` for advisory agents. Explicit task wording still wins.

## Model routing

Use frontmatter, settings, or per-run overrides. `subagents.defaultModel`, `subagents.defaultThinking`, and `subagents.defaultExtensions` apply only when the Markdown definition leaves the field unset. Project settings override user settings; explicit frontmatter remains authoritative.
