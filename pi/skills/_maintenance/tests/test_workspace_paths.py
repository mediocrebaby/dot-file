"""Isolated regression tests. No API calls or writes to installed skill data."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SKILLS = Path(__file__).resolve().parents[2]
SCRIPTS = SKILLS / "baibai-aigc" / "scripts"


class WorkspaceTests(unittest.TestCase):
    def run_python(self, code, cwd, workspace=None):
        env = os.environ.copy()
        env.pop("BAIBAI_WORKSPACE_ROOT", None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        if workspace is not None:
            env["BAIBAI_WORKSPACE_ROOT"] = str(workspace)
        result = subprocess.run(
            [sys.executable, "-B", "-c", f"import sys; sys.path.insert(0, {str(SCRIPTS)!r});\n" + code],
            cwd=cwd, env=env, text=True, capture_output=True, encoding="utf-8", timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_default_workspace_is_cwd(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.run_python("import json, aigc_records, managed_sources; print(json.dumps([str(aigc_records.ROOT_DIR), str(managed_sources.ROOT_DIR)]))", tmp)
            self.assertEqual([Path(p) for p in data], [Path(tmp).resolve()] * 2)

    def test_explicit_workspace_and_resource_roots_are_separate(self):
        with tempfile.TemporaryDirectory() as cwd, tempfile.TemporaryDirectory() as work:
            data = self.run_python("import json, workspace_paths as p; from aigc_round_service import load_prompt; print(json.dumps({'workspace': str(p.WORKSPACE_ROOT), 'resource': str(p.RESOURCE_ROOT), 'prompt': bool(load_prompt('en', 1))}))", cwd, work)
            self.assertEqual(Path(data["workspace"]), Path(work).resolve())
            self.assertEqual(Path(data["resource"]), SCRIPTS.parent)
            self.assertTrue(data["prompt"])

    def test_explicit_external_text_source_remains_supported(self):
        with tempfile.TemporaryDirectory() as work, tempfile.TemporaryDirectory() as outside:
            source = Path(outside) / "sample.txt"
            source.write_text("sample", encoding="utf-8")
            data = self.run_python(
                f"""import json
from skill_round_helper import build_execution_context
context = build_execution_context({str(source)!r}, prompt_profile='cn')
print(json.dumps({{'source': str(context.source_path), 'input': str(context.input_text_path), 'output': str(context.output_text_path)}}))
""",
                work,
            )
            self.assertEqual(Path(data["source"]), source.resolve())
            self.assertEqual(Path(data["input"]), source.resolve())
            self.assertTrue(Path(data["output"]).is_relative_to(Path(work).resolve() / "finish"))

    def test_implicit_install_workspace_is_rejected_but_explicit_legacy_is_allowed(self):
        env = os.environ.copy()
        env.pop("BAIBAI_WORKSPACE_ROOT", None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        result = subprocess.run(
            [sys.executable, "-B", "-c", f"import sys; sys.path.insert(0, {str(SCRIPTS)!r}); import workspace_paths"],
            cwd=SCRIPTS.parent, env=env, text=True, capture_output=True, encoding="utf-8", timeout=30,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("explicit legacy workspace", result.stderr)
        data = self.run_python(
            "import json, workspace_paths as p; print(json.dumps(str(p.WORKSPACE_ROOT)))",
            SCRIPTS.parent,
            SCRIPTS.parent,
        )
        self.assertEqual(Path(data), SCRIPTS.parent)

    def test_app_and_web_use_same_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.run_python("import json, app_service, web_app, skill_round_helper; print(json.dumps([str(app_service.ROOT_DIR), str(web_app.ROOT_DIR), str(skill_round_helper.ROOT_DIR)]))", tmp)
            self.assertEqual([Path(p) for p in data], [Path(tmp).resolve()] * 3)

    def test_web_rejects_absolute_dotdot_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            (workspace / "finish").mkdir()
            escaped = workspace / "finish" / ".." / ".." / "outside.txt"
            data = self.run_python(
                f"""import json
