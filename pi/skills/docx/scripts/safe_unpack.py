"""Extract an untrusted DOCX ZIP into a NEW directory after preflight checks.

Python 3.10+, standard library. Reject traversal, Windows special paths, symlinks,
case-insensitive duplicate names and oversized archives before touching output.
"""
import argparse
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import zipfile

MAX_BYTES = 256 * 1024 * 1024
MAX_ENTRIES = 20000
RESERVED = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$", re.I)


def unpack(source: Path, destination: Path):
    source = source.resolve()
    # resolve() alone would hide a dangling symlink at the destination.
    if destination.exists() or destination.is_symlink():
        raise ValueError("Destination must be new; existing content is never overwritten")
    destination = destination.resolve()
    created = False
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES or sum(e.file_size for e in entries) > MAX_BYTES:
            raise ValueError("Archive exceeds extraction limits")
        seen = set()
        validated = []
        for entry in entries:
            name = entry.filename
            parts = PurePosixPath(name).parts
            if not parts or name.startswith("/") or "\\" in name or any(
                part in {".", ".."} or ":" in part or part.endswith((".", " "))
                or RESERVED.fullmatch(part) or any(ord(c) < 32 for c in part)
                for part in parts
            ):
                raise ValueError(f"Unsafe archive entry: {name!r}")
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"Symbolic link rejected: {name!r}")
            key = "/".join(parts).casefold()
            if key in seen:
                raise ValueError(f"Duplicate archive entry: {name!r}")
            seen.add(key)
            target = destination.joinpath(*parts)
            if not target.is_relative_to(destination):
                raise ValueError("Archive entry escapes destination")
            validated.append((entry, target))
        try:
            destination.mkdir(parents=True, exist_ok=False)
            created = True
            copied = 0
            for entry, target in validated:
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as src, target.open("xb") as out:
                    while chunk := src.read(1024 * 1024):
                        copied += len(chunk)
                        if copied > MAX_BYTES:
                            raise ValueError("Expanded data exceeds extraction limit")
                        out.write(chunk)
        except Exception:
            if created:
                shutil.rmtree(destination)
            raise
    return len(entries)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        count = unpack(args.source, args.destination)
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as exc:
        parser.exit(1, f"Extraction refused: {exc}\n")
    print(f"Extracted {count} entries to {args.destination.resolve()}")


if __name__ == "__main__":
    main()
