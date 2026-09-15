"""Read-only skill checks; no dependency installs, model calls or business jobs.

Checks explicit Markdown resource links and declared local script references,
not natural-language correctness. Optional probes report capabilities separately.
"""
from __future__ import annotations

import argparse
import ast
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r"(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)")
CODE_PATH = re.compile(r"`((?:scripts|references|templates|prompts)/[A-Za-z0-9_./-]+\.(?:py|sh|ps1|md|json))`")
OBSOLETE = [r"Call the Skill tool", r"call the Skill tool", r"/setup-matt-pocock-skills", r"/codebase-design", r"\bgrep\b", r"\bfind unpacked\b", r"is preinstalled"]


def outside_fences(text):
    lines, fence = [], None
    for line in text.splitlines():
        mark = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if mark:
            if fence is None:
                fence = mark[1]
            elif mark[1][0] == fence[0] and len(mark[1]) >= len(fence):
                fence = None
            continue
        if fence is None:
            lines.append(line)
    return "\n".join(lines)


def scan(root=ROOT):
    errors, warnings, entries = [], [], []
    for skill in sorted(p for p in root.iterdir() if p.is_dir() and (p / "SKILL.md").is_file()):
        entry = skill / "SKILL.md"
        text = entry.read_text(encoding="utf-8-sig")
        front = re.match(r"\A---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)", text)
        if not front:
            errors.append(f"{skill.name}: missing frontmatter")
            continue
        values = dict(re.findall(r"^([a-z-]+):[ \t]*(.*)$", front[1], re.M))
        if values.get("name", "").strip("\"' \r") != skill.name:
            errors.append(f"{skill.name}: frontmatter name must match directory")
        if not values.get("description", "").strip("\"' \r"):
            errors.append(f"{skill.name}: missing description")
        mode = values.get("disable-model-invocation", "false").strip()
        if mode not in {"true", "false"}:
            errors.append(f"{skill.name}: disable-model-invocation must be boolean")
        entries.append({"name": skill.name, "invocation": "manual" if mode == "true" else "automatic"})
        if len(text.splitlines()) > 180:
            warnings.append(f"{skill.name}: long entry; consider branch references")
        docs = list(skill.glob("*.md"))
        for directory in ("references", "templates"):
            docs.extend((skill / directory).rglob("*.md") if (skill / directory).is_dir() else [])
        for doc in docs:
            raw = doc.read_text(encoding="utf-8-sig")
            for pattern in OBSOLETE:
                if re.search(pattern, raw):
                    errors.append(f"{doc.relative_to(root)}: obsolete host assumption {pattern}")
            clean = outside_fences(raw)
            for match in LINK.finditer(clean):
                value = match[1].strip()
                if "<" in value or ">" in value:
                    continue  # documented placeholder, not a real resource dependency
                parsed = urlsplit(value)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                target = (doc.parent / unquote(parsed.path)).resolve()
                if not target.exists():
                    errors.append(f"{doc.relative_to(root)}: missing resource link {value}")
            # Inline code resource paths are conventionally relative to SKILL root.
            for relative in CODE_PATH.findall(raw):
                if not (skill / relative).is_file():
                    errors.append(f"{doc.relative_to(root)}: missing script/resource {relative}")
    cases_path = root / "_maintenance" / "behavior-cases.json"
    if cases_path.exists():
        cases = json.loads(cases_path.read_text(encoding="utf-8"))
        coverage = {item.get("skill") for item in cases}
        names = {item["name"] for item in entries}
        for name in names - coverage:
            errors.append(f"{name}: no trigger/skip behavior case")
        for item in cases:
            if item.get("skill") not in names or not all(item.get(k) for k in ("trigger", "skip", "expected", "must_not")):
                errors.append(f"Invalid behavior case: {item.get('skill')}")
    else:
        errors.append("Missing behavior-cases.json")
    return {"status": "failed" if errors else "ok", "root": str(root), "skills": entries, "errors": sorted(set(errors)), "warnings": warnings,
            "behavior_status": "cases-validated-only; model behavior requires fresh-session evaluation"}


def syntax_check(root):
    errors = []
    # Modified/new Python execution surfaces; do not import services or traverse dependencies.
    paths = list((root / "_maintenance").rglob("*.py")) + list((root / "decision-notes/scripts").glob("*.py"))
    paths += list((root / "baibai-aigc/scripts").glob("*.py"))
    paths += [root / "docx/scripts/safe_unpack.py", root / "docx/scripts/safe_pack.py"]
    for path in paths:
        if path.exists():
            try:
                ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
            except SyntaxError as exc:
                errors.append(str(exc))
    return errors


def probes():
    commands = {name: shutil.which(name) for name in ("python", "node", "git", "rg", "fd", "pandoc", "soffice", "pdftoppm", "cargo", "powershell")}
    modules = {name: importlib.util.find_spec(name) is not None for name in ("docx", "flask", "lxml")}
    node_docx = False
    if commands["node"]:
        run = subprocess.run([commands["node"], "-e", "try { require.resolve('docx'); process.exit(0) } catch { process.exit(1) }"], capture_output=True, timeout=15)
        node_docx = run.returncode == 0
    return {"commands": commands, "python_modules": modules, "node_docx_resolvable_from_cwd": node_docx,
            "note": "Missing optional tools are capability gaps, not installed automatically; PATH presence is not an end-to-end check"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    result = scan(root)
    result["errors"].extend(syntax_check(root))
    result["status"] = "failed" if result["errors"] else "ok"
    if args.probe:
        result["capabilities"] = probes()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(bool(result["errors"]))


if __name__ == "__main__":
    raise SystemExit(main())