from web_app import require_managed_output_path
try:
    require_managed_output_path({str(escaped)!r})
    rejected = False
except ValueError:
    rejected = True
print(json.dumps(rejected))
""",
                workspace,
            )
            self.assertTrue(data)

    def test_web_rejects_junction_escape(self):
        with tempfile.TemporaryDirectory() as work, tempfile.TemporaryDirectory() as outside:
            workspace = Path(work)
            finish = workspace / "finish"
            finish.mkdir()
            link = finish / "linked"
            try:
                if os.name == "nt":
                    linked = subprocess.run(
                        ["cmd", "/c", "mklink", "/J", str(link), str(Path(outside))],
                        capture_output=True,
                    )
                    if linked.returncode:
                        self.skipTest("Cannot create web workspace junction")
                else:
                    link.symlink_to(outside, target_is_directory=True)
                candidate = link / "outside.txt"
                data = self.run_python(
                    f"""import json
from web_app import require_managed_output_path
try:
    require_managed_output_path({str(candidate)!r})
    rejected = False
except ValueError:
    rejected = True
print(json.dumps(rejected))
""",
                    workspace,
                )
                self.assertTrue(data)
            finally:
                if os.name == "nt" and link.exists():
                    link.rmdir()
                elif link.is_symlink():
                    link.unlink()

    def test_offline_app_run_cannot_complete_or_write_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.run_python("""import json
from app_service import run_round_for_app
try:
    run_round_for_app('origin/sample.txt', {'offlineMode': True, 'promptProfile': 'cn'})
    rejected = False
except ValueError as exc:
    rejected = 'cannot execute or complete' in str(exc)
print(json.dumps({'rejected': rejected}))
""", tmp)
            self.assertTrue(data["rejected"])
            self.assertFalse((Path(tmp) / "finish").exists())

    def test_targeted_app_run_rejects_external_based_on_paths(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            external = Path(outside) / "result.txt"
            data = self.run_python(f"""import json
from app_service import run_round_for_app
try:
    run_round_for_app('origin/sample.txt', {{'baseUrl': 'https://invalid.example', 'apiKey': 'fake', 'model': 'fake', 'offlineMode': False, 'promptProfile': 'cn'}}, execution_options={{'applyMode': 'current_round_revision', 'basedOnOutputPath': {str(external)!r}, 'basedOnManifestPath': {str(external.with_suffix('.json'))!r}}})
    rejected = False
except ValueError as exc:
    rejected = 'workspace finish directory' in str(exc)
print(json.dumps(dict(rejected=rejected)))
""", tmp)
            self.assertTrue(data["rejected"])
            self.assertFalse((Path(tmp) / "finish").exists())

    def test_resumed_targeted_run_rejects_external_progress_paths(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            workspace = Path(tmp)
            source = workspace / "origin/sample.txt"
            source.parent.mkdir()
            source.write_text("sample", encoding="utf-8")
            external = Path(outside) / "result.txt"
            data = self.run_python(f"""import json
from pathlib import Path
import app_service
from aigc_round_service import build_progress_path
from skill_round_helper import build_round_context
context = build_round_context({str(source)!r}, prompt_profile='cn')
progress = build_progress_path(context.manifest_path)
progress.parent.mkdir(parents=True, exist_ok=True)
progress.write_text(json.dumps({{'apply_mode': 'current_round_revision', 'based_on_output_path': {str(external)!r}, 'based_on_manifest_path': {str(external.with_suffix('.json'))!r}, 'target_paragraph_indexes': [0]}}), encoding='utf-8')
app_service.llm_completion = lambda *a, **k: (_ for _ in ()).throw(AssertionError('LLM must not run'))
try:
    app_service.run_round_for_app({str(source)!r}, {{'baseUrl': 'https://invalid.example', 'apiKey': 'fake', 'model': 'fake', 'offlineMode': False, 'promptProfile': 'cn'}})
    rejected = False
