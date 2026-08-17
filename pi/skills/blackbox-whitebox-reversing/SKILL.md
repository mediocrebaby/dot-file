---
name: blackbox-whitebox-reversing
description: Black-box analysis, white-box implementation; authorization is required.
---

# Reverse Engineering Workflow: Black-Box Analysis, White-Box Implementation

## Overview

When reversing a native target, statically decompiling the entire binary from the beginning is both slow and easy to get lost in. This workflow uses black-box observation first to accomplish two things that white-box analysis cannot replace: **narrowing the target area** (locating a small number of key functions instead of reversing the entire execution path) and **collecting oracle samples** (a ground-truth set of input→output vectors). It then uses white-box analysis to recover the exact algorithm of the identified functions, and finally validates the reimplementation against the black-box corpus until the outputs match byte-for-byte. Together, these three stages form a convergent closed loop; once validation passes, the result is ready for delivery.

Core causal chain: **black-box observation = targeting signals + ground-truth oracle; white-box decompilation = exact algorithm; reimplementation ⨝ corpus = convergence criterion**. None of these steps exists merely to "look rigorous"; if any link is missing, the loop cannot be closed.

## Step 0: Authorization Prerequisite (Mandatory, Cannot Be Skipped)

Before collecting any target behavior, first confirm that the scenario is authorized. If the user has not explained the target's origin or authorization status, ask directly: is the target owned by the user, a CTF challenge, an explicitly authorized penetration-test target, or for learning purposes? If authorization cannot be confirmed, stop at purely static, public educational discussion; do not execute the target program or collect its behavior. Once authorization is confirmed, proceed to Step 1.

## Workflow

```text
[0 Authorization] → [1 Black-Box Observation] → [2 Target Localization] → [3 White-Box Recovery] → [4 Validation Loop] ⟳
                                                                       ↑______________________________|
                                              (mismatch → return to 3 and fix the algorithm;
                                               if necessary, return to 1 and collect more samples)
                                                                  convergence → [5 Delivery]
```

Stages 1 and 2 are often interleaved. If Step 4 fails, return to Step 3 (algorithm details are wrong); if corpus coverage is insufficient, return to Step 1 and add more samples.

### Step 1: Black-Box Observation — Establish the Behavioral Contract and Oracle

Without looking inside, treat the target as a black box: feed it inputs, record its outputs, and build an empirical understanding of the "input→output" mapping. At the same time, preserve these pairs as the validation corpus.

1. **Determine the I/O surface**: identify where input enters (stdin / argv / files / network / function parameters) and where output leaves (stdout / return values / files / memory).
2. **Construct diverse samples**: empty input, single-byte input, boundary lengths, all-zero/all-FF data, printable vs. binary data, increasing sequences — use differentiated inputs to expose algorithm characteristics (whether output length depends on input length, positional dependence, block structure, avalanche effect, etc.).
3. **Capture vectors**: use `scripts/oracle_capture.py` to feed the corpus into the target and record `(input, stdout, stderr, exit)` as JSON. This JSON is both the behavioral ground truth and the test set for Step 4.
4. **Use dynamic observation to locate entry points**: for whole-program targets, use dynamic tracing (`ltrace`/`strace`, debugger breakpoints, Frida hooks) to observe which library functions are called, which addresses are accessed, and what the parameters look like. This directly indicates "where the critical code is." See `references/binary-tooling.md` for tool selection.

Output: an oracle-vector JSON file + hypotheses about algorithm characteristics + several candidate target addresses/symbols.

### Step 2: Target Localization — Converge from Black-Box Signals to Specific Functions

Choose the file first, then the function. Do not immediately pick an arbitrary binary and drag it into a disassembler.

**2a File level: determine which executable should be loaded into IDA/Ghidra.** Targets often consist of many files (app bundles, multiple .so/.dll files, firmware dumps), so the first decision is: "Which of these binaries actually contains the logic that needs to be recovered?" Rank evidence by signal strength: the file containing strings/constants observed during the black-box stage (nearly decisive) > the file containing algorithm names/constant fingerprints > the module that is actually loaded and hit at runtime. Use `scripts/triage_targets.py` to scan and rank a candidate directory, passing the clues observed in Step 1 via `--needle`/`--hex-needle`:

```bash
scripts/triage_targets.py ./app/lib --needle "signature invalid" --hex-needle 9e3779b9
```

It outputs a prioritized list of binaries and a first-choice recommendation for what to load into IDA. Dynamic information (`/proc/pid/maps`, libraries loaded by `ltrace`, Frida `enumerateModules`, or which module contains a hit address) is the strongest supporting evidence for file-level localization and should corroborate the script's static ranking.

