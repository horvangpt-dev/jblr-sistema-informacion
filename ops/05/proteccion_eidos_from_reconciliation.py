#!/usr/bin/env python3
"""JBLR 05 Objective 02: acquire legal-protection evidence from EIDOS accepted IDs.

Consumes cached/validated EIDOS taxonomic reconciliation from Objective 01 and therefore
DOES NOT repeat taxon-name queries. Preserves RAW responses and query provenance.
No scoring is coupled to this acquisition layer.
"""
from __future__ import annotations

import argparse, csv, hashlib, json, time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = "https://iepnb.gob.es:443/api/especie/rpc/obtenerestadoslegalesportaxonid?_idtaxon="
SOURCE = "IEPNB / EIDOS"
INSTITUTION = "MITECO / Inventario Español del Patrimonio Natural y de la Biodiversidad"
METHOD_VERSION = "PROTECCION_EIDOS_EVIDENCE_v1"
USER_AGENT = "JBLR-05-Analytical-Evidence/1.0"


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


def compact(v):
    if v is None: return ""
    return " ".join(str(v).split())


def rows_from_payload(payload):
    if payload is None: return []
    if isinstance(payload, list): return payload
    if isinstance(payload, dict):
        for k in ("data", "result", "results", "items"):
            if isinstance(payload.get(k), list): return payload[k]
        return [payload] if payload else []
    return []


