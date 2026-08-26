from __future__ import annotations

from pathlib import Path


PACKET02_ARTIFACTS = [
    "docs/architecture/L0_CANONICAL_STEP_CROSSWALK_v1.md",
    "docs/architecture/L0_RUNTIME_INTEGRATION_REPORT_v1.md",
    "docs/architecture/L0_NEON_RUNTIME_VALIDATION_v1.md",
    "docs/architecture/L0_DRIVE_RUNTIME_VALIDATION_v1.md",
    "docs/architecture/L0_CORE_STATE_MODEL_ASSESSMENT_v1.md",
    "docs/architecture/L0_DEPENDENCY_SUFFICIENCY_FOR_L1_REPORT_v1.md",
    "docs/architecture/L0_PACKET_02_EXECUTION_RECEIPT_v1.md",
]


def test_packet02_required_artifacts_are_persisted() -> None:
    for artifact in PACKET02_ARTIFACTS:
        path = Path(artifact)
        assert path.is_file(), artifact
        assert path.read_text(encoding="utf-8").strip(), artifact
