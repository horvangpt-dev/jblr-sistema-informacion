#!/usr/bin/env python3
import csv
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

RUN_ID = "06_CORPUS_B_UNRESOLVED_185_TAXONOMY_20260824_001"
CORPUS_ID = "BIODIVERSIDAD_RIOJANA_FLORA"
SOURCE_BATCH_ID = "CORPUS_B_UNRESOLVED_185_v1"
TARGET_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"
SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_185_v1"
MASTER_PROMPT_ID = "1Vn3VTU8NcOtA4-G8C0zzrhw_g_nvQ3Bt9TBUySzBZDA"
RESTORATION_EVENT = "JBLR-EVT-06-20260824-RESTORATION-VNEXT-001"
EXPECTED_INPUT_BLOB = "ef5192304fa22c2ca8a9daffd67f58aa9c4827de"
UA = "JBLR-ACTOR06-STIMES-vNEXT/1.0 (+taxonomic-reality; exact-only)"

SOURCES = {
    "POWO_WCVP": {
        "url": "http://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        "provenance": "WCVP official Darwin Core Archive published by Royal Botanic Gardens, Kew; POWO names backbone",
    },
    "WFO": {
        "url": "https://zenodo.org/records/20782718/files/_DwC_backbone_R.zip?download=1",
        "provenance": "World Flora Online Plant List 2026-06 official static Darwin Core backbone",
    },
    "ANTHOS": {
        "url": "https://ipt.gbif.es/archive.do?r=rjb-anthos",
        "provenance": "ANTHOS official RJB-CSIC Darwin Core Archive via GBIF-Spain IPT",
    },
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "application/zip,*/*"})


def now():
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("×", "x").strip()).casefold()


def rank_norm(s):
    x = norm(s).replace(".", "").replace("_", " ")
    aliases = {
        "sp": "species", "species": "species", "especie": "species",
        "subsp": "subspecies", "ssp": "subspecies", "subspecies": "subspecies",
        "subespecie": "subspecies", "var": "variety", "variety": "variety",
        "variedad": "variety", "forma": "form", "form": "form", "f": "form",
        "nothospecies": "species", "nothosubspecies": "subspecies",
    }
    return aliases.get(x, x)


def detect_rank(name):
    n = norm(name)
    if " nothosubsp " in n or " subsp " in n or " ssp " in n:
        return "subspecies"
    if " var " in n:
        return "variety"
    if " f " in n:
        return "form"
    return "species"


def is_hybrid(name):
    n = " " + norm(name) + " "
    return " x " in n


def canonical(name):
    s = re.sub(r"\s+", " ", (name or "").replace("×", " x ").strip())
    # Preserve only a conservative scientific-name core; authorship is not used for identity.
    pat = re.compile(
        r"^([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+\s+"
        r"(?:x\s+)?[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+"
        r"(?:\s+(?:subsp\.?|ssp\.?|var\.?|f\.?|nothosubsp\.?)\s+"
        r"[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+)?)"
    )
    m = pat.match(s)
    if not m:
        return s
    c = m.group(1)
    c = re.sub(r"\bssp\.?\b", "subsp.", c)
    c = re.sub(r"\bsubsp\b", "subsp.", c)
    c = re.sub(r"\bvar\b", "var.", c)
    c = re.sub(r"\bf\b", "f.", c)
    c = re.sub(r"\s+", " ", c).strip()
    return c.replace(" x ", " × ")


def term_tail(term):
    return (term or "").rsplit("/", 1)[-1].rsplit("#", 1)[-1]


def decode_sep(value, default="\t"):
    if value is None:
        return default
    return {"\\t": "\t", "\\n": "\n", "\\r\\n": "\r\n"}.get(value, value)


def canonical_from_values(v):
    genus = (v.get("genericName") or v.get("genus") or "").strip()
    species = (v.get("specificEpithet") or "").strip()
    infra = (v.get("infraspecificEpithet") or "").strip()
    rank = rank_norm(v.get("taxonRank"))
    if genus and species:
        c = f"{genus} {species}"
        if infra:
            marker = {"subspecies": "subsp.", "variety": "var.", "form": "f."}.get(rank, "")
            c += f" {marker} {infra}" if marker else f" {infra}"
        return canonical(c)
    sci = (v.get("scientificName") or "").strip()
    auth = (v.get("scientificNameAuthorship") or "").strip()
    if auth and sci.endswith(auth):
        sci = sci[:-len(auth)].strip()
    return canonical(sci)


