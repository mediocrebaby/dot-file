# 二进制逆向工具速查

按"目的 + 平台"选工具，不是记全所有开关。分静态（不运行，看结构）和动态（运行时，看行为）两栏。

## 目录

- [静态分析](#静态分析)
- [动态分析](#动态分析)
- [按平台](#按平台)
- [Frida 函数级 IO Hook 模板](#frida-函数级-io-hook-模板)

## 静态分析

| 目的 | 工具 | 关键用法 |
|---|---|---|
| 反编译看伪代码 | Ghidra（免费）/ IDA Pro / Binary Ninja | 定位函数后看 C 伪代码；Ghidra 无头模式可脚本化批处理 |
| 快速反汇编 / 交叉引用 | radare2 / rizin、`objdump -d` | `objdump -d --start-address=0x.. --stop-address=0x..` 只看目标函数 |
| 抓字符串/常量做锚点 | `strings -a`、Ghidra Defined Strings | 错误信息、算法名、magic → 交叉引用回定位函数 |
| 看头/段/符号/导入 | `readelf -a`、`nm -D`、`objdump -T`（ELF）；`otool`、`nm`（Mach-O） | 看导入的加密库判断是否标准算法包装 |
| 常量指纹搜索 | Ghidra 脚本 / 手工 grep 反汇编 | 搜 MD5/TEA/CRC 等已知常量（见 workflow.md 交接一节） |
| 加壳检测 | `checksec`、DIE (Detect It Easy) | 有壳先脱壳/dump 再静态 |

## 动态分析

| 目的 | 工具 | 关键用法 |
|---|---|---|
| 库函数调用轨迹 | `ltrace` | 看调了哪些 `memcpy`/`strcmp`/加密库函数及参数 |
| 系统调用轨迹 | `strace`（Linux）、`dtruss`/`dtrace`（macOS） | 看文件/网络/内存 syscall，定位 I/O 面 |
| 断点 / 单步 / 回溯栈 | `gdb`（+pwndbg/gef）、`lldb`（macOS） | 在锚点 API 下断，`bt` 回溯到业务函数 |
| 函数级 I/O 抓取 / hook | Frida | 抓参数、返回值、读写内存；见下方模板 |
| 内存搜索 / dump | gdb `find`、Frida `Memory.scan` | 找密钥/密钥流/明文缓冲 |
| 网络抓包（若走网络） | Wireshark、mitmproxy | 抓协议 I/O 作为 oracle 输入源 |

选择原则：**先 `ltrace`/`strace` 拿轨迹（成本最低）→ 有锚点后上调试器断点回溯 → 需要稳定抓函数 I/O 或改行为时上 Frida。**

## 按平台

- **Linux ELF**：`file`/`checksec` → `ltrace`+`strace` → `gdb`(pwndbg) → Ghidra。基址看 `/proc/<pid>/maps`。
- **macOS Mach-O**：`otool -L`/`nm` → `dtruss`（需关 SIP 或用可调试目标）→ `lldb` → Ghidra。注意签名/加固与 SIP 限制。
- **Android（原生 .so）**：`frida-server` 推到设备 → Frida hook JNI 导出函数 → 需要静态时把 .so 拉出来进 Ghidra。加固 App 先脱壳/dump dex+so。
- **Windows PE**：x64dbg / WinDbg（动态）+ IDA/Ghidra（静态）+ API Monitor（调用轨迹）。

## Frida 函数级 IO Hook 模板

抓某个原生函数的输入→输出配对——这直接产出 oracle 语料，也验证靶区找对没。改 `MODULE`、`SYMBOL`（或偏移）、参数解读即可。

```javascript
// 用法: frida -f <目标> -l hook.js   或   frida -n <进程名> -l hook.js
const MODULE = "libtarget.so";      // 目标模块；主程序可用 Process.enumerateModules()[0].name
const SYMBOL = "transform";          // 导出符号；无符号时用 base.add(0xOFFSET)

const base = Module.getBaseAddress(MODULE);
// 有符号:
const addr = Module.getExportByName(MODULE, SYMBOL);
// 无符号（改用偏移）: const addr = base.add(0x1234);

function hexdump_arg(ptr, len) {
  try { return hexdump(ptr, { length: len, ansi: false }); }
  catch (e) { return "<unreadable>"; }
}

Interceptor.attach(addr, {
  // 约定该函数签名为 transform(uint8_t* in, size_t len, uint8_t* out)
  onEnter(args) {
    this.inPtr = args[0];
    this.len = args[1].toInt32();
    this.outPtr = args[2];
    console.log(`\n[+] ${SYMBOL} 入参 len=${this.len}`);
    console.log("  input:\n" + hexdump_arg(this.inPtr, this.len));
  },
  onLeave(retval) {
    // 输出常写在 outPtr（或返回缓冲区）；长度按实际情况取
    console.log(`  ret=${retval}`);
    console.log("  output:\n" + hexdump_arg(this.outPtr, this.len));
    // 把 {input, output} 打成 hex 一行，可重定向进语料文件供 oracle 复用
  }
});
```

要点：
- 函数签名未知时先只 hook `onEnter` 打印各 `args[i]` 当指针/整数两种解读，比对哪种讲得通。
- 抓到的 `input→output` 配对就是最干净的 oracle——它绕过了程序的 I/O 包装，直击算法边界。
- 若目标有反调试/反 Frida，可能需要 `Stalker` 或改用 gdb 硬件断点；这属于对抗场景，按授权范围决定是否深入。
