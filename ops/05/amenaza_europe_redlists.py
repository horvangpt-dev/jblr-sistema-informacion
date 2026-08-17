#!/usr/bin/env python3
"""JBLR 05 · AMENAZA · European national/subnational red-list evidence.

Consumes the unchanged 2024 Figshare v1.0 XLSX source. Uses only exact normalized
scientific-name matching; never fuzzy-matches. Records whose original source name
matches JBLR but whose accepted identity is unresolved remain TAXON_UNRESOLVED.
No scoring and no absence inference are performed.
"""
from __future__ import annotations

import argparse, csv, hashlib, json, re, unicodedata, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

METHOD_VERSION = "AMENAZA_EUROPE_NATIONAL_REDLISTS_EVIDENCE_v1"
SOURCE_DATASET = "Database of European vascular plants red lists v1.0"
SOURCE_ARTICLE_DOI = "10.1038/s41597-024-03963-0"
SOURCE_DATA_DOI = "10.6084/m9.figshare.26982994"
SOURCE_FILE_ID = "49115563"
SOURCE_FILE_MD5 = "7292f006b8f32f4e79b8c1985cd91069"
SOURCE_URL = "https://doi.org/10.6084/m9.figshare.26982994"


def utc_now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def name_key(value):
    s = str(value or "").strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).replace("×", "x")
    for pat in (r"\bsubsp\.\s*", r"\bssp\.\s*", r"\bvar\.\s*", r"\bf\.\s*"):
        s = re.sub(pat, "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip().casefold()

def col_index(ref):
    m = re.match(r"([A-Z]+)", ref); n = 0
    for ch in m.group(1): n = n * 26 + ord(ch) - 64
    return n - 1

def load_shared_strings(z):
    out=[]
    with z.open("xl/sharedStrings.xml") as f:
        for _, elem in ET.iterparse(f, events=("end",)):
            if elem.tag.endswith("}si"):
                out.append("".join(t.text or "" for t in elem.iter() if t.tag.endswith("}t")))
                elem.clear()
    return out

def iter_sheet_rows(xlsx):
    with zipfile.ZipFile(xlsx) as z:
        sst=load_shared_strings(z)
        with z.open("xl/worksheets/sheet1.xml") as f:
            for _, elem in ET.iterparse(f, events=("end",)):
                if elem.tag.endswith("}row"):
                    vals={}
                    for c in elem:
                        if not c.tag.endswith("}c"): continue
                        ci=col_index(c.attrib.get("r","A1")); typ=c.attrib.get("t")
                        v=c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                        if typ=="inlineStr":
                            isel=c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is")
                            txt="".join(x.text or "" for x in isel.iter() if x.tag.endswith("}t")) if isel is not None else ""
                        elif v is None: txt=""
                        else:
                            raw=v.text or ""; txt=sst[int(raw)] if typ=="s" and raw else raw
                        vals[ci]=txt
                    if vals: yield [vals.get(i,"") for i in range(max(vals)+1)]
                    elem.clear()

def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w=csv.DictWriter(f, fieldnames=fields, extrasaction="ignore"); w.writeheader(); w.writerows(rows)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--universe",required=True); ap.add_argument("--source",required=True); ap.add_argument("--out",required=True); a=ap.parse_args()
    source=Path(a.source); out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    assert hashlib.md5(source.read_bytes()).hexdigest()==SOURCE_FILE_MD5, "source MD5 mismatch"
    with open(a.universe,encoding="utf-8-sig",newline="") as f: universe=list(csv.DictReader(f))
    assert len(universe)==2742
    bykey={name_key(r["taxon"]):r for r in universe}; assert len(bykey)==2742
    it=iter_sheet_rows(source); header=next(it); cols={v:i for i,v in enumerate(header)}
    required=["Database ID","Country","Sub-country","Original taxonomic name","Accepted taxonomic name without authorships","Accepted taxonomic name with authorships","LSID-Accepted taxonomic name","Name backbone used","Confidence level","Red list category","Standardized red list category","References"]
    assert all(x in cols for x in required)
    matches=[]; source_rows=0; consulted=utc_now()
    for row in it:
        source_rows+=1
        def g(k): return row[cols[k]] if cols[k] < len(row) else ""
        acc,orig=g("Accepted taxonomic name without authorships"),g("Original taxonomic name")
        hit=None; basis=""
        if acc and name_key(acc) in bykey: hit=bykey[name_key(acc)]; basis="ACCEPTED_NAME_EXACT_NORMALIZED"
        elif orig and name_key(orig) in bykey: hit=bykey[name_key(orig)]; basis="ORIGINAL_NAME_EXACT_NORMALIZED"
        if not hit: continue
        conf=g("Confidence level")
        if basis=="ACCEPTED_NAME_EXACT_NORMALIZED": identity="ACCEPTED_NAME_MATCH"
        elif conf in {"HIGH","MEDIUM"} and acc: identity="SOURCE_RECONCILED_SYNONYM"
        else: identity="TAXON_IDENTITY_UNRESOLVED"
        matches.append({
            "universe_index":hit["universe_index"],"family":hit["family"],"input_taxon":hit["taxon"],
            "database_id":g("Database ID"),"country":g("Country"),"sub_country":g("Sub-country"),
            "territorial_scope_type":"SUB_COUNTRY" if g("Sub-country") else "COUNTRY",
            "original_taxonomic_name":orig,"accepted_taxonomic_name":acc,
            "accepted_with_authorship":g("Accepted taxonomic name with authorships"),"lsid":g("LSID-Accepted taxonomic name"),
            "name_backbone":g("Name backbone used"),"confidence_level":conf,
            "red_list_category":g("Red list category"),"standardized_category":g("Standardized red list category"),
            "reference":g("References"),"match_basis":basis,"identity_state":identity,
            "evidence_state":"VALID_SOURCE_EVIDENCE" if identity!="TAXON_IDENTITY_UNRESOLVED" else "TAXON_UNRESOLVED",
            "category_system":"Original country/sub-country red list; standardized category harmonized by dataset authors to IUCN regional categories (IUCN 2012)",
            "evaluation_date_state":"NOT_STRUCTURED_SEPARATELY_IN_SOURCE","source_dataset":SOURCE_DATASET,
            "source_article_doi":SOURCE_ARTICLE_DOI,"source_data_doi":SOURCE_DATA_DOI,"source_file_id":SOURCE_FILE_ID,
            "source_file_md5":SOURCE_FILE_MD5,"source_url":SOURCE_URL,"consulted_at":consulted,
        })
    fields=list(matches[0].keys()); write_csv(out/"evidence_records.csv",matches,fields)
    bytax=defaultdict(list)
    for r in matches: bytax[int(r["universe_index"])].append(r)
    summary=[]
    for u in universe:
        rs=bytax.get(int(u["universe_index"]),[]); valid=[r for r in rs if r["evidence_state"]=="VALID_SOURCE_EVIDENCE"]; unr=[r for r in rs if r["evidence_state"]=="TAXON_UNRESOLVED"]
        countries=sorted({r["country"] for r in valid})
        state="EVIDENCE_FOUND" if valid else ("TAXON_UNRESOLVED" if unr else "NO_EVALUATION_FOUND_IN_SOURCE")
        summary.append({"universe_index":u["universe_index"],"family":u["family"],"input_taxon":u["taxon"],"matched_records_total":len(rs),"valid_evidence_records":len(valid),"taxonomically_unresolved_records":len(unr),"countries_with_valid_evidence":len(countries),"country_list":" | ".join(countries),"source_state":state,"source_dataset":SOURCE_DATASET,"consulted_at":consulted})
    write_csv(out/"taxon_summary.csv",summary,list(summary[0].keys()))
    manifest={"method_version":METHOD_VERSION,"source_rows":source_rows,"taxon_universe":len(universe),"matched_rows":len(matches),"taxa_any_match":len(bytax),"valid_evidence_rows":sum(r["evidence_state"]=="VALID_SOURCE_EVIDENCE" for r in matches),"taxa_with_valid_evidence":sum(r["source_state"]=="EVIDENCE_FOUND" for r in summary),"taxa_with_taxonomically_unresolved_only":sum(r["source_state"]=="TAXON_UNRESOLVED" for r in summary),"taxa_with_no_evaluation_found_in_source":sum(r["source_state"]=="NO_EVALUATION_FOUND_IN_SOURCE" for r in summary),"identity_state_counts":dict(Counter(r["identity_state"] for r in matches)),"match_basis_counts":dict(Counter(r["match_basis"] for r in matches)),"source_file_md5":SOURCE_FILE_MD5,"scoring_performed":False,"absence_inference_performed":False,"generated_at":utc_now()}
    (out/"run_manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8")
    print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))

if __name__=="__main__": main()
