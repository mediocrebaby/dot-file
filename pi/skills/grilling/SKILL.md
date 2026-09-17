---
name: grilling
description: 用户明确要求追问、访谈或压力测试方案时，按依赖分轮澄清取舍；普通方案建议、摘要和已确认实施不触发。
---

Interview within the agreed scope until consequential choices are settled or explicitly deferred. Map dependencies as a **design tree**; do not turn incidental preferences into mandatory decisions.

Work the tree in **rounds**. The **frontier** contains decisions whose prerequisites are settled. Ask a small, high-impact subset per round, usually 1–3 questions; prioritize choices that unblock the most work or carry the greatest risk. Keep other questions pending rather than flooding the user. Number each question, explain the tradeoff and recommend an answer, then wait for the user's answers.

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