class DwcIndex:
    def __init__(self, key, spec):
        self.key = key
        self.spec = spec
        self.by_name = {}
        self.by_id = {}
        self.reverse_accepted = {}
        self.meta = {}

    def _download(self):
        last = None
        for attempt in range(4):
            try:
                r = session.get(self.spec["url"], timeout=300, allow_redirects=True)
                if r.status_code >= 400:
                    raise RuntimeError(f"HTTP_{r.status_code} final_url={r.url}")
                if len(r.content) < 10000:
                    raise RuntimeError(f"ARCHIVE_TOO_SMALL bytes={len(r.content)}")
                return r.content, r.url
            except Exception as e:
                last = e
                if attempt < 3:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"DOWNLOAD_FAILED:{self.key}:{type(last).__name__}:{last}")

    def start(self):
        payload, final_url = self._download()
        archive_sha = sha256_bytes(payload)
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            names = set(zf.namelist())
            meta_name = next((x for x in names if x.endswith("meta.xml")), None)
            if not meta_name:
                raise RuntimeError("meta.xml not found")
            root = ET.fromstring(zf.read(meta_name))
            core = root.find("{*}core")
            if core is None:
                raise RuntimeError("core not found")
            loc = core.find("{*}files/{*}location")
            if loc is None or not (loc.text or "").strip():
                raise RuntimeError("core location missing")
            location = loc.text.strip()
            if location not in names and meta_name.rsplit("/", 1)[0]:
                prefix = meta_name.rsplit("/", 1)[0] + "/"
                if prefix + location in names:
                    location = prefix + location
            if location not in names:
                raise RuntimeError(f"core file missing:{location}")
            encoding = core.attrib.get("encoding", "UTF-8")
            delimiter = decode_sep(core.attrib.get("fieldsTerminatedBy"), "\t")
            quotechar = decode_sep(core.attrib.get("fieldsEnclosedBy"), '"') or '"'
            ignore_headers = int(core.attrib.get("ignoreHeaderLines", "0") or 0)
            id_node = core.find("{*}id")
            id_idx = int(id_node.attrib["index"]) if id_node is not None and "index" in id_node.attrib else None
            fields = {}
            for f in core.findall("{*}field"):
                try:
                    fields[term_tail(f.attrib.get("term", ""))] = int(f.attrib["index"])
                except Exception:
                    pass
            wanted = ["scientificName", "scientificNameAuthorship", "genericName", "genus",
                      "specificEpithet", "infraspecificEpithet", "taxonRank", "taxonomicStatus",
                      "acceptedNameUsage", "acceptedNameUsageID", "scientificNameID", "taxonID"]
            rows = 0
            with zf.open(location) as raw:
                text = io.TextIOWrapper(raw, encoding=encoding, errors="replace", newline="")
                reader = csv.reader(text, delimiter=delimiter, quotechar=quotechar)
                for _ in range(ignore_headers):
                    next(reader, None)
                for row in reader:
                    rows += 1
                    vals = {}
                    for name in wanted:
                        idx = fields.get(name)
                        vals[name] = row[idx].strip() if idx is not None and idx < len(row) else ""
                    core_id = row[id_idx].strip() if id_idx is not None and id_idx < len(row) else ""
                    cname = canonical_from_values(vals)
                    if not cname:
                        continue
                    tid = vals.get("taxonID") or core_id or vals.get("scientificNameID")
                    rec = {
                        "canonicalName": cname,
                        "scientificName": vals.get("scientificName", ""),
                        "rank": rank_norm(vals.get("taxonRank")),
                        "taxonomicStatus": vals.get("taxonomicStatus", ""),
                        "taxonID": tid,
                        "acceptedNameUsage": canonical(vals.get("acceptedNameUsage", "")) if vals.get("acceptedNameUsage") else "",
                        "acceptedNameUsageID": vals.get("acceptedNameUsageID", ""),
                    }
                    self.by_name.setdefault(norm(cname), []).append(rec)
                    if tid:
                        self.by_id[tid] = rec
                    if rec["acceptedNameUsageID"]:
                        self.reverse_accepted.setdefault(rec["acceptedNameUsageID"], []).append(rec)
            if rows < 1000 or len(self.by_name) < 1000:
                raise RuntimeError(f"implausible archive rows={rows} names={len(self.by_name)}")
            self.meta = {
                "source": self.key,
                "provenance": self.spec["provenance"],
                "requestedUrl": self.spec["url"],
                "finalUrl": final_url,
                "archiveSha256": archive_sha,
                "archiveBytes": len(payload),
                "coreRows": rows,
                "uniqueCanonicalNames": len(self.by_name),
                "availableFields": sorted(fields.keys()),
            }

    def exact_network(self, seed, required_rank):
        names = []
        evidence = []
        seen = set()
        queue = [canonical(seed)]
        for _ in range(4):
            if not queue:
                break
            current = queue.pop(0)
            nk = norm(current)
            if not nk or nk in seen:
                continue
            seen.add(nk)
            same = [r for r in self.by_name.get(nk, []) if r.get("rank") == required_rank]
            evidence.append({"queryName": current, "queryMode": "EXACT_CANONICAL_SAME_RANK", "records": same[:20]})
            for rec in same:
                for candidate in [rec.get("canonicalName"), rec.get("acceptedNameUsage")]:
                    c = canonical(candidate or "")
                    if c and norm(c) not in {norm(x) for x in names}:
                        names.append(c)
                        queue.append(c)
                aid = rec.get("acceptedNameUsageID") or rec.get("taxonID")
                if aid:
                    accepted = self.by_id.get(aid)
                    if accepted and accepted.get("rank") == required_rank:
                        c = canonical(accepted.get("canonicalName") or "")
                        if c and norm(c) not in {norm(x) for x in names}:
                            names.append(c); queue.append(c)
                    for syn in self.reverse_accepted.get(aid, [])[:100]:
                        if syn.get("rank") != required_rank:
                            continue
                        c = canonical(syn.get("canonicalName") or "")
                        if c and norm(c) not in {norm(x) for x in names}:
                            names.append(c); queue.append(c)
        seedc = canonical(seed)
        if seedc and norm(seedc) not in {norm(x) for x in names}:
            names.insert(0, seedc)
        return names[:80], evidence


