#!/usr/bin/env python3
"""Capture a black-box I/O oracle from a target binary.

Feed each input in a corpus to the target and record (input, stdout, stderr,
exit code, timing). The resulting JSON is both the behavioral ground truth and
the test corpus later used to verify a white-box reimplementation.

Input feeding convention (shared with verify_reimpl.py):
  - if the target command contains the literal token ``{}``, each input is
    substituted there as an argv argument (latin-1 decoded, byte-preserving);
  - otherwise the input bytes are piped to the target's stdin.

Examples:
  # stdin-fed target, corpus is one raw line per input
  oracle_capture.py --target ./target --inputs corpus.txt -o oracle.json

  # argv-fed target, corpus is hex-encoded (for non-printable / binary inputs)
  oracle_capture.py --target './target --key {}' --inputs corpus.hex --format hex
"""
import argparse
import json
import shlex
import subprocess
import sys
import time
from pathlib import Path


def load_inputs(path, fmt):
    raw = Path(path).read_bytes()
    if fmt == "json":
        return [s.encode() if isinstance(s, str) else bytes(s) for s in json.loads(raw)]
    lines = raw.split(b"\n")
    if lines and lines[-1] == b"":  # drop the single trailing empty line
        lines.pop()
    if fmt == "hex":
        return [bytes.fromhex(l.decode().strip()) for l in lines if l.strip()]
    return lines  # raw: one input per line, bytes preserved as-is


def run_once(target, data, timeout):
    if "{}" in target:
        cmd = [a.replace("{}", data.decode("latin-1")) for a in target]
        stdin = None
    else:
        cmd, stdin = target, data
    t0 = time.perf_counter()
    try:
        p = subprocess.run(cmd, input=stdin, capture_output=True, timeout=timeout)
        return {
            "stdout": p.stdout.hex(),
            "stderr": p.stderr.hex(),
            "exit": p.returncode,
            "ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "", "exit": None, "ms": None, "timeout": True}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True,
                    help="target command; use {} as the argv input placeholder, else input is piped to stdin")
    ap.add_argument("--inputs", required=True, help="corpus file")
    ap.add_argument("--format", choices=["raw", "hex", "json"], default="raw",
                    help="corpus encoding: raw=one line per input, hex=hex per line, json=array of strings")
    ap.add_argument("--timeout", type=float, default=10.0)
    ap.add_argument("-o", "--out", default="oracle.json")
    args = ap.parse_args()

    target = shlex.split(args.target)
    inputs = load_inputs(args.inputs, args.format)
    vectors = []
    for i, data in enumerate(inputs):
        r = run_once(target, data, args.timeout)
        vectors.append({"input": data.hex(), **r})
        out_len = len(bytes.fromhex(r["stdout"]))
        print(f"[{i + 1}/{len(inputs)}] exit={r.get('exit')} out={out_len}B", file=sys.stderr)
    Path(args.out).write_text(json.dumps({"target": args.target, "vectors": vectors}, indent=2))
    print(f"wrote {len(vectors)} vectors -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
