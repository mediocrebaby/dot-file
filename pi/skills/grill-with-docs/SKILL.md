---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, capture ADRs and glossary terms, and finish with a decision summary for the user.
disable-model-invocation: true
---

Load the "grilling" and "domain-modeling" skills. Use grilling to work through the design tree and domain-modeling to capture resolved terms and qualifying ADRs as you go.

## Scope

This workflow covers discussion, read-only fact-finding, and domain documentation. Keep code, tests, configuration, and dependencies unchanged, including through sub-agents. Answers to interview questions and confirmation of shared understanding settle design decisions; they do not authorize implementation. Implementation requires an explicit instruction in a later user turn.

## Completion

When the frontier is empty and all decision-relevant fact-finding is complete, present a consolidated summary of the final conclusions across all rounds:

- The agreed goal and scope, including explicit exclusions.
- The settled decisions and their key reasons, incorporating revisions from later rounds.
- The agreed behavior, constraints, edge cases, and acceptance criteria, where discussed.
- Any explicitly deferred questions and their effect on the agreed scope.
- The glossary or ADR files created or updated, if any.

Distinguish agreed conclusions from recommendations the user has not accepted. If an unresolved question still affects the design, continue the interview rather than presenting it as settled.

The summary is the final deliverable of this invocation. End the turn after presenting it and wait for the user's next instruction.
