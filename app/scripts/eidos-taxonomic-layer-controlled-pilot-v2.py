#!/usr/bin/env python3
import importlib.util
import json
import os
import re
from pathlib import Path

V1_PATH = Path(__file__).with_name("eidos-taxonomic-layer-controlled-pilot-v1.py")
spec = importlib.util.spec_from_file_location("eidos_pilot_v1", V1_PATH)
v1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v1)

OUT = Path(os.environ.get("EIDOS_PILOT_OUT", "artifacts/eidos_taxonomic_layer_pilot_v2"))
v1.OUT = OUT


def taxon_parts_hybrid_aware(name):
    n = v1.norm(name)
    toks = n.split()
    if len(toks) < 2:
        return {"genus": toks[0] if toks else "", "species": "", "rank": "", "infra": "", "hybrid": False}

    genus = toks[0]
    hybrid = False
    if len(toks) >= 3 and toks[1] == "x":
        hybrid = True
        species = toks[2]
    else:
        species = toks[1]
        hybrid = " x " in f" {n} "

    rank = ""
    infra = ""
    for marker in ("subsp.", "subsp", "var.", "var", "subvar.", "subvar"):
        if marker in toks:
            pos = toks.index(marker)
            rank = marker.rstrip(".")
            if pos + 1 < len(toks):
                infra = toks[pos + 1]
            break
    return {"genus": genus, "species": species, "rank": rank, "infra": infra, "hybrid": hybrid}


v1.taxon_parts = taxon_parts_hybrid_aware


def main():
    v1.main()
    src = OUT / "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V1.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    data["pilot_id"] = "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v2"
    data["supersedes_pilot"] = "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v1"
    data["fix"] = "HYBRID_X_TOKEN_IS_STRUCTURAL_MARKER_NOT_SPECIFIC_EPITHET"
    dst = OUT / "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V2.json"
    dst.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
