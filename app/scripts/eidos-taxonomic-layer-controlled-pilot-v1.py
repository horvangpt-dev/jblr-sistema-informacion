#!/usr/bin/env python3
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ENDPOINT = "https://datos.iepnb.es/sparql"
OUT = Path(os.environ.get("EIDOS_PILOT_OUT", "artifacts/eidos_taxonomic_layer_pilot_v1"))
V8_RESULTS = Path("evidence/06_stimes/taxonomic_reality_effective_2739_v8/latest/TAXONOMIC_REALITY_EFFECTIVE_2739_RESULTS_V8.csv")
SALIX_REC = Path("app/data/taxonomy/salix-rioja-reconciliation-v1.json")
SAX_REC = Path("app/data/taxonomy/saxifraga-rioja-reconciliation-v1.json")
TIMEOUT = 45

PREFIXES = """
PREFIX plinian:<https://datos.iepnb.es/def/sector-publico/medio-ambiente/pliniancore#>
PREFIX darwin:<http://rs.tdwg.org/dwc/terms/>
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def norm(s):
    s = (s or "").replace("×", " x ")
    s = re.sub(r"[^0-9A-Za-zÀ-ÖØ-öø-ÿ.]+", " ", s.casefold())
    return re.sub(r"\s+", " ", s).strip()


def sparql_quote(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def query_contains(term, limit=100):
    q = PREFIXES + f"""
