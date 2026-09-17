"""Static case validation is not a model-behavior test."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("behavior_doctor", ROOT / "_maintenance/doctor.py")
doctor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(doctor)


class BehaviorCaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        skill = self.root / "sample"
        skill.mkdir()
        (skill / "SKILL.md").write_text(
            "---\nname: sample\ndescription: Example\n---\n", encoding="utf-8"
        )
        maintenance = self.root / "_maintenance"
        maintenance.mkdir()
        self.path = maintenance / "behavior-cases.json"
        self.valid = {
            "skill": "sample", "trigger": "开始示例任务", "skip": "跳过无关任务",
            "expected": "完成明确行为", "must_not": "执行未授权操作",
        }

    def scan(self, cases):
        self.path.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
        return doctor.scan(self.root)

    def assert_invalid(self, cases, fragment):
        result = self.scan(cases)
        self.assertEqual(result["status"], "failed")
        self.assertTrue(any(fragment in e for e in result["errors"]), result)

    def test_valid_primary_and_optional_branches(self):
        for branches in (None, [], [{"prompt": "只讨论", "expected": "不写入"}]):
            with self.subTest(branches=branches):
                item = dict(self.valid)
                if branches is not None:
                    item["additional_cases"] = branches
                self.assertEqual(self.scan([item])["errors"], [])

    def test_invalid_json_and_encoding_are_reported(self):
        for raw in (b"[", b"\xff"):
            with self.subTest(raw=raw):
                self.path.write_bytes(raw)
                result = doctor.scan(self.root)
                self.assertEqual(result["status"], "failed")
                self.assertTrue(any("behavior-cases.json" in e for e in result["errors"]))

    def test_root_must_be_list(self):
        for cases in ({}, None, "text", 3):
            with self.subTest(cases=cases):
                self.assert_invalid(cases, "must be a list")

    def test_primary_must_be_object(self):
        for item in (None, [], "text", 3):
            with self.subTest(item=item):
                self.assert_invalid([item], "must be an object")

    def test_primary_fields_must_be_nonempty_strings(self):
        for field in self.valid:
            for value in (None, "", " \n\t", [], {}, 7, True):
                with self.subTest(field=field, value=value):
                    self.assert_invalid([{**self.valid, field: value}], field)
            item = dict(self.valid)
            del item[field]
            self.assert_invalid([item], field)

    def test_duplicate_and_unknown_skills(self):
        self.assert_invalid([self.valid, self.valid], "duplicate")
        self.assert_invalid([{**self.valid, "skill": "absent"}], "unknown skill")

    def test_missing_coverage(self):
        self.assert_invalid([], "sample: no trigger/skip")

    def test_branches_must_be_list(self):
        for branches in (None, {}, "text", True):
            with self.subTest(branches=branches):
                self.assert_invalid([{**self.valid, "additional_cases": branches}], "additional_cases")

    def test_branch_must_be_object(self):
        for branch in (None, [], "text", 3):
            with self.subTest(branch=branch):
                self.assert_invalid([{**self.valid, "additional_cases": [branch]}], "additional_cases[0]")

    def test_branch_fields_must_be_nonempty_strings(self):
        valid = {"prompt": "操作", "expected": "结果"}
        for field in valid:
            for value in (None, "", " \n", [], 8, True):
                with self.subTest(field=field, value=value):
                    branch = {**valid, field: value}
                    self.assert_invalid([{**self.valid, "additional_cases": [branch]}], field)
            branch = dict(valid)
            del branch[field]
            self.assert_invalid([{**self.valid, "additional_cases": [branch]}], field)

    def test_optional_branch_prohibition_is_validated(self):
        branch = {"prompt": "讨论", "expected": "建议", "must_not": ""}
        self.assert_invalid([{**self.valid, "additional_cases": [branch]}], "must_not")
        branch["must_not"] = "改文件"
        self.assertEqual(self.scan([{**self.valid, "additional_cases": [branch]}])["errors"], [])

    def test_unknown_primary_fields_are_rejected(self):
        self.assert_invalid([{**self.valid, "additional_case": []}], "unknown field additional_case")

    def test_unknown_branch_fields_are_rejected(self):
        branch = {"prompt": "讨论", "expected": "建议", "mustnot": "改文件"}
        self.assert_invalid([{**self.valid, "additional_cases": [branch]}], "unknown field mustnot")

    def test_cli_reports_json_error_without_traceback(self):
        self.path.write_text("[", encoding="utf-8")
        result = subprocess.run(
            [sys.executable, "-B", str(ROOT / "_maintenance/doctor.py"), "--root", str(self.root)],
            capture_output=True, text=True, encoding="utf-8", timeout=30,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["status"], "failed")
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