def fetch_json(url: str, retries=4, pause=0.15):
    last = None
    for attempt in range(retries + 1):
        started = utc_now(); status = None; headers = {}; body = b""; err = ""
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=45) as resp:
                status = getattr(resp, "status", 200)
                headers = dict(resp.headers.items())
                body = resp.read()
            payload = json.loads(body.decode("utf-8"))
            return payload, {
                "requested_at": started, "completed_at": utc_now(), "url": url,
                "http_status": status, "response_sha256": sha256_bytes(body),
                "response_bytes": len(body), "rate_limit_limit": headers.get("X-RateLimit-Limit", ""),
                "rate_limit_remaining": headers.get("X-RateLimit-Remaining", ""),
                "rate_limit_reset": headers.get("X-RateLimit-Reset", ""),
                "attempt": attempt + 1, "error": "",
            }
        except HTTPError as e:
            status = e.code
            try: body = e.read()
            except Exception: body = b""
            err = f"HTTPError:{e.code}:{e.reason}"
            last = (err, status, body)
            if e.code not in (408, 425, 429) and e.code < 500: break
        except (URLError, TimeoutError, json.JSONDecodeError) as e:
            err = f"{type(e).__name__}:{e}"
            last = (err, status, body)
        if attempt < retries:
            time.sleep(min(8.0, (2 ** attempt) + pause))
    err, status, body = last or ("UNKNOWN_ERROR", None, b"")
    return None, {
        "requested_at": started, "completed_at": utc_now(), "url": url,
        "http_status": status or "", "response_sha256": sha256_bytes(body) if body else "",
        "response_bytes": len(body), "rate_limit_limit": "", "rate_limit_remaining": "",
        "rate_limit_reset": "", "attempt": retries + 1, "error": err,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reconciliation", required=True)
    ap.add_argument("--summary", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pause", type=float, default=0.12)
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "raw"; raw_dir.mkdir(exist_ok=True)

    recon = read_csv(Path(args.reconciliation))
    summary01 = read_csv(Path(args.summary))
    assert len(recon) == len(summary01) == 2742
    by_summary = {int(r["universe_index"]): r for r in summary01}

    evidence = []; summary = []; qlog = []
    cache = {}
    valid_recon_states = {"EXACT_ACCEPTED", "EXACT_NAME_NON_ACCEPTED"}

    for pos, r in enumerate(recon, start=1):
        idx = int(r["universe_index"]); taxon = r["input_taxon"]
        accepted_id = compact(r.get("accepted_taxon_id"))
        recon_state = compact(r.get("reconciliation_state"))
        accepted_name = compact(r.get("accepted_source_taxon"))
        records = 0; source_error = ""
        if not accepted_id or recon_state not in valid_recon_states:
            state = "TAXON_UNRESOLVED"
        else:
            if accepted_id in cache:
                payload, prov = cache[accepted_id]
                prov = dict(prov); prov["cache_hit"] = "YES"; prov["universe_index"] = idx; prov["input_taxon"] = taxon
                qlog.append(prov)
            else:
                url = ENDPOINT + accepted_id
                payload, prov = fetch_json(url)
                prov.update({"universe_index": idx, "input_taxon": taxon, "accepted_taxon_id": accepted_id, "endpoint": ENDPOINT, "query_parameter": "_idtaxon", "query_value": accepted_id, "api_version": "UNVERSIONED_ENDPOINT", "script_method_version": METHOD_VERSION, "cache_hit": "NO"})
                qlog.append(prov); cache[accepted_id] = (payload, prov)
                if payload is not None:
                    raw_bytes = json.dumps({"universe_index": idx, "input_taxon": taxon, "accepted_taxon_id": accepted_id, "accepted_source_taxon": accepted_name, "url": url, "payload": payload, "consulted_at": prov["completed_at"]}, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")
                    (raw_dir / f"{accepted_id}.json").write_bytes(raw_bytes)
                time.sleep(args.pause)
            if payload is None:
                state = "SOURCE_ERROR"; source_error = qlog[-1].get("error", "SOURCE_ERROR")
            else:
                rows = rows_from_payload(payload)
                for rec in rows:
                    if not isinstance(rec, dict): continue
                    records += 1
                    evidence.append({
                        "universe_index": idx, "family": r.get("family", ""), "input_taxon": taxon,
                        "source_returned_name": accepted_name, "accepted_taxon_id": accepted_id,
                        "source": SOURCE, "institution": INSTITUTION,
                        "territorial_scope": compact(rec.get("aplicaa") or rec.get("aplicacion") or rec.get("ambito") or rec.get("ámbito")),
                        "legal_category": compact(rec.get("categoria") or rec.get("categorianorma") or rec.get("categoriaestadolegal") or rec.get("estadolegal")),
                        "legal_instrument": compact(rec.get("norma") or rec.get("nombrenorma") or rec.get("instrumento")),
                        "authority": compact(rec.get("autoridad") or rec.get("administracion") or rec.get("organismo")),
                        "publication_date": compact(rec.get("fecha") or rec.get("fechapublicacion") or rec.get("anio") or rec.get("año")),
                        "instrument_id": compact(rec.get("idnorma")), "category_id": compact(rec.get("idcategoria")), "scope_id": compact(rec.get("idaplicaa")),
                        "source_url": ENDPOINT + accepted_id,
                        "evidence_structured_json": json.dumps(rec, ensure_ascii=False, sort_keys=True),
                        "validation_state": "SOURCE_STRUCTURED_RECORD", "evidence_state": "VALID_SOURCE_EVIDENCE",
                    })
                state = "VALID_SOURCE_EVIDENCE" if records else "NO_EVALUATION_FOUND"
        summary.append({
            "universe_index": idx, "family": r.get("family", ""), "input_taxon": taxon,
            "reconciliation_state": recon_state, "accepted_taxon_id": accepted_id,
            "accepted_source_taxon": accepted_name, "legal_records": records,
            "evidence_state": state, "source_error": source_error,
        })
        if pos % 200 == 0 or pos == 2742:
            print(json.dumps({"progress": pos, "total": 2742, "evidence_records": len(evidence), "query_log_rows": len(qlog)}, ensure_ascii=False), flush=True)

    write_csv(out / "taxon_summary.csv", summary, ["universe_index","family","input_taxon","reconciliation_state","accepted_taxon_id","accepted_source_taxon","legal_records","evidence_state","source_error"])
    write_csv(out / "evidence_records.csv", evidence, ["universe_index","family","input_taxon","source_returned_name","accepted_taxon_id","source","institution","territorial_scope","legal_category","legal_instrument","authority","publication_date","instrument_id","category_id","scope_id","source_url","evidence_structured_json","validation_state","evidence_state"])
    qfields = ["universe_index","input_taxon","accepted_taxon_id","endpoint","query_parameter","query_value","url","api_version","requested_at","completed_at","http_status","response_sha256","response_bytes","rate_limit_limit","rate_limit_remaining","rate_limit_reset","attempt","error","script_method_version","cache_hit"]
    write_csv(out / "query_provenance.csv", qlog, qfields)
    manifest = {
        "objective": "PROTECCION_LEGAL", "stage": "SOURCE_ACQUISITION", "method_version": METHOD_VERSION,
        "taxon_universe": 2742, "source": SOURCE, "endpoint": ENDPOINT,
        "evidence_records": len(evidence), "evidence_state_counts": dict(Counter(r["evidence_state"] for r in summary)),
        "unique_accepted_taxon_ids_queried": len(cache), "query_provenance_rows": len(qlog),
        "taxon_name_requeries": 0, "scoring_performed": False, "generated_at": utc_now(),
    }
    (out / "run_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))

if __name__ == "__main__":
    raise SystemExit(main())
