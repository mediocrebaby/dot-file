import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "decision-notes" / "scripts" / "notes.py"
spec = importlib.util.spec_from_file_location("decision_notes", SCRIPT)
notes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notes)


def body(state="implemented"):
    if state == "proposed":
        return "# Agent Note: Candidate\n\nStatus: proposed\n\n## Problem\nA real constraint.\n\n## Proposal\nTry X.\n\n## Alternatives considered\nY has merit, but violates the constraint.\n\n## Acceptance criteria\nTest the behavior.\n\n## Risks\nExtra maintenance.\n"
    return "# Agent Note: Choice\n\nStatus: implemented\n\n## Problem\nA real constraint.\n\n## Decision\nUse X for this constraint.\n\n## Alternatives considered\nY has merit, but violates the constraint.\n\n## Consequences\nClear behavior with extra maintenance.\n\n## Verification\nNot verified: integration environment unavailable.\n"


class NoteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.project = Path(self.tmp.name).resolve()
        self.root = self.project / ".agents/notes"

    def put(self, name="old", text=None, state="implemented"):
        path = self.root / state / "architecture" / f"2026-09-15-{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body(state) if text is None else text, encoding="utf-8")
        return path

    def check(self, **kw):
        return notes.verify(self.project, self.root, "notes", **kw)

    def archive(self, old, new, apply=False):
        return notes.archive(self.project, self.root, str(old), str(new), apply, "HEAD")

    def git(self, *args):
        run = subprocess.run(["git", "-C", str(self.project), "-c", "user.name=SkillTests", "-c", "user.email=skills@example.invalid", "-c", "commit.gpgSign=false", "-c", f"core.hooksPath={self.project / 'no-hooks'}", *args], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(run.returncode, 0, run.stderr)

    def test_empty_is_skipped(self):
        self.assertEqual(self.check()["status"], "skipped")

    def test_required_empty_fails(self):
        self.assertEqual(self.check(require_record=True)["status"], "failed")

    def test_valid_one_real_alternative_and_unverified_gap_pass(self):
        self.put()
        self.assertEqual(self.check()["errors"], [])

    def test_empty_alternative_fails(self):
        self.put(text=body().replace("Y has merit, but violates the constraint.", "<!-- empty -->"))
        self.assertTrue(any("alternatives" in e for e in self.check()["errors"]))

    def test_placeholder_fails(self):
        self.put(text=body().replace("A real constraint.", "<problem>"))
        self.assertTrue(self.check()["errors"])

    def test_plan_heading_fails_in_implemented(self):
        self.put(text=body() + "\n## Plan\nWill do later.\n")
        self.assertTrue(self.check()["errors"])

    def test_code_fences_do_not_create_sections_or_links(self):
        self.put(text=body() + "\n~~~~\n## Plan\n[bad](missing.md)\n~~~~\n")
        self.assertFalse(self.check()["errors"])

    def test_invalid_date_fails(self):
        path = self.put()
        path.rename(path.with_name("2026-99-99-old.md"))
        self.assertTrue(self.check()["errors"])

    def test_dead_local_link_fails(self):
        self.put(text=body() + "\n[Missing](missing.md)\n")
        self.assertTrue(any("missing local target" in e for e in self.check()["errors"]))

    def test_existing_adr_keeps_format_and_content(self):
        root = self.project / "docs/adr"
        root.mkdir(parents=True)
        path = root / "0001-choice.md"
        path.write_text("---\nstatus: accepted\n---\n# Existing choice\nA short rationale.\n")
        original = path.read_bytes()
        found, layout = notes.locate(self.project, None, "auto")
        self.assertEqual(layout, "adr")
        self.assertFalse(notes.verify(self.project, found, layout)["errors"])
        self.assertEqual(original, path.read_bytes())
        self.assertFalse(self.root.exists())

    def test_ambiguous_roots_require_selection(self):
        self.put()
        (self.project / "docs/adr").mkdir(parents=True)
        with self.assertRaises(ValueError):
            notes.locate(self.project, None, "auto")

    def test_linked_decision_root_inside_project_is_rejected(self):
        actual = self.project / "actual-notes"
        actual.mkdir()
        self.root.parent.mkdir()
        try:
            if os.name == "nt":
                linked = subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(self.root), str(actual)],
                    capture_output=True,
                )
                if linked.returncode:
                    self.skipTest("Cannot create decision-root junction")
            else:
                self.root.symlink_to(actual, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "Linked/junction"):
                notes.locate(self.project, None, "auto")
        finally:
            if os.name == "nt" and self.root.exists():
                self.root.rmdir()
            elif self.root.is_symlink():
                self.root.unlink()

    def test_archive_dry_run_and_crlf_bom_preservation(self):
        old, new = self.put(), self.put("new")
        raw = b"\xef\xbb\xbf" + body().replace("\n", "\r\n").encode()
        old.write_bytes(raw)
        result = self.archive(old, new)
        self.assertEqual(result["status"], "planned")
        self.assertEqual(old.read_bytes(), raw)
        self.assertFalse((self.root / "archived").exists())
        result = self.archive(old, new, True)
        frozen = Path(result["destination"]).read_bytes()
        marker = f"Archived: {notes.date.today().isoformat()}\r\n".encode()
        self.assertEqual(frozen.replace(marker, b"", 1), raw)
        self.assertFalse(old.exists())
        self.assertFalse(self.check()["errors"])

    def test_inbound_links_block_archive_before_writes(self):
        old, new = self.put(), self.put("new", body() + "\n[old](2026-09-15-old.md)\n")
        with self.assertRaisesRegex(ValueError, "inbound"):
            self.archive(old, new, True)
        self.assertTrue(old.exists())
        self.assertFalse((self.root / "archived").exists())

    def test_project_readme_inbound_blocks_archive(self):
        old, new = self.put(), self.put("new")
        readme = self.project / "README.md"
        readme.write_text(f"# Project\n[decision]({old.relative_to(self.project).as_posix()}#decision)\n")
        with self.assertRaisesRegex(ValueError, "README.md"):
            self.archive(old, new, True)
        self.assertTrue(old.exists())
        self.assertFalse((self.root / "archived").exists())

    def test_adr_readme_does_not_count_as_decision(self):
        root = self.project / "docs/adr"
        root.mkdir(parents=True)
        (root / "README.md").write_text("# How to write ADRs\n")
        self.assertEqual(notes.verify(self.project, root, "adr", require_record=True)["status"], "failed")

    def test_markdown_walk_rejects_nested_cycle_before_descent(self):
        category = self.root / "implemented/architecture"
        category.mkdir(parents=True)
        loop = category / "loop"
        try:
            if os.name == "nt":
                linked = subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(loop), str(self.root)],
                    capture_output=True,
                )
                if linked.returncode:
                    self.skipTest("Cannot create nested directory junction")
            else:
                loop.symlink_to(self.root, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "Linked/junction"):
                notes.markdown_paths(self.root)
        finally:
            if os.name == "nt" and loop.exists():
                loop.rmdir()
            elif loop.is_symlink():
                loop.unlink()

    def test_linked_archive_directory_is_rejected_without_external_writes(self):
        old, new = self.put(), self.put("new")
        outside = self.project / "outside"
        outside.mkdir()
        archive_root = self.root / "archived"
        try:
            if os.name == "nt":
                linked = subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(archive_root), str(outside)],
                    capture_output=True,
                )
                if linked.returncode:
                    self.skipTest("Cannot create directory junction")
            else:
                archive_root.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "Preflight failed"):
                self.archive(old, new, True)
            self.assertEqual(list(outside.iterdir()), [])
            self.assertTrue(old.exists())
        finally:
            if getattr(archive_root, "is_junction", lambda: False)():
                archive_root.rmdir()
            elif archive_root.is_symlink():
                archive_root.unlink()

    def test_archive_rolls_back_on_write_failure(self):
        from unittest.mock import patch
        old, new = self.put(), self.put("new")
        before = {old: old.read_bytes(), new: new.read_bytes()}
        real_write = notes.atomic_write
        calls = 0
        def fail_once(path, data, root=None):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated manifest write failure")
            return real_write(path, data, root)
        with patch.object(notes, "atomic_write", side_effect=fail_once):
            with self.assertRaisesRegex(OSError, "simulated"):
                self.archive(old, new, True)
        self.assertEqual({p: p.read_bytes() for p in before}, before)
        self.assertFalse((self.root / "archived/manifest.json").exists())
        self.assertFalse(list((self.root / "archived").rglob("*.md")))

    def test_corrupt_manifest_refuses_archive(self):
        old, new = self.put(), self.put("new")
        manifest = self.root / "archived/manifest.json"
        manifest.parent.mkdir()
        manifest.write_text("broken")
        with self.assertRaises(ValueError):
            self.archive(old, new, True)
        self.assertTrue(old.exists())
        self.assertEqual(manifest.read_text(), "broken")

    def test_archive_requires_implemented_successor(self):
        old, new = self.put(), self.put("new", state="proposed")
        with self.assertRaisesRegex(ValueError, "implemented"):
            self.archive(old, new)

    def test_seal_and_file_tampering_cannot_bypass_git_baseline(self):
        self.git("init")
        old, new = self.put(), self.put("new")
        archived = Path(self.archive(old, new, True)["destination"])
        self.git("add", ".")
        self.git("commit", "-m", "fixture")
        archived.write_bytes(archived.read_bytes() + b"tamper\n")
        manifest_path = self.root / "archived/manifest.json"
        data = json.loads(manifest_path.read_text())
        data["files"][archived.relative_to(self.root).as_posix()] = notes.seal(archived.read_bytes())
        manifest_path.write_text(json.dumps(data))
        self.assertTrue(any("baseline" in e for e in self.check()["errors"]))

    def test_invalid_baseline_fails_closed(self):
        self.git("init")
        self.put()
        self.git("add", ".")
        self.git("commit", "-m", "fixture")
        self.assertTrue(any("baseline" in e for e in self.check(base_ref="does-not-exist")["errors"]))


if __name__ == "__main__":
    unittest.main()
