# Constraints and recipes

## Safety constraints

- Call `list` first and use only discovered, executable agents.
- Never infer authority from an agent name; inspect frontmatter and task wording.
- Keep one writer per active cwd unless managed worktrees isolate writers.
- Use fresh-context read-only agents for independent review.
- Children must escalate unapproved product, architecture, scope, API, or destructive-operation choices.
- Forked context requires a persisted parent session and inherits the parent transcript.
- Attention signals are observational; interrupt only when a run is genuinely blocked or drifting.
- Intercom decision requests block the child until the parent replies.

## Clarify → implement → review

1. **Understand**: inspect the load-bearing files and discover available agents.
2. **Clarify**: ask the user only for product choices, preferences, and tradeoffs that cannot be established from the repository.
3. **Contract**: define expected behavior, validation commands or user flows, and required evidence.
4. **Implement**: launch one Markdown-defined writer as the sole writer for the active worktree.
5. **Review**: launch one or more independently configured read-only agents with distinct review angles.
6. **Fix**: synthesize accepted findings and send one writer to apply them.
7. **Verify**: inspect the final diff and run focused validation.

If the discovered set lacks a suitable writer or reviewer, stop and ask for a Markdown definition instead of substituting a hardcoded role name.

## Parallel analysis

Parallelize distinct read-only questions, not overlapping writes. Give every child a lane-specific goal, evidence scope, and output contract. Avoid clone prompts that differ only by an issue number or broad path.

## Writer budgets and handoff

As a conservative orchestration policy, do not pass `turnBudget`, a hard `toolBudget`, or a tight `usageBudget` to mutation-capable agents. A default tool budget blocks read/search tools rather than mutation tools, so turn and tool-call caps are not safe delivery boundaries. Prefer a narrow task and an outer runtime timeout with enough margin to finish a coherent slice. Before the deadline, request a checkpoint after the current tool returns that includes changed files, build/test state, remaining work, and commit or PR state.

Ask a writer to report:

- changed files;
- implemented and intentionally omitted work;
- commands and exit codes;
- validation evidence;
- surprises and residual risks;
- decisions that still require approval.

## Review findings

Review-only children should report only evidence-backed findings with severity and file/line references. The parent separates blockers, fixes worth doing now, optional improvements, and feedback to defer or reject.

## Project traceless mode

When `projectTracelessMode` is enabled, do not expect project-local `.pi-subagents` artifacts. Operational chain state is temporary, while mission and Herdr state is stored in the extension data directory. The mode affects future behavior only.
