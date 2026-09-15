---
name: to-spec
description: "将已确认讨论整理为本地 spec；明确授权后可发布到已有 tracker，不重新进行完整访谈。"
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

Discover the existing tracker and labels using [tracker adaptation](../wayfinder/references/tracker.md). With no tracker, write a local `.scratch/<effort>/spec.md`. External publication requires authorization; a draft is not a published issue. Use [pi runtime](../_maintenance/PI-RUNTIME.md) for tools and paths.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Reuse already confirmed test boundaries. Ask only if a material unresolved choice blocks the spec; otherwise mark uncertainty explicitly rather than starting a new interview.

3. Write the spec using the template below. Publish only to the authorized tracker with its existing labels, or deliver the local file path. Link durable confirmed choices to [decision-notes](../decision-notes/SKILL.md); the spec describes requested behavior, not proof of implementation.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A numbered list of distinct, relevant user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

Cover the agreed scope and important edge cases without inventing requirements or padding the list.

## Implementation Decisions

A list of confirmed implementation choices, linking their owning ADR/Note rather than duplicating the full rationale. Unconfirmed choices stay explicitly open. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
