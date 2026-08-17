# Signal → Structure Mapping Table

Abstractions are triggered by **observable signals in the code**, not by “we might need this someday.”

No signal → write the most straightforward implementation directly; do not force a pattern onto it.

Decision order: first confirm that the signal exists → then choose the structure → if the cost is clearly greater than the benefit, explain why and still use the straightforward implementation.

---

## 1. Multiple branches are checking the same type / enum / string tag

**Signal**: Three or more branches make decisions based on the value of the same variable; adding a new value requires adding another branch; the same combination of branches appears repeatedly in multiple places.

**Use**: Table-driven dispatch (mapping: value → handler function) or polymorphic dispatch.

**Why**: Adding a new value only requires registering one entry instead of revisiting every branching point. The structure eliminates the possibility of forgetting to update one of the branches.

```python
# Bad: adding a new type requires modifying N places
if kind == "a": return handle_a(x)
elif kind == "b": return handle_b(x)
elif kind == "c": return handle_c(x)
...

# Good
HANDLERS = {"a": handle_a, "b": handle_b, "c": handle_c}
handler = HANDLERS.get(kind)
if handler is None:
    raise ValueError(f"Unknown type {kind!r}; supported types: {sorted(HANDLERS)}")
return handler(x)
```

**Not applicable**: There are only two or three branches, each with substantially different logic, and the value set is stable and unlikely to grow — writing the branches directly is clearer.

---

## 2. An object has a “current stage,” and transitions between stages follow rules

**Signal**: Multiple boolean flags are used to represent stages (`is_started` / `is_paused` / `is_done` coexist); the code contains comments or validations such as “Y can only be performed after X”; calling operations in an invalid order can corrupt data.

**Use**: An explicit state field + a valid transition table. Provide a single transition entry point, and reject invalid transitions immediately with an error.

**Why**: Boolean combinations can produce meaningless states (for example, both `paused` and `done`), while a valid transition table eliminates impossible states structurally.

```python
TRANSITIONS = {
    "created":  {"running"},
    "running":  {"paused", "done", "failed"},
    "paused":   {"running", "failed"},
    "done":     set(),
    "failed":   set(),
}

def transition(self, target: str) -> None:
    allowed = TRANSITIONS[self.state]
    if target not in allowed:
        raise IllegalTransition(
            f"Task {self.task_id} cannot transition from {self.state} to {target}; "
            f"currently allowed: {sorted(allowed) or 'none (terminal state)'}"
        )
    self.state = target
```

**Not applicable**: There are only two states and no invalid transition order (such as open/closed) — a single boolean field is sufficient.

---

## 3. A globally unique resource is being created repeatedly

**Signal**: Configuration objects, connection pools, HTTP clients, loggers, model/driver instances, etc. are independently `new`ed in multiple modules; the same configuration file is read multiple times; different modules receive different instances and therefore behave inconsistently.

**Use**: A single instance (a module-level singleton or a single owner managed through dependency injection). Initialization must handle concurrency races, and explicit reload/shutdown entry points should be provided.

**Why**: An application should share one configuration instance and one connection pool. Repeated creation causes state drift, connection leaks, and redundant I/O overhead.

```python
_config: Config | None = None
_lock = threading.Lock()

def get_config() -> Config:
    global _config
    if _config is None:
        with _lock:
            if _config is None:                 # Double-check to avoid duplicate loading under concurrency
                _config = Config.load(CONFIG_PATH)
    return _config
```

Key points:

- Initialization must be thread-safe (or use the language's built-in lazy one-time initialization mechanism).
- Do not turn the singleton into a global container that holds everything — the singleton should represent a **resource**, not a junk drawer.
- If testing requires it, provide a reset entry point; otherwise tests may contaminate one another.

**Not applicable**: The instance itself contains request-scoped state (such as the context of a specific request) — in that case, a new instance must be created for each request.

---

## 4. Multiple functions share the same pre-processing / post-processing steps

**Signal**: Multiple functions begin with the same authentication, parameter validation, transaction setup, timing, or audit logging; they end with the same close, commit/rollback, or instrumentation steps; these steps have been copied and pasted and have already started drifting out of sync.

**Use**: Decorators / middleware / context managers / template methods to consolidate the common steps in one place.

**Why**: Copied pre/post-processing logic will inevitably drift over time. Failures then appear as difficult-to-diagnose issues such as “a few endpoints are missing audit logs.”

```python
@contextmanager
def transaction(conn):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise                                    # Preserve the original exception and stack trace
```

**Not applicable**: There is only one call site, or the supposedly “similar” steps actually have different semantics — forcing them together will only create a pile of configuration flags.

---

## 5. Constructing an object requires a long parameter list or many parameter combinations

**Signal**: The constructor has more than five parameters and most of them have default values; call sites contain many `None` placeholders; several fixed parameter combinations are repeatedly assembled.

**Use**: A parameter object / named configuration structure; provide factory functions for commonly used fixed combinations.

**Not applicable**: There are only a few parameters and their meanings are clear — passing them directly is the clearest approach. Do not create a Builder just for three parameters.

---

## 6. The same data is needed by multiple observers

**Signal**: A state change needs to notify N unrelated downstream consumers; a long sequence of direct calls hard-codes those consumers into the mutation point; adding a new downstream consumer requires modifying the mutation-point code.

**Use**: Event/callback registration. The mutation point only publishes the event and does not care about the subscribers.

**Not applicable**: There are only one or two fixed downstream consumers and they are unlikely to change — direct calls are easier to trace. An event mechanism would make the call chain harder to follow statically.

---

## General Prohibitions

- Do not introduce a pattern just for the sake of “using a pattern”: when the signal does not exist, straightforward code is the optimal solution.
- Do not stack multiple patterns at once (for example, Factory + Strategy + Observer) to solve a small problem.
- Whenever introducing a structure, clearly state in the placement rationale which signal triggered it.
