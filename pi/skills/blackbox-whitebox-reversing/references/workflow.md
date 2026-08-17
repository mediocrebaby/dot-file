# Detailed Reverse Engineering Techniques

Operational details for each stage. `SKILL.md` provides the skeleton; this document contains the concrete techniques to consult when working on a real target or when a specific step gets stuck.

## Table of Contents

- [Black-Box Corpus Construction Strategy](#black-box-corpus-construction-strategy)
- [Dynamic Observation Checklist](#dynamic-observation-checklist)
- [Black-Box → White-Box Handoff](#black-box--white-box-handoff)
- [Identifying Common "Custom Algorithms"](#identifying-common-custom-algorithms)
- [Validation Mismatch Attribution Table](#validation-mismatch-attribution-table)
- [Convergence and Stopping Criteria](#convergence-and-stopping-criteria)

## Black-Box Corpus Construction Strategy

A good corpus is not a random pile of samples. Each sample should **falsify a specific hypothesis about the algorithm**. Design samples by dimension:

| Property to Verify | Constructed Input Pair | What to Observe in the Output |
|---|---|---|
| Whether output length changes with input length | Lengths 0/1/15/16/17/31/32 | Output-length curve; whether it jumps at 8/16-byte boundaries (block-cipher block size) |
| Whether behavior is position-dependent | `AAAA` vs `ABAA` (change one position) | Whether only the corresponding position changes or everything changes (diffusion/avalanche) |
| Whether there is a round/block structure | All `\x00` × N | Whether the output shows periodicity (revealing block boundaries or keystream period) |
| Whether length/count fields are present | Increasing input lengths | Whether a byte in the output header equals or changes linearly with the length |
| Whether there is a checksum trailer | Same length, different content | Whether a fixed-length region at the tail changes with the content (CRC/MAC characteristics) |
| Encoding vs. encryption | Run the same input twice | Whether the outputs are identical (determinism); if not, random salt/IV/time may be involved |
| Endianness | `\x01\x00\x00\x00` vs `\x00\x00\x00\x01` | Which one is interpreted as numeric value 1 |

Key point: **first use minimally different inputs to locate sensitive bytes**, then expand to boundary/extreme inputs. All-zero, all-FF, and single-byte incrementing sequences (`00 01 02 ...`) are three of the highest-information probes.

## Dynamic Observation Checklist

When you receive a whole-program target, perform a quick dynamic pass in this order to produce clues about "where the critical code is":

1. **File and protection properties**: use `file` and `checksec` (Linux) to inspect architecture, packing, PIE/NX/Canary — these determine later base-address and hook strategies.
2. **Library/system-call traces**: run `ltrace` (library calls) + `strace` (system calls) once with representative input and inspect calls to `memcpy`/`malloc`/cryptographic libraries/file/network APIs — these are anchors for backtracking into business logic.
3. **Strings**: use `strings -a` to extract error messages, format strings, magic values, paths, algorithm names (`"aes"`, `"md5"`, version strings) — these become direct anchors for static cross-references.
4. **Import/dependency tables**: use `objdump -T` / `nm -D` (Linux), `otool -L` (macOS) to inspect which cryptographic/encoding libraries are linked — if OpenSSL/mbedTLS is present, the "custom encryption" is often just a wrapper.
5. **Breakpoint backtracing**: set breakpoints on the anchor APIs above, and when hit, backtrace the call stack (`bt`). The business-logic layer closest to user-controlled input is the target area.
6. **Execution-address sampling**: record addresses hit on critical paths in the debugger, subtract the runtime module base to get static offsets, and feed those offsets into the decompiler.

Frida is well suited for function-level I/O capture (arguments, return values, memory). See `binary-tooling.md` for concrete templates.

## Black-Box → White-Box Handoff

This is the pivot of the workflow — pinning "observed behavior" to "specific code addresses." Do it in two layers: first converge on **which file**, then on **which function**.

**File level (which binary should be loaded into IDA)**: when the target contains many binaries, use `scripts/triage_targets.py` to scan the candidate directory and pass strings/constants observed during black-box analysis via `--needle`/`--hex-needle`. A file containing those clues is almost certainly the target binary. The script ranks candidates by "black-box clue hit > cryptographic signals > format/size" and provides a first choice. Dynamic corroboration includes: using `/proc/<pid>/maps` to see which modules are actually loaded, checking which module address range contains a hit address, identifying which library owns the target function in `ltrace`, and inspecting Frida `Process.enumerateModules()`. Static ranking and dynamic hits should corroborate each other; when both agree, the target file is essentially confirmed.

**Function level (which function inside that file)**: there are three main paths:

- **Constant-fingerprint backtracking**: cross-reference magic constants observed during black-box analysis or memory inspection in the static view. High-value constants include `0x67452301`/`0xEFCDAB89` (MD5/SHA1 initial values), `0x9E3779B9` (TEA delta), `0xEDB88320` (CRC32 reflected polynomial), AES S-box sequences beginning with `0x63`..., and `0x811C9DC5` (FNV). Recognizing one of these often identifies both the algorithm and the function.
- **Data backtracking (taint-style reasoning)**: set breakpoints at output-production points (`write`/`send`/return buffer), trace backward to determine which function wrote the buffer and where its input came from, then follow the data flow back to the transformation function.
- **Offset mapping**: dynamic hit address − module base address = static offset. Under PIE/ASLR, the base address changes between runs, so always use the base address from the same execution.

Handoff output: a small list in the form `{symbol name or offset → suspected responsibility}`. Only functions on this list should enter Step 3 white-box analysis; leave the rest alone.

## Identifying Common "Custom Algorithms"

Most apparently proprietary transformations are standard algorithms in disguise. Before recovery, first try to falsify the cheap hypothesis "this is a standard algorithm":

- **Block ciphers**: 8-byte blocks → possibly DES/TEA/XTEA/Blowfish; 16-byte blocks → AES/SM4/Camellia. Look for S-box tables and round loops.
- **Stream ciphers / simple obfuscation**: byte-by-byte, position-dependent, predictable keystream → possibly RC4 (with a 256-byte KSA permutation) or a rolling XOR key.
- **Hashes/checksums**: fixed-length output with strong avalanche → MD5 (16B) / SHA1 (20B) / SHA256 (32B); short and linear → CRC (with polynomial table) / Adler / FNV.
- **Encoding**: reversible, with proportional length expansion → Base64/32/85, variable-length integers, protobuf-like TLV.
- **Disguised modifications**: the most common pattern is "standard algorithm + modified constants/S-box/initial values/round count/endianness." Once the skeleton is identified, white-box work only needs to confirm those changed parameters, drastically reducing recovery cost.

## Validation Mismatch Attribution Table

When `verify_reimpl.py` reports a `MISMATCH`, map the first differing position and pattern to likely causes:

| Symptom | Most Likely Cause |
|---|---|
| Everything is wrong from byte 0, but length matches | Wrong initial value/key/constants, or overall endianness reversed |
| First few bytes match, then diverges after a block boundary | Wrong block boundary/block size, off-by-one round count, different padding handling |
| One byte is wrong at a fixed interval | Lookup-table index offset, position counter off by one |
| Only the final few bytes are wrong | Missing final transformation (final round / output permutation / checksum trailer) |
| Multi-byte values are reversed in batches | Multi-byte read/write endianness reversed |
| Numeric difference is constant (e.g. always off by 1) | Missing `+1`/`-1`/carry/modulus |
| High bytes are wrong while low bytes match | Sign extension vs zero extension, signed vs unsigned `char` |
| Short inputs all match, long inputs fail | Buffer/block overflow handling or length-field truncation — return to Step 1 and add long-input samples |

## Convergence and Stopping Criteria

- **Delivery criterion**: every oracle vector must match byte-for-byte, and the corpus must cover boundary cases (empty / single-byte / cross-block / very long). One mismatch means it is not done.
- **Stop-loss criterion**: if repeated attempts to recover a function still cannot produce matching output, question whether Step 2 identified the correct target area. The real transformation may be elsewhere, or the code itself may be decrypted at runtime. Return to dynamic observation and confirm the execution path instead of grinding indefinitely on the wrong function.
- **Is the corpus sufficient?** If the reimplementation passes every existing vector but you are uncertain about an untested branch, add an input specifically designed to hit that branch and validate again. Only after it passes should you claim the implementation is "equivalent."
