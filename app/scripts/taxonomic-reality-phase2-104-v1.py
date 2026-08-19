#!/usr/bin/env python3
import csv
import difflib
import importlib.util
import io
import json
import os
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Reuse the already validated official-source readers from phase 1.
V6_PATH = Path(__file__).with_name("taxonomic-reality-protocol-1259-v6.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_v6", V6_PATH)
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)

QUEUE = Path("evidence/06_stimes/taxonomic_reality_1259_v6/latest/TAXONOMIC_REALITY_NO_RESPONSE_ALL_THREE_V6.csv")
OUT = Path(os.environ.get("TAXON_PHASE2_OUT", "artifacts/taxonomic_reality_phase2_104"))
EXPECTED = 104


def now():
    return datetime.now(timezone.utc).isoformat()


def norm(s):
    s = (s or "").replace("×", " x ")
    s = re.sub(r"\bssp\.?\b", "subsp", s, flags=re.I)
    s = re.sub(r"\bsubspecies\b", "subsp", s, flags=re.I)
    s = re.sub(r"\bvariety\b|\bvarietas\b|\bvar\.?\b", "var", s, flags=re.I)
    s = re.sub(r"\bforma\b|\bform\b|\bf\.?\b", "f", s, flags=re.I)
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip().casefold()
    return re.sub(r"\s+", " ", s)


def tokens(s):
    return norm(s).split()


def genus_of(s):
    t = tokens(s)
    return t[0] if t else ""


def species_epithet(s):
    t = tokens(s)
    if len(t) < 2:
        return ""
    i = 1
    if t[i] == "x" and len(t) > 2:
        i += 1
    return t[i] if i < len(t) else ""


def parent_binomial(s):
    t = tokens(s)
    if len(t) < 2 or "x" in t:
        return ""
    return f"{t[0]} {t[1]}"


def hybrid_signature(s):
    raw = re.sub(r"\s+", " ", (s or "").replace("×", " x ").strip())
    if not re.search(r"\s[xX]\s", raw):
        return None
    parts = re.split(r"\s[xX]\s", raw, maxsplit=1)
    if len(parts) != 2:
        return None
    left = parts[0].strip().split()
    right = parts[1].strip().split()
    if len(left) < 2 or not right:
        return None
    genus = left[0].casefold()
    ep1 = left[1].casefold().strip(".,")
    if len(right) >= 2:
        rgen = right[0].rstrip(".").casefold()
        ep2 = right[1].casefold().strip(".,")
        if rgen and not genus.startswith(rgen):
            return None
    else:
        ep2 = right[0].casefold().strip(".,")
    return genus, tuple(sorted([ep1, ep2]))


def equivalent_notation(a, b):
    if norm(a) == norm(b):
        return True
    ha, hb = hybrid_signature(a), hybrid_signature(b)
    return bool(ha and hb and ha == hb)


def spelling_score(target, candidate):
    gt, gc = genus_of(target), genus_of(candidate)
    et, ec = species_epithet(target), species_epithet(candidate)
    if not gt or not gc or not et or not ec:
        return 0.0
    gr = difflib.SequenceMatcher(None, gt, gc).ratio()
    er = difflib.SequenceMatcher(None, et, ec).ratio()
    whole = difflib.SequenceMatcher(None, norm(target), norm(candidate)).ratio()
    # Require both genus and epithet to be plausibly related; same genus is strongest.
    if gt == gc:
        if er < 0.72:
            return 0.0
        return 0.55 * er + 0.45 * whole
    if gr < 0.78 or er < 0.78:
        return 0.0
    return 0.35 * gr + 0.35 * er + 0.30 * whole


def load_queue():
    with QUEUE.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) != EXPECTED:
        raise RuntimeError(f"QUEUE_COUNT_MISMATCH expected={EXPECTED} got={len(rows)}")
    return rows


def record_name(rec):
    return (rec.get("canonical_name") or rec.get("matched_canonical") or rec.get("scientific_name") or "").strip()


