# Binary Reverse Engineering Tool Quick Reference

Choose tools by **purpose + platform**, rather than memorizing every option. The tools are grouped into two categories: static analysis (inspect structure without running the target) and dynamic analysis (observe behavior at runtime).

## Table of Contents

- [Static Analysis](#static-analysis)
- [Dynamic Analysis](#dynamic-analysis)
- [By Platform](#by-platform)
- [Frida Function-Level I/O Hook Template](#frida-function-level-io-hook-template)

## Static Analysis

| Purpose | Tool | Key Usage |
|---|---|---|
| Decompile and inspect pseudocode | Ghidra (free) / IDA Pro / Binary Ninja | After locating the function, inspect C-like pseudocode; Ghidra headless mode supports scripted batch processing |
| Quick disassembly / cross-references | radare2 / rizin, `objdump -d` | Use `objdump -d --start-address=0x.. --stop-address=0x..` to inspect only the target function |
| Extract strings/constants as anchors | `strings -a`, Ghidra Defined Strings | Error messages, algorithm names, magic values → cross-reference back to the relevant function |
| Inspect headers/sections/symbols/imports | `readelf -a`, `nm -D`, `objdump -T` (ELF); `otool`, `nm` (Mach-O) | Inspect imported cryptographic libraries to determine whether the target is wrapping a standard algorithm |
| Search for constant fingerprints | Ghidra scripts / manually grep disassembly | Search for known constants from MD5/TEA/CRC and similar algorithms (see the handoff section in `workflow.md`) |
| Detect packing/protection | `checksec`, DIE (Detect It Easy) | If packed, unpack/dump first, then perform static analysis |

## Dynamic Analysis

| Purpose | Tool | Key Usage |
|---|---|---|
| Trace library-function calls | `ltrace` | Observe which `memcpy`/`strcmp`/cryptographic-library functions are called and with what arguments |
| Trace system calls | `strace` (Linux), `dtruss`/`dtrace` (macOS) | Observe file/network/memory syscalls to locate the I/O surface |
| Breakpoints / single-step / stack backtrace | `gdb` (+pwndbg/gef), `lldb` (macOS) | Break on anchor APIs, then use `bt` to trace back into business-logic functions |
| Function-level I/O capture / hooking | Frida | Capture arguments, return values, and memory reads/writes; see the template below |
| Memory search / dump | gdb `find`, Frida `Memory.scan` | Locate keys/keystreams/plaintext buffers |
| Network capture (when networking is involved) | Wireshark, mitmproxy | Capture protocol I/O as a source of oracle inputs |

Selection principle: **start with `ltrace`/`strace` to obtain execution traces at the lowest cost → once anchors are available, use debugger breakpoints and stack backtracing → use Frida when you need reliable function-level I/O capture or behavior modification.**

## By Platform

- **Linux ELF**: `file`/`checksec` → `ltrace`+`strace` → `gdb` (pwndbg) → Ghidra. Read the module base address from `/proc/<pid>/maps`.
- **macOS Mach-O**: `otool -L`/`nm` → `dtruss` (requires SIP to be disabled or a debuggable target) → `lldb` → Ghidra. Be aware of code-signing, hardened runtime, and SIP restrictions.
- **Android (native .so)**: push `frida-server` to the device → use Frida to hook exported JNI functions → pull the `.so` into Ghidra when static analysis is needed. For protected apps, unpack/dump dex+so first.
- **Windows PE**: x64dbg / WinDbg (dynamic) + IDA/Ghidra (static) + API Monitor (call tracing).

## Frida Function-Level I/O Hook Template

Capture input→output pairs for a native function. This directly produces oracle samples and also confirms whether the target area has been identified correctly. Adjust `MODULE`, `SYMBOL` (or the offset), and argument interpretation as needed.

```javascript
// Usage: frida -f <target> -l hook.js   or   frida -n <process-name> -l hook.js
const MODULE = "libtarget.so";      // Target module; for the main executable, use Process.enumerateModules()[0].name
const SYMBOL = "transform";         // Exported symbol; if stripped, use base.add(0xOFFSET)

const base = Module.getBaseAddress(MODULE);
// With symbol:
const addr = Module.getExportByName(MODULE, SYMBOL);
// Without symbol (use an offset instead): const addr = base.add(0x1234);

function hexdump_arg(ptr, len) {
  try { return hexdump(ptr, { length: len, ansi: false }); }
  catch (e) { return "<unreadable>"; }
}

Interceptor.attach(addr, {
  // Assume the function signature is transform(uint8_t* in, size_t len, uint8_t* out)
  onEnter(args) {
    this.inPtr = args[0];
    this.len = args[1].toInt32();
    this.outPtr = args[2];
    console.log(`\n[+] ${SYMBOL} input len=${this.len}`);
    console.log("  input:\n" + hexdump_arg(this.inPtr, this.len));
  },
  onLeave(retval) {
    // Output is often written to outPtr (or returned through a buffer); adjust the length as needed
    console.log(`  ret=${retval}`);
    console.log("  output:\n" + hexdump_arg(this.outPtr, this.len));
    // Print {input, output} as one hex-formatted line and redirect it into a corpus file for oracle reuse
  }
});
```

Key points:

- If the function signature is unknown, initially hook only `onEnter` and print each `args[i]` interpreted both as a pointer and as an integer; determine which interpretation makes sense.
- Captured `input→output` pairs are the cleanest possible oracle because they bypass the program's I/O wrappers and hit the algorithm boundary directly.
- If the target includes anti-debugging or anti-Frida protections, you may need `Stalker` or gdb hardware breakpoints instead. This is an adversarial-analysis scenario, so decide whether to go deeper according to the authorized scope.
