---
name: lean-coder
description: Write code in accordance with engineering standards. Supports languages such as TypeScript, C/C++, Python, Java, JavaScript, Golang, Rust, and C#. Commonly used before coding to familiarize yourself with the project's development standards, and during code reviews to verify whether the code complies with those standards.
license: MIT
---

# lean-coder

Writing code does not end when the functionality works. The following are mandatory gates, and each item must be verifiable.

## Priority Order

When requirements conflict, make trade-offs in the following order:

1. **Correctness and robustness** — including failure paths that must be handled
2. **Maintainability** — correct placement and clear boundaries
3. **Simplicity** — every changed line must be traceable to the current requirement
4. **Consistency with the existing style**
5. **Keep the change surface as small as possible** — but not at the cost of degrading the structure
6. **Reasonable performance** — avoid known pitfalls; do not perform speculative optimization

## Before Coding: Placement Declaration

When creating a new file, modifying a public interface, or making cross-module changes, output one line before making any changes:

```markdown
Placement: <which file to modify / what to create>; reuse <existing function/pattern>; do not <explicit structural changes that will not be made>
```


For changes contained within a single file, proceed directly without writing a declaration.

If the placement is unclear (whether to create a new module or put it into an existing file, which layer it belongs in, or what the dependency direction should be) → read `references/structure.md`.

## During Coding: Gate Checklist

**Structure Selection**

- When any of the following signals appear in the code, the corresponding structure must be used instead of working around it by piling up branches: multiple branches checking the same type, objects transitioning through stages, a globally unique resource being repeatedly created, or repeated pre/post-processing steps in multiple places. See `references/patterns.md` for the complete mapping table.
- Do not create abstractions for logic that appears only once; do not add configuration options, parameters, or extension points for things that "might be needed in the future."
- Abstractions must be triggered by signals, not by imagination.

**Robustness**

- External input, IO/network operations, process and concurrency boundaries, and resource cleanup: failure paths must be handled.
- Do not add defensive branches for internal invariants; errors should propagate upward by default.
- Error messages must include **cause + context**. Do not merely state that an operation failed. Bad example: `Connection failed`; good example: `Failed to connect to 10.0.0.5:5432: connection timed out (5s)`.
- Empty catch blocks are forbidden. Do not print only `str(e)` and discard the stack trace. Do not lose the cause when wrapping exceptions.
- See `references/robustness.md` for detailed boundary and logging rules.

**Constants**

- Leave no raw literals. Timeouts, retry counts, ports, thresholds, capacities, version numbers, status labels, path fragments, URLs, unit conversion factors, and business magic numbers must all be named before use.
- Naming whitelist: `0 / 1 / -1` when used as natural boundaries, empty values, intrinsic coefficients in mathematical definitions, example data in test cases, and characters in regular expressions whose meaning is self-evident.
- Values already present in project files (version numbers, package names, build metadata) must be read from their native source rather than duplicated in code.
- A group of related values (status names, type labels, error codes) must use the language's enum facility rather than being scattered as isolated constants.
- Keep scope as local as possible and promote it only as required by usage scope; runtime-variable values are configuration, not constants. See `references/structure.md` for details.

**Performance**

- Do not perform per-item IO / individual SQL queries inside loops — use batch interfaces so the database or remote service can process them in one operation.
- Do not perform repeated computation, unnecessary full copies, or use unbounded-growing collections on hot paths.
- See `references/robustness.md` for the complete list of pitfalls.

**Cleanup**

- Imports, variables, functions, branches, configuration items, and tests invalidated by the current change must be deleted.
- Symbols in modified files that no longer have callers must be deleted.
- Historical dead code outside the scope of the current change should be mentioned in the report, but not proactively removed.
- Do not "improve along the way" any code, comments, or formatting unrelated to the current requirement.

## After Coding: Verification Checklist

Answer each item individually. If none apply, write "None". Do not omit any item:

1. **Symbols invalidated by this change**: List every deleted import / function / branch / configuration item.
2. **Failure paths**: Which ones were handled; what context the error messages include.
3. **IO / queries inside loops**: Yes / No, and on which line.
4. **Raw literals**: For every non-whitelisted literal introduced by this change, state what it was named and where it is defined.
5. **Verification**: The commands actually executed and their outputs. Do not write merely "verified."
6. **Remaining risks**: Unhandled edge cases.

Run verification before reporting. If you wrote 200 lines for something that could have been done in 50, rewrite it.

## Review Mode

During code review or refactoring, in addition to functional correctness, focus on:

- Whether places that should use a proper structure are instead piling up branches (compare against `references/patterns.md`).
- Whether any failure paths are missing; whether error messages contain enough information to locate the problem.
- Whether per-item IO / queries are hidden inside loops.
- Whether there are raw literals, duplicated sources of truth, or scattered constants that should be enums.
- Whether there is dead code with no callers.
- Which abstractions, parameters, states, and branches can be removed.
