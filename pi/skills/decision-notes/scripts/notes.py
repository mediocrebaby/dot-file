"""Portable decision checks and opt-in archive. Python 3.10+, standard library.

Notes layout is strict; existing ADR layout is deliberately minimal. This is not
an LLM judge or a detector for important code diffs. JSON output is always explicit
about skipped coverage. Archive is a plan unless --apply is supplied.
"""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

STATES = {"proposed", "implemented", "rejected", "archived"}
CLASSES = {"feature", "bug-fix", "architecture", "process", "testing", "simplification"}
ALIASES = {
    "问题": "problem", "提案": "proposal", "方案": "proposal", "决策": "decision", "决定": "decision",
    "备选方案": "alternatives considered", "已考虑的替代方案": "alternatives considered",
    "验收标准": "acceptance criteria", "风险": "risks", "后果": "consequences", "影响": "consequences",
    "验证": "verification", "testing": "verification", "测试": "verification",
    "计划": "plan", "迁移计划": "migration plan",
}
REQUIRED = {
    "proposed": {"problem", "proposal", "alternatives considered", "acceptance criteria", "risks"},
    "implemented": {"problem", "decision", "alternatives considered", "consequences", "verification"},
    "rejected": {"problem", "proposal", "alternatives considered"},
}
LINK = re.compile(r"\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+['\"][^\n]*?['\"])?\s*\)")


def prose(raw: str) -> str:
    raw = re.sub(r"<!--[\s\S]*?-->", "", raw)
    lines, fence = [], None
    for line in raw.splitlines():
        mark = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if mark:
            token = mark[1]
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            lines.append("")
        else:
            lines.append("" if fence or line.lstrip().startswith(">") else line)
    return "\n".join(lines)


def targets(path: Path, raw: str):
    for match in LINK.finditer(prose(raw)):
        value = match[1].strip("<>")
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        yield (path.parent / unquote(parsed.path)).resolve()


def is_linked_directory(path: Path):
    try:
        if path.is_symlink():
            return True
        attributes = getattr(os.lstat(path), "st_file_attributes", 0)
        reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return bool(attributes & reparse_point)
    except FileNotFoundError:
        return False
    except OSError:
        return True  # fail closed when a path component cannot be inspected


def safe_path(root: Path, path: Path):
    """Reject linked/junction path components before reading or writing notes."""
    root = root.resolve()
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Decision path escapes root: {path}") from exc
    current = root
    for part in relative.parts:
        current /= part
        if is_linked_directory(current):
            raise ValueError(f"Linked/junction decision path is not supported: {current}")
        if current.exists() and not current.resolve().is_relative_to(root):
            raise ValueError(f"Decision path escapes root: {current}")
    return path


def locate(project: Path, root_arg: str | None, layout: str):
    if root_arg:
        candidate = project / root_arg
    else:
        found = [project / p for p in (".agents/notes", "docs/adr", "docs/decisions") if (project / p).is_dir()]
        if len(found) > 1:
            raise ValueError("Multiple decision roots found; specify --root rather than choosing another authority")
        candidate = found[0] if found else project / ".agents/notes"
    safe_path(project, candidate)
    root = candidate.resolve()
    if layout == "auto":
        layout = "notes" if root == (project / ".agents/notes").resolve() or any((root / s).is_dir() for s in STATES) else "adr"
    return root, layout


