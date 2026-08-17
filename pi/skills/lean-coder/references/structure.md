# Structure: Placement Criteria, Constant Management, Size Thresholds, and Dead Code Cleanup

---

## 1. Where New Code Should Go

### Decision Order

1. **Is there already a module with the same responsibility?** → Put the code there and reuse its internal utilities and conventions.
2. **If not, are there sibling modules at the same layer?** → Create a peer file following the naming and organizational conventions of those sibling modules.
3. **Does it represent a new layer of responsibility?** → Create a new module and explain its responsibility boundary and dependency direction in the placement rationale.

Read the target file and adjacent modules before deciding where to place new code. Do not place it based on assumptions.

### Placement Criteria

| Situation | Placement |
| --- | --- |
| Pure computation, no I/O, no framework dependency | Domain/utility layer; keep it unit-testable and free of framework dependencies |
| Accessing databases, files, or networks | Data-access/adapter layer; expose semantic interfaces upward rather than SQL/URLs |
| Orchestrating multiple steps or defining transaction boundaries | Service/use-case layer |
| Parsing requests, producing responses, handling command-line arguments | Interface/entry layer; do not put business rules here |
| Helper logic used by only one function | Keep it as a nearby private function; do not prematurely move it into a shared module |
| Helper logic used in 3 or more places | Move it into a shared module and give it an accurate, responsibility-specific name |

### Dependency Direction

- Dependencies must flow in one direction: entry layer → service layer → domain layer; lower layers must not depend back on higher layers.
- Circular dependencies indicate incorrect responsibility boundaries. Move shared parts downward instead of adding interfaces merely to work around the cycle.
- The domain layer must not import frameworks, ORMs, or HTTP clients.

### Do Not

- Do not create an entire module for a single function.
- Do not create grab-bag files with responsibility-free names such as `utils.py` / `common.py` / `helpers.py`. Existing ones may still be used, but new code should go into semantically clear modules.
- Do not split unrelated things out merely because "this file is already long" — split by responsibility, not by line count.

---

## 2. Constant Management

### Literals That Must Be Named

Do not leave raw values in code when their meaning has to be guessed. The following must always be named before use:

| Category | Examples |
| --- | --- |
| Time and retries | Timeout duration, polling interval, retry count, backoff multiplier, cache TTL |
| Capacity and thresholds | Batch size, page size, connection-pool limit, alert threshold, length limit |
| Network and paths | Ports, hostnames, URLs, path fragments, filenames, environment-variable names |
| Identifiers and labels | Status names, type tags, error codes, permission names, event names, table/field names |
| Conversion factors | 1024, 1000, 60, 3600, unit coefficients, scaling ratios |
| Business magic numbers | Rates, discounts, maximum day counts, level boundaries |
| Engineering metadata | Version numbers, package names, build numbers, protocol versions |

### Naming Exemption Whitelist

The following may be written directly; forcing names onto them would reduce readability:

- `0` / `1` / `-1` when used as natural boundaries: index starts, step sizes, emptiness checks, increments.
- Empty strings, empty collections, `null` / `None`.
- Intrinsic coefficients in mathematical formulas (such as `/2` for a midpoint or `**2` for squaring).
- Example data and expected values in tests.
- Characters in regular expressions whose semantics are self-evident.

Everything outside this whitelist must be named. Rule of thumb: **when changing this value, do you need to know what it represents? If yes → name it.**

```python
# Bad: what does 30 mean? A typo in "pending" will not be caught.
if time.time() - task.created_at > 30 and task.status == "pending":
    retry(task, times=3)

# Good
PENDING_TIMEOUT_SECONDS = 30
MAX_RETRY_ATTEMPTS = 3

if time.time() - task.created_at > PENDING_TIMEOUT_SECONDS and task.status is TaskStatus.PENDING:
    retry(task, times=MAX_RETRY_ATTEMPTS)
```

### Scope: Define Locally First, Promote Gradually

| Usage scope | Definition location |
| --- | --- |
| Within one function | Local constant inside the function |
| Multiple places in the same file | Module-level constant |
| Multiple modules | Shared constant module with a responsibility-specific name (`limits.py`, not a catch-all `constants.py`) |
| Runtime-variable / environment-specific | Configuration, not a constant |

Do not promote a value that serves only one function to global scope; likewise, do not redefine a shared value independently in multiple files.

Distinguish constants from configuration: values that may need to change at deployment time (ports, addresses, feature switches, quotas) belong in configuration and should be injectable via configuration files/environment variables rather than hard-coded as constants.

### Single Source of Truth

If a value already exists in a project-native file, read it from the original source instead of copying it into code. Naming a duplicate does not solve the problem — it is still a defect because the copies will eventually drift during releases.