def build_sources():
    built, failures = {}, {}
    for key, spec in SOURCES.items():
        idx = DwcIndex(key, spec)
        try:
            idx.start()
            built[key] = idx
        except Exception as e:
            failures[key] = f"{type(e).__name__}:{e}"
    return built, failures


def build_eidos(path):
    idx = {}
    block = []
    def emit(lines):
        if not lines:
            return
        t = "\n".join(lines)
        mn = re.search(r'Darwin:scientificName\s+"([^"]+)"', t)
        mi = re.search(r'Darwin:taxonID\s+"([^"]+)"', t)
        if not (mn and mi):
            return
        ms = re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"', t)
        mr = re.search(r'Darwin:taxonRank\s+"([^"]+)"', t)
        ma = re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"', t)
        c = canonical(mn.group(1))
        rec = {
            "scientificName": mn.group(1), "canonicalName": c, "taxonID": mi.group(1),
            "taxonomicStatus": ms.group(1) if ms else None,
            "rank": rank_norm(mr.group(1) if mr else ""),
            "nameAccordingTo": ma.group(1) if ma else None,
        }
        idx.setdefault(norm(c), []).append(rec)
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip():
                emit(block); block = []
            else:
                block.append(line.rstrip())
        emit(block)
    if len(idx) < 1000:
        raise RuntimeError(f"EIDOS_INDEX_IMPLAUSIBLE:{len(idx)}")
    return idx


def accepted_eidos_exact(eidx, name, required_rank):
    records = eidx.get(norm(canonical(name)), [])
    same = [r for r in records if r.get("rank") == required_rank]
    accepted = [r for r in same if norm(r.get("taxonomicStatus")) in {"aceptado/válido", "aceptado/valido", "accepted", "valid"}]
    if len(accepted) == 1:
        return {"state": "UNIQUE_ACCEPTED_EXACT_SAME_RANK", "taxonID": accepted[0]["taxonID"], "record": accepted[0], "sameRankRecords": same}
    if len(accepted) > 1:
        return {"state": "MULTIPLE_ACCEPTED_EXACT_SAME_RANK", "taxonID": None, "record": None, "sameRankRecords": same}
    if same:
        return {"state": "EXACT_SAME_RANK_NO_ACCEPTED", "taxonID": None, "record": None, "sameRankRecords": same}
    if records:
        return {"state": "EXACT_NAME_ONLY_OTHER_RANKS", "taxonID": None, "record": None, "sameRankRecords": [], "otherRankRecords": records}
    return {"state": "EXACT_NAME_NOT_FOUND_IN_EIDOS", "taxonID": None, "record": None, "sameRankRecords": []}