**2b Function level: locate the target functions inside the selected file.** Convert the dynamic signals from Step 1 into static coordinates so that white-box analysis is limited to only a few functions. Common bridging techniques:

- **Cross-reference strings/constants**: error messages, magic values, or magic constants observed during black-box analysis (such as S-boxes, CRC polynomials, or hash initialization values like `0x67452301`) can be cross-referenced in the static disassembly to locate the relevant functions.
- **Backtrace from API breakpoints**: set breakpoints on `malloc`/`memcpy`/`send`/exported cryptographic-library functions and inspect the call stack when they are hit to locate business-logic functions.
- **Map runtime addresses to static code**: subtract the module base address from a dynamically observed execution address to obtain the static offset, then jump directly to the corresponding location in the decompiler view.

See the "Black-Box → White-Box Handoff" section in `references/workflow.md` for detailed techniques. Output: an explicit list of functions to recover (symbol names or offsets).

### Step 3: White-Box Recovery — Recover the Exact Algorithm

Perform static decompilation/disassembly only on the identified functions, translate the logic into readable pseudocode, and then translate that into an implementation in the target language.

- Identify standard algorithms by comparing constants and structure; many "custom encryption" schemes are variants of standard algorithms or modified-constant versions of XTEA/RC4/AES/CRC, etc.
- Recover the logic block by block: data layout, loop boundaries, bit operations, byte order, lookup tables — these are exactly the details most likely to be exposed as errors in Step 4.
- Convert the recovered logic into runnable code as you go (prefer Python for speed). Do not wait until the end to write the entire implementation at once.

### Step 4: Validation Loop — Match the Oracle Byte-for-Byte

Use `scripts/verify_reimpl.py` to run the reimplementation against every oracle sample collected in Step 1 and compare stdout byte-for-byte.

- All samples match → the algorithm has been recovered correctly; proceed to delivery.
- A `MISMATCH` occurs → the script reports the first differing byte position; use that to return to Step 3 and fix the implementation (common causes: reversed endianness, off-by-one loops, missing final transformations, sign extension, incorrect modulus).
- A few inputs match but boundary inputs do not → return to Step 1, add more extreme samples, and validate again.

**Only a complete match across all vectors counts as successful recovery.** "Looks close enough" does not count.

### Step 5: Delivery

Finish in the form requested by the user:

- **Interoperable client/SDK**: package the validated reimplementation as a library/CLI and retain the oracle corpus as regression tests.
- **Analysis report**: use `assets/report-template.md` as the structure — target, methodology, key functions, algorithm pseudocode, recovered implementation, validation results.

## Script Usage

`oracle_capture.py` and `verify_reimpl.py` share the same input-feeding convention: if the command contains `{}`, the input replaces it as an argv argument; otherwise, input bytes are piped to stdin.

```bash
# 0) File-level target localization: choose which binary among many should be loaded into IDA/Ghidra (Step 2a)
scripts/triage_targets.py ./app/lib --needle "signature invalid" --hex-needle 9e3779b9

# 1) Black-box oracle capture: feed the corpus into the target and record I/O vectors
scripts/oracle_capture.py --target ./target --inputs corpus.txt -o oracle.json
scripts/oracle_capture.py --target './target --key {}' --inputs corpus.hex --format hex

# 2) White-box validation: run the reimplementation against the oracle and compare byte-for-byte
scripts/verify_reimpl.py --reimpl 'python3 my_reimpl.py' --oracle oracle.json
```

`--format` supports `raw` (one input per line), `hex` (one hexadecimal input per line, for binary/non-printable input), and `json` (an array of strings). `verify_reimpl.py` exits with code 0 when all samples match, otherwise 1, so it can be integrated directly into regression testing.

## Reference Files

- **`references/workflow.md`** — Detailed techniques for each stage: black-box corpus construction strategies, dynamic observation checklist, black-box→white-box handoff techniques, common "custom algorithm" identification methods, and a mismatch-attribution table for failed validation. Read when starting work on a real target or when blocked at a particular stage.
- **`references/binary-tooling.md`** — Quick reference for static/dynamic tools (Ghidra/IDA/radare2/objdump, gdb/lldb/ltrace/strace/Frida), organized by platform (Linux/macOS/Android) and purpose, including a Frida function-level I/O hook template. Read when choosing tools or writing hooks.
- **`assets/report-template.md`** — Reverse-engineering analysis report skeleton; copy and fill it in when delivering an "analysis report."
