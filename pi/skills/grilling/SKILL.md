---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job. Look up small facts directly. For substantial independent exploration, use an available read-only agent following [pi runtime](../_maintenance/PI-RUNTIME.md); if unavailable, investigate locally. A running exploration is an unsettled prerequisite: ask independent frontier questions now, but wait for its results before settling dependent decisions. The _decisions_ are the user's: put each to them and wait.

The session is done when the in-scope frontier is empty: every relevant branch is settled or explicitly deferred with an owner/condition. Summarize the decisions, assumptions and deferred questions for user confirmation before implementation. Do not reopen already confirmed choices merely to repeat a checkpoint.

When recording is requested or authorized by the surrounding task, pass durable confirmed decisions to [decision-notes](../decision-notes/SKILL.md); unconfirmed choices remain proposals. Pure interviewing does not silently create files.