except ValueError as exc:
    rejected = 'workspace' in str(exc)
print(json.dumps(dict(rejected=rejected, records=(Path({str(workspace)!r}) / 'finish/aigc_records.json').exists())))
""", workspace)
            self.assertEqual(data, {"rejected": True, "records": False})

    def test_skill_round_rejects_external_progress_paths(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            workspace = Path(tmp)
            source = workspace / "origin/sample.txt"
            source.parent.mkdir()
            source.write_text("sample", encoding="utf-8")
            external = Path(outside) / "result.txt"
            data = self.run_python(f"""import json
from pathlib import Path
from aigc_round_service import build_progress_path
from skill_round_helper import build_round_context, run_skill_round
context = build_round_context({str(source)!r}, prompt_profile='cn')
progress = build_progress_path(context.manifest_path)
progress.parent.mkdir(parents=True, exist_ok=True)
progress.write_text(json.dumps({{'apply_mode': 'current_round_revision', 'based_on_output_path': {str(external)!r}, 'based_on_manifest_path': {str(external.with_suffix('.json'))!r}, 'target_paragraph_indexes': [0]}}), encoding='utf-8')
def forbidden(*args, **kwargs):
    raise AssertionError('transform must not run')
try:
    run_skill_round({str(source)!r}, forbidden, prompt_profile='cn')
    rejected = False
except ValueError as exc:
    rejected = 'workspace' in str(exc)
print(json.dumps(dict(rejected=rejected, records=(Path({str(workspace)!r}) / 'finish/aigc_records.json').exists())))
""", workspace)
            self.assertEqual(data, {"rejected": True, "records": False})

    def test_web_rejects_external_revision_paths_before_starting_worker(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            workspace = Path(tmp)
            source = workspace / "origin/sample.txt"
            source.parent.mkdir()
            source.write_text("sample", encoding="utf-8")
            external = Path(outside) / "result.txt"
            payload = {
                "sourcePath": str(source),
                "modelConfig": {"baseUrl": "https://invalid.example", "apiKey": "fake", "model": "fake", "offlineMode": False, "promptProfile": "cn"},
                "executionOptions": {"applyMode": "current_round_revision", "basedOnOutputPath": str(external), "basedOnManifestPath": str(external.with_suffix(".json"))},
            }
            data = self.run_python(f"""import json
import web_app
client = web_app.app.test_client()
response = client.post('/api/run-round', json={payload!r})
print(json.dumps(dict(status=response.status_code, workers=len(web_app.RUN_STATES))))
""", workspace)
            self.assertEqual(data, {"status": 400, "workers": 0})

    def test_app_export_rejects_invalid_format_before_creating_directories(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            workspace = Path(tmp)
            output = workspace / "finish/result.txt"
            output.parent.mkdir()
            output.write_text("sample", encoding="utf-8")
            export_path = Path(outside) / "new/dir/result.bad"
            data = self.run_python(f"""import json
from app_service import export_round_output
try:
    export_round_output({str(output)!r}, {str(export_path)!r}, '../bad')
    rejected = False
except ValueError:
    rejected = True
print(json.dumps(dict(rejected=rejected)))
""", workspace)
            self.assertTrue(data["rejected"])
            self.assertFalse(export_path.parent.exists())

    def test_web_rejects_invalid_export_format_without_creating_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            output = workspace / "finish/result.txt"
            output.parent.mkdir()
            output.write_text("sample", encoding="utf-8")
            escaped = workspace.parent / f"{workspace.name}-escape"
            data = self.run_python(f"""import json
import web_app
client = web_app.app.test_client()
response = client.get('/api/export-round', query_string={{'outputPath': {str(output)!r}, 'targetFormat': '../../../../{escaped.name}/pwn'}})
print(json.dumps(dict(status=response.status_code)))
""", workspace)
            self.assertEqual(data["status"], 400)
            self.assertFalse(escaped.exists())

    def test_shared_round_rejects_outputs_outside_finish(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            source = workspace / "sample.txt"
            source.write_text("sample", encoding="utf-8")
            data = self.run_python(f"""import json