def load_manifest(path: Path):
    if not path.exists():
        return {"version": 1, "files": {}}
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate manifest key: {key}")
            result[key] = value
        return result
    data = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique)
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("files"), dict):
        raise ValueError("Invalid archive manifest schema")
    for key, value in data["files"].items():
        parts = key.split("/")
        if len(parts) != 3 or parts[0] != "archived" or parts[1] not in CLASSES or "\\" in key or parts[-1] in {".", ".."}:
            raise ValueError(f"Unsafe archive manifest key: {key}")
        if not isinstance(value, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
            raise ValueError(f"Invalid seal: {key}")
    return data


def seal(data: bytes):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def git(project: Path, *args):
    return subprocess.run(["git", "-C", str(project), *args], text=True, encoding="utf-8", capture_output=True, timeout=30)


def markdown_paths(root: Path):
    """Collect Markdown without entering symlink/junction/reparse-point directories."""
    if not root.exists():
        return []
    paths, pending = [], [root]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                path = Path(entry.path)
                if is_linked_directory(path):
                    raise ValueError(f"Linked/junction decision path is not supported: {path}")
                if entry.is_dir(follow_symlinks=False):
                    pending.append(path)
                elif entry.is_file(follow_symlinks=False) and path.suffix.lower() == ".md":
                    paths.append(path)
    return sorted(paths)


def verify(project: Path, root: Path, layout: str, require_record=False, base_ref="HEAD"):
    errors, warnings = [], []
    try:
        safe_path(project, root)
        paths = markdown_paths(root)
    except (ValueError, OSError) as exc:
        return {"status": "failed", "root": str(root), "layout": layout, "records": 0, "errors": [str(exc)], "warnings": []}
    support_files = {"AGENTS.md", "CLAUDE.md"}
    if layout == "adr":
        support_files |= {"README.md", "INDEX.md"}
    paths = [p for p in paths if p.name.upper() not in {n.upper() for n in support_files}]
    archived = {}
    if root.exists() and layout == "notes":
        for item in root.iterdir():
            if is_linked_directory(item) or not item.resolve().is_relative_to(root):
                errors.append(f"Linked/escaping lifecycle is not supported: {item.name}")
                continue
            if item.is_dir() and item.name not in STATES:
                errors.append(f"Unknown lifecycle: {item.name}")
            if item.is_dir() and item.name in STATES:
                for category in item.iterdir():
                    if category.is_dir() and (is_linked_directory(category) or not category.resolve().is_relative_to(root)):
                        errors.append(f"{item.name}/{category.name}: linked/escaping category is not supported")
    for path in paths:
        rel = path.relative_to(root).as_posix()
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            errors.append(f"{rel}: linked/escaping note is not supported")
            continue
        raw = path.read_text(encoding="utf-8-sig")
        clean = prose(raw)
        if layout == "adr":
            if not re.search(r"^# +\S", clean, re.M):
                errors.append(f"{rel}: ADR needs a nonempty title")
        else:
            parts = path.relative_to(root).parts
            match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})-.+\.md", path.name)
            if len(parts) != 3 or parts[0] not in STATES or parts[1] not in CLASSES or not match:
                errors.append(f"{rel}: expected lifecycle/class/yyyy-mm-dd-topic.md")
                continue
            try:
                date.fromisoformat(match[1])
            except ValueError:
                errors.append(f"{rel}: invalid calendar date")
            state = parts[0]
            lines = raw.splitlines()
            if len(lines) < 4 or not re.fullmatch(r"# Agent Note[:：] +\S.*", lines[0]) or lines[1] != "":
                errors.append(f"{rel}: invalid title/header")
            expected = "implemented" if state == "archived" else state
            grammar = r"Status: rejected — \S.*" if expected == "rejected" else f"Status: {expected}"
            if len(lines) < 3 or not re.fullmatch(grammar, lines[2]):
                errors.append(f"{rel}: status does not match lifecycle")
            if state == "archived":
                archived[rel] = seal(path.read_bytes())
                try:
                    if len(lines) < 5 or lines[4] != "" or not re.fullmatch(r"Archived: \d{4}-\d{2}-\d{2}", lines[3]):
                        raise ValueError()
                    date.fromisoformat(lines[3][10:])
                except ValueError:
                    errors.append(f"{rel}: invalid Archived header")
                continue  # frozen outbound links are historical, not current contracts
            if len(lines) < 4 or lines[3] != "":
                errors.append(f"{rel}: blank line required after status")
            if len(re.findall(r"^Status: (?:proposed|implemented|rejected(?: — .+)?)$", clean, re.M)) != 1:
                errors.append(f"{rel}: status must occur exactly once")
            sections, current = {}, None
            for line in clean.splitlines():
                if line.startswith("## "):
                    name = re.split(r"[（(]", line[3:].strip())[0].strip().lower()
                    name = ALIASES.get(name, name)
                    if name in sections:
                        errors.append(f"{rel}: duplicate section {name}")
                    sections[name] = []
                    current = name
                elif current:
                    sections[current].append(line)
            if next(iter(sections), None) != "problem":
                errors.append(f"{rel}: first section must be Problem")
            for name in REQUIRED[state]:
                content = "\n".join(sections.get(name, [])).strip()
                if not content or re.fullmatch(r"(?:<[^>]+>|TODO|TBD)", content, re.I):
                    errors.append(f"{rel}: missing/empty/placeholder section {name}")
            if state == "implemented" and sections.keys() & {"proposal", "plan", "migration plan", "acceptance criteria"}:
                errors.append(f"{rel}: implemented contains proposal/plan headings")
        for target in targets(path, raw):
            if not target.is_relative_to(project):
                errors.append(f"{rel}: local link escapes project: {target}")
            elif not target.exists():
                errors.append(f"{rel}: missing local target: {target.relative_to(project)}")
    if layout == "notes":
        manifest_path = root / "archived" / "manifest.json"
        manifest = load_manifest(manifest_path)
        if manifest["files"] != archived:
            errors.append("Archive manifest does not exactly match archived file seals")
        try:
            repo = git(project, "rev-parse", "--show-toplevel")
        except FileNotFoundError:
            repo = None
        if repo is None or repo.returncode != 0:
            warnings.append("No Git baseline available; archive hash consistency only")
        else:
            repo_root = Path(repo.stdout.strip()).resolve()
            checked_ref = git(project, "rev-parse", "--verify", "--end-of-options", f"{base_ref}^{{commit}}")
            if checked_ref.returncode:
                # A new repository has no HEAD yet; explicit invalid refs fail closed.
                unborn = base_ref == "HEAD" and git(project, "symbolic-ref", "-q", "HEAD").returncode == 0 and not git(project, "show-ref").stdout.strip()
                if unborn:
                    warnings.append("New Git repository has no baseline commit yet")
                else:
                    errors.append(f"Cannot resolve archive baseline: {base_ref}")
            else:
                commit = checked_ref.stdout.strip()
                rel_manifest = manifest_path.relative_to(repo_root).as_posix()
                listed = git(project, "ls-tree", commit, "--", rel_manifest)
                if listed.returncode:
                    errors.append("Cannot inspect baseline manifest")
                elif listed.stdout.strip():
                    original = git(project, "show", f"{commit}:{rel_manifest}")
                    if original.returncode:
                        errors.append("Cannot read existing baseline manifest")
                    else:
                        baseline = json.loads(original.stdout)
                        if not isinstance(baseline, dict) or not isinstance(baseline.get("files"), dict):
                            errors.append("Invalid baseline manifest")
                        else:
                            for key, value in baseline["files"].items():
                                if manifest["files"].get(key) != value:
                                    errors.append(f"Archive seal changed/deleted relative to baseline: {key}")
    active_count = len(paths) - len(archived)
    if require_record and active_count == 0:
        errors.append("This task requires an active decision record; empty coverage is not success")
    status = "failed" if errors else "ok" if paths else "skipped"
    if not paths:
        warnings.append("No decision records checked; no claim about important changes being documented")
    return {"status": status, "root": str(root), "layout": layout, "records": len(paths), "errors": errors, "warnings": warnings}


