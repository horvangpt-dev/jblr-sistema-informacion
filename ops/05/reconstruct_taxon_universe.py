#!/usr/bin/env python3
"""Reconstruct the canonical 05 taxon universe from split Base64 payload.

Fail closed unless the unique reconstructed CSV has exactly the 00D-approved
SHA-256 and row count. The split transfer contains one duplicated adjacent
Base64 character in part00; candidate deletion is accepted only when it yields
the exact canonical binary payload.
"""
import base64
import gzip
import hashlib
import pathlib
import re

TARGET_SHA256 = "3a0f9badf84a6798d01f0b5f3c01d72875d28f852db0b2ec49592bccfb2f31e4"
TARGET_ROWS = 2742
PARTS_DIR = pathlib.Path("data/05/universe.parts")
OUTPUT = pathlib.Path("data/05/taxon_universe.csv")


def main() -> int:
    parts = sorted(PARTS_DIR.glob("part*.b64"))
    assert len(parts) == 9, f"expected 9 parts, got {len(parts)}"
    texts = [re.sub(r"\s+", "", p.read_text(encoding="ascii")) for p in parts]
    compact = "".join(texts)
    bad = sorted(set(re.sub(r"[A-Za-z0-9+/=]", "", compact)))
    assert not bad, f"invalid base64 characters: {bad!r}"

    candidates: list[tuple[str, str]] = []
    if len(compact) % 4 == 0:
        candidates.append(("direct", compact))
    elif len(compact) % 4 == 1 and len(texts[0]) == 5001:
        tail = "".join(texts[1:])
        for i in range(len(texts[0])):
            candidates.append((f"part00_delete_index_{i}", texts[0][:i] + texts[0][i + 1:] + tail))
    else:
        raise AssertionError(f"unexpected base64 lengths total={len(compact)} part00={len(texts[0])}")

    canonical: dict[bytes, list[str]] = {}
    for label, candidate in candidates:
        try:
            raw_csv = gzip.decompress(base64.b64decode(candidate, validate=True))
        except Exception:
            continue
        if hashlib.sha256(raw_csv).hexdigest() == TARGET_SHA256:
            canonical.setdefault(raw_csv, []).append(label)

    assert len(canonical) == 1, f"unique canonical outputs={len(canonical)}"
    raw_csv, labels = next(iter(canonical.items()))
    rows = raw_csv.count(b"\n") - 1
    assert rows == TARGET_ROWS, rows
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(raw_csv)
    print("TAXON_UNIVERSE_RECONSTRUCTION_LABELS=" + "|".join(labels))
    print("TAXON_UNIVERSE_INTEGRITY=PASS")
    print(f"TAXON_UNIVERSE_ROWS={rows}")
    print("TAXON_UNIVERSE_SHA256=" + TARGET_SHA256)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
