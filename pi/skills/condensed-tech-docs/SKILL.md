---
name: condensed-tech-docs
description: "Plainspoken technical documentation: feature-oriented, behavior-focused, and highly concise. Use when writing feature descriptions, implementation studies, technical proposals, or comparative analyses, or when rewriting technical documentation to be more concise and less code-centric."
---

Call this style **plainspoken**: explain a complex system clearly enough for anyone to understand. Describe behavior rather than implementation; after reading, the reader should be able to explain how it works to someone else.

## What the style looks like

**Narrative perspective.** Describe the system at the behavioral level, as if it were a black box with a personality: what happens, what it does, and what results. Class names, function names, and line numbers stay out of the main text—implementation details belong in the code, not the documentation. The reader should not need to read a single line of code to understand the document.

The same fact, written two ways:

- Implementation-heavy: "`WebDAVConnector.download_file()` reads the entire file into memory through `BytesIO` and does not support resumable downloads (`webdav_connector.py:179`)."
- Plainspoken: "Downloads load the entire file into memory and cannot be resumed, so large files may create memory pressure."

**Organizational granularity.** Break the subject down by *what it does*, not by *how it is implemented*. A system spread across a dozen files may expose only seven or eight small features; a change touching many places may contain only two or three meaningful change points. The unit of decomposition is a **feature** that can be named, not a file.

**Texture.** Every sentence carries new information. Begin with a one-sentence orientation, then expand in concise points. Favor nouns and verbs; use few adjectives. Do not force standalone sentences into paragraphs. Use prose for explanation, numbered steps for processes, and tables for comparisons—the form should follow the shape of the information.

**Honesty.** What the system cannot do matters as much as what it can. State limitations, unsupported scenarios, and the costs of tradeoffs where they belong. A text that only says what something can do is advertising; documentation also explains what it cannot do.

## How to begin

Structure is not a template; it grows from the subject. Before writing, work through this sequence:

**Find the governing verb.** What is the document trying to do—explain a system, drive a change, support a decision, or compare options? The verb determines the direction: explanations unfold by feature, change proposals by change point, and decision support by evaluation dimension.

**Find the spine sentence.** Summarize the entire document in one sentence. If you cannot, you do not understand the subject yet; return to the source material and verify the facts. This sentence becomes the opening orientation and the test for every later detail: if something does not support it, leave it out.

**Follow the subject's natural seams.** Divide working systems by feature, proposed changes by change point, and alternatives by comparison dimension. Each unit should have a clear name and be explainable in about three sentences.

**Order sections by the reader's questions.** Do not preserve the author's discovery order. Follow the order in which questions naturally arise: What is it? → How does it work? → When does it work, and when does it not? → What tradeoffs create those behaviors? → What can it not do? For a proposal, continue with: What changes? → What does it cost? → How will it be verified? A strong sequence lets the reader anticipate the next section from the previous one.

**Give every section a reason to exist.** Sections should form a causal or progressive chain, with each one arising naturally from the last. If removing a section does not weaken the reader's understanding, remove it or merge it elsewhere.

**End with tradeoffs.** Bring the document back to limitations and costs: what these capabilities require, and where their boundaries lie.

## Tests for the result

Judge the style by its effect, not its format. After writing, ask:

- Can someone who has never read the code restate the document's core idea?
- Would removing any paragraph cause the reader to lose information?
- If the reader remembers only one sentence, will it be the spine sentence?

## Boundary

This style serves documents intended to support **understanding and decisions**. Documents intended for step-by-step operation—API references, deployment manuals, and code comments—need implementation details and should use a different style.
