# Markdown agent management

## Discovery locations

Agents are loaded recursively from:

- installed package manifests declaring `pi-subagents.agents` or `pi.subagents.agents`;
- `~/.pi/agent/agents/**/*.md` and the legacy user directory;
- project `.pi/agents/**/*.md` and legacy `.agents/**/*.md`.

Precedence is `package < user < project`. There is no builtin source.

Chains are loaded from package declarations, `~/.pi/agent/chains/`, and project `.pi/chains/`.

## Management actions

Supported authoring actions are:

```ts
subagent({ action: "list" })
subagent({ action: "get", agent: "name" })
subagent({ action: "create", config: { name: "name", description: "...", scope: "user" } })
subagent({ action: "update", agent: "name", config: { model: "provider/model" } })
subagent({ action: "delete", agent: "name", agentScope: "user" })
```

The removed builtin management actions (`models`, `eject`, `disable`, `enable`, and `reset`) are not available. Edit Markdown or settings directly when persistent configuration changes are needed.

`create` uses `config.scope`; `update` and `delete` use `agentScope` only to disambiguate duplicate runtime names. Package definitions are read-only and cannot be updated in place.

## Minimal definition

```markdown
---
name: repository-audit
description: Inspect a repository and return a concise risk report.
tools: read, bash
acceptanceRole: read-only
defaultContext: fresh
---

Inspect the requested scope. Return concrete evidence, file paths, and residual risks.
```

No name receives implicit tools, context, prompt mode, aliases, model, or acceptance behavior. Put every required capability in frontmatter.

## Settings

Global extension config is read only from:

```text
~/.pi/agent/extensions/pi-subagent/config.json
```

Agent defaults and overrides remain in user/project Pi settings under `subagents`. Overrides fill fields absent from Markdown frontmatter; project settings beat user settings.