def build_maps(index):
    genus_map = defaultdict(list)
    genus_names = set()
    id_map = {}
    for rec in index.values():
        name = record_name(rec)
        g = genus_of(name)
        if g:
            genus_map[g].append(rec)
            genus_names.add(g)
        tid = (rec.get("taxon_id") or "").strip()
        if tid and tid not in id_map:
            id_map[tid] = rec
    return genus_map, genus_names, id_map


def top_candidates(target, genus_map, genus_names, id_map, source, maxn=5):
    tg = genus_of(target)
    genera = [tg] if tg in genus_map else []
    if not genera and tg:
        genera = difflib.get_close_matches(tg, list(genus_names), n=4, cutoff=0.78)
    # Even when the genus exists, inspect a very close alternate genus as a possible typo.
    if tg:
        for g in difflib.get_close_matches(tg, list(genus_names), n=3, cutoff=0.90):
            if g not in genera:
                genera.append(g)
    scored = []
    parent = parent_binomial(target)
    parent_hits = []
    normalized_hits = []
    for g in genera:
        for rec in genus_map.get(g, []):
            name = record_name(rec)
            if not name:
                continue
            if equivalent_notation(target, name):
                normalized_hits.append(rec)
                continue
            if parent and norm(name) == norm(parent):
                parent_hits.append(rec)
            score = spelling_score(target, name)
            if score >= 0.82:
                scored.append((score, name, rec))
    scored.sort(key=lambda x: (-x[0], len(x[1]), x[1]))
    dedup = []
    seen = set()
    for score, name, rec in scored:
        key = norm(name)
        if key in seen:
            continue
        seen.add(key)
        accepted = ""
        aid = (rec.get("accepted_id") or "").strip()
        if aid and aid in id_map:
            accepted = record_name(id_map[aid])
        dedup.append({
            "source": source,
            "candidate": name,
            "score": round(score, 5),
            "taxonomic_status": rec.get("taxonomic_status", ""),
            "accepted_id": aid,
            "accepted_name_resolved": accepted,
            "taxon_id": rec.get("taxon_id", ""),
        })
        if len(dedup) >= maxn:
            break
    return {
        "normalized_hits": [record_name(r) for r in normalized_hits[:5]],
        "parent_hits": [record_name(r) for r in parent_hits[:5]],
        "candidates": dedup,
        "searched_genera": genera,
    }


