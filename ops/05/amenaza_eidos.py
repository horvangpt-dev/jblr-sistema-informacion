#!/usr/bin/env python3
"""
JBLR 05 · OBJETIVO 01 · AMENAZA
Evidence-only acquisition from IEPNB/EIDOS.

No scoring. No inference of absence from empty results.
Outputs keep raw evidence, taxonomic reconciliation state, and explicit uncertainty.
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TAXON_ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenertaxonespornombre?_nombretaxon="
CONSERVATION_ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenerestadosconservacionportaxonid?_idtaxon="
SOURCE_NAME = "IEPNB/EIDOS"
SOURCE_INSTITUTION = "MITECO · Inventario Español del Patrimonio Natural y de la Biodiversidad"
USER_AGENT = "JBLR-Analytical-Research-05/1.0 evidence-only"

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
    s = re.sub(r"\s+", " ", s).strip().casefold()
    return s


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


class EidosClient:
    def __init__(self, timeout: int = 30, retries: int = 5, pause: float = 0.08):
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
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    self.calls += 1
                    if self.pause:
                        time.sleep(self.pause)
                    if not raw:
                        return []
                    return json.loads(raw.decode("utf-8-sig"))
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
            if delay is None:
                delay = min(30.0, (2 ** attempt) + random.random())
            time.sleep(delay)
        raise RuntimeError(f"EIDOS request failed after retries: {url}: {last_error}")


def query_variants(taxon: str) -> list[str]:
    variants = [compact_ws(taxon)]
    if " subsp. " in taxon:
        variants.append(re.sub(r"\s+subsp\.\s+", " ", taxon, flags=re.I))
    if " ssp. " in taxon:
        variants.append(re.sub(r"\s+ssp\.\s+", " ", taxon, flags=re.I))
    return list(dict.fromkeys(v for v in variants if v))


def returned_name(row: dict[str, Any]) -> str:
    genus = compact_ws(row.get("genus"))
    specific = compact_ws(row.get("specificepithet"))
    infra = compact_ws(row.get("infraspecificepithet"))
    pieces = [x for x in (genus, specific, infra) if x]
    if pieces:
        return " ".join(pieces)
    for key in ("scientificname", "scientific_name", "nombre", "name"):
        if compact_ws(row.get(key)):
            return compact_ws(row.get(key))
    return ""


def is_accepted(row: dict[str, Any]) -> bool:
    v = compact_ws(row.get("nametype")).casefold()
    return v in ACCEPTED_LABELS or "aceptado" in v or "válido" in v or "valido" in v


def candidate_taxon_id(row: dict[str, Any]) -> int | None:
    for key in ("taxonid", "idtaxon"):
        val = safe_int(row.get(key))
        if val is not None:
            return val
    return safe_int(row.get("acceptednameid"))


def pick_candidate(input_taxon: str, rows: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, str]:
    if not rows:
        return None, "NO_MATCH"
    key = name_key(input_taxon)
    exact = [r for r in rows if name_key(returned_name(r)) == key]
    exact_accepted = [r for r in exact if is_accepted(r)]
    if len(exact_accepted) == 1:
        return exact_accepted[0], "EXACT_ACCEPTED"
    if len(exact_accepted) > 1:
        return None, "UNRESOLVED_MULTIPLE_EXACT_ACCEPTED"
    if len(exact) == 1:
        return exact[0], "EXACT_NAME_NON_ACCEPTED"
    if len(exact) > 1:
        return None, "UNRESOLVED_MULTIPLE_EXACT"
    if len(rows) == 1:
        return None, "UNRESOLVED_SINGLE_NONEXACT_CANDIDATE"
    return None, "UNRESOLVED_MULTIPLE_NONEXACT_CANDIDATES"


def json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def csv_write(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--universe", default="data/05/taxon_universe.csv")
    parser.add_argument("--out", default="out/05/amenaza")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--pause", type=float, default=float(os.getenv("EIDOS_PAUSE", "0.08")))
    args = parser.parse_args()

    out_dir = Path(args.out)
    raw_tax_dir = out_dir / "raw" / "taxonomy"
    raw_con_dir = out_dir / "raw" / "conservation"
    for p in (raw_tax_dir, raw_con_dir):
        p.mkdir(parents=True, exist_ok=True)

    with open(args.universe, encoding="utf-8-sig", newline="") as f:
        universe = list(csv.DictReader(f))
    universe = [r for r in universe if int(r["universe_index"]) >= args.start]
    if args.limit > 0:
        universe = universe[: args.limit]

    client = EidosClient(pause=args.pause)
    fetched_at = utc_now()
    reconciliation: list[dict[str, Any]] = []
    evidence: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []

    for pos, row in enumerate(universe, start=1):
        idx = int(row["universe_index"])
        taxon = compact_ws(row["taxon"])
        family = compact_ws(row.get("family"))
        variants = query_variants(taxon)
        all_candidates: list[dict[str, Any]] = []
        variants_tried: list[str] = []
        tax_query_errors: list[str] = []
        raw_variant_records: list[dict[str, Any]] = []

        for variant in variants:
            variants_tried.append(variant)
            url = TAXON_ENDPOINT + urllib.parse.quote(variant, safe="")
            try:
                payload = client.get_json(url)
                candidates = as_rows(payload)
                raw_variant_records.append({"query_variant": variant, "url": url, "payload": payload})
                all_candidates.extend(candidates)
                if candidates:
                    break
            except Exception as exc:
                tax_query_errors.append(f"{type(exc).__name__}: {exc}")
                raw_variant_records.append({"query_variant": variant, "url": url, "error": str(exc)})

        unique_candidates: list[dict[str, Any]] = []
        seen = set()
        for cand in all_candidates:
            token = json.dumps(cand, ensure_ascii=False, sort_keys=True, default=str)
            if token not in seen:
                seen.add(token)
                unique_candidates.append(cand)

        raw_tax_path = raw_tax_dir / f"{idx:04d}_{hashlib.sha1(taxon.encode('utf-8')).hexdigest()[:12]}.json"
        json_write(raw_tax_path, {"universe_index": idx, "input_taxon": taxon, "query_variants": raw_variant_records, "fetched_at": fetched_at})

        chosen, match_state = pick_candidate(taxon, unique_candidates)
        chosen_id = candidate_taxon_id(chosen) if chosen else None
        chosen_name = returned_name(chosen) if chosen else ""
        chosen_nametype = compact_ws(chosen.get("nametype")) if chosen else ""
        reconciliation_state = "SOURCE_ERROR" if tax_query_errors and not unique_candidates else match_state

        reconciliation.append({
            "universe_index": idx,
            "family": family,
            "input_taxon": taxon,
            "query_variants": " | ".join(variants_tried),
            "candidate_count": len(unique_candidates),
            "reconciliation_state": reconciliation_state,
            "eidos_idtaxon": chosen_id if chosen_id is not None else "",
            "eidos_returned_name": chosen_name,
            "eidos_nametype": chosen_nametype,
            "query_errors": " | ".join(tax_query_errors),
            "taxonomy_raw_file": str(raw_tax_path.relative_to(out_dir)),
            "consulted_at": fetched_at,
        })

        evidence_count = 0
        conservation_error = ""
        if chosen_id is not None and reconciliation_state in ("EXACT_ACCEPTED", "EXACT_NAME_NON_ACCEPTED"):
            cons_url = CONSERVATION_ENDPOINT + str(chosen_id)
            try:
                cons_payload = client.get_json(cons_url)
                cons_rows = as_rows(cons_payload)
                raw_con_path = raw_con_dir / f"{chosen_id}.json"
                json_write(raw_con_path, {"universe_index": idx, "input_taxon": taxon, "eidos_idtaxon": chosen_id, "url": cons_url, "payload": cons_payload, "fetched_at": fetched_at})
                for crec in cons_rows:
                    evidence_count += 1
                    evidence.append({
                        "universe_index": idx,
                        "family": family,
                        "input_taxon": taxon,
                        "source_taxon": chosen_name,
                        "eidos_idtaxon": chosen_id,
                        "source": SOURCE_NAME,
                        "institution": SOURCE_INSTITUTION,
                        "territorial_scope": compact_ws(crec.get("aplicacion") or crec.get("ambito") or crec.get("ámbito") or crec.get("scope")),
                        "category": compact_ws(crec.get("conservacion") or crec.get("categoría") or crec.get("categoria") or crec.get("category")),
                        "category_system": compact_ws(crec.get("autoridad") or crec.get("sistema") or crec.get("authority")),
                        "evaluation_year": compact_ws(crec.get("anio") or crec.get("año") or crec.get("year")),
                        "criteria": compact_ws(crec.get("criterios") or crec.get("criteria")),
                        "version": compact_ws(crec.get("version") or crec.get("versión")),
                        "source_identifier": compact_ws(crec.get("id") or crec.get("idest") or crec.get("idestadoconservacion")),
                        "source_url": cons_url,
                        "evidence_structured_json": json.dumps(crec, ensure_ascii=False, sort_keys=True),
                        "consulted_at": fetched_at,
                        "validation_state": "SOURCE_STRUCTURED_RECORD",
                        "uncertainty": "",
                        "raw_file": str(raw_con_path.relative_to(out_dir)),
                    })
            except Exception as exc:
                conservation_error = f"{type(exc).__name__}: {exc}"

        if reconciliation_state == "SOURCE_ERROR" or conservation_error:
            evidence_state = "SOURCE_ERROR"
        elif chosen_id is None:
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
            "eidos_idtaxon": chosen_id if chosen_id is not None else "",
            "eidos_returned_name": chosen_name,
            "evidence_records": evidence_count,
            "evidence_state": evidence_state,
            "conservation_query_error": conservation_error,
            "consulted_at": fetched_at,
        })

        if pos % 100 == 0 or pos == len(universe):
            print(json.dumps({"progress": pos, "total": len(universe), "last_universe_index": idx, "api_calls": client.calls, "retries": client.retry_count}, ensure_ascii=False), flush=True)

    recon_fields = ["universe_index","family","input_taxon","query_variants","candidate_count","reconciliation_state","eidos_idtaxon","eidos_returned_name","eidos_nametype","query_errors","taxonomy_raw_file","consulted_at"]
    evidence_fields = ["universe_index","family","input_taxon","source_taxon","eidos_idtaxon","source","institution","territorial_scope","category","category_system","evaluation_year","criteria","version","source_identifier","source_url","evidence_structured_json","consulted_at","validation_state","uncertainty","raw_file"]
    summary_fields = ["universe_index","family","input_taxon","reconciliation_state","eidos_idtaxon","eidos_returned_name","evidence_records","evidence_state","conservation_query_error","consulted_at"]
    csv_write(out_dir / "taxon_reconciliation.csv", reconciliation, recon_fields)
    csv_write(out_dir / "evidence_records.csv", evidence, evidence_fields)
    csv_write(out_dir / "taxon_summary.csv", summary, summary_fields)

    state_counts: dict[str, int] = {}
    for r in summary:
        state_counts[r["evidence_state"]] = state_counts.get(r["evidence_state"], 0) + 1
    reconciliation_counts: dict[str, int] = {}
    for r in reconciliation:
        k = r["reconciliation_state"]
        reconciliation_counts[k] = reconciliation_counts.get(k, 0) + 1

    manifest = {
        "objective": "AMENAZA",
        "stage": "EVIDENCE_COLLECTION",
        "method_version": "AMENAZA_EIDOS_EVIDENCE_v1",
        "generated_at": utc_now(),
        "consulted_at": fetched_at,
        "source": SOURCE_NAME,
        "source_institution": SOURCE_INSTITUTION,
        "taxa_attempted": len(summary),
        "universe_start_index": int(universe[0]["universe_index"]) if universe else None,
        "universe_end_index": int(universe[-1]["universe_index"]) if universe else None,
        "evidence_records": len(evidence),
        "evidence_state_counts": state_counts,
        "reconciliation_state_counts": reconciliation_counts,
        "api_calls": client.calls,
        "retry_count": client.retry_count,
        "scoring_performed": False,
        "absence_inference_performed": False,
    }
    json_write(out_dir / "run_manifest.json", manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
