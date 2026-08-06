---
name: pi-subagents
description: Delegate work to Markdown-defined subagents with single-agent execution, scripted workflows, async control, review fanout, and intercom coordination.
---

# Pi Subagents

Use this skill only from the parent orchestrator. Child agents must not start their own orchestration unless their Markdown definition explicitly grants the child-safe `subagent` tool.

`pi-subagents` provides no predefined agents. Always call `subagent({ action: "list" })` before delegation and select only agents actually discovered from package, user, or project Markdown files.

Read the matching reference before acting:

| Task | Reference |
|---|---|
| Choose a discovered agent and write a strong task contract | `references/prompting-and-roles.md` |
| Run single agents, workflowScript, async control, worktrees, or intercom | `references/execution-controls.md` |
| List/get/create/update/delete Markdown agents and chains | `references/management-authoring-rpc.md` |
| Apply safety constraints and implementation/review recipes | `references/constraints-and-recipes.md` |

## Always-on constraints

- The parent owns orchestration and final decisions.
- Never assume names such as `worker`, `reviewer`, or `scout` exist or carry special behavior.
- Read each selected agent's description, tools, context, and acceptance metadata before launch.
- Keep one writer per cwd/worktree unless managed worktree isolation is intentional.
- Use fresh-context read-only agents for independent review.
- Escalate product, architecture, scope, or destructive-operation decisions to the user.
- Prefer async execution when work can proceed independently; do not poll or sleep merely to wait.
- Treat configured output artifacts and async lifecycle paths as part of the handoff contract.
