---
name: improve-codebase-architecture
description: 显式评估代码库架构痛点，按证据与收益给出改进候选；默认简洁报告，选定候选后再讨论设计，不自动重构。
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Read [architecture vocabulary](references/design.md) for **module**, **interface**, **depth**, **seam** and related principles. This local reference replaces an unavailable external skill; use the project's own terminology where it is more precise.
- The domain language in `CONTEXT.md` gives names to good seams; discover the current scope's ADR/Notes authority through [decision-notes](../decision-notes/SKILL.md) before reopening existing choices.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read the project's domain glossary (`CONTEXT.md`) and relevant existing decisions first, including context-local ADRs where the project map points to them.

For substantial independent scanning, discover an executable read-only explorer following [pi runtime](../_maintenance/PI-RUNTIME.md); otherwise explore directly. Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present evidence-ranked candidates

Default to a concise Markdown report in the conversation; do not create a file just to wrap the review. For each worthwhile candidate include:

- **Scope and evidence**: affected modules/files and concrete observed friction, with source locations where useful.
- **Change**: what boundary would change and why; no detailed interface design yet.
- **Benefits and costs**: testability/locality gains, migration risk, and reasons to keep the current design.
- **Confidence**: `Strong`, `Worth exploring`, or `Speculative`, tied to the evidence and its gaps.

End with the top recommendation and why it outranks the others. If no candidate has convincing benefit, say so; do not manufacture refactoring work.

Use diagrams only when they clarify actual relationships. If the user requests a visual deliverable, or complex dependency relationships materially benefit from one, produce an HTML report using [HTML-REPORT.md](HTML-REPORT.md). Write to the OS temp directory as `architecture-review-<timestamp>.html` unless the user specifies a destination, and report its absolute path. Prefer inline assets; disclose any CDN dependency. Open it only when requested and a desktop opener is available; inability to open it does not invalidate the report.

**Use CONTEXT.md vocabulary for the domain and [design.md](references/design.md) for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007, but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

After the report, ask which candidate the user wants to explore. A review is complete when candidates, evidence, costs and uncertainty are clear; HTML generation and implementation are not completion requirements.

### 3. Grilling loop

Once the user picks a candidate, read [grilling](../grilling/SKILL.md) to walk the decision tree: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Within the authorized writing scope, read [domain-modeling](../domain-modeling/SKILL.md) when terminology changes. Durable choices go through [decision-notes](../decision-notes/SKILL.md); pure reviews do not silently edit project files:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing; skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces?** Compare two genuine designs using [design.md](references/design.md), or use an authorized [prototype](../prototype/SKILL.md). Independent read-only exploration may run in parallel, but there is one writer and no automatic implementation or Git publication.
