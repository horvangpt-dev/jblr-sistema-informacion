#!/usr/bin/env python3
import json, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import secondary_web_synonymy_185_v3 as v3

core = v3.core
ROOT_GROUP = core.ROOT_GROUP
TOP4_KEYS = [
    "FLORA_MONTIBERICA",
    "JOLUBE_BOTANICAL_CATALOGS",
    "ARANZADI_MUNIBE",
    "FLORA_CATALANA",
]


def top4_sources():
    by_key = {s["key"]: s for s in core.SOURCES}
    missing = [k for k in TOP4_KEYS if k not in by_key]
    if missing:
        raise RuntimeError(f"missing TOP4 source definitions: {missing}")
    return [by_key[k] for k in TOP4_KEYS]


def process_taxon(row, eidx, sources):
    bid = str(row["B_SOURCE_RECORD_ID"])
    seed = row["name"]
    required_rank = core.rank_of(seed)
    seed_key = core.norm(core.canonical(seed))

    source_runs = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(v3.broad_source_hits, seed, s, 6): s for s in sources}
        for fut in as_completed(futs):
            src = futs[fut]
            try:
                source_runs.append(fut.result())
            except Exception as e:
                source_runs.append({
                    "source": src["key"], "domain": src["domain"],
                    "searchErrors": [{"error": f"WORKER:{type(e).__name__}:{e}"}],
                    "searchResults": [], "explicitSynonymyPages": [], "fetchFailures": []
                })
    source_runs.sort(key=lambda x: TOP4_KEYS.index(x["source"]))

    comp = {}
    for sr in source_runs:
        for page in sr.get("explicitSynonymyPages", []):
            for name in page.get("names", []):
                c = core.canonical(name)
                k = core.norm(c)
                if not k or k == seed_key:
                    continue
                ent = comp.setdefault(k, {"name": c, "sourceKeys": set(), "evidence": []})
                ent["sourceKeys"].add(sr["source"])
                ent["evidence"].append({
                    "source": sr["source"],
                    "url": page.get("url"),
                    "pagePrimary": page.get("pagePrimary"),
                    "discoverySeed": seed,
                    "relationExtraction": page.get("relationExtraction", "EXPLICIT_SYNONYMY_SECTION"),
                    "windows": page.get("windows", [])[:3],
                })

    comp_rows = []
    for ent in comp.values():
        comp_rows.append({
            "name": ent["name"],
            "sourceCount": len(ent["sourceKeys"]),
            "sources": sorted(ent["sourceKeys"]),
            "evidence": ent["evidence"],
        })
    comp_rows.sort(key=lambda x: (-x["sourceCount"], x["name"].lower()))

    eidos_rows = []
    for ordinal, c in enumerate(comp_rows, 1):
        ev = core.eval_eidos(eidx, c["name"], required_rank)
        ev.update({
            "synonymOrdinal": ordinal,
            "sourceCount": c["sourceCount"],
            "sources": c["sources"],
            "discoveredRank": core.rank_of(c["name"]),
        })
        eidos_rows.append(ev)

    assert len(eidos_rows) == len(comp_rows)
    ids = sorted({e["taxonID"] for e in eidos_rows if e.get("taxonID")})
    any_relation = bool(comp_rows)
    any_search_failure = any(sr.get("searchErrors") for sr in source_runs)

    if len(ids) == 1:
        group, tid = "RESOLVED_UNIQUE_EIDOS_ID_FROM_TOP4_SYNONYMY", ids[0]
    elif len(ids) > 1:
        group, tid = "MULTIPLE_EIDOS_IDS_FROM_TOP4_REQUIRES_RELATION_CRIB", None
    elif any_relation:
        states = {e["state"] for e in eidos_rows}
        if "MULTIPLE_ACCEPTED_SAME_RANK" in states:
            group = "TOP4_EIDOS_MULTIPLE_ACCEPTED_SAME_RANK"
        elif "SAME_RANK_PRESENT_NO_ACCEPTED" in states:
            group = "TOP4_SYNONYMS_EIDOS_SAME_RANK_NO_ACCEPTED"
        elif "ONLY_OTHER_RANKS_PRESENT" in states:
            group = "TOP4_SYNONYMS_EIDOS_ONLY_OTHER_RANKS"
        else:
            group = "TOP4_SYNONYMS_NOT_FOUND_IN_EIDOS"
        tid = None
    elif any_search_failure:
        group, tid = "NO_TOP4_SYNONYMS_WITH_SOURCE_FAILURES", None
    else:
        group, tid = "NO_TOP4_SYNONYMS_FOUND", None

    return {
        "B_SOURCE_RECORD_ID": bid,
        "NOMBRE_RIOJA_VERBATIM": seed,
        "RANK": required_rank,
        "FINAL_GROUP": group,
        "MITECO_IDTAXON": tid,
        "UNIQUE_SYNONYM_COUNT": len(comp_rows),
        "EIDOS_QUERY_COUNT": len(eidos_rows),
        "SYNONYMY_COMPENDIUM": comp_rows,
        "EIDOS_UNIQUE_NAME_QUERIES": eidos_rows,
        "SOURCE_RUNS": source_runs,
        "SEED_EXCLUDED_FROM_SYNONYMS": True,
        "NO_FUZZY_EQUIVALENCE": True,
        "PARENT_ID_INHERITANCE": False,
        "NO_RANK_COLLAPSE": True,
    }


