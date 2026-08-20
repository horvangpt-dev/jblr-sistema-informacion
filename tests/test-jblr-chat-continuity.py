#!/usr/bin/env python3
import json
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "app" / "scripts" / "jblr-chat-continuity.py"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(SCRIPT), *args],
        text=True,
        capture_output=True,
        check=False,
    )


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        src = root / "src"
        out = root / "out"
        src.mkdir()
        out.mkdir()

        conversation = src / "conversation.md"
        state = src / "state.md"
        prompt = src / "prompt.txt"
        conversation.write_text("full conversation\n", encoding="utf-8")
        state.write_text("complete state\n", encoding="utf-8")
        prompt.write_text("reopen prompt\n", encoding="utf-8")

        originals = {p: p.read_bytes() for p in (conversation, state, prompt)}

        created = run(
            "create",
            "--actor", "06",
            "--version", "6",
            "--date", "2026-08-20",
            "--conversation-copy", str(conversation),
            "--state", str(state),
            "--reopen-prompt", str(prompt),
            "--output-root", str(out),
            "--pointer", "EVENT_BUS=test-event-bus",
        )
        assert created.returncode == 0, created.stderr
        created_payload = json.loads(created.stdout)
        assert created_payload["state"] == "CONTINUITY_READY"
        assert created_payload["transfer_policy"] == "COPY · NEVER MOVE"

        package = out / "2026-08-20_06_continuidad_v6"
        assert package.exists()

        for source, before in originals.items():
            assert source.exists()
            assert source.read_bytes() == before

        verified = run("verify", str(package))
        assert verified.returncode == 0, verified.stderr
        verified_payload = json.loads(verified.stdout)
        assert verified_payload["state"] == "CONTINUITY_VERIFIED"

        manifest = next(package.glob("05_MANIFEST_v*.json"))
        manifest_payload = json.loads(manifest.read_text(encoding="utf-8"))
        assert manifest_payload["transfer_policy"] == "COPY · NEVER MOVE"
        assert manifest_payload["source_mutation_allowed"] is False
        assert manifest_payload["missing_information_policy"] == "DO_NOT_INFER"

        copied_conversation = next(package.glob("01_COPIA_INTEGRAL_CONVERSACION_v6.*"))
        copied_conversation.write_text("tampered\n", encoding="utf-8")
        tampered = run("verify", str(package))
        assert tampered.returncode == 2
        assert "sha256 mismatch" in tampered.stderr or "size mismatch" in tampered.stderr

    print("JBLR_CHAT_CONTINUITY_SELFTEST_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
