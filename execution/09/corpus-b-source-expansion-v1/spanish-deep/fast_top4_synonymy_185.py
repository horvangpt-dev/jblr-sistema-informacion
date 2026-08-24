#!/usr/bin/env python3
import gzip
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import seed_bound_synonymy_recovery_v1 as strict

core = strict.core
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
        futs = {ex.submit(strict.strict_source_hits, seed, s, 6): s for s in sources}
        for fut in as_completed(futs):
            src = futs[fut]
            try:
                source_runs.append(fut.result())
            except Exception as exc:
                source_runs.append({
                    "source": src["key"],
                    "domain": src["domain"],
                    "searchErrors": [{"error": f"WORKER:{type(exc).__name__}:{exc}"}],
                    "searchResults": [],
                    "explicitSynonymyPages": [],
                    "fetchFailures": [],
                    "strictSeedBound": True,
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
                ent = comp.setdefault(k, {
                    "name": c,
                    "sourceKeys": set(),
                    "evidence": [],
                })
                ent["sourceKeys"].add(sr["source"])
                ent["evidence"].append({
                    "source": sr["source"],
                    "url": page.get("url"),
                    "pagePrimary": page.get("pagePrimary"),
                    "discoverySeed": seed,
                    "relationExtraction": page.get(
                        "relationExtraction",
                        "SEED_BOUND_EXPLICIT_RELATION_V1",
                    ),
                    "relationEvidence": page.get("relationEvidence", []),
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
    for ordinal, candidate in enumerate(comp_rows, 1):
        ev = core.eval_eidos(eidx, candidate["name"], required_rank)
        ev.update({
            "synonymOrdinal": ordinal,
            "sourceCount": candidate["sourceCount"],
            "sources": candidate["sources"],
            "discoveredRank": core.rank_of(candidate["name"]),
        })
        eidos_rows.append(ev)

    assert len(eidos_rows) == len(comp_rows)
    ids = sorted({e["taxonID"] for e in eidos_rows if e.get("taxonID")})
    any_relation = bool(comp_rows)
    any_search_failure = any(sr.get("searchErrors") for sr in source_runs)

    if len(ids) == 1:
        group, tid = "RESOLVED_UNIQUE_EIDOS_ID_FROM_SEED_BOUND_TOP4_SYNONYMY", ids[0]
    elif len(ids) > 1:
        group, tid = "MULTIPLE_EIDOS_IDS_FROM_SEED_BOUND_TOP4_REQUIRES_RELATION_CRIB", None
    elif any_relation:
        states = {e["state"] for e in eidos_rows}
        if "MULTIPLE_ACCEPTED_SAME_RANK" in states:
            group = "SEED_BOUND_TOP4_EIDOS_MULTIPLE_ACCEPTED_SAME_RANK"
        elif "SAME_RANK_PRESENT_NO_ACCEPTED" in states:
            group = "SEED_BOUND_TOP4_SYNONYMS_EIDOS_SAME_RANK_NO_ACCEPTED"
        elif "ONLY_OTHER_RANKS_PRESENT" in states:
            group = "SEED_BOUND_TOP4_SYNONYMS_EIDOS_ONLY_OTHER_RANKS"
        else:
            group = "SEED_BOUND_TOP4_SYNONYMS_NOT_FOUND_IN_EIDOS"
        tid = None
    elif any_search_failure:
        group, tid = "NO_SEED_BOUND_TOP4_SYNONYMS_WITH_SOURCE_FAILURES", None
    else:
        group, tid = "NO_SEED_BOUND_TOP4_SYNONYMS_FOUND", None

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
        "SEED_BOUND_EXPLICIT_RELATION": True,
        "DISCOVERY_CANDIDATE_IS_VALIDATED_SYNONYM": False,
        "NO_FUZZY_EQUIVALENCE": True,
        "PARENT_ID_INHERITANCE": False,
        "NO_RANK_COLLAPSE": True,
    }


def compact_candidate(candidate):
    return {
        "name": candidate["name"],
        "sourceCount": candidate["sourceCount"],
        "sources": candidate["sources"],
        "relationEvidenceCount": sum(
            len(ev.get("relationEvidence", []))
            for ev in candidate.get("evidence", [])
        ),
    }


def compact_eidos(row):
    return {
        "name": row["name"],
        "state": row["state"],
        "taxonID": row.get("taxonID"),
        "sourceCount": row["sourceCount"],
        "sources": row["sources"],
        "discoveredRank": row["discoveredRank"],
    }


def compact_row(row):
    return {
        "B_SOURCE_RECORD_ID": row["B_SOURCE_RECORD_ID"],
        "NOMBRE_RIOJA_VERBATIM": row["NOMBRE_RIOJA_VERBATIM"],
        "RANK": row["RANK"],
        "FINAL_GROUP": row["FINAL_GROUP"],
        "MITECO_IDTAXON": row.get("MITECO_IDTAXON"),
        "UNIQUE_SYNONYM_COUNT": row["UNIQUE_SYNONYM_COUNT"],
        "EIDOS_QUERY_COUNT": row["EIDOS_QUERY_COUNT"],
        "CANDIDATES": [compact_candidate(x) for x in row["SYNONYMY_COMPENDIUM"]],
        "EIDOS_OUTCOMES": [compact_eidos(x) for x in row["EIDOS_UNIQUE_NAME_QUERIES"]],
        "SEED_BOUND_EXPLICIT_RELATION": True,
    }


def write_gzip_json(path, payload):
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    data = path.read_bytes()
    return {
        "file": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def main(groups_path, eidos_path, outdir, request_path):
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    assert request["enabled"] is True
    assert request["scope"] == 185
    assert request["supersedesRun"] == 32723005903
    assert request["relaunchAsIs"] is False
    assert request["seedBoundExplicitRelationRequired"] is True
    assert request["boundedPersistenceRequired"] is True
    assert request["primaryPassSources"] == TOP4_KEYS
    assert request["crossWithA"] is False
    assert request["neonWrites"] == 0
    assert request["corpusBFreeze"] is False

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
                result = fut.result()
            except Exception as exc:
                result = {
                    "B_SOURCE_RECORD_ID": str(row["B_SOURCE_RECORD_ID"]),
                    "NOMBRE_RIOJA_VERBATIM": row["name"],
                    "RANK": core.rank_of(row["name"]),
                    "FINAL_GROUP": "EXECUTION_FAILURE_TAXON",
                    "MITECO_IDTAXON": None,
                    "ERROR": f"{type(exc).__name__}:{exc}",
                    "UNIQUE_SYNONYM_COUNT": 0,
                    "EIDOS_QUERY_COUNT": 0,
                    "SYNONYMY_COMPENDIUM": [],
                    "EIDOS_UNIQUE_NAME_QUERIES": [],
                    "SOURCE_RUNS": [],
                    "SEED_EXCLUDED_FROM_SYNONYMS": True,
                    "SEED_BOUND_EXPLICIT_RELATION": True,
                    "DISCOVERY_CANDIDATE_IS_VALIDATED_SYNONYM": False,
                    "NO_FUZZY_EQUIVALENCE": True,
                    "PARENT_ID_INHERITANCE": False,
                    "NO_RANK_COLLAPSE": True,
                }
            results[i] = result
            done += 1
            print(
                f"[{done:03d}/185] {result['B_SOURCE_RECORD_ID']} "
                f"{result['NOMBRE_RIOJA_VERBATIM']} => "
                f"{result['FINAL_GROUP']} {result.get('MITECO_IDTAXON') or ''}",
                flush=True,
            )

    assert all(r is not None for r in results)
    assert all(r["UNIQUE_SYNONYM_COUNT"] == r["EIDOS_QUERY_COUNT"] for r in results)
    assert all(
        core.norm(core.canonical(r["NOMBRE_RIOJA_VERBATIM"])) not in {
            core.norm(core.canonical(x["name"])) for x in r["SYNONYMY_COMPENDIUM"]
        }
        for r in results
    )

    compact_results = [compact_row(r) for r in results]
    groups = {}
    for r in compact_results:
        groups.setdefault(r["FINAL_GROUP"], []).append(r["B_SOURCE_RECORD_ID"])

    source_stats = {
        s["key"]: {
            "taxaQueried": 185,
            "searchFailureTaxa": 0,
            "searchHitTaxa": 0,
            "seedBoundSynonymyTaxa": 0,
            "strictEvidencePages": 0,
            "fetchFailures": 0,
        }
        for s in sources
    }
    for r in results:
        for sr in r.get("SOURCE_RUNS", []):
            stat = source_stats[sr["source"]]
            if sr.get("searchErrors"):
                stat["searchFailureTaxa"] += 1
            if sr.get("searchResults"):
                stat["searchHitTaxa"] += 1
            if sr.get("explicitSynonymyPages"):
                stat["seedBoundSynonymyTaxa"] += 1
            stat["strictEvidencePages"] += len(sr.get("explicitSynonymyPages", []))
            stat["fetchFailures"] += len(sr.get("fetchFailures", []))

    unique_synonym_queries = sum(r["UNIQUE_SYNONYM_COUNT"] for r in results)
    eidos_queries = sum(r["EIDOS_QUERY_COUNT"] for r in results)
    assert unique_synonym_queries == eidos_queries

    out = Path(outdir)
    raw = out / "raw_evidence"
    raw.mkdir(parents=True, exist_ok=True)

    evidence_files = []
    for result in results:
        fname = f"{result['B_SOURCE_RECORD_ID']}.json.gz"
        meta = write_gzip_json(raw / fname, result)
        meta["B_SOURCE_RECORD_ID"] = result["B_SOURCE_RECORD_ID"]
        evidence_files.append(meta)

    manifest = {
        "evidenceClass": "RAW_PER_TAXON_GZIP",
        "repositoryPersistence": "PROHIBITED",
        "artifactPersistence": "REQUIRED",
        "files": evidence_files,
        "fileCount": len(evidence_files),
        "totalCompressedBytes": sum(x["bytes"] for x in evidence_files),
    }

    receipt = {
        "runClass": "CORPUS_B_FAST_TOP4_SYNONYMY_185_SEED_BOUND_RECOVERY",
        "releaseEvent": request["releaseEvent"],
        "failureDiagnosisEvent": request["failureDiagnosisEvent"],
        "supersedesRun": 32723005903,
        "priorRunResultsCanonical": False,
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
        "seedBoundExplicitRelationExtraction": True,
        "broadSectionHarvesting": False,
        "eidosSource": "https://datos.iepnb.es/datasets/eidos.ttl",
        "eidosBytes": emeta["bytes"],
        "eidosSha256": emeta["sha256"],
        "singleEidosLoad": True,
        "deduplicateNamesPerTaxonBeforeEidos": True,
        "queryEveryUniqueDiscoveredNameOnce": True,
        "repositoryPersistence": "COMPACT_ONLY",
        "rawEvidencePersistence": "PER_TAXON_GZIP_ACTIONS_ARTIFACT",
        "rawEvidenceManifest": "EVIDENCE_MANIFEST_185.json",
        "crossWithA": False,
        "neonWrites": 0,
        "corpusBFreeze": False,
        "noFuzzy": True,
        "noParentIdInheritance": True,
        "noRankCollapse": True,
        "semantics": [
            "SOURCE_FAILURE!=NOT_FOUND",
            "NOT_FOUND!=ABSENCE",
            "NO_SILENT_INFERENCE",
            "DISCOVERY_CANDIDATE!=VALIDATED_SYNONYM",
            "SEED_BOUND_EXPLICIT_RELATION_REQUIRED",
            "BOUNDED_PERSISTENCE_REQUIRED",
        ],
    }

    (out / "RUN_RECEIPT.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "COMPACT_RESULTS_185.json").write_text(
        json.dumps({"receipt": receipt, "rows": compact_results}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "GROUP_INDEX_185.json").write_text(
        json.dumps({"receipt": receipt, "groups": groups}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "RESOLVED_185.json").write_text(
        json.dumps(
            {"receipt": receipt, "rows": [r for r in compact_results if r.get("MITECO_IDTAXON")]},
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    (out / "EVIDENCE_MANIFEST_185.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:5])