def atomic_write(path: Path, data: bytes, root: Path | None = None):
    if root is not None:
        safe_path(root, path.parent)
    path.parent.mkdir(parents=True, exist_ok=True)
    if root is not None:
        safe_path(root, path.parent)
    fd, name = tempfile.mkstemp(prefix=".note-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def project_markdown(project: Path, archive_root: Path):
    """Active project Markdown, excluding dependencies, VCS and frozen notes."""
    ignored = {".git", "node_modules", ".venv", "venv", "dist", "build", ".next", ".cache", "__pycache__"}
    for directory, dirs, files in os.walk(project, followlinks=False):
        parent = Path(directory)
        dirs[:] = [name for name in dirs if name not in ignored
                   and not is_linked_directory(parent / name)
                   and (parent / name).resolve().is_relative_to(project)
                   and not (parent / name).resolve().is_relative_to(archive_root)]
        for name in files:
            path = parent / name
            if name.lower().endswith(".md") and not path.is_symlink() and path.resolve().is_relative_to(project):
                yield path


def archive(project: Path, root: Path, source_arg: str, successor_arg: str, apply: bool, base_ref: str):
    check = verify(project, root, "notes", True, base_ref)
    if check["errors"]:
        raise ValueError("Preflight failed: " + "; ".join(check["errors"]))
    source = (project / source_arg).resolve()
    successor = (project / successor_arg).resolve()
    for path in (source, successor):
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("Source and successor must be existing notes in this root")
        parts = path.relative_to(root).parts
        if len(parts) != 3 or parts[0] != "implemented" or parts[1] not in CLASSES:
            raise ValueError("Only implemented notes can be source/successor")
    if source == successor:
        raise ValueError("A note cannot supersede itself")
    destination = root / "archived" / Path(*source.relative_to(root).parts[1:])
    if destination.exists():
        raise ValueError("Archive collision; will not overwrite history")
    inbound = []
    for path in project_markdown(project, root / "archived"):
        if path != source and source in targets(path, path.read_text(encoding="utf-8-sig")):
            inbound.append(str(path.relative_to(project)))
    if inbound:
        raise ValueError("Update these inbound links to the successor before archiving: " + ", ".join(inbound))
    raw = source.read_bytes()
    lines = raw.splitlines(keepends=True)
    ending = b"\r\n" if lines[2].endswith(b"\r\n") else b"\n"
    frozen = b"".join(lines[:3] + [f"Archived: {date.today().isoformat()}".encode() + ending] + lines[3:])
    manifest_path = root / "archived" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["files"][destination.relative_to(root).as_posix()] = seal(frozen)
    old_successor = successor.read_bytes()
    newline = b"\r\n" if b"\r\n" in old_successor else b"\n"
    link = Path(os.path.relpath(destination, successor.parent)).as_posix()
    new_successor = old_successor + newline + f"[Historical decision]({link})".encode() + newline
    plan = {"status": "planned", "source": str(source), "destination": str(destination), "successor": str(successor), "warnings": check["warnings"]}
    if not apply:
        return plan
    originals = {p: p.read_bytes() if p.exists() else None for p in (source, successor, destination, manifest_path)}
    try:
        atomic_write(destination, frozen, root)
        atomic_write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(), root)
        atomic_write(successor, new_successor, root)
        source.unlink()
        post = verify(project, root, "notes", True, base_ref)
        if post["errors"]:
            raise ValueError("Postflight failed: " + "; ".join(post["errors"]))
    except Exception:
        for path, content in originals.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content, root)
        raise
    plan["status"] = "archived"
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["verify", "archive"])
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--root")
    parser.add_argument("--layout", choices=["auto", "notes", "adr"], default="auto")
    parser.add_argument("--require-record", action="store_true")
    parser.add_argument("--base-ref", default=os.getenv("AGENT_NOTE_ARCHIVE_BASE_REF") or "HEAD")
    parser.add_argument("--source")
    parser.add_argument("--superseded-by")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        project = args.project.resolve()
        if not project.is_dir():
            raise ValueError("--project must exist")
        root, layout = locate(project, args.root, args.layout)
        if args.command == "archive":
            if layout != "notes" or not args.source or not args.superseded_by:
                raise ValueError("archive needs notes layout, --source and --superseded-by")
            result = archive(project, root, args.source, args.superseded_by, args.apply, args.base_ref)
        else:
            if args.apply or args.source or args.superseded_by:
                raise ValueError("Write options are only valid with archive")
            result = verify(project, root, layout, args.require_record, args.base_ref)
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        result = {"status": "failed", "errors": [str(exc)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
