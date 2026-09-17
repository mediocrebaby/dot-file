---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → Prefer a single shareable HTML demo when non-developers need to drive the state. For developer-only questions, a small script, REPL scenario or existing harness may answer it faster. Read [LOGIC.md](LOGIC.md) only for the interactive HTML shape.
- **"What should this look like?"** → Build only the variations needed to resolve the question: one for a focused interaction, several for comparing directions. Read [UI.md](UI.md) for UI isolation, data and comparison guidance; a single variant needs no switcher.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Use the user's destination or the project's prototype convention; otherwise choose a clearly named local scratch artifact. Existing-page integration is an option only within the authorized scope, not permission to replace the normal page. Keep prototypes out of production behavior, not merely their controls.
2. **Trivial to run.** Provide one command, a direct URL or a double-clickable HTML file, matching the chosen shape and the user's environment. Prefer existing tools over adding infrastructure.
3. **Isolated data by default.** Use in-memory fixture state. If the question explicitly involves persistence, use a named scratch database/file and report its location; production data, credentials or services are not prototype fixtures. Any additional data access must be authorized and necessary for the question.
4. **Skip production polish.** Avoid speculative abstractions and full production test suites. Use small assertions or scenario checks when they directly answer the design question; run the artifact before handoff and report anything that could not be exercised.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture the evidence, then hand off.** Record the question, observed results, tested scenarios, limitations and artifact path. A runnable artifact is not a confirmed design: mark user-dependent verdicts as awaiting feedback rather than inventing approval. If the result establishes a durable decision, follow [decision-notes](../decision-notes/SKILL.md); production promotion requires separate authorization and checks.
7. **Preserve evidence within authorization.** A local, clearly named artifact is the default primary source. If the user authorizes Git preservation, use a separate branch/worktree and link it from the task; do not switch a dirty worktree or create commits automatically. Remove only prototype files created for this task once their replacement/evidence is secured. No issue tracker is required.

For branch-specific capture steps, these authorization and production-readiness rules remain binding. See [pi runtime](../_maintenance/PI-RUNTIME.md) for file paths and isolation.
