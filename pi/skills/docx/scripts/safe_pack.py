"""Pack an edited Word directory into a NEW .docx/.dotx. Never overwrite."""
import argparse
import os
from pathlib import Path
import stat
import zipfile


def is_linked_path(path: Path):
    try:
        if path.is_symlink():
            return True
        attributes = getattr(os.lstat(path), "st_file_attributes", 0)
        reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return bool(attributes & reparse_point)
    except FileNotFoundError:
        return False
    except OSError:
        return True


def package_files(source: Path):
    files, pending = [], [source]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                path = Path(entry.path)
                if is_linked_path(path):
                    raise ValueError(f"Linked package entry: {path}")
                if entry.is_dir(follow_symlinks=False):
                    pending.append(path)
                elif entry.is_file(follow_symlinks=False):
                    files.append(path)
    return sorted(files, key=lambda path: path.relative_to(source).as_posix())


def pack(source: Path, output: Path):
    if is_linked_path(source):
        raise ValueError("Source must not be a linked directory")
    source = source.resolve()
    if not source.is_dir():
        raise ValueError("Source must be an extracted Word directory")
    if output.exists() or output.is_symlink():
        raise ValueError("Output already exists; choose a new filename")
    output = output.resolve()
    if output.is_relative_to(source):
        raise ValueError("Output must be outside the source directory")
    for required in ("[Content_Types].xml", "word/document.xml"):
        if not (source / required).is_file():
            raise ValueError(f"Required Word part missing: {required}")
    files = package_files(source)
    # Exclusive creation is the overwrite guard, not just the earlier exists().
    # Existing output remains untouched even if another process creates it now.
    created = False
    stream = None
    try:
        stream = output.open("xb")
        created = True
        with stream:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path in files:
                    archive.write(path, path.relative_to(source).as_posix())
    except Exception:
        if stream is not None:
            try:
                stream.close()
            except OSError:
                pass
        if created:
            try:
                output.unlink(missing_ok=True)  # only this invocation's incomplete output
            except OSError:
                pass
        raise
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        count = pack(args.source, args.output)
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        parser.exit(1, f"Packing refused: {exc}\n")
    print(f"Packed {count} parts to {args.output.resolve()}; validate structure and rendering separately")


if __name__ == "__main__":
    main()
