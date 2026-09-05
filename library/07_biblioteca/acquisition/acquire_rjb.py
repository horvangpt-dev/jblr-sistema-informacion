from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
TARGETS_FILE = ROOT / "rjb_targets_batch01.json"
OUT = Path("acquired")
OUT.mkdir(parents=True, exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36 JBLR-Biblioteca/0.3"
})


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_target(target: dict) -> dict:
    category = target["category"]
    destination = OUT / category
    destination.mkdir(parents=True, exist_ok=True)
    path = destination / target["filename"]
    url = target["pdf_url"]

    print(f"DOWNLOAD TRY {target['library_id']} {url}", flush=True)
    with session.get(url, timeout=240, stream=True, allow_redirects=True) as response:
        print(
            f"DOWNLOAD HTTP {target['library_id']} {response.status_code} "
            f"ctype={response.headers.get('content-type')} "
            f"length={response.headers.get('content-length')} final={response.url}",
            flush=True,
        )
        response.raise_for_status()
        with path.open("wb") as f:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)

    size = path.stat().st_size
    with path.open("rb") as f:
        magic = f.read(5)
    if size < 1024 or magic != b"%PDF-":
        raise RuntimeError(f"not a valid PDF: bytes={size} magic={magic!r}")

    return {
        **target,
        "final_url": response.url,
        "bytes": size,
        "sha256": sha256_file(path),
        "artifact_path": str(path.relative_to(OUT)),
        "acquisition_status": "ACQUIRED_VERIFIED_PDF",
    }


def main() -> int:
    plan = json.loads(TARGETS_FILE.read_text(encoding="utf-8"))
    acquired = []
    failures = []

    for target in plan["targets"]:
        try:
            record = download_target(target)
            acquired.append(record)
            print(
                f"ACQUIRED {record['library_id']} {record['artifact_path']} "
                f"{record['bytes']} bytes sha256={record['sha256']}",
                flush=True,
            )
        except Exception as exc:
            failure = {
                "library_id": target.get("library_id"),
                "title": target.get("title"),
                "pdf_url": target.get("pdf_url"),
                "error": repr(exc),
            }
            failures.append(failure)
            print(f"ERROR {json.dumps(failure, ensure_ascii=False)}", file=sys.stderr, flush=True)

    manifest = {
        "batch": plan["batch"],
        "source": "Biblioteca Digital del Real Jardín Botánico, CSIC",
        "policy": "Only previously verified direct public PDF URLs. No authentication, paywall, or technical-protection bypass.",
        "target_count": len(plan["targets"]),
        "acquired_count": len(acquired),
        "failure_count": len(failures),
        "acquired": acquired,
        "failures": failures,
    }
    (OUT / "acquisition_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps({
        "target_count": manifest["target_count"],
        "acquired_count": manifest["acquired_count"],
        "failure_count": manifest["failure_count"],
    }, indent=2), flush=True)

    if not acquired:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