```python
# Bad 1: raw literal
print("myapp v1.1.1.0")

# Bad 2: named, but duplicated separately from pyproject.toml
VERSION = "1.1.1.0"

# Good: read from package metadata
from importlib.metadata import version
__version__ = version("myapp")
```

Native sources by ecosystem: Node reads `package.json` (or injects the value at build time), Rust uses `env!("CARGO_PKG_VERSION")`, Go injects via `-ldflags -X`, and Java reads the manifest. The same principle applies to table schemas (derive from models/migrations), API routes (derive from route registration), and enum value ranges (derive from the enum type).

### Use Enums for Value Sets

For values such as status names, type tags, error codes, and mode switches that **belong to a mutually exclusive set**, use the language's enum facilities instead of scattering them across string constants.

```python
class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE    = "done"
```

Benefits: typos are exposed during static checking; all valid values can be enumerated; the values integrate directly with table-driven dispatch and state-machine transition tables in `patterns.md`.

Language facilities: Python `Enum` / `StrEnum`, TypeScript string union types or `as const`, Go `iota` + named types, Java/C# `enum`, Rust `enum`.

### Naming Requirements

Constant names must clearly describe **meaning and unit**, not merely restate the value:

```text
Bad: THIRTY = 30, NUM_1024 = 1024, TIMEOUT = 5
Good: PENDING_TIMEOUT_SECONDS = 30, BYTES_PER_KIB = 1024, HTTP_CONNECT_TIMEOUT_SECONDS = 5
```

Quantities with units must include the unit in the name (`_SECONDS` / `_MS` / `_BYTES` / `_PERCENT`), otherwise callers may use the wrong scale.

---

## 3. Size Thresholds (Soft Thresholds; Exceeding Them Requires Justification)

| Object | Threshold | What to do when exceeded |
| --- | --- | --- |
| Function | ~50 lines | Identify semantically independent sections and extract them into named functions; if no meaningful extraction exists because it is genuinely one sequential flow, it may remain as-is |
| Function parameters | 5 | Check whether the parameters naturally form a parameter object, or whether the function is handling multiple responsibilities |
| Nesting depth | 3 levels | Use early returns, guard clauses, or extracted functions |
| Cyclomatic complexity | Branches + loops > 10 | Use table-driven dispatch (see `patterns.md`) or split the logic |
| File | ~400 lines | Split by responsibility, not by mechanically cutting at a line count |
| Public methods on a class | ~10 | Check whether multiple responsibilities have been mixed together |

These thresholds are signals, not hard limits. If you exceed one, explain in the report why keeping the current structure is justified.

---

## 4. Operational Criteria for Single Responsibility

To determine whether a function/class has too many responsibilities, check these three signals:

1. Describing what it does requires using "and" / "at the same time" — it probably has two responsibilities.
2. It has more than one reason to change (for example, both business-rule changes and storage-layer changes require modifying it).
3. Its name contains low-information verbs such as `handle` / `process` / `manage` / `do`, and there is no obvious more specific verb you can replace them with.

---

## 5. Dead Code Cleanup

### Must Be Cleaned Up (Within the Scope Affected by the Change)

Remove anything made obsolete directly by the current change:

- Imports / requires that are no longer referenced.
- Variables, fields, or constants that are no longer read.
- Functions, methods, or classes that are no longer called.
- Dead branches left behind after conditions become always true or always false.
- Old implementations replaced by the new one (do not keep them "just in case"; version control is the backup).
- Deprecated configuration options and their documentation.
- Tests that only covered logic that has now been removed.
- Comments invalidated by removed functionality.

Within modified files, scan once for symbols that no longer have callers and remove them as part of the change.

### Must Be Reported but Not Deleted Proactively (Outside the Change Scope)

If you discover historical dead code in other files, list the path and symbol name in the report, but do not modify it unless the user explicitly asks for cleanup.

### Confirmation Before Deletion

Before deleting, confirm that there are no implicit references:

```bash
rg -n '\bsymbol_name\b' --glob '!*.lock'
```

Be aware that this search cannot detect usages such as: reflection/dynamic invocation (`getattr`, `eval`, method names assembled as strings), dependency-injection container registrations, references in configuration files or templates, public APIs that downstream consumers may use, plugin entry points, and serialized field names. If any of these cases apply, do not delete the symbol; explain the concern in the report.

### Forbidden Fake Cleanup

- Renaming an unused variable to `_unused` and keeping it.
- Leaving tombstone comments such as `// removed xxx`.
- Commenting code out instead of deleting it.
- Keeping compatibility re-exports, empty shell functions, or forwarding stubs for deleted functionality unless external compatibility is explicitly required.
