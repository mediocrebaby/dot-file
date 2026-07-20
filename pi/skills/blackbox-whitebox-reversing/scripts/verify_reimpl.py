#!/usr/bin/env python3
"""Verify a white-box reimplementation against a black-box oracle.

Run the reimplementation over the oracle's recorded inputs and diff its stdout
against the recorded stdout byte-for-byte. The reimplementation has only
"landed" when every vector matches; any mismatch points at an algorithm detail
still wrong in the reconstruction.

Uses the same input-feeding convention as oracle_capture.py: a ``{}`` token in
the command receives the input as an argv argument, otherwise input is piped to
stdin.

Example:
  verify_reimpl.py --reimpl 'python3 my_reimpl.py' --oracle oracle.json
"""
import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path


def run_once(cmd, data, timeout):
    if "{}" in cmd:
        argv = [a.replace("{}", data.decode("latin-1")) for a in cmd]
        stdin = None
    else:
        argv, stdin = cmd, data
    try:
        p = subprocess.run(argv, input=stdin, capture_output=True, timeout=timeout)
        return p.stdout
    except subprocess.TimeoutExpired:
        return None


def first_diff(a, b):
    """Return the index of the first differing byte, or -1 if a == b."""
    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            return i
    return -1 if len(a) == len(b) else min(len(a), len(b))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reimpl", required=True,
                    help="reimplementation command; use {} as the argv input placeholder, else input is piped to stdin")
    ap.add_argument("--oracle", default="oracle.json")
    ap.add_argument("--timeout", type=float, default=10.0)
    ap.add_argument("--max-show", type=int, default=3, help="how many mismatches to detail")
    args = ap.parse_args()

    cmd = shlex.split(args.reimpl)
    data = json.loads(Path(args.oracle).read_text())
    vectors = data["vectors"]
    passed = shown = 0
    for i, v in enumerate(vectors):
        inp = bytes.fromhex(v["input"])
        want = bytes.fromhex(v["stdout"])
        got = run_once(cmd, inp, args.timeout)
        if got == want:
            passed += 1
            continue
        if shown < args.max_show:
            shown += 1
            got_repr = "timeout" if got is None else f"{len(got)}B"
            print(f"MISMATCH vector[{i}] input={inp.hex()}")
            print(f"  want ({len(want)}B): {want.hex()}")
            print(f"  got  ({got_repr}): {(got or b'').hex()}")
            print(f"  first diff at byte {first_diff(want, got or b'')}")
    total = len(vectors)
    pct = 100 * passed // total if total else 0
    print(f"\n{passed}/{total} vectors match ({pct}%)")
    sys.exit(0 if passed == total and total > 0 else 1)


if __name__ == "__main__":
    main()