class WfoCandidateIndex:
    def __init__(self, target_rows):
        self.target_rows = target_rows
        self.index = {}
        self.meta = {}

    def start(self):
        # Download the same official WFO 2026-06 classification used successfully in phase 1.
        payload, final_url = v6.WfoStatic(["Quercus ilex"])._download()
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            members = [n for n in zf.namelist() if n.casefold().endswith("classification.csv")]
            if not members:
                raise RuntimeError("WFO_CLASSIFICATION_CSV_NOT_FOUND")
            member = sorted(members, key=lambda n: (len(n), n))[0]
            with zf.open(member) as raw:
                text = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
                reader = csv.DictReader(text, delimiter="\t")
                headers = reader.fieldnames or []
                hm = {v6.hnorm(h): h for h in headers if h}
                def field(*opts):
                    for o in opts:
                        k = v6.hnorm(o)
                        if k in hm:
                            return hm[k]
                    return None
                genus_f = field("genus", "genericName")
                species_f = field("specificEpithet")
                infra_f = field("infraspecificEpithet", "infraSpecificEpithet")
                rank_f = field("taxonRank")
                sci_f = field("scientificName")
                auth_f = field("scientificNameAuthorship")
                status_f = field("taxonomicStatus")
                aid_f = field("acceptedNameUsageID")
                id_f = field("taxonID", "scientificNameID")
                if not genus_f or not species_f:
                    raise RuntimeError(f"WFO_REQUIRED_FIELDS_MISSING headers={headers[:80]}")

                target_genera = {genus_of(r["taxon"]) for r in self.target_rows if genus_of(r["taxon"])}
                # Pass 1: collect all genera so close misspelled genera can be considered.
                all_genera = set()
                rows = []
                for row in reader:
                    g = norm(row.get(genus_f, ""))
                    if g:
                        all_genera.add(g)
                    rows.append(row)
                close_genera = set(target_genera)
                genus_list = list(all_genera)
                for tg in target_genera:
                    close_genera.update(difflib.get_close_matches(tg, genus_list, n=4, cutoff=0.78))

                for row in rows:
                    g = norm(row.get(genus_f, ""))
                    if g not in close_genera:
                        continue
                    species = (row.get(species_f) or "").strip()
                    genus = (row.get(genus_f) or "").strip()
                    if not genus or not species:
                        continue
                    canonical = f"{genus} {species}"
                    infra = (row.get(infra_f) or "").strip() if infra_f else ""
                    rank = (row.get(rank_f) or "").strip() if rank_f else ""
                    if infra:
                        rm = v6.rank_marker(rank)
                        canonical += f" {rm} {infra}" if rm else f" {infra}"
                    rec = {
                        "canonical_name": canonical,
                        "scientific_name": (row.get(sci_f) or canonical).strip() if sci_f else canonical,
                        "authorship": (row.get(auth_f) or "").strip() if auth_f else "",
                        "taxonomic_status": (row.get(status_f) or "").strip() if status_f else "",
                        "accepted_id": (row.get(aid_f) or "").strip() if aid_f else "",
                        "taxon_id": (row.get(id_f) or "").strip() if id_f else "",
                    }
                    key = norm(canonical)
                    if key and key not in self.index:
                        self.index[key] = rec
                self.meta = {
                    "source": "World Flora Online",
                    "archive_sha256": v6.hashlib.sha256(payload).hexdigest(),
                    "archive_bytes": len(payload),
                    "member": member,
                    "target_genera": len(target_genera),
                    "candidate_genera": len(close_genera),
                    "indexed_candidate_names": len(self.index),
                    "final_url": final_url,
                }


def source_analysis(rows):
    target_names = [r["taxon"] for r in rows]
    analyses = {r["taxon"]: {} for r in rows}

    # POWO/WCVP
    powo = v4.RobustDwcIndex("powo_wcvp", v4.mod.SOURCES["powo_wcvp"])
    powo.start()
    gm, gs, ids = build_maps(powo.index)
    for t in target_names:
        analyses[t]["powo"] = top_candidates(t, gm, gs, ids, "POWO_WCVP")
    powo_meta = powo.meta
    del powo, gm, gs, ids

    # WFO
    wfo = WfoCandidateIndex(rows)
    wfo.start()
    gm, gs, ids = build_maps(wfo.index)
    for t in target_names:
        analyses[t]["wfo"] = top_candidates(t, gm, gs, ids, "WFO")
    wfo_meta = wfo.meta
    del wfo, gm, gs, ids

    # ANTHOS
    anthos = v4.RobustDwcIndex("anthos", v4.mod.SOURCES["anthos"])
    anthos.start()
    gm, gs, ids = build_maps(anthos.index)
    for t in target_names:
        analyses[t]["anthos"] = top_candidates(t, gm, gs, ids, "ANTHOS")
    anthos_meta = anthos.meta

    return analyses, {"powo_wcvp": powo_meta, "wfo": wfo_meta, "anthos": anthos_meta}


