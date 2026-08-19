#!/usr/bin/env python3
import csv
import importlib.util
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import certifi
import requests

V4_PATH = Path(__file__).with_name("taxonomic-reality-protocol-1259-v4.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_v4", V4_PATH)
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)

OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_1259_v5"))
WFO_API = "https://list.worldfloraonline.org/gql.php"
WFO_WAIT = float(os.environ.get("WFO_API_WAIT", "0.55"))

GRAPHQL = """query NameMatch($searchString: String, $fallbackToGenus: Boolean) {
  taxonNameMatch(
    inputString: $searchString
    checkHomonyms: false
    checkRank: false
    fallbackToGenus: $fallbackToGenus
  ) {
    inputString
    searchString
    match {
      id
      fullNameStringPlain
      role
      wfoPath
    }
    candidates {
      id
      fullNameStringPlain
      role
      wfoPath
    }
    error
    errorMessage
    method
    narrative
  }
}"""


def now():
    return datetime.now(timezone.utc).isoformat()


def truthy(value):
    return str(value or "").strip().lower() not in {"", "0", "false", "none", "null", "nan"}


class WfoApi:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = certifi.where()
        self.session.headers.update({
            "User-Agent": "JBLR-Taxonomic-Reality-Protocol/5.1 (+scientific quality-control)",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        self.last_call = 0.0
        self.calls = 0
        self.meta = {
            "source": "World Flora Online",
            "provenance": "Official normative WFO Plant List GraphQL API used by the official worldflora/wfor package",
            "api_url": WFO_API,
            "query": "taxonNameMatch",
            "fallbackToGenus": False,
            "checkHomonyms": False,
            "checkRank": False,
            "tls_verification": "CERTIFI_CA_BUNDLE",
        }

    def _throttle(self):
        elapsed = time.monotonic() - self.last_call
        if elapsed < WFO_WAIT:
            time.sleep(WFO_WAIT - elapsed)

    def search(self, target):
        payload = {"query": GRAPHQL, "variables": {"searchString": target, "fallbackToGenus": False}}
        last_error = ""
        for attempt in range(6):
            try:
                self._throttle()
                r = self.session.post(WFO_API, json=payload, timeout=60)
                self.last_call = time.monotonic()
                self.calls += 1
                if r.status_code == 429 or 500 <= r.status_code < 600:
                    last_error = f"HTTP_{r.status_code}"
                    if attempt < 5:
                        time.sleep(min(20, 2 ** attempt))
                        continue
                if r.status_code != 200:
                    return {
                        "state": "SOURCE_ERROR", "matched_name": "", "wfo_id": "", "role": "",
                        "wfo_path": "", "method": "", "narrative": "", "candidate_count": "",
                        "api_error": f"HTTP_{r.status_code}", "error": f"HTTP_{r.status_code}",
                    }
                data = r.json()
                if data.get("errors"):
                    return {
                        "state": "SOURCE_ERROR", "matched_name": "", "wfo_id": "", "role": "",
                        "wfo_path": "", "method": "", "narrative": "", "candidate_count": "",
                        "api_error": json.dumps(data.get("errors"), ensure_ascii=False)[:800],
                        "error": "GRAPHQL_ERRORS",
                    }
                obj = (data.get("data") or {}).get("taxonNameMatch") or {}
                match = obj.get("match")
                candidates = obj.get("candidates") or []
                if match:
                    return {
                        "state": "TAXON_MATCH_FOUND",
                        "matched_name": match.get("fullNameStringPlain", ""),
                        "wfo_id": match.get("id", ""),
                        "role": match.get("role", ""),
                        "wfo_path": match.get("wfoPath", ""),
                        "method": obj.get("method", ""),
                        "narrative": obj.get("narrative", ""),
                        "candidate_count": len(candidates),
                        "api_error": obj.get("errorMessage", "") if obj.get("error") else "",
                        "error": "",
                    }
                return {
                    "state": "NO_TAXON_MATCH",
                    "matched_name": "", "wfo_id": "", "role": "", "wfo_path": "",
                    "method": obj.get("method", ""), "narrative": obj.get("narrative", ""),
                    "candidate_count": len(candidates),
                    "api_error": obj.get("errorMessage", "") if obj.get("error") else "",
                    "error": "",
                }
            except Exception as e:
                self.last_call = time.monotonic()
                last_error = str(e)
                if attempt < 5:
                    time.sleep(min(20, 2 ** attempt))
                    continue
        return {
            "state": "SOURCE_ERROR", "matched_name": "", "wfo_id": "", "role": "",
            "wfo_path": "", "method": "", "narrative": "", "candidate_count": "",
            "api_error": "", "error": last_error[:800],
        }


def build_static_sources():
    powo = v4.RobustDwcIndex("powo_wcvp", v4.mod.SOURCES["powo_wcvp"])
    anthos = v4.RobustDwcIndex("anthos", v4.mod.SOURCES["anthos"])
    powo.start()
    anthos.start()
    return powo, anthos


def static_found(result):
    return result.get("state") == "EXACT_CANONICAL_FOUND"


def static_negative(result):
    return result.get("state") == "EXACT_CANONICAL_NOT_FOUND"


def write_csv(path, rows):
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def execute():
    OUT.mkdir(parents=True, exist_ok=True)
    queue = v4.mod.load_queue()
    expected_n = v4.mod.EXPECTED_N
    if len(queue) != expected_n:
        raise SystemExit(f"QUEUE_COUNT_MISMATCH expected={expected_n} got={len(queue)}")

    powo, anthos = build_static_sources()
    wfo = WfoApi()

    controls = {}
    for key, src in (("powo_wcvp", powo), ("anthos", anthos)):
        known = src.search("Quercus ilex")
        nonsense = src.search("Xqznotaxa fictissima")
        controls[key] = {
            "pass": static_found(known) and static_negative(nonsense),
            "known": known,
            "nonsense": nonsense,
            "meta": src.meta,
        }
    known = wfo.search("Quercus ilex")
    nonsense = wfo.search("Xqznotaxa fictissima")
    controls["wfo"] = {
        "pass": known.get("state") == "TAXON_MATCH_FOUND" and nonsense.get("state") == "NO_TAXON_MATCH",
        "known": known,
        "nonsense": nonsense,
        "meta": wfo.meta,
    }
    preflight_ok = all(v.get("pass") for v in controls.values())
    preflight = {
        "execution": "TAXONOMIC_REALITY_1259_PREFLIGHT_v5_1",
        "at": now(),
        "pass": preflight_ok,
        "checks": controls,
    }
    (OUT / "TAXONOMIC_REALITY_PREFLIGHT_V5.json").write_text(
        json.dumps(preflight, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"preflight_pass": preflight_ok, "summary": {k: v["pass"] for k, v in controls.items()}}, ensure_ascii=False), flush=True)
    if not preflight_ok:
        raise SystemExit(3)

    results = []
    for i, row in enumerate(queue, 1):
        taxon = row["taxon"].strip()
        pr = powo.search(taxon)
        ar = anthos.search(taxon)
        wr = wfo.search(taxon)

        threat_reference = any(truthy(row.get(k)) for k in (
            "assessment_id", "red_list_category_code", "red_list_category"
        ))
        any_found = static_found(pr) or static_found(ar) or wr.get("state") == "TAXON_MATCH_FOUND"
        any_error = wr.get("state") == "SOURCE_ERROR"

        if threat_reference:
            resolution = "KEEP_THREAT_REFERENCE"
        elif any_found:
            resolution = "KEEP_TAXONIC_RESPONSE"
        elif any_error:
            resolution = "SOURCE_INCOMPLETE"
        elif static_negative(pr) and static_negative(ar) and wr.get("state") == "NO_TAXON_MATCH":
            resolution = "NO_RESPONSE_ALL_THREE"
        else:
            resolution = "REVIEW_REQUIRED"

        base = {
            "universe_index": row.get("universe_index", ""),
            "family": row.get("family", ""),
            "taxon": taxon,
            "iucn_problem_state": row.get("match_state", ""),
            "fresh_iucn_threat_reference_present": threat_reference,
            "resolution": resolution,
            "checked_at": now(),
        }
        for prefix, result in (("powo", pr), ("wfo", wr), ("anthos", ar)):
            for k, val in result.items():
                base[f"{prefix}_{k}"] = val
        results.append(base)

        if i % 50 == 0 or i == len(queue):
            print(
                f"processed={i}/{len(queue)} keep={sum(r['resolution'].startswith('KEEP_') for r in results)} "
                f"no_response={sum(r['resolution']=='NO_RESPONSE_ALL_THREE' for r in results)} "
                f"incomplete={sum(r['resolution']=='SOURCE_INCOMPLETE' for r in results)}",
                flush=True,
            )

    no_response = [r for r in results if r["resolution"] == "NO_RESPONSE_ALL_THREE"]
    incomplete = [r for r in results if r["resolution"] == "SOURCE_INCOMPLETE"]
    review = [r for r in results if r["resolution"] == "REVIEW_REQUIRED"]
    keep = [r for r in results if r["resolution"].startswith("KEEP_")]

    write_csv(OUT / "TAXONOMIC_REALITY_1259_RESULTS_V5.csv", results)
    write_csv(OUT / "TAXONOMIC_REALITY_NO_RESPONSE_ALL_THREE_V5.csv", no_response)
    write_csv(OUT / "TAXONOMIC_REALITY_SOURCE_INCOMPLETE_V5.csv", incomplete)
    write_csv(OUT / "TAXONOMIC_REALITY_REVIEW_REQUIRED_V5.csv", review)

    qa = {
        "execution": "TAXONOMIC_REALITY_1259_V5_1",
        "at": now(),
        "queue_count": len(queue),
        "results_count": len(results),
        "keep_count": len(keep),
        "no_response_all_three_count": len(no_response),
        "source_incomplete_count": len(incomplete),
        "review_required_count": len(review),
        "wfo_api_calls": wfo.calls,
        "complete": len(results) == len(queue) and len(incomplete) == 0 and len(review) == 0,
        "automatic_deletion": False,
    }
    (OUT / "TAXONOMIC_REALITY_1259_QA_V5.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    execute()
