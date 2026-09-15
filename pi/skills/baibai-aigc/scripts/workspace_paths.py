"""Resource paths belong to the installation; user data belongs to one workspace.

Set BAIBAI_WORKSPACE_ROOT before starting a CLI/app process to pin its workspace.
Without it, the launch working directory is used. Existing data is never moved.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

RESOURCE_ROOT = Path(__file__).resolve().parents[1]
_explicit_workspace = os.environ.get("BAIBAI_WORKSPACE_ROOT")
WORKSPACE_ROOT = Path(_explicit_workspace or Path.cwd()).expanduser().resolve()
if not _explicit_workspace and WORKSPACE_ROOT.is_relative_to(RESOURCE_ROOT):
    raise RuntimeError(
        "Set BAIBAI_WORKSPACE_ROOT to an existing user workspace; "
        "the skill installation is only allowed as an explicit legacy workspace"
    )

if __name__ == "__main__":
    print(json.dumps({
        "resource_root": str(RESOURCE_ROOT),
        "workspace_root": str(WORKSPACE_ROOT),
        "records_path": str(WORKSPACE_ROOT / "finish" / "aigc_records.json"),
        "legacy_records_present": (RESOURCE_ROOT / "finish" / "aigc_records.json").exists(),
    }, ensure_ascii=False, indent=2))
