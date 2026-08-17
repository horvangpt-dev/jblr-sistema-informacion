#!/usr/bin/env python3
"""JBLR 05 · AMENAZA · European Red List of Vascular Plants (2011).

Extracts Appendix 2 from the publication PDF and matches source names conservatively
against the canonical JBLR universe. Evidence-only: no scoring, weighting, absence
inference, territorial precedence, or temporal precedence.
"""
from __future__ import annotations
import argparse,csv,json,re,unicodedata
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from pypdf import PdfReader

METHOD_VERSION='AMENAZA_EUROPE_CONTINENTAL_2011_v1'
SOURCE='European Red List of Vascular Plants'
INSTITUTION='European Commission / IUCN'
DOI='10.2779/8515'
SOURCE_URL='https://doi.org/10.2779/8515'
CATS={'EX','EW','RE','CR','EN','VU','NT','LC','DD','NE','NA'}
START=re.compile(r'^([A-ZÁÉÍÓÚÜÑ-]{3,})\s+(.+?)\s+(EX|EW|RE|CR|EN|VU|NT|LC|DD|NE|NA)(?:\s+|$)')
META={'Yes','No','I','II','III','IV','V','II/IV','I/II','I/III','II/III'}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
def compact(s): return re.sub(r'\s+',' ',str(s or '')).strip()
def key(s):
    s=compact(s).replace('¹','')
    s=unicodedata.normalize('NFKD',s); s=''.join(c for c in s if not unicodedata.combining(c))
    return s.casefold()
def rank_variant(s):
    return re.sub(r'\bssp\.\s*','subsp. ',compact(s),flags=re.I)
def read_csv(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write_csv(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore'); w.writeheader();w.writerows(rows)

def parse_pdf(pdf):
    r=PdfReader(pdf); records=[]; cur=None
    # Physical PDF pages 82–135 inclusive contain Appendix 2 table.
    for i in range(81,135):
        text=r.pages[i].extract_text() or ''
        for line in text.splitlines():
            line=compact(line); m=START.match(line)
            if m:
                if cur: records.append(cur)
                cur={'pdf_page':i+1,'lines':[line]}
            elif cur: cur['lines'].append(line)
    if cur: records.append(cur)
    out=[]
    for rec in records:
        text=' '.join(x for x in rec['lines'] if x); toks=text.split(); fam=toks[0]
        pos=[i for i,t in enumerate(toks[1:],1) if t in CATS]
        if len(pos)<2: raise AssertionError(f'cannot parse source record page {rec["pdf_page"]}: {text[:300]}')
        p1,p2=pos[0],pos[1]
        source_taxon=' '.join(toks[1:p1]).replace('¹','').strip()
        cat_europe=toks[p1]; criteria_europe=' '.join(toks[p1+1:p2])
        cat_eu27=toks[p2]; crit=[]
        for t in toks[p2+1:]:
            if t in META or re.fullmatch(r'[IVX]+(?:/[IVX]+)*',t): break
            if t in {'Family','Species','IUCN','Red','List','Category','Endemic','Habitats','Directive','Annexes','Bern','Convention','CITES','Aquatic','Crop','wild','relative?'}: break
            crit.append(t)
        out.append({'pdf_page':rec['pdf_page'],'source_family':fam,'source_taxon':source_taxon,'europe_category':cat_europe,'europe_criteria':criteria_europe,'eu27_category':cat_eu27,'eu27_criteria':' '.join(crit),'source_record_text':text})
    assert len(out)==1826, f'expected 1826 Appendix 2 taxa, got {len(out)}'
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--pdf',required=True);ap.add_argument('--universe',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    source=parse_pdf(a.pdf); universe=read_csv(a.universe); assert len(universe)==2742
    exact={key(r['taxon']):r for r in universe}; assert len(exact)==2742
    evidence=[]; summary=[]; reconc=[]; matched=set(); unresolved=[]; ts=now()
    for s in source:
        k=key(s['source_taxon']); u=exact.get(k); state='EXACT_NAME'
        if not u:
            rv=rank_variant(s['source_taxon']); u=exact.get(key(rv)); state='RANK_ABBREVIATION_NORMALIZED' if u else 'TAXON_UNRESOLVED'
        idx=int(u['universe_index']) if u else None
        reconc.append({'source_taxon':s['source_taxon'],'source_family':s['source_family'],'pdf_page':s['pdf_page'],'universe_index':idx or '','input_taxon':u['taxon'] if u else '','reconciliation_state':state})
        if not u:
            unresolved.append(s); continue
        matched.add(idx)
        for scope,cat,criteria in [('Europe',s['europe_category'],s['europe_criteria']),('EU27',s['eu27_category'],s['eu27_criteria'])]:
            evidence.append({'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'source_taxon':s['source_taxon'],'territorial_scope':scope,'category':cat,'category_system':'IUCN Red List Categories and Criteria','criteria':criteria,'evaluation_year':'2011','source':SOURCE,'institution':INSTITUTION,'source_identifier':DOI,'source_url':SOURCE_URL,'pdf_page':s['pdf_page'],'source_record_text':s['source_record_text'],'validation_state':'SOURCE_PUBLICATION_RECORD','uncertainty':'','consulted_at':ts,'scoring_performed':'NO'})
    counts=Counter(int(r['universe_index']) for r in evidence)
    for u in universe:
        idx=int(u['universe_index'])
        summary.append({'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'valid_evidence_records':counts[idx],'source_state':'VALID_SOURCE_EVIDENCE' if counts[idx] else 'NO_EVALUATION_FOUND','consulted_at':ts})
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    write_csv(out/'evidence_records.csv',evidence,list(evidence[0].keys()))
    write_csv(out/'taxon_summary.csv',summary,list(summary[0].keys()))
    write_csv(out/'taxon_reconciliation.csv',reconc,list(reconc[0].keys()))
    # Preserve all source records including those not matched to canonical universe.
    write_csv(out/'source_records.csv',source,list(source[0].keys()))
    manifest={'objective':'AMENAZA','stage':'EVIDENCE_COLLECTION','method_version':METHOD_VERSION,'source':SOURCE,'source_records':len(source),'canonical_taxa_matched':len(matched),'canonical_taxa_no_evaluation_found':2742-len(matched),'source_taxa_unresolved_against_canonical_universe':len(unresolved),'valid_evidence_records':len(evidence),'scoring_performed':False,'absence_inference_performed':False,'generated_at':ts}
    assert len(summary)==2742 and len(evidence)==2*len(matched)
    (out/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
