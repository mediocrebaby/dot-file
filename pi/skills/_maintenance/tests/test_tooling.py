import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


doctor = module("skill_doctor", ROOT / "_maintenance/doctor.py")
unpacker = module("safe_unpack", ROOT / "docx/scripts/safe_unpack.py")
packer = module("safe_pack", ROOT / "docx/scripts/safe_pack.py")


class DoctorTests(unittest.TestCase):
    def test_current_skill_resource_graph(self):
        self.assertEqual(doctor.scan(ROOT)["errors"], [])
        self.assertEqual(doctor.syntax_check(ROOT), [])

    def test_bad_link_and_obsolete_host_are_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill = root / "sample"
            skill.mkdir()
            (skill / "SKILL.md").write_text("---\nname: sample\ndescription: Sample\n---\nCall the Skill tool.\n[missing](references/missing.md)\n")
            result = doctor.scan(root)
            self.assertTrue(any("missing resource" in e for e in result["errors"]))
            self.assertTrue(any("obsolete host" in e for e in result["errors"]))

    def test_cases_cover_every_entry(self):
        names = {p.parent.name for p in ROOT.glob("*/SKILL.md")}
        cases = json.loads((ROOT / "_maintenance/behavior-cases.json").read_text(encoding="utf-8"))
        self.assertEqual({c["skill"] for c in cases}, names)
        self.assertEqual(len(cases), len(names))


class SafeUnpackTests(unittest.TestCase):
    def attempt(self, name, symlink=False):
        with tempfile.TemporaryDirectory() as tmp:
            source, destination = Path(tmp) / "input.docx", Path(tmp) / "output"
            with zipfile.ZipFile(source, "w") as z:
                entry = zipfile.ZipInfo(name)
                if symlink:
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                z.writestr(entry, "payload")
            with self.assertRaises(ValueError):
                unpacker.unpack(source, destination)
            self.assertFalse(destination.exists())

    def test_traversal_rejected_before_extraction(self):
        self.attempt("../escape.xml")

    def test_windows_absolute_path_rejected(self):
        self.attempt("C:/escape.xml")

    def test_windows_device_rejected(self):
        self.attempt("word/NUL.xml")

    def test_symlink_rejected(self):
        self.attempt("word/link", symlink=True)

    def test_valid_package_and_existing_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, destination = Path(tmp) / "input.docx", Path(tmp) / "output"
            with zipfile.ZipFile(source, "w") as z:
                z.writestr("word/document.xml", "<document/>")
            self.assertEqual(unpacker.unpack(source, destination), 1)
            self.assertEqual((destination / "word/document.xml").read_text(), "<document/>")
            with self.assertRaises(ValueError):
                unpacker.unpack(source, destination)

    def test_case_insensitive_collision_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, destination = Path(tmp) / "input.docx", Path(tmp) / "output"
            with zipfile.ZipFile(source, "w") as z:
                z.writestr("word/a.xml", "one")
                z.writestr("word/A.xml", "two")
            with self.assertRaises(ValueError):
                unpacker.unpack(source, destination)
            self.assertFalse(destination.exists())


class SafePackTests(unittest.TestCase):
    def fixture(self, tmp):
        root = Path(tmp) / "source"
        (root / "word").mkdir(parents=True)
        (root / "word/document.xml").write_text("<document/>")
        (root / "[Content_Types].xml").write_text("<Types/>")
        return root

    def test_new_output_and_existing_output_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            output = Path(tmp) / "out.docx"
            self.assertEqual(packer.pack(root, output), 2)
            before = output.read_bytes()
            with self.assertRaises(ValueError):
                packer.pack(root, output)
            self.assertEqual(output.read_bytes(), before)
            with zipfile.ZipFile(output) as z:
                self.assertIn("word/document.xml", z.namelist())

    def test_output_inside_source_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            with self.assertRaises(ValueError):
                packer.pack(root, root / "out.docx")

    def test_nested_junction_is_rejected_before_descent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            loop = root / "word/loop"
            try:
                if os.name == "nt":
                    linked = subprocess.run(
                        ["cmd", "/c", "mklink", "/J", str(loop), str(root)],
                        capture_output=True,
                    )
                    if linked.returncode:
                        self.skipTest("Cannot create package directory junction")
                else:
                    loop.symlink_to(root, target_is_directory=True)
                with self.assertRaisesRegex(ValueError, "Linked package entry"):
                    packer.pack(root, Path(tmp) / "out.docx")
            finally:
                if os.name == "nt" and loop.exists():
                    loop.rmdir()
                elif loop.is_symlink():
                    loop.unlink()

    def test_close_failure_removes_incomplete_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            output = Path(tmp) / "out.docx"
            real_open = Path.open

            class CloseFailingStream:
                def __init__(self, stream):
                    self.stream = stream

                def __getattr__(self, name):
                    return getattr(self.stream, name)

                def __enter__(self):
                    return self

                def __exit__(self, *_):
                    self.stream.close()
                    raise OSError("simulated close failure")

            def failing_open(path, *args, **kwargs):
                stream = real_open(path, *args, **kwargs)
                if path == output and args and args[0] == "xb":
                    return CloseFailingStream(stream)
                return stream

            with patch.object(Path, "open", autospec=True, side_effect=failing_open):
                with self.assertRaisesRegex(OSError, "simulated close failure"):
                    packer.pack(root, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
