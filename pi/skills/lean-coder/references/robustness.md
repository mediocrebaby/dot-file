# Robustness: Failure Paths, Error Messages, and Performance Traps

---

## 1. Boundaries That Must Be Handled vs. Cases That Must Be Allowed to Propagate

**Must be handled** (failing to handle these is a defect):

| Boundary | Failures that must be covered |
| --- | --- |
| External input | User input, request parameters, configuration files, environment variables, command-line arguments: missing values, type mismatches, out-of-range values, invalid formats |
| File and network I/O | File/resource not found, permission denied, connection failure, timeout, mid-stream disconnect, unexpected status codes |
| Serialization / parsing | JSON/YAML/XML parsing failures, missing fields, encoding errors |
| Process boundaries | Non-zero child-process exit codes, stderr output, process termination |
| Concurrency | Race conditions, timeouts, cancellation, potential deadlock points |
| Resource cleanup | File handles, connections, locks, temporary files: must also be released on exception paths (use `with` / `defer` / `try-finally`) |
| Return values from external dependencies | Query results that may be empty, third-party calls that may fail |

**Must be allowed to propagate** (handling these explicitly only adds noise):

- Invariants between internal functions — do not repeatedly validate preconditions already guaranteed by the caller.
- Cases already guaranteed by the type system.
- Impossible branches — instead of writing `else: pass`, let them fail.
- When uncertain whether an error should be handled locally, let it propagate upward rather than swallowing it in place.

**Handling ≠ catching**: In most cases, the correct way to "handle" an error is to add context and rethrow it. Catch it only at a layer that can actually make a decision, such as retrying, degrading gracefully, or returning an error response.

---

## 2. Error Message Rules

### Mandatory Requirements

Every error message must include:

1. **What happened** — the specific operation that failed.
2. **Why** — the underlying cause (the original exception message, not merely the exception class name).
3. **Context** — key parameters that allow direct diagnosis: address, path, ID, line number, elapsed time, retry count.

```text
Bad: Connection failed
Bad: Database error
Bad: ValueError
Bad: Processing failed: <class 'KeyError'>

Good: Failed to connect to Postgres 10.0.0.5:5432: connection timed out (timeout=5s, retry 3)
Good: Failed to read configuration /etc/app/conf.yaml: YAML syntax error at line 12 — mapping values are not allowed here
Good: Batch insert into the orders table failed: 3 rows violated unique constraint uk_order_no; conflicting order numbers: [A1001, A1003, A1009]
```

### Prohibitions

- **No empty catch blocks**: `except: pass` / `catch (e) {}` — once an exception is swallowed, the problem will only surface later in a more confusing form.
- **Do not log only `str(e)` and discard the stack trace**: exception logs must include the stack trace (`logger.exception(...)` / `logger.error(..., exc_info=True)` / print `error.stack`).
- **Do not lose the cause when wrapping an error**: rethrowing must preserve the original exception chain (`raise X(...) from e` / `new Error(msg, { cause: e })` / `fmt.Errorf("...: %w", err)`).
- **Do not catch too broadly**: catch only the exception types you can actually handle; do not wrap an entire block of logic in `except Exception`.
- **Do not use error messages as control flow**: do not branch by matching error-message text.

### Sensitive Parameter Redaction

If the context contains passwords, tokens, keys, identity numbers, or phone numbers, mask them before logging (for example, `sk-****abcd`). "Complete information" is not a justification for writing credentials into logs.

### Logging Levels

- Log the same exception only once, at the **layer that can make a decision**. Do not log it at every layer and generate duplicate stack traces.
- Do not emit one log entry per failure inside a loop. Aggregate failures and log them once, including the failure count and a few representative samples.
- Levels: recoverable and already degraded → WARNING; request failed but service remains healthy → ERROR; process cannot continue → CRITICAL. Use DEBUG for diagnostic details instead of stuffing them into INFO.

---

## 3. Performance Trap Checklist

Review this after implementation. If any item matches, fix it.

### 1. Per-Item I/O / Queries Inside a Loop (Most Common Defect)

```python
# Bad: N round trips
for order_id in order_ids:
    row = db.query("SELECT * FROM orders WHERE id = %s", order_id)

# Good: one round trip; let the database handle the batch
rows = db.query("SELECT * FROM orders WHERE id = ANY(%s)", (order_ids,))
by_id = {r.id: r for r in rows}
```

The same principle applies to: sending HTTP requests inside a loop (use a batch API or controlled concurrency instead), reading/writing files inside a loop, issuing one INSERT per iteration (use `executemany` / batch INSERT), and ORM lazy loading that causes N+1 queries (preload related data).

### 2. Repeated Computation or Construction Inside a Loop

Compiling regular expressions, establishing connections, reading configuration, sorting the same list — move these operations outside the loop.

### 3. Unnecessary Full Copies

Repeatedly slicing, concatenating, or using `+=` on large lists/strings inside iterations; materializing data where iterators/generators/`join` could be used instead.

### 4. Uncontrolled Complexity

Nested loops used for membership lookup (`for a in A: for b in B: if a == b`) → use set/dictionary lookup instead, reducing O(n·m) to O(n+m).

### 5. Unbounded Growth

Caches, queues, or accumulating lists with no size limit or eviction policy; logs without rotation; loading an entire table / file into memory at once — use pagination, streaming, and bounded caches instead.

### 6. Blocking an Async Execution Path

Calling synchronous blocking I/O inside an async function (`requests` / `time.sleep` / synchronous file I/O), or performing CPU-intensive computation on the event-loop thread — use an async client or move the work to a thread/process pool.

### 7. Lock Scope Is Too Large

Performing I/O or long-running computation while holding a lock; using a global lock where a more localized lock would suffice.

### 8. High-Frequency Query Conditions Without Indexes

When adding a frequently used query filter on a field, confirm that the field is indexed. Avoid applying functions to columns in the `WHERE` clause when doing so prevents index usage.

---

## 4. "Optimizations" Not to Do

- Do not rewrite algorithms, add caching layers, or introduce concurrency without measurement data.
- Do not sacrifice readability merely to save a few function calls.
- Do not perform micro-optimizations (such as caching object attributes in local variables or manually unrolling loops) unless profiling results justify them.

Principle: **Avoiding known performance traps is mandatory; optimization beyond this checklist requires evidence.**