def main(groups_path, eidos_path, outdir):
    data = json.loads(Path(groups_path).read_text(encoding="utf-8"))
    rows = data["groups"][ROOT_GROUP]
    assert len(rows) == 185, len(rows)
    sources = top4_sources()
    eidx, emeta = core.build_eidos(eidos_path)

    results = [None] * len(rows)
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(process_taxon, row, eidx, sources): i for i, row in enumerate(rows)}
        done = 0
        for fut in as_completed(futs):
            i = futs[fut]
            row = rows[i]
            try:
                r = fut.result()
            except Exception as e:
                r = {
                    "B_SOURCE_RECORD_ID": str(row["B_SOURCE_RECORD_ID"]),
                    "NOMBRE_RIOJA_VERBATIM": row["name"],
                    "RANK": core.rank_of(row["name"]),
                    "FINAL_GROUP": "EXECUTION_FAILURE_TAXON",
                    "MITECO_IDTAXON": None,
                    "ERROR": f"{type(e).__name__}:{e}",
                    "UNIQUE_SYNONYM_COUNT": 0,
                    "EIDOS_QUERY_COUNT": 0,
                    "SYNONYMY_COMPENDIUM": [],
                    "EIDOS_UNIQUE_NAME_QUERIES": [],
                    "SOURCE_RUNS": [],
                    "SEED_EXCLUDED_FROM_SYNONYMS": True,
                    "NO_FUZZY_EQUIVALENCE": True,
                    "PARENT_ID_INHERITANCE": False,
                    "NO_RANK_COLLAPSE": True,
                }
            results[i] = r
            done += 1
            print(f"[{done:03d}/185] {r['B_SOURCE_RECORD_ID']} {r['NOMBRE_RIOJA_VERBATIM']} => {r['FINAL_GROUP']} {r.get('MITECO_IDTAXON') or ''}", flush=True)

    assert all(r is not None for r in results)
    groups = {}
    for r in results:
        groups.setdefault(r["FINAL_GROUP"], []).append(r)

    source_stats = {s["key"]: {"taxaQueried": 185, "searchFailureTaxa": 0, "searchHitTaxa": 0, "explicitSynonymyTaxa": 0, "explicitPages": 0, "fetchFailures": 0} for s in sources}
    for r in results:
        for sr in r.get("SOURCE_RUNS", []):
            st = source_stats[sr["source"]]
            if sr.get("searchErrors"): st["searchFailureTaxa"] += 1
            if sr.get("searchResults"): st["searchHitTaxa"] += 1
            if sr.get("explicitSynonymyPages"): st["explicitSynonymyTaxa"] += 1
            st["explicitPages"] += len(sr.get("explicitSynonymyPages", []))
            st["fetchFailures"] += len(sr.get("fetchFailures", []))

    unique_synonym_queries = sum(r["UNIQUE_SYNONYM_COUNT"] for r in results)
    eidos_queries = sum(r["EIDOS_QUERY_COUNT"] for r in results)
    assert unique_synonym_queries == eidos_queries
    assert all(r["UNIQUE_SYNONYM_COUNT"] == r["EIDOS_QUERY_COUNT"] for r in results)
    assert all(core.norm(core.canonical(r["NOMBRE_RIOJA_VERBATIM"])) not in {core.norm(core.canonical(x["name"])) for x in r["SYNONYMY_COMPENDIUM"]} for r in results)

    receipt = {
        "runClass": "CORPUS_B_FAST_TOP4_SYNONYMY_185_TO_EIDOS",
        "releaseEvent": "JBLR-EVT-0000-20260824-RELEASE-09-TOP4-FAST-SYNONYMY-185-001",
        "inputRows": 185,
        "outputRows": 185,
        "resolvedRows": sum(1 for r in results if r.get("MITECO_IDTAXON")),
        "groupCounts": {k: len(v) for k, v in groups.items()},
        "primaryPassSources": TOP4_KEYS,
        "other11Sources": "EXTRAORDINARY_RESCUE_ONLY_NOT_USED_IN_PRIMARY_PASS",
        "sourceStats": source_stats,
        "uniqueSynonymQueriesAcrossTaxa": unique_synonym_queries,
        "eidosQueryCountAcrossTaxa": eidos_queries,
        "perTaxonUniqueSynonymEqualsEidosQueries": True,
        "seedExcludedFromSynonymCompendium": True,
        "eidosSource": "https://datos.iepnb.es/datasets/eidos.ttl",
        "eidosBytes": emeta["bytes"],
        "eidosSha256": emeta["sha256"],
        "singleEidosLoad": True,
        "deduplicateNamesPerTaxonBeforeEidos": True,
        "sourceCountPreserved": True,
        "queryEveryUniqueDiscoveredNameOnce": True,
        "crossWithA": False,
        "neonWrites": 0,
        "corpusBFreeze": False,
        "noFuzzy": True,
        "noParentIdInheritance": True,
        "noRankCollapse": True,
        "semantics": ["SOURCE_FAILURE!=NOT_FOUND", "NOT_FOUND!=ABSENCE", "NO_SILENT_INFERENCE", "DISCOVERY_CANDIDATE!=VALIDATED_SYNONYM"],
    }

    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "RUN_RECEIPT.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "FAST_TOP4_COMPENDIUM_185.json").write_text(json.dumps({"receipt": receipt, "rows": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "GROUPED_RESULTS_185.json").write_text(json.dumps({"receipt": receipt, "groups": groups}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "RESOLVED_185.json").write_text(json.dumps({"receipt": receipt, "rows": [r for r in results if r.get("MITECO_IDTAXON")]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:4])
