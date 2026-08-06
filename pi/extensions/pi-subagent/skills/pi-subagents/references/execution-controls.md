# Execution controls

## Single agent

After discovery, launch one configured agent:

```ts
subagent({ agent: "<discovered-name>", task: "Concrete task contract" })
```

Use `context: "fresh"` for independent analysis and `context: "fork"` only when the child should inherit the persisted parent transcript. Forking requires a persisted parent session.

## Scripted workflows

`workflowScript` is the public orchestration surface for sequence, parallelism, branching, retries, and aggregation:

```ts
subagent({
  workflowScript: `
    const context = await runs.run("context", {
      agent: "<context-agent>",
      task: "Inspect the target and return concise context"
    });
    const reviews = await runs.all([
      { key: "correctness", agent: "<review-agent>", task: "Review correctness: " + context.output },
      { key: "tests", agent: "<validation-agent>", task: "Review validation: " + context.output }
    ]);
    return reviews.map(result => result.output);
  `
})
```

Every agent name must come from discovery. Scripts have only the documented `runs`, `emit`, and console surfaces; they do not receive filesystem or shell access directly.

## Async and control

Async is the normal mode. Use:

```ts
subagent({ action: "status", id: "<run-id>" })
subagent({ action: "status", id: "<run-id>", view: "transcript" })
subagent({ action: "steer", id: "<run-id>", message: "Focus on the failing check." })
subagent({ action: "interrupt", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue with the approved direction." })
subagent({ action: "stop", id: "<run-id>" })
```

Do not sleep or poll merely to wait. In interactive sessions, yield and let completion notification wake the parent. Use `subagent_wait` only when the current turn must receive the result.

## Worktrees

Use `worktree: true` for intentionally isolated mutation lanes. Keep ordinary same-worktree writes single-threaded. Inspect the returned handoff manifest rather than scraping combined terminal text.

## Intercom

Children should use the injected `contact_supervisor` tool for decisions or meaningful progress. The parent replies through the supervisor channel. Do not invent intercom targets, and do not use coordination for routine completion handoffs.

## Project traceless mode

Global config lives at `~/.pi/agent/extensions/pi-subagent/config.json`.

```json
{ "projectTracelessMode": true }
```

When enabled, debug artifacts are disabled, chain scratch moves to OS temp, and mission/Herdr project state moves under `~/.pi/agent/extensions/pi-subagent/data/`. Existing project `.pi-subagents` content is neither inspected nor deleted.