def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) != 5:
        raise SystemExit("usage: taxonomy_185_vnext.py GROUP_JSON EIDOS_TTL OUT_DIR REQUEST_JSON")
    group_path, eidos_path, out_dir, request_path = map(Path, sys.argv[1:])
    out_dir.mkdir(parents=True, exist_ok=True)
    req = json.loads(request_path.read_text(encoding="utf-8"))
    assert req["enabled"] is True
    assert req["actor"] == "06" and req["runId"] == RUN_ID
    assert req["corpusId"] == CORPUS_ID and req["sourceBatchId"] == SOURCE_BATCH_ID
    assert req["scope"] == 185 and req["crossWithA"] is False
    assert req["neonWrites"] == 0 and req["databaseWrites"] == 0 and req["corpusBFreeze"] is False
    assert req["noFuzzy"] is True and req["noParentIdInheritance"] is True and req["noRankCollapse"] is True
    assert req["downstreamStimesAuthorized"] is False
    assert req["masterPromptId"] == MASTER_PROMPT_ID and req["restorationEvent"] == RESTORATION_EVENT

    source_blob = req["inputBlobSha"]
    assert source_blob == EXPECTED_INPUT_BLOB
    all_groups = json.loads(group_path.read_text(encoding="utf-8"))
    rows = all_groups["groups"][TARGET_GROUP]
    assert len(rows) == 185, len(rows)
    ids = [str(x["B_SOURCE_RECORD_ID"]) for x in rows]
    assert len(set(ids)) == 185

    intake = []
    for i, row in enumerate(rows, 1):
        verbatim = row["name"]
        intake.append({
            "index": i, "B_SOURCE_RECORD_ID": str(row["B_SOURCE_RECORD_ID"]),
            "NOMBRE_BIODIVERSIDAD_RIOJANA_VERBATIM": verbatim,
            "parsedScientificName": canonical(verbatim),
            "requiredRank": detect_rank(verbatim), "isHybrid": is_hybrid(verbatim),
            "sourceRow": row,
        })
    dump(out_dir / "SOURCE_INTAKE_RECEIPTS.json", {"runId": RUN_ID, "rows": intake})

    built, source_failures = build_sources()
    source_status = {
        k: ({"state": "READY", "meta": built[k].meta} if k in built else {"state": "SOURCE_FAILURE", "error": source_failures[k]})
        for k in SOURCES
    }
    systemic = len(built) == 0
    if systemic:
        receipt = {
            "runId": RUN_ID, "state": "STOP_REQUIRED", "stopRequired": True,
            "stopReason": "SYSTEMIC_DOCUMENTED_NAME_NETWORK_SOURCE_FAILURE",
            "sourceStatus": source_status, "processedRows": 0,
            "crossWithA": False, "neonWrites": 0, "databaseWrites": 0, "corpusBFreeze": False,
        }
        dump(out_dir / "RUN_RECEIPT.json", receipt)
        dump(out_dir / "QA_REPORT.json", {"pass": False, "stopRequired": True, "reason": receipt["stopReason"], "sourceStatus": source_status})
        dump(out_dir / "REPORT_TO_0000.json", receipt)
        return

    try:
        eidx = build_eidos(eidos_path)
        eidos_sha = sha256_file(eidos_path)
    except Exception as e:
        receipt = {
            "runId": RUN_ID, "state": "STOP_REQUIRED", "stopRequired": True,
            "stopReason": f"EIDOS_SOURCE_SYSTEMIC_FAILURE:{type(e).__name__}:{e}",
            "sourceStatus": source_status, "processedRows": 0,
            "crossWithA": False, "neonWrites": 0, "databaseWrites": 0, "corpusBFreeze": False,
        }
        dump(out_dir / "RUN_RECEIPT.json", receipt)
        dump(out_dir / "QA_REPORT.json", {"pass": False, "stopRequired": True, "reason": receipt["stopReason"]})
        dump(out_dir / "REPORT_TO_0000.json", receipt)
        return

    identities, idstates, snapshots, provenance, unresolved = [], [], [], [], []
    for item in intake:
        seed = item["parsedScientificName"]
        rr = item["requiredRank"]
        aliases = [seed]
        per_source = {}
        for key, src in built.items():
            names, evidence = src.exact_network(seed, rr)
            per_source[key] = {"state": "QUERIED_EXACT_SAME_RANK", "names": names, "evidence": evidence, "sourceSha256": src.meta["archiveSha256"]}
            for name in names:
                if norm(name) not in {norm(x) for x in aliases}:
                    aliases.append(name)
        for key in source_failures:
            per_source[key] = {"state": "SOURCE_FAILURE", "error": source_failures[key]}

        eidos_evidence = []
        for alias in aliases:
            ev = accepted_eidos_exact(eidx, alias, rr)
            eidos_evidence.append({"queryName": alias, **ev})
        resolved_ids = sorted({str(e["taxonID"]) for e in eidos_evidence if e.get("taxonID")})
        if len(resolved_ids) == 1:
            state = "RESOLVED_EXACT_EIDOS_ID_FROM_DOCUMENTED_NAME_NETWORK"
            exact_id = resolved_ids[0]
        elif len(resolved_ids) > 1:
            state = "CONFLICT_MULTIPLE_EXACT_EIDOS_IDS"
            exact_id = None
        else:
            state = "UNRESOLVED_AFTER_DOCUMENTED_NAME_NETWORK_AND_EXACT_EIDOS"
            exact_id = None
        eidos_hit = next((e.get("record") for e in eidos_evidence if exact_id and str(e.get("taxonID")) == exact_id), None)
        reconciled = (eidos_hit or {}).get("canonicalName") or seed
        identity = {
            "B_SOURCE_RECORD_ID": item["B_SOURCE_RECORD_ID"],
            "nameVerbatim": item["NOMBRE_BIODIVERSIDAD_RIOJANA_VERBATIM"],
            "nameParsed": seed, "nameReconciled": reconciled,
            "rank": rr, "isHybrid": item["isHybrid"],
            "documentedQueryNames": aliases, "sourceStates": {k: v["state"] for k, v in per_source.items()},
            "identityState": state,
        }
        identities.append(identity)
        idstate = {
            "B_SOURCE_RECORD_ID": item["B_SOURCE_RECORD_ID"],
            "ID_TAXON_EXACT": exact_id,
            "ID_TAXON_EFFECTIVE_PARENT_REFERENCE": None,
            "ID_TAXON_STATE": state,
            "forcedId": False, "fuzzyUsed": False, "parentIdInherited": False, "rankCollapsed": False,
        }
        idstates.append(idstate)
        snap = {
            "snapshotVersion": SNAPSHOT_VERSION, "runId": RUN_ID, "corpusId": CORPUS_ID, "sourceBatchId": SOURCE_BATCH_ID,
            "B_SOURCE_RECORD_ID": item["B_SOURCE_RECORD_ID"],
            "nameVerbatim": item["NOMBRE_BIODIVERSIDAD_RIOJANA_VERBATIM"],
            "nameParsed": seed, "nameReconciled": reconciled, "rank": rr, "isHybrid": item["isHybrid"],
            "synonymsAndParallelTreatments": aliases,
            "ID_TAXON_EXACT": exact_id, "ID_TAXON_EFFECTIVE_PARENT_REFERENCE": None, "ID_TAXON_STATE": state,
            "eidosAcceptedRecord": eidos_hit,
            "lastChecked": now(),
            "provenance": {"networkSources": per_source, "eidos": {"source": req["eidosSource"], "sha256": eidos_sha, "queries": eidos_evidence}},
        }
        snapshots.append(snap)
        provenance.append({
            "B_SOURCE_RECORD_ID": item["B_SOURCE_RECORD_ID"], "seed": seed,
            "networkSources": per_source, "eidosQueries": eidos_evidence,
        })
        if exact_id is None:
            unresolved.append({"B_SOURCE_RECORD_ID": item["B_SOURCE_RECORD_ID"], "nameVerbatim": item["NOMBRE_BIODIVERSIDAD_RIOJANA_VERBATIM"], "state": state, "documentedQueryNames": aliases})

    dump(out_dir / "TAXONOMIC_IDENTITY_RESULTS.json", {"runId": RUN_ID, "rows": identities})
    dump(out_dir / "ID_TAXON_STATE_RESULTS.json", {"runId": RUN_ID, "rows": idstates})
    dump(out_dir / "TAXONOMIC_SNAPSHOTS.json", {"snapshotVersion": SNAPSHOT_VERSION, "rows": snapshots})
    dump(out_dir / "QUERY_PROVENANCE_LEDGER.json", {"runId": RUN_ID, "sourceStatus": source_status, "rows": provenance})
    dump(out_dir / "UNRESOLVED_OR_CONFLICTS.json", {"runId": RUN_ID, "rows": unresolved})

    resolved_count = sum(1 for x in idstates if x["ID_TAXON_EXACT"] is not None)
    conflict_count = sum(1 for x in idstates if x["ID_TAXON_STATE"].startswith("CONFLICT_"))
    qa_checks = {
        "inputCount185": len(intake) == 185,
        "uniqueSourceRecordIds185": len({x["B_SOURCE_RECORD_ID"] for x in intake}) == 185,
        "identityCount185": len(identities) == 185,
        "idStateCount185": len(idstates) == 185,
        "snapshotCount185": len(snapshots) == 185,
        "verbatimPreserved": all(x["nameVerbatim"] for x in identities),
        "noForcedIds": all(not x["forcedId"] for x in idstates),
        "noFuzzy": all(not x["fuzzyUsed"] for x in idstates),
        "noParentInheritance": all(not x["parentIdInherited"] and x["ID_TAXON_EFFECTIVE_PARENT_REFERENCE"] is None for x in idstates),
        "noRankCollapse": all(not x["rankCollapsed"] for x in idstates),
        "crossWithA0": req["crossWithA"] is False,
        "neonWrites0": req["neonWrites"] == 0,
        "databaseWrites0": req["databaseWrites"] == 0,
        "corpusBFreeze0": req["corpusBFreeze"] is False,
        "downstreamBlocked": req["downstreamStimesAuthorized"] is False,
        "documentedNetworkAvailable": len(built) >= 1,
        "eidosIndexAvailable": len(eidx) >= 1000,
    }
    qa_pass = all(qa_checks.values())
    qa = {
        "runId": RUN_ID, "pass": qa_pass, "checks": qa_checks, "sourceStatus": source_status,
        "eidosSha256": eidos_sha, "resolvedCount": resolved_count, "unresolvedOrConflictCount": len(unresolved),
        "conflictCount": conflict_count,
        "semantics": ["REALITY_FIRST", "PERSISTED_EVIDENCE_FIRST", "NO_SILENT_INFERENCE", "NO_FUZZY", "NO_RANK_COLLAPSE", "NO_PARENT_ID_INHERITANCE", "SOURCE_FAILURE!=NOT_FOUND", "UNRESOLVED!=ABSENCE"],
    }
    dump(out_dir / "QA_REPORT.json", qa)
    receipt = {
        "runId": RUN_ID, "actor": "06", "corpusId": CORPUS_ID, "sourceBatchId": SOURCE_BATCH_ID,
        "state": "PHASE1_TAXONOMIC_COMPLETE_STOP_BEFORE_DOWNSTREAM_STIMES" if qa_pass else "STOP_REQUIRED_QA_FAILURE",
        "stopRequired": not qa_pass, "stopReason": None if qa_pass else "QA_FAILURE",
        "inputRows": 185, "processedRows": len(idstates), "resolvedCount": resolved_count,
        "unresolvedOrConflictCount": len(unresolved), "conflictCount": conflict_count,
        "snapshotVersion": SNAPSHOT_VERSION, "sourceStatus": source_status, "eidosSha256": eidos_sha,
        "crossWithA": False, "neonWrites": 0, "databaseWrites": 0, "corpusBFreeze": False,
        "downstreamStimesExecuted": False, "existingCorpusOverwritten": False,
        "masterPromptId": MASTER_PROMPT_ID, "restorationEvent": RESTORATION_EVENT,
    }
    dump(out_dir / "RUN_RECEIPT.json", receipt)
    dump(out_dir / "REPORT_TO_0000.json", {**receipt, "qa": qa, "nextState": "STOP_BEFORE_DOWNSTREAM_STIMES" if qa_pass else "STOP_REQUIRED"})


if __name__ == "__main__":
    main()
