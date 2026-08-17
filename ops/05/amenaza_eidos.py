#!/usr/bin/env python3
"""JBLR 05 · OBJETIVO 01 · AMENAZA · IEPNB/EIDOS evidence collector.

Evidence only. No scoring. No inference of absence from empty source results.
RAW source payloads, taxonomic resolution, accepted source identity and normalized
assessment fields are kept separately and remain auditable.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TAXON_NAME_ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenertaxonespornombre?_nombretaxon="
TAXON_ID_ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenertaxonporid?_idtaxon="
CONSERVATION_ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenerestadosconservacionportaxonid?_idtaxon="
SOURCE_NAME = "IEPNB/EIDOS"
SOURCE_INSTITUTION = "MITECO · Inventario Español del Patrimonio Natural y de la Biodiversidad"
METHOD_VERSION = "AMENAZA_EIDOS_EVIDENCE_v2"
USER_AGENT = "JBLR-Analytical-Research-05/2.0 evidence-only"
ACCEPTED_LABELS = {"aceptado/válido", "aceptado/valido", "accepted", "valid"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def compact_ws(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def name_key(value: Any) -> str:
    s = compact_ws(value)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("×", "x")
    s = re.sub(r"\bsubsp\.\s*", "", s, flags=re.I)
    s = re.sub(r"\bssp\.\s*", "", s, flags=re.I)
    s = re.sub(r"\bvar\.\s*", "", s, flags=re.I)
    s = re.sub(r"\bf\.\s*", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip().casefold()


def safe_int(value: Any) -> int | None:
    try:
        if value in (None, ""):
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def as_rows(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for k in ("data", "results", "result"):
            if isinstance(payload.get(k), list):
                return [x for x in payload[k] if isinstance(x, dict)]
        return [payload]
    return []


def json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def csv_write(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


class EidosClient:
    def __init__(self, timeout: int = 30, retries: int = 5, pause: float = 0.12):
        self.timeout = timeout
        self.retries = retries
        self.pause = pause
        self.calls = 0
        self.retry_count = 0

    def get_json(self, url: str) -> Any:
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            delay = None
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    self.calls += 1
                    if self.pause:
                        time.sleep(self.pause)
                    return [] if not raw else json.loads(raw.decode("utf-8-sig"))
            except urllib.error.HTTPError as exc:
                last_error = exc
                self.calls += 1
                if exc.code not in (408, 425, 429, 500, 502, 503, 504):
                    raise
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                try:
                    delay = float(retry_after) if retry_after else None
                except (TypeError, ValueError):
                    delay = None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
            if attempt >= self.retries:
                break
            self.retry_count += 1
            time.sleep(delay if delay is not None else min(30.0, (2 ** attempt) + random.random()))
        raise RuntimeError(f"EIDOS request failed after retries: {url}: {last_error}")


def query_variants(taxon: str) -> list[str]:
    variants = [compact_ws(taxon)]
    if re.search(r"\s+(subsp|ssp)\.\s+", taxon, flags=re.I):
        variants.append(re.sub(r"\s+(subsp|ssp)\.\s+", " ", taxon, flags=re.I))
    return list(dict.fromkeys(v for v in variants if v))


def returned_name(row: dict[str, Any]) -> str:
    genus = compact_ws(row.get("genus"))
    specific = compact_ws(row.get("specificepithet"))
    infra = compact_ws(row.get("infraspecificepithet"))
    pieces = [x for x in (genus, specific, infra) if x]
    if pieces:
        return " ".join(pieces)
    for key in ("scientificname", "scientific_name", "nombre", "name"):
        v = compact_ws(row.get(key))
        if v:
            return v
    return ""


def is_accepted(row: dict[str, Any]) -> bool:
    v = compact_ws(row.get("nametype")).casefold()
    return v in ACCEPTED_LABELS or "aceptado" in v or "válido" in v or "valido" in v


def accepted_taxon_id(row: dict[str, Any]) -> int | None:
    if not row:
        return None
    accepted = safe_int(row.get("acceptednameid"))
    taxon = safe_int(row.get("taxonid") or row.get("idtaxon"))
    return accepted if accepted is not None else taxon


def pick_candidate(input_taxon: str, rows: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, str]:
    if not rows:
        return None, "NO_MATCH"
    key = name_key(input_taxon)
    exact = [r for r in rows if name_key(returned_name(r)) == key]
    accepted = [r for r in exact if is_accepted(r)]
    if len(accepted) == 1:
        return accepted[0], "EXACT_ACCEPTED"
    if len(accepted) > 1:
        return None, "UNRESOLVED_MULTIPLE_EXACT_ACCEPTED"
    if len(exact) == 1:
        return exact[0], "EXACT_NAME_NON_ACCEPTED"
    if len(exact) > 1:
        return None, "UNRESOLVED_MULTIPLE_EXACT"
    if len(rows) == 1:
        return None, "UNRESOLVED_SINGLE_NONEXACT_CANDIDATE"
    return None, "UNRESOLVED_MULTIPLE_NONEXACT_CANDIDATES"


def choose_accepted_identity(rows: list[dict[str, Any]], accepted_id: int) -> tuple[str, str]:
    accepted_rows = [r for r in rows if is_accepted(r)]
    if len(accepted_rows) == 1:
        return returned_name(accepted_rows[0]), "ACCEPTED_IDENTITY_CONFIRMED"
    id_rows = [r for r in rows if safe_int(r.get("taxonid") or r.get("idtaxon")) == accepted_id]
    if len(id_rows) == 1:
        return returned_name(id_rows[0]), "SOURCE_IDENTITY_RETURNED"
    return "", "ACCEPTED_IDENTITY_UNRESOLVED"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--universe", default="data/05/taxon_universe.csv")
    parser.add_argument("--out", default="out/05/amenaza")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--pause", type=float, default=float(os.getenv("EIDOS_PAUSE", "0.12")))
    args = parser.parse_args()

    out = Path(args.out)
    raw_tax = out / "raw" / "taxonomy_by_name"
    raw_id = out / "raw" / "taxonomy_by_id"
    raw_cons = out / "raw" / "conservation"
    for p in (raw_tax, raw_id, raw_cons):
        p.mkdir(parents=True, exist_ok=True)

    with open(args.universe, encoding="utf-8-sig", newline="") as f:
        universe = list(csv.DictReader(f))
    universe = [r for r in universe if int(r["universe_index"]) >= args.start]
    if args.limit > 0:
        universe = universe[:args.limit]

    client = EidosClient(pause=args.pause)
    consulted_at = utc_now()
    reconciliation: list[dict[str, Any]] = []
    evidence: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []

    for pos, row in enumerate(universe, 1):
        idx = int(row["universe_index"])
        taxon = compact_ws(row["taxon"])
        family = compact_ws(row.get("family"))
        variants = query_variants(taxon)
        candidates: list[dict[str, Any]] = []
        query_errors: list[str] = []
        raw_variants: list[dict[str, Any]] = []

        for variant in variants:
            url = TAXON_NAME_ENDPOINT + urllib.parse.quote(variant, safe="")
            try:
                payload = client.get_json(url)
                rows = as_rows(payload)
                raw_variants.append({"query_variant": variant, "url": url, "payload": payload})
                candidates.extend(rows)
                if rows:
                    break
            except Exception as exc:
                query_errors.append(f"{type(exc).__name__}: {exc}")
                raw_variants.append({"query_variant": variant, "url": url, "error": str(exc)})

        unique_candidates: list[dict[str, Any]] = []
        seen = set()
        for cand in candidates:
            token = json.dumps(cand, ensure_ascii=False, sort_keys=True, default=str)
            if token not in seen:
                seen.add(token)
                unique_candidates.append(cand)

        name_raw_file = raw_tax / f"{idx:04d}_{hashlib.sha1(taxon.encode()).hexdigest()[:12]}.json"
        json_write(name_raw_file, {"universe_index": idx, "input_taxon": taxon, "queries": raw_variants, "consulted_at": consulted_at})

        chosen, match_state = pick_candidate(taxon, unique_candidates)
        source_queried_name = returned_name(chosen) if chosen else ""
        source_nametype = compact_ws(chosen.get("nametype")) if chosen else ""
        source_nameid = safe_int(chosen.get("nameid")) if chosen else None
        accepted_id = accepted_taxon_id(chosen) if chosen else None
        reconciliation_state = "SOURCE_ERROR" if query_errors and not unique_candidates else match_state

        accepted_name = ""
        accepted_identity_state = "NOT_RESOLVED"
        accepted_identity_error = ""
        if accepted_id is not None and reconciliation_state in ("EXACT_ACCEPTED", "EXACT_NAME_NON_ACCEPTED"):
            id_url = TAXON_ID_ENDPOINT + str(accepted_id)
            try:
                id_payload = client.get_json(id_url)
                id_rows = as_rows(id_payload)
                accepted_name, accepted_identity_state = choose_accepted_identity(id_rows, accepted_id)
                id_raw_file = raw_id / f"{accepted_id}.json"
                json_write(id_raw_file, {"universe_index": idx, "input_taxon": taxon, "accepted_id": accepted_id, "url": id_url, "payload": id_payload, "consulted_at": consulted_at})
            except Exception as exc:
                accepted_identity_error = f"{type(exc).__name__}: {exc}"
                accepted_identity_state = "SOURCE_ERROR"
        if is_accepted(chosen or {}) and not accepted_name:
            accepted_name = source_queried_name
            if accepted_identity_state == "NOT_RESOLVED":
                accepted_identity_state = "ACCEPTED_BY_NAME_RESPONSE"

        reconciliation.append({
            "universe_index": idx,
            "family": family,
            "input_taxon": taxon,
            "query_variants": " | ".join(variants),
            "candidate_count": len(unique_candidates),
            "reconciliation_state": reconciliation_state,
            "source_queried_name": source_queried_name,
            "source_nametype": source_nametype,
            "source_nameid": source_nameid or "",
            "accepted_taxon_id": accepted_id or "",
            "accepted_source_taxon": accepted_name,
            "accepted_identity_state": accepted_identity_state,
            "query_errors": " | ".join(query_errors),
            "accepted_identity_error": accepted_identity_error,
            "taxonomy_by_name_raw_file": str(name_raw_file.relative_to(out)),
            "consulted_at": consulted_at,
        })

        evidence_count = 0
        conservation_error = ""
        if accepted_id is not None and reconciliation_state in ("EXACT_ACCEPTED", "EXACT_NAME_NON_ACCEPTED"):
            cons_url = CONSERVATION_ENDPOINT + str(accepted_id)
            try:
                cons_payload = client.get_json(cons_url)
                cons_rows = as_rows(cons_payload)
                cons_raw_file = raw_cons / f"{accepted_id}.json"
                json_write(cons_raw_file, {"universe_index": idx, "input_taxon": taxon, "accepted_taxon_id": accepted_id, "url": cons_url, "payload": cons_payload, "consulted_at": consulted_at})
                for crec in cons_rows:
                    evidence_count += 1
                    evidence.append({
                        "universe_index": idx,
                        "family": family,
                        "input_taxon": taxon,
                        "source_queried_name": source_queried_name,
                        "accepted_source_taxon": accepted_name,
                        "accepted_taxon_id": accepted_id,
                        "source": SOURCE_NAME,
                        "institution": SOURCE_INSTITUTION,
                        "territorial_scope": compact_ws(crec.get("aplicaa") or crec.get("aplicacion") or crec.get("ambito") or crec.get("ámbito")),
                        "category": compact_ws(crec.get("categoriaconservacion") or crec.get("conservacion") or crec.get("categoria") or crec.get("categoría")),
                        "category_system": compact_ws(crec.get("autoridad") or crec.get("sistema")),
                        "evaluation_year": compact_ws(crec.get("anio") or crec.get("año") or crec.get("year")),
                        "criteria": compact_ws(crec.get("criterios") or crec.get("criteria")),
                        "dataset_id": compact_ws(crec.get("iddataset")),
                        "category_id": compact_ws(crec.get("idcategoria")),
                        "scope_id": compact_ws(crec.get("idaplicaa")),
                        "authority_id": compact_ws(crec.get("idautoridad")),
                        "validity": compact_ws(crec.get("vigencia")),
                        "is_current_source_record": compact_ws(crec.get("idvigente")),
                        "source_record_date_added": compact_ws(crec.get("fechaalta")),
                        "source_record_date_removed": compact_ws(crec.get("fechabaja")),
                        "source_url": cons_url,
                        "evidence_structured_json": json.dumps(crec, ensure_ascii=False, sort_keys=True),
                        "consulted_at": consulted_at,
                        "validation_state": "SOURCE_STRUCTURED_RECORD",
                        "uncertainty": "" if accepted_name else "ACCEPTED_SOURCE_NAME_UNRESOLVED",
                        "raw_file": str(cons_raw_file.relative_to(out)),
                    })
            except Exception as exc:
                conservation_error = f"{type(exc).__name__}: {exc}"

        if reconciliation_state == "SOURCE_ERROR" or conservation_error:
            evidence_state = "SOURCE_ERROR"
        elif accepted_id is None:
            evidence_state = "TAXON_UNRESOLVED"
        elif evidence_count == 0:
            evidence_state = "NO_EVALUATION_FOUND_IN_EIDOS"
        else:
            evidence_state = "VALID_SOURCE_EVIDENCE"

        summary.append({
            "universe_index": idx,
            "family": family,
            "input_taxon": taxon,
            "reconciliation_state": reconciliation_state,
            "source_queried_name": source_queried_name,
            "accepted_taxon_id": accepted_id or "",
            "accepted_source_taxon": accepted_name,
            "accepted_identity_state": accepted_identity_state,
            "evidence_records": evidence_count,
            "evidence_state": evidence_state,
            "conservation_query_error": conservation_error,
            "consulted_at": consulted_at,
        })
        if pos % 100 == 0 or pos == len(universe):
            print(json.dumps({"progress": pos, "total": len(universe), "last_universe_index": idx, "api_calls": client.calls, "retries": client.retry_count}, ensure_ascii=False), flush=True)

    recon_fields = ["universe_index","family","input_taxon","query_variants","candidate_count","reconciliation_state","source_queried_name","source_nametype","source_nameid","accepted_taxon_id","accepted_source_taxon","accepted_identity_state","query_errors","accepted_identity_error","taxonomy_by_name_raw_file","consulted_at"]
    evidence_fields = ["universe_index","family","input_taxon","source_queried_name","accepted_source_taxon","accepted_taxon_id","source","institution","territorial_scope","category","category_system","evaluation_year","criteria","dataset_id","category_id","scope_id","authority_id","validity","is_current_source_record","source_record_date_added","source_record_date_removed","source_url","evidence_structured_json","consulted_at","validation_state","uncertainty","raw_file"]
    summary_fields = ["universe_index","family","input_taxon","reconciliation_state","source_queried_name","accepted_taxon_id","accepted_source_taxon","accepted_identity_state","evidence_records","evidence_state","conservation_query_error","consulted_at"]
    csv_write(out / "taxon_reconciliation.csv", reconciliation, recon_fields)
    csv_write(out / "evidence_records.csv", evidence, evidence_fields)
    csv_write(out / "taxon_summary.csv", summary, summary_fields)
    json_write(out / "run_manifest.json", {
        "objective": "AMENAZA",
        "stage": "EVIDENCE_COLLECTION",
        "method_version": METHOD_VERSION,
        "source": SOURCE_NAME,
        "source_institution": SOURCE_INSTITUTION,
        "taxa_attempted": len(summary),
        "universe_start_index": int(summary[0]["universe_index"]) if summary else None,
        "universe_end_index": int(summary[-1]["universe_index"]) if summary else None,
        "evidence_records": len(evidence),
        "evidence_state_counts": dict(Counter(r["evidence_state"] for r in summary)),
        "reconciliation_state_counts": dict(Counter(r["reconciliation_state"] for r in reconciliation)),
        "accepted_identity_state_counts": dict(Counter(r["accepted_identity_state"] for r in summary)),
        "api_calls": client.calls,
        "retry_count": client.retry_count,
        "consulted_at": consulted_at,
        "generated_at": utc_now(),
        "scoring_performed": False,
        "absence_inference_performed": False,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