def consensus_for(taxon, per_source):
    normalized = []
    parent_sources = []
    candidates = defaultdict(list)
    for source, result in per_source.items():
        for n in result["normalized_hits"]:
            normalized.append((source, n))
        if result["parent_hits"]:
            parent_sources.append(source)
        for c in result["candidates"]:
            candidates[norm(c["candidate"])].append(c)

    if normalized:
        return "SUPPORTED_NORMALIZED_NOTATION", normalized[0][1], len({s for s, _ in normalized}), normalized, parent_sources, candidates

    ranked = []
    for key, vals in candidates.items():
        sources = {v["source"] for v in vals}
        best = max(v["score"] for v in vals)
        candidate = sorted(vals, key=lambda v: (-v["score"], v["candidate"]))[0]["candidate"]
        ranked.append((len(sources), best, candidate, vals))
    ranked.sort(key=lambda x: (-x[0], -x[1], x[2]))
    if ranked:
        nsrc, best, candidate, vals = ranked[0]
        if nsrc >= 2 and best >= 0.86:
            state = "STRONG_SPELLING_OR_NOMENCLATURAL_CANDIDATE"
        elif best >= 0.90:
            state = "SINGLE_SOURCE_STRONG_CANDIDATE"
        else:
            state = "WEAK_CANDIDATE_REVIEW"
        return state, candidate, nsrc, normalized, parent_sources, candidates

    if parent_sources:
        return "PARENT_TAXON_ONLY", parent_binomial(taxon), len(parent_sources), normalized, parent_sources, candidates
    return "NO_TAXONOMIC_CANDIDATE", "", 0, normalized, parent_sources, candidates


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = load_queue()
    analyses, meta = source_analysis(rows)
    flat = []
    human = []
    resolved = []
    for row in rows:
        taxon = row["taxon"]
        state, suggested, support_count, normalized_hits, parent_sources, candidate_map = consensus_for(taxon, analyses[taxon])
        all_candidates = []
        for source in ("powo", "wfo", "anthos"):
            for c in analyses[taxon][source]["candidates"]:
                all_candidates.append(c)
        all_candidates.sort(key=lambda c: (-c["score"], c["source"], c["candidate"]))
        rec = {
            "universe_index": row.get("universe_index", ""),
            "family": row.get("family", ""),
            "taxon": taxon,
            "iucn_problem_state": row.get("iucn_problem_state", ""),
            "phase1_resolution": row.get("resolution", ""),
            "phase2_state": state,
            "suggested_taxon": suggested,
            "supporting_source_count": support_count,
            "parent_taxon": parent_binomial(taxon),
            "parent_sources": ";".join(parent_sources),
            "powo_normalized_hits": ";".join(analyses[taxon]["powo"]["normalized_hits"]),
            "wfo_normalized_hits": ";".join(analyses[taxon]["wfo"]["normalized_hits"]),
            "anthos_normalized_hits": ";".join(analyses[taxon]["anthos"]["normalized_hits"]),
            "top_candidates_json": json.dumps(all_candidates[:12], ensure_ascii=False, separators=(",", ":")),
            "automatic_correction": False,
            "automatic_deletion": False,
            "checked_at": now(),
        }
        flat.append(rec)
        if state in {"NO_TAXONOMIC_CANDIDATE", "WEAK_CANDIDATE_REVIEW", "PARENT_TAXON_ONLY", "SINGLE_SOURCE_STRONG_CANDIDATE"}:
            human.append(rec)
        else:
            resolved.append(rec)

    fields = list(flat[0].keys())
    for path, data in [
        (OUT / "TAXONOMIC_REALITY_PHASE2_104_RESULTS.csv", flat),
        (OUT / "TAXONOMIC_REALITY_PHASE2_HUMAN_REVIEW.csv", human),
        (OUT / "TAXONOMIC_REALITY_PHASE2_SUPPORTED.csv", resolved),
    ]:
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader(); w.writerows(data)

    counts = defaultdict(int)
    for r in flat:
        counts[r["phase2_state"]] += 1
    qa = {
        "execution": "TAXONOMIC_REALITY_PHASE2_104_v1",
        "at": now(),
        "queue_count": len(rows),
        "results_count": len(flat),
        "state_counts": dict(sorted(counts.items())),
        "supported_without_master_mutation": len(resolved),
        "human_review_count": len(human),
        "complete": len(rows) == EXPECTED and len(flat) == EXPECTED,
        "automatic_correction": False,
        "automatic_deletion": False,
        "source_meta": meta,
    }
    (OUT / "TAXONOMIC_REALITY_PHASE2_104_QA.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    main()
