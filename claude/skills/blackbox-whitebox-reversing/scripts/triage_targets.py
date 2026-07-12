#!/usr/bin/env python3
"""Triage a set of binaries and rank which to open in a disassembler (IDA/Ghidra).

Reverse targets often ship as a pile of files — an app bundle, many .so/.dll, a
firmware dump. This scans candidate binaries and ranks them by how likely each
one holds the logic you're after, so you open the right file first instead of
guessing your way through dozens of modules.

Signals, highest to lowest:
  1. needle hits  — strings/constants you observed in the black-box phase, found
                    inside a file. A hit is near-decisive: that file contains it.
  2. crypto hints — algorithm-name strings and known constant fingerprints
                    (MD5/SHA/TEA/CRC/AES ...), suggesting the file does crypto.
  3. format/size  — only executables/shared objects are ranked; size breaks ties.

Needles are the strongest lever: pass whatever the black-box phase surfaced
(an error message, a magic string, a魔术常量) and the file that contains it is
almost certainly your target.

Usage:
  triage_targets.py <dir-or-file...> [--needle STR]... [--hex-needle HEX]...

Examples:
  triage_targets.py ./app/lib
  triage_targets.py ./app/lib --needle "signature invalid" --hex-needle 9e3779b9
"""
import argparse
import sys
from pathlib import Path

# First-4-bytes magic -> format label. Only these are treated as disasm targets.
MAGICS = {
    b"\x7fELF": "ELF",
    b"MZ\x90\x00": "PE",
    b"\xfe\xed\xfa\xce": "Mach-O",
    b"\xfe\xed\xfa\xcf": "Mach-O64",
    b"\xce\xfa\xed\xfe": "Mach-O",
    b"\xcf\xfa\xed\xfe": "Mach-O64",
    b"\xca\xfe\xba\xbe": "Mach-O-fat",
}

# Algorithm-name strings hinting the file does crypto/encoding worth reversing.
CRYPTO_NAMES = [
    b"aes", b"rijndael", b"sha1", b"sha256", b"sha512", b"md5", b"md4",
    b"rc4", b"blowfish", b"xtea", b"des", b"hmac", b"crc32", b"base64",
    b"curve25519", b"ed25519", b"chacha", b"poly1305", b"sm4", b"sm3",
    b"openssl", b"mbedtls", b"boringssl", b"libsodium",
]

# Known constant fingerprints (given big-endian); searched in both byte orders.
CONST_FINGERPRINTS = {
    "67452301": "MD5/SHA1 init",
    "9e3779b9": "TEA/XTEA delta",
    "edb88320": "CRC32 reflected poly",
    "6a09e667": "SHA256 init",
    "811c9dc5": "FNV offset",
    "428a2f98": "SHA256 K[0]",
}
# AES S-box opening bytes (order-independent literal run).
AES_SBOX = bytes.fromhex("637c777bf26b6fc5")


def detect_format(head):
    for magic, label in MAGICS.items():
        if head.startswith(magic):
            return label
    if head[:2] == b"MZ":
        return "PE"
    return None


def scan(path, needles, hex_needles):
    data = path.read_bytes()
    fmt = detect_format(data[:8])
    if fmt is None:
        return None  # not an executable/shared object; skip
    low = data.lower()

    needle_hits = []
    for n in needles:
        c = low.count(n.lower().encode())
        if c:
            needle_hits.append((n, c))
    for hx in hex_needles:
        b = bytes.fromhex(hx)
        c = data.count(b) + data.count(b[::-1])
        if c:
            needle_hits.append((f"hex:{hx}", c))

    crypto = []
    for name in CRYPTO_NAMES:
        if name in low:
            crypto.append(name.decode())
    for hx, label in CONST_FINGERPRINTS.items():
        b = bytes.fromhex(hx)
        if b in data or b[::-1] in data:
            crypto.append(label)
    if AES_SBOX in data:
        crypto.append("AES S-box")

    return {
        "path": path,
        "fmt": fmt,
        "size": len(data),
        "needle_hits": needle_hits,
        "needle_score": sum(c for _, c in needle_hits),
        "crypto": crypto,
    }


def gather_files(paths):
    files = []
    for p in paths:
        pp = Path(p)
        if pp.is_dir():
            files.extend(f for f in pp.rglob("*") if f.is_file())
        elif pp.is_file():
            files.append(pp)
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", help="directories and/or files to triage")
    ap.add_argument("--needle", action="append", default=[], help="string observed in black-box phase (repeatable)")
    ap.add_argument("--hex-needle", action="append", default=[], help="hex constant observed in black-box phase, e.g. 9e3779b9 (repeatable)")
    args = ap.parse_args()

    results = []
    for f in gather_files(args.paths):
        try:
            r = scan(f, args.needle, args.hex_needle)
        except (OSError, ValueError):
            continue
        if r:
            results.append(r)

    if not results:
        print("未发现可执行/共享库文件（ELF/Mach-O/PE）。", file=sys.stderr)
        sys.exit(1)

    # Rank: needle hits first (decisive), then crypto signal, then size.
    results.sort(key=lambda r: (r["needle_score"], len(r["crypto"]), r["size"]), reverse=True)

    print(f"扫描到 {len(results)} 个二进制，按拉进 IDA 的优先级排序：\n")
    for rank, r in enumerate(results, 1):
        rel = r["path"]
        kb = r["size"] / 1024
        print(f"#{rank}  {rel}")
        print(f"     格式 {r['fmt']}  大小 {kb:.1f}KB")
        if r["needle_hits"]:
            hits = ", ".join(f"{n}×{c}" for n, c in r["needle_hits"])
            print(f"     ★ 命中黑盒线索: {hits}")
        if r["crypto"]:
            print(f"     加密信号: {', '.join(sorted(set(r['crypto'])))}")
        print()

    top = results[0]
    reason = "含黑盒线索命中" if top["needle_score"] else ("含加密信号" if top["crypto"] else "最可能的主逻辑模块")
    print(f"建议优先拉进 IDA/Ghidra：{top['path']}（{reason}）")
    if not any(r["needle_score"] for r in results):
        print("提示：未提供或未命中黑盒线索。用 --needle/--hex-needle 传入第 1 步观测到的字符串/常量可大幅提高定位精度。")


if __name__ == "__main__":
    main()
