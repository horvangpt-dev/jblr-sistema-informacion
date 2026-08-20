#!/usr/bin/env python3
"""JBLR chat continuity packager.

Creates deterministic, auditable chat-continuity packages without moving or
mutating source artifacts. The program only packages explicit inputs; it does
not infer missing conversation/state content.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "JBLR_CHAT_CONTINUITY_MANIFEST_v1"
TRANSFER_POLICY = "COPY · NEVER MOVE"
REQUIRED_ROLES = (
    ("conversation_copy", "01_COPIA_INTEGRAL_CONVERSACION"),
    ("complete_state", "02_ESTADO_COMPLETO"),
    ("reopen_prompt", "03_PROMPT_REAPERTURA"),
)


class ContinuityError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sanitize_actor(actor: str) -> str:
    actor = actor.strip()
    if not actor:
        raise ContinuityError("actor must not be empty")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", actor).strip("-")
    if not safe:
        raise ContinuityError("actor has no filesystem-safe characters")
    return safe


def validate_version(version: str) -> str:
    version = str(version).strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version):
        raise ContinuityError("version must contain only letters, numbers, dot, underscore or hyphen")
    return version


def validate_date(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ContinuityError("date must be YYYY-MM-DD") from exc
    return value


def file_record(role: str, src: Path, dst: Path, source_hash: str) -> dict[str, Any]:
    return {
        "role": role,
        "source_name": src.name,
        "source_path": str(src.resolve()),
        "packaged_name": dst.name,
        "bytes": dst.stat().st_size,
        "sha256": source_hash,
    }


def ensure_source(path: Path, role: str) -> None:
    if not path.exists():
        raise ContinuityError(f"{role}: source does not exist: {path}")
    if not path.is_file():
        raise ContinuityError(f"{role}: source is not a file: {path}")
    if path.stat().st_size == 0:
        raise ContinuityError(f"{role}: source is empty: {path}")


def load_pointers_json(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    ensure_source(path, "pointers_json")
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContinuityError(f"invalid pointers JSON: {path}") from exc
    if not isinstance(obj, dict):
        raise ContinuityError("pointers JSON must be an object")
    return obj


def parse_pointer_pairs(items: Iterable[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ContinuityError(f"pointer must use KEY=VALUE: {item}")
        key, value = item.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key or not value:
            raise ContinuityError(f"pointer key/value must be non-empty: {item}")
        if key in out:
            raise ContinuityError(f"duplicate pointer key: {key}")
        out[key] = value
    return out


def write_json_atomic(path: Path, obj: Any) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def create_package(args: argparse.Namespace) -> int:
    actor = sanitize_actor(args.actor)
    version = validate_version(args.version)
    date = validate_date(args.date)
    output_root = Path(args.output_root).expanduser().resolve()

    sources = {
        "conversation_copy": Path(args.conversation_copy).expanduser().resolve(),
        "complete_state": Path(args.state).expanduser().resolve(),
        "reopen_prompt": Path(args.reopen_prompt).expanduser().resolve(),
    }
    for role, src in sources.items():
        ensure_source(src, role)

    source_hashes_before = {role: sha256_file(src) for role, src in sources.items()}
    source_stats_before = {role: (src.stat().st_size, src.stat().st_mtime_ns) for role, src in sources.items()}

    folder = output_root / f"{date}_{actor}_continuidad_v{version}"
    if folder.exists():
        if any(folder.iterdir()):
            raise ContinuityError(f"destination already exists and is not empty: {folder}")
    else:
        folder.mkdir(parents=True, exist_ok=False)

    records: list[dict[str, Any]] = []
    try:
        for role, prefix in REQUIRED_ROLES:
            src = sources[role]
            suffix = src.suffix or ".txt"
            dst = folder / f"{prefix}_v{version}{suffix}"
            shutil.copy2(src, dst)
            dst_hash = sha256_file(dst)
            if dst_hash != source_hashes_before[role]:
                raise ContinuityError(f"copy hash mismatch for {role}")
            records.append(file_record(role, src, dst, dst_hash))

        pointers = load_pointers_json(Path(args.pointers_json).expanduser().resolve() if args.pointers_json else None)
        cli_pointers = parse_pointer_pairs(args.pointer or [])
        collision = set(pointers) & set(cli_pointers)
        if collision:
            raise ContinuityError(f"pointer keys duplicated across JSON and CLI: {sorted(collision)}")
        pointers.update(cli_pointers)

        pointer_doc = {
            "schema_version": "JBLR_CHAT_CONTINUITY_POINTERS_v1",
            "actor": args.actor,
            "version": version,
            "date": date,
            "transfer_policy": TRANSFER_POLICY,
            "pointers": pointers,
        }
        pointers_path = folder / f"04_POINTERS_v{version}.json"
        write_json_atomic(pointers_path, pointer_doc)
        records.append({
            "role": "pointers",
            "source_name": None,
            "source_path": None,
            "packaged_name": pointers_path.name,
            "bytes": pointers_path.stat().st_size,
            "sha256": sha256_file(pointers_path),
        })

        manifest = {
            "schema_version": SCHEMA_VERSION,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "actor": args.actor,
            "actor_filesystem_slug": actor,
            "version": version,
            "date": date,
            "transfer_policy": TRANSFER_POLICY,
            "source_mutation_allowed": False,
            "missing_information_policy": "DO_NOT_INFER",
            "required_order": [role for role, _ in REQUIRED_ROLES],
            "files": records,
        }
        manifest_path = folder / f"05_MANIFEST_v{version}.json"
        write_json_atomic(manifest_path, manifest)
        manifest_hash = sha256_file(manifest_path)
        sidecar_path = folder / f"06_MANIFEST_v{version}.sha256"
        sidecar_path.write_text(f"{manifest_hash}  {manifest_path.name}\n", encoding="utf-8")

        for role, src in sources.items():
            if not src.exists():
                raise ContinuityError(f"source disappeared after packaging: {src}")
            current_stat = (src.stat().st_size, src.stat().st_mtime_ns)
            current_hash = sha256_file(src)
            if current_stat != source_stats_before[role] or current_hash != source_hashes_before[role]:
                raise ContinuityError(f"source changed during packaging: {src}")

        verify_package(folder, quiet=True)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise

    print(json.dumps({
        "state": "CONTINUITY_READY",
        "folder": str(folder),
        "manifest": str(manifest_path),
        "manifest_sha256": manifest_hash,
        "transfer_policy": TRANSFER_POLICY,
    }, ensure_ascii=False))
    return 0


def verify_package(folder: Path, quiet: bool = False) -> int:
    folder = folder.expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise ContinuityError(f"continuity folder not found: {folder}")

    manifests = sorted(folder.glob("05_MANIFEST_v*.json"))
    if len(manifests) != 1:
        raise ContinuityError(f"expected exactly one 05_MANIFEST_v*.json, found {len(manifests)}")
    manifest_path = manifests[0]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContinuityError("manifest is not valid JSON") from exc

    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ContinuityError("unsupported manifest schema_version")
    if manifest.get("transfer_policy") != TRANSFER_POLICY:
        raise ContinuityError("transfer policy mismatch")
    if manifest.get("source_mutation_allowed") is not False:
        raise ContinuityError("source_mutation_allowed must be false")
    if manifest.get("missing_information_policy") != "DO_NOT_INFER":
        raise ContinuityError("missing_information_policy must be DO_NOT_INFER")

    records = manifest.get("files")
    if not isinstance(records, list):
        raise ContinuityError("manifest files must be a list")
    by_role = {r.get("role"): r for r in records if isinstance(r, dict)}
    for role, _ in REQUIRED_ROLES:
        if role not in by_role:
            raise ContinuityError(f"required role missing: {role}")
    if "pointers" not in by_role:
        raise ContinuityError("required role missing: pointers")

    checked = 0
    for rec in records:
        if not isinstance(rec, dict):
            raise ContinuityError("invalid file record in manifest")
        name = rec.get("packaged_name")
        expected_hash = rec.get("sha256")
        expected_bytes = rec.get("bytes")
        if not isinstance(name, str) or not isinstance(expected_hash, str):
            raise ContinuityError("invalid packaged_name/sha256 in manifest")
        path = folder / name
        if not path.exists() or not path.is_file():
            raise ContinuityError(f"packaged file missing: {name}")
        if path.stat().st_size != expected_bytes:
            raise ContinuityError(f"size mismatch: {name}")
        actual_hash = sha256_file(path)
        if actual_hash != expected_hash:
            raise ContinuityError(f"sha256 mismatch: {name}")
        checked += 1

    sidecars = sorted(folder.glob("06_MANIFEST_v*.sha256"))
    if len(sidecars) != 1:
        raise ContinuityError(f"expected exactly one manifest sidecar, found {len(sidecars)}")
    parts = sidecars[0].read_text(encoding="utf-8").strip().split()
    if len(parts) < 2:
        raise ContinuityError("invalid manifest sha256 sidecar")
    expected_manifest_hash = parts[0]
    expected_manifest_name = parts[-1]
    if expected_manifest_name != manifest_path.name:
        raise ContinuityError("manifest sidecar points to the wrong manifest")
    if sha256_file(manifest_path) != expected_manifest_hash:
        raise ContinuityError("manifest sha256 sidecar mismatch")

    if not quiet:
        print(json.dumps({
            "state": "CONTINUITY_VERIFIED",
            "folder": str(folder),
            "checked_files": checked,
            "manifest": manifest_path.name,
            "transfer_policy": TRANSFER_POLICY,
        }, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Create and verify JBLR chat continuity packages.")
    sub = p.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Create a continuity package from explicit source artifacts.")
    c.add_argument("--actor", required=True, help="Logical actor id/name, e.g. 06 or 0000-00E")
    c.add_argument("--version", required=True, help="Continuity version, e.g. 6")
    c.add_argument("--date", required=True, help="Package date YYYY-MM-DD")
    c.add_argument("--conversation-copy", required=True, help="Full conversation-copy artifact")
    c.add_argument("--state", required=True, help="Complete state artifact")
    c.add_argument("--reopen-prompt", required=True, help="Reopening prompt artifact")
    c.add_argument("--output-root", required=True, help="Root folder where the continuity folder is created")
    c.add_argument("--pointers-json", help="Optional JSON object with canonical pointers")
    c.add_argument("--pointer", action="append", default=[], help="Additional KEY=VALUE pointer; repeatable")
    c.set_defaults(func=create_package)

    v = sub.add_parser("verify", help="Verify hashes and invariants of an existing continuity package.")
    v.add_argument("folder", help="Continuity folder to verify")
    v.set_defaults(func=lambda a: verify_package(Path(a.folder)))
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ContinuityError as exc:
        print(json.dumps({"state": "CONTINUITY_INVALID", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
