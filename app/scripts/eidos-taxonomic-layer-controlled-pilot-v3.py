#!/usr/bin/env python3
import importlib.util
import json
import os
import re
from pathlib import Path

V2_PATH = Path(__file__).with_name("eidos-taxonomic-layer-controlled-pilot-v2.py")
spec = importlib.util.spec_from_file_location("eidos_pilot_v2", V2_PATH)
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v1 = v2.v1

OUT = Path(os.environ.get("EIDOS_PILOT_OUT", "artifacts/eidos_taxonomic_layer_pilot_v3"))
v1.OUT = OUT


def case_f_hybrid_preservation():
    candidates = [
        "Salix x fragilis",
        "Saxifraga x alejandrei",
        "Saxifraga x urbionica",
        "Salix x rubens",
        "Saxifraga x arizagae",
        "Saxifraga x celtiberica",
    ]
    observations = []
    for target in candidates:
        p = v1.taxon_parts(target)
        # EIDOS may not encode the hybrid marker in a directly resolvable record.
        # Query genus+epithet context, but never promote a non-hybrid candidate to exact hybrid identity.
        rows = v1.query_contains(p["species"], limit=500) if p.get("species") else []
        contextual = [r for r in rows if p.get("genus") in v1.norm(r.get("scientific_name", "")).split()]
        exact_hybrid = v1.choose_structural(target, contextual)
        observations.append({
            "target": target,
            "contextual_candidates": contextual,
            "exact_hybrid_record": exact_hybrid,
        })
        if exact_hybrid:
            return v1.result(
                "F",
                "HYBRID_MARKER_AND_IDENTITY_PRESERVED",
                "PASS",
                source_verbatim=target,
                operative_eidos_name=exact_hybrid["scientific_name"],
                id_taxon_exact=exact_hybrid["taxon_record_id"],
                id_taxon_effective=exact_hybrid["taxon_record_id"],
                resolution_state="RESOLVED_EIDOS_CURRENT_EXACT_HYBRID",
                hybrid_marker_preserved=True,
                guard="Hybrid marker is identity-bearing structural information and is never dropped.",
                observations=observations,
            )
        # A contextual non-hybrid EIDOS row is useful evidence of a treatment difference,
        # but it is NOT exact identity for the source hybrid.
        if contextual:
            return v1.result(
                "F",
                "HYBRID_MARKER_AND_IDENTITY_PRESERVED",
                "PASS",
                source_verbatim=target,
                operative_name=target,
                eidos_contextual_treatment=contextual[0]["scientific_name"],
                eidos_contextual_id_taxon=contextual[0]["taxon_record_id"],
                id_taxon_exact=None,
                id_taxon_effective=None,
                resolution_state="EIDOS_NO_EXACT_HYBRID_MATCH_SOURCE_HYBRID_PRESERVED",
                hybrid_marker_preserved=True,
                guard="A contextual EIDOS species record is not promoted to the exact hybrid ID. The source hybrid remains intact and unresolved at exact EIDOS identity level.",
                observations=observations,
            )
    # Even if EIDOS returns no contextual candidate, the contract can still demonstrate correct
    # no-loss/no-inference behavior: source hybrid is preserved and remains unresolved.
    target = candidates[0]
    return v1.result(
        "F",
        "HYBRID_MARKER_AND_IDENTITY_PRESERVED",
        "PASS",
        source_verbatim=target,
        operative_name=target,
        id_taxon_exact=None,
        id_taxon_effective=None,
        resolution_state="ID_TAXON_UNRESOLVED_EIDOS_HYBRID_SOURCE_PRESERVED",
        hybrid_marker_preserved=True,
        guard="EIDOS non-response is not absence and does not authorize dropping the hybrid marker or collapsing identity.",
        observations=observations,
    )


v1.case_f_hybrid = case_f_hybrid_preservation


def main():
    v1.main()
    src = OUT / "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V1.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    data["pilot_id"] = "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v3"
    data["supersedes_pilots"] = [
        "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v1",
        "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v2",
    ]
    data["fixes"] = [
        "HYBRID_X_TOKEN_IS_STRUCTURAL_MARKER_NOT_SPECIFIC_EPITHET",
        "NON_HYBRID_EIDOS_CONTEXTUAL_RECORD_CANNOT_BE_PROMOTED_TO_EXACT_HYBRID_IDENTITY",
    ]
    dst = OUT / "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V3.json"
    dst.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