from pathlib import Path
from aigc_round_service import run_round
def forbidden(*args, **kwargs):
    raise AssertionError('transform must not run')
try:
    run_round('sample.txt', 1, Path({str(source)!r}), Path('outside.txt'), Path('manifest.json'), forbidden, prompt_profile='en')
    rejected = False
except ValueError as exc:
    rejected = 'workspace finish directory' in str(exc)
print(json.dumps(dict(rejected=rejected)))
""", workspace)
            self.assertTrue(data["rejected"])
            self.assertFalse((workspace / "outside.txt").exists())
            self.assertFalse((workspace / "manifest.json").exists())

    def test_dry_run_does_not_call_api_or_complete_round(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "sample.txt"
            source.write_text("This is a small sample paragraph.", encoding="utf-8")
            data = self.run_python("""import run_aigc_round as cli
cli.read_api_config = lambda *a: ('fake-secret', 'fake-model', 'https://invalid.example', 'chat_completions')
def forbidden(*a, **kw): raise AssertionError('dry-run called execution or API')
cli._build_api_transform = forbidden
cli.run_round = forbidden
cli.main(['sample.txt', '1', 'sample.txt', 'out.txt', 'manifest.json', '--prompt-profile', 'en', '--dry-run'])
""", tmp)
            self.assertTrue(data["dry_run"])
            self.assertFalse((Path(tmp) / "finish").exists())
            self.assertFalse((Path(tmp) / "out.txt").exists())
            self.assertFalse((Path(tmp) / "manifest.json").exists())

    def test_powershell_workspace_paths_are_literal(self):
        script = (SCRIPTS / "start_web_dev.ps1").read_text(encoding="utf-8")
        self.assertIn("Resolve-Path -LiteralPath $Workspace", script)
        self.assertIn("Test-Path -LiteralPath $workspaceDir -PathType Container", script)
        self.assertIn("Push-Location -LiteralPath $appDir", script)
        self.assertIn("Set-Location -LiteralPath '$quotedWorkspace'", script)
        self.assertIn("Set-Location -LiteralPath '$quotedApp'", script)
        with tempfile.TemporaryDirectory() as tmp:
            wildcard_path = Path(tmp) / "Project[1]"
            wildcard_path.mkdir()
            env = os.environ.copy()
            env["TEST_LITERAL_PATH"] = str(wildcard_path)
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "$resolved = (Resolve-Path -LiteralPath $env:TEST_LITERAL_PATH).Path; Push-Location -LiteralPath $resolved; try { (Get-Location).Path } finally { Pop-Location }"],
                env=env, text=True, capture_output=True, encoding="utf-8", timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(Path(result.stdout.strip()), wildcard_path.resolve())

    def test_real_rounds_resume_in_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "origin").mkdir()
            (Path(tmp) / "origin" / "sample.txt").write_text("第一段内容。\n\n第二段内容。", encoding="utf-8")
            data = self.run_python("""import json
from pathlib import Path
from skill_round_helper import build_round_context, get_document_round_state
from aigc_round_service import run_round
for round_number in [1, 2]:
    ctx = build_round_context('origin/sample.txt')
    assert ctx.round_number == round_number
    if round_number == 2: assert ctx.input_text_path.name == 'sample_round1.txt'
    run_round(doc_id=ctx.doc_id, round_number=round_number, input_path=ctx.input_text_path, output_path=ctx.output_text_path, manifest_path=ctx.manifest_path, transform=lambda text, *_: text)
state = get_document_round_state('origin/sample.txt')
print(json.dumps({'completed': state.is_complete, 'next': state.next_round}))
""", tmp)
            self.assertTrue(data["completed"])
            self.assertIsNone(data["next"])
            self.assertTrue((Path(tmp) / "finish" / "aigc_records.json").is_file())


if __name__ == "__main__":
    unittest.main()