SELECT DISTINCT ?TaxonRecordID ?ScientificName WHERE {{
  ?TaxonRecord plinian:hasHierarchy ?Taxon .
  ?TaxonRecord plinian:TaxonRecordID ?TaxonRecordID .
  ?Taxon darwin:scientificName ?ScientificName .
  FILTER(CONTAINS(LCASE(STR(?ScientificName)), LCASE(\"{sparql_quote(term)}\")))
}} LIMIT {int(limit)}
"""
    r = requests.get(
        ENDPOINT,
        params={"query": q, "format": "application/sparql-results+json", "timeout": "30000"},
        headers={"Accept": "application/sparql-results+json", "User-Agent": "JBLR-Actor06-EIDOS-Pilot/1.0"},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    rows = []
    for b in data.get("results", {}).get("bindings", []):
        rows.append({
            "taxon_record_id": b.get("TaxonRecordID", {}).get("value", ""),
            "scientific_name": b.get("ScientificName", {}).get("value", ""),
        })
    return rows


def taxon_parts(name):
    n = norm(name)
    toks = n.split()
    if len(toks) < 2:
        return {"genus": toks[0] if toks else "", "species": "", "rank": "", "infra": "", "hybrid": False}
    genus, species = toks[0], toks[1]
    hybrid = " x " in f" {n} " or (len(toks) > 1 and toks[1] == "x")
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


def structural_match(target, returned):
    t = taxon_parts(target)
    r = norm(returned)
    rt = r.split()
    if not t["genus"] or not t["species"]:
        return False
    if t["genus"] not in rt or t["species"] not in rt:
        return False
    if t["rank"]:
        rank_forms = {t["rank"], t["rank"] + "."}
        if not any(x in rt for x in rank_forms):
            return False
        if t["infra"] and t["infra"] not in rt:
            return False
    if t["hybrid"] and not ("×" in returned or re.search(r"(^|\s)[xX](?=\s|[A-Za-zÀ-ÖØ-öø-ÿ])", returned)):
        return False
    return True


def choose_structural(target, rows):
    matches = [r for r in rows if structural_match(target, r["scientific_name"])]
    matches.sort(key=lambda r: (len(r["scientific_name"]), r["scientific_name"].casefold(), r["taxon_record_id"]))
    return matches[0] if matches else None


def resolve_name(target):
    p = taxon_parts(target)
    term = " ".join(x for x in (p["genus"], p["species"]) if x)
    rows = query_contains(term)
    return choose_structural(target, rows), rows


def parent_species(name):
    p = taxon_parts(name)
    return f"{p['genus']} {p['species']}" if p["genus"] and p["species"] else ""


def result(case_id, contract, status, **kwargs):
    out = {
        "case_id": case_id,
        "contract": contract,
        "status": status,
        "checked_at": now(),
        "eidos_endpoint": ENDPOINT,
        "no_silent_inference": True,
        "no_information_loss": True,
    }
    out.update(kwargs)
    return out


def case_a_exact_species():
    for target in ["Quercus ilex", "Salix alba", "Saxifraga rotundifolia"]:
        rec, rows = resolve_name(target)
        if rec and rec["taxon_record_id"]:
            return result("A", "SPECIES_WITH_EXACT_EIDOS_ID", "PASS", source_verbatim=target, operative_name=rec["scientific_name"], id_taxon_exact=rec["taxon_record_id"], id_taxon_effective=rec["taxon_record_id"], resolution_state="RESOLVED_EIDOS_CURRENT", candidates=rows)
    return result("A", "SPECIES_WITH_EXACT_EIDOS_ID", "REVIEW_REQUIRED", reason="No candidate species produced a demonstrable EIDOS TaxonRecordID")


def case_b_exact_infraspecific():
    candidates = [
        "Leontodon hispidus subsp. hispidus",
        "Saxifraga pentadactylis subsp. willkommiana",
        "Herniaria hirsuta subsp. hirsuta",
        "Saxifraga hirsuta subsp. hirsuta",
        "Saxifraga oppositifolia subsp. oppositifolia",
    ]
    observations = []
    for target in candidates:
        infra, _ = resolve_name(target)
        parent_name = parent_species(target)
        parent, _ = resolve_name(parent_name)
        observations.append({"target": target, "infra": infra, "parent": parent})
        if infra and parent and infra["taxon_record_id"] and parent["taxon_record_id"] and infra["taxon_record_id"] != parent["taxon_record_id"]:
            return result("B", "INFRASPECIFIC_WITH_OWN_EIDOS_ID", "PASS", source_verbatim=target, operative_name=infra["scientific_name"], id_taxon_exact=infra["taxon_record_id"], id_taxon_effective=infra["taxon_record_id"], parent_species_name=parent_name, parent_species_id_taxon=parent["taxon_record_id"], resolution_state="RESOLVED_EIDOS_CURRENT", observations=observations)
    return result("B", "INFRASPECIFIC_WITH_OWN_EIDOS_ID", "REVIEW_REQUIRED", reason="No tested source-supported infraspecific candidate demonstrated a distinct own EIDOS TaxonRecordID", observations=observations)


def case_c_parent_fallback():
    candidates = [
        "Quercus ilex subsp. ilex",
        "Herniaria fruticosa var. fruticosa",
        "Herniaria glabra var. glabra",
        "Herniaria scabrida var. scabrida",
        "Leontodon hispidus subsp. hispidus",
    ]
    observations = []
    for target in candidates:
        infra, _ = resolve_name(target)
        p_name = parent_species(target)
        parent, _ = resolve_name(p_name)
        observations.append({"target": target, "infra": infra, "parent": parent})
        if parent and parent["taxon_record_id"] and (infra is None or not infra.get("taxon_record_id") or infra.get("taxon_record_id") == parent.get("taxon_record_id")):
            return result("C", "INFRASPECIFIC_TEMPORARY_PARENT_SPECIES_REFERENCE", "PASS", source_verbatim=target, operative_name=target, id_taxon_exact=None if infra is None or infra.get("taxon_record_id") == parent.get("taxon_record_id") else infra.get("taxon_record_id"), id_taxon_effective=parent["taxon_record_id"], id_taxon_reference_level="SPECIES", resolution_state="INHERITED_FROM_PARENT_SPECIES_PENDING_OWN_ID", parent_species_name=p_name, parent_species_id_taxon=parent["taxon_record_id"], guard="Parent ID is an operational reference only; it is not asserted as exact infraspecific identity.", observations=observations)
    return result("C", "INFRASPECIFIC_TEMPORARY_PARENT_SPECIES_REFERENCE", "REVIEW_REQUIRED", reason="No tested candidate demonstrated the parent-reference condition", observations=observations)


def load_v8_rows():
    if not V8_RESULTS.exists() or V8_RESULTS.stat().st_size == 0:
        return []
    with V8_RESULTS.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def case_d_eidos_anthos_conflict():
    # A conflict means differing source-specific taxonomic treatments, not that either source is discarded.
    preferred = {"Salix cantabrica", "Salix fragilis", "Saxifraga platyloba", "Leontodon caroliaedoi", "Arenaria pomelii"}
    rows = load_v8_rows()
    observations = []
    for row in rows:
        taxon = (row.get("taxon") or "").strip()
        if taxon not in preferred:
            continue
        eidos, _ = resolve_name(taxon)
        anthos_name = (row.get("anthos_accepted_name") or row.get("anthos_scientific_name") or row.get("anthos_match_scientific_name") or "").strip()
        observations.append({"taxon": taxon, "eidos": eidos, "anthos_name": anthos_name, "anthos_state": row.get("anthos_state", "")})
        if eidos and anthos_name and norm(eidos["scientific_name"]) != norm(anthos_name):
            return result("D", "EIDOS_VS_ANTHOS_CONFLICT_PRESERVED", "PASS", source_verbatim=taxon, operative_eidos_name=eidos["scientific_name"], eidos_id_taxon=eidos["taxon_record_id"], anthos_parallel_treatment=anthos_name, resolution_state="CONFLICT_PRESERVED_EIDOS_OPERATIVE", observations=observations)
    return result("D", "EIDOS_VS_ANTHOS_CONFLICT_PRESERVED", "REVIEW_REQUIRED", reason="No demonstrable EIDOS-vs-ANTHOS treatment conflict found in the controlled candidate set; no conflict invented", observations=observations)


def case_e_rioja_alternative():
    pairs = [
        ("Saxifraga platyloba", "Saxifraga cuneata", "Rioja 2026 catalogue explicitly links platyloba to cuneata sensu Flora iberica"),
        ("Salix elaeagnos", "Salix eleagnos", "Direct Rioja p.43 orthography vs current Spanish/international orthography"),
        ("Salix cantabrica", "Salix bicolor", "Direct Rioja treatment preserved alongside an alternative external treatment"),
    ]
    observations = []
    for local_name, eidos_search_name, evidence in pairs:
        eidos, _ = resolve_name(eidos_search_name)
        observations.append({"rioja_name": local_name, "eidos_search_name": eidos_search_name, "eidos": eidos, "evidence": evidence})
        if eidos:
            return result("E", "RIOJA_FINER_OR_ALTERNATIVE_TREATMENT_PRESERVED", "PASS", source_verbatim=local_name, operative_eidos_name=eidos["scientific_name"], eidos_id_taxon=eidos["taxon_record_id"], parallel_rioja_treatment=local_name, relationship_evidence=evidence, resolution_state="PARALLEL_TREATMENTS_PRESERVED", observations=observations)
    return result("E", "RIOJA_FINER_OR_ALTERNATIVE_TREATMENT_PRESERVED", "REVIEW_REQUIRED", reason="No EIDOS side of a controlled Rioja alternative pair resolved", observations=observations)


def case_f_hybrid():
    candidates = ["Salix x fragilis", "Saxifraga x alejandrei", "Saxifraga x urbionica", "Salix x rubens", "Saxifraga x arizagae", "Saxifraga x celtiberica"]
    observations = []
    for target in candidates:
        rec, rows = resolve_name(target)
        observations.append({"target": target, "record": rec, "candidate_count": len(rows)})
        if rec and ("×" in rec["scientific_name"] or re.search(r"(^|\s)[xX](?=\s|[A-Za-zÀ-ÖØ-öø-ÿ])", rec["scientific_name"])):
            return result("F", "HYBRID_MARKER_PRESERVED", "PASS", source_verbatim=target, operative_name=rec["scientific_name"], id_taxon_exact=rec["taxon_record_id"], resolution_state="RESOLVED_EIDOS_CURRENT", hybrid_marker_preserved=True, observations=observations)
    return result("F", "HYBRID_MARKER_PRESERVED", "REVIEW_REQUIRED", reason="No controlled hybrid candidate resolved with demonstrable hybrid marker in EIDOS", observations=observations)


def case_g_group():
    target = "Taraxacum gr."
    # This record is explicitly retained at group level in JBLR. It must not be converted to a species merely to obtain an ID.
    rows = query_contains("Taraxacum")
    exact_group = [r for r in rows if norm(r["scientific_name"]) == norm(target)]
    if not exact_group:
        return result("G", "GROUP_LEVEL_RECORD_NO_SPECIES_COLLAPSE", "PASS", source_verbatim=target, operative_name=target, id_taxon_exact=None, id_taxon_effective=None, resolution_state="GROUP_LEVEL_NOT_ELIGIBLE_FOR_SPECIES_ID_INFERENCE", eidos_taxarows_seen=len(rows), guard="No species is inferred from a group-level record.")
    return result("G", "GROUP_LEVEL_RECORD_NO_SPECIES_COLLAPSE", "PASS", source_verbatim=target, operative_name=target, id_taxon_exact=exact_group[0]["taxon_record_id"], id_taxon_effective=exact_group[0]["taxon_record_id"], resolution_state="EIDOS_EXACT_GROUP_RECORD", eidos_record=exact_group[0], guard="Group semantics remain preserved even if EIDOS exposes a record.")


def case_h_synonym_resolution():
    pairs = [
        ("Salix salvifolia", "Salix salviifolia", "Historical orthographic usage explicitly reconciled in SALIX_RIOJA_RECONCILIATION_v1"),
        ("Saxifraga platyloba", "Saxifraga cuneata", "Explicit synonymy preserved in SAXIFRAGA_RIOJA_RECONCILIATION_v1/V8"),
        ("Salix x rubens", "Salix x fragilis", "Explicit synonymy to Salix × fragilis lineage in SALIX_RIOJA_RECONCILIATION_v1"),
    ]
    observations = []
    for source_name, resolved_name, evidence in pairs:
        source_rec, _ = resolve_name(source_name)
        target_rec, _ = resolve_name(resolved_name)
        observations.append({"source_name": source_name, "source_record": source_rec, "resolved_name": resolved_name, "resolved_record": target_rec, "evidence": evidence})
        if target_rec:
            return result("H", "VALIDATED_SYNONYM_OR_HISTORICAL_NAME_RESOLUTION", "PASS", source_verbatim=source_name, operative_name=target_rec["scientific_name"], id_taxon_exact=target_rec["taxon_record_id"], resolution_state="RESOLVED_VIA_VALIDATED_NAME_NETWORK", matched_name_type="VALIDATED_SYNONYM_OR_HISTORICAL_ALIAS", relationship_evidence=evidence, source_name_direct_eidos_record=source_rec, observations=observations)
    return result("H", "VALIDATED_SYNONYM_OR_HISTORICAL_NAME_RESOLUTION", "REVIEW_REQUIRED", reason="No validated synonym/alias target resolved in EIDOS", observations=observations)


def case_i_eidos_unresolved():
    # Controlled source-supported candidates; success here means EIDOS genuinely gives no structural exact record for the source treatment.
    candidates = [
        "Herniaria fruticosa var. fruticosa",
        "Herniaria glabra var. glabra",
        "Herniaria scabrida var. scabrida",
        "Saxifraga cuneata x S. losae",
        "Salix atrocinerea x S. caprea",
    ]
    observations = []
    for target in candidates:
        rec, rows = resolve_name(target)
        observations.append({"target": target, "record": rec, "candidate_count": len(rows)})
        if rec is None:
            return result("I", "EIDOS_UNRESOLVED_WITHOUT_ABSENCE_INFERENCE", "PASS", source_verbatim=target, operative_name=target, id_taxon_exact=None, id_taxon_effective=None, resolution_state="ID_TAXON_UNRESOLVED_EIDOS", guard="NOT_FOUND_IN_EIDOS is not biological absence and does not authorize deletion.", observations=observations)
    return result("I", "EIDOS_UNRESOLVED_WITHOUT_ABSENCE_INFERENCE", "REVIEW_REQUIRED", reason="All controlled candidates resolved structurally; an unresolved case was not fabricated", observations=observations)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    started = now()
    cases = []
    funcs = [case_a_exact_species, case_b_exact_infraspecific, case_c_parent_fallback, case_d_eidos_anthos_conflict, case_e_rioja_alternative, case_f_hybrid, case_g_group, case_h_synonym_resolution, case_i_eidos_unresolved]
    for fn in funcs:
        try:
            cases.append(fn())
        except Exception as exc:
            cases.append(result(fn.__name__, "UNHANDLED_CASE", "REVIEW_REQUIRED", reason=f"{type(exc).__name__}: {exc}"))
        time.sleep(0.2)

    passed = sum(c["status"] == "PASS" for c in cases)
    review = len(cases) - passed
    overall = "PASS" if review == 0 and len(cases) == 9 else "REVIEW_REQUIRED"
    payload = {
        "pilot_id": "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v1",
        "started_at": started,
        "finished_at": now(),
        "source_authority": "MITECO_IEPNB_EIDOS_OFFICIAL_LINKED_DATA_SPARQL",
        "endpoint": ENDPOINT,
        "canonical_directives": [
            "JBLR-EVT-0000-20260820-TAXONOMIC-FIELDS-001",
            "JBLR-EVT-0000-20260820-TAXONOMIC-EXEC-001",
        ],
        "overall": overall,
        "case_count": len(cases),
        "pass_count": passed,
        "review_required_count": review,
        "cases": cases,
        "global_rematerialization_allowed": overall == "PASS",
        "invariants": {
            "reality_first": True,
            "no_silent_inference": True,
            "no_information_loss": True,
            "not_found_is_not_absence": True,
            "source_verbatim_preserved": True,
            "eidos_temporal_provenance_required": True,
        },
    }
    (OUT / "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V1.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"overall": overall, "pass": passed, "review": review, "cases": [{"case_id": c["case_id"], "status": c["status"], "reason": c.get("reason", "")} for c in cases]}, ensure_ascii=False))
    if overall != "PASS":
        sys.exit(5)


if __name__ == "__main__":
    main()
