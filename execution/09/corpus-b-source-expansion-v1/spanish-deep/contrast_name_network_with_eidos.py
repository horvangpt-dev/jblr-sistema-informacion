#!/usr/bin/env python3
import json,re,sys,hashlib
from pathlib import Path

network_path=Path(sys.argv[1]); ttl_path=Path(sys.argv[2]); outdir=Path(sys.argv[3]); outdir.mkdir(parents=True,exist_ok=True)
network=json.loads(network_path.read_text(encoding='utf-8'))

def norm(s):
    return re.sub(r'\s+',' ',s.replace('×','x')).strip()

def source_rank_from_name(name):
    n=norm(name)
    if re.search(r'\b(sp\.|spp\.|gr\.)\b',n): return ('OPEN_IDENTIFICATION',None)
    toks=n.split()
    if len(toks)>=4 and 'x' in toks[2:] and toks[1] != 'x': return ('HYBRID_FORMULA',None)
    if len(toks)>=3 and toks[1]=='x': return ('NAMED_HYBRID','Nothospecies')
    if len(toks)>=4 and toks[2] in ('subsp.','ssp.'):
        return ('INFRASPECIFIC','Subspecies')
    if len(toks)>=4 and toks[2]=='var.': return ('INFRASPECIFIC','Variety')
    if len(toks)==2: return ('SPECIES','Species')
    return ('AMBIGUOUS',None)

def canonical_from_candidate(name):
    n=norm(re.sub(r'\[\*\]','',name))
    toks=n.split()
    if len(toks)>=3 and toks[1]=='x' and re.fullmatch(r'[A-Za-z-]+',toks[2]):
        return norm(' '.join(toks[:3])), 'Nothospecies'
    if len(toks)>=4 and toks[2] in ('subsp.','ssp.'):
        return norm(f'{toks[0]} {toks[1]} subsp. {toks[3]}'), 'Subspecies'
    if len(toks)>=4 and toks[2]=='var.':
        return norm(f'{toks[0]} {toks[1]} var. {toks[3]}'), 'Variety'
    if len(toks)>=2 and re.match(r'^[A-Z][A-Za-z.-]+$',toks[0]) and re.match(r'^[a-z][A-Za-z-]+$',toks[1]):
        return norm(f'{toks[0]} {toks[1]}'), 'Species'
    return None,None

# stream Turtle statement blocks and index taxon records only
index={}; raw_scientific={}; block=[]
pat_taxid=re.compile(r'Darwin:taxonID\s+"([^"]+)"')
pat_sci=re.compile(r'Darwin:scientificName\s+"([^"]+)"')
pat_genus=re.compile(r'Darwin:genus\s+"([^"]+)"')
pat_spec=re.compile(r'Darwin:specificEpithet\s+"([^"]+)"')
pat_infra=re.compile(r'Darwin:infraspecificEpithet\s+"([^"]+)"')
pat_rank=re.compile(r'Darwin:taxonRank\s+"([^"]+)"')
pat_status=re.compile(r'Darwin:taxonomicStatus\s+"([^"]+)"')
pat_accusage=re.compile(r'Darwin:acceptedNameUsageID\s+"([^"]+)"')
pat_according=re.compile(r'Darwin:nameAccordingTo\s+"([^"]+)"')

def flush(lines):
    if not lines: return
    txt='\n'.join(lines)
    if 'Darwin:taxonID' not in txt or 'Darwin:scientificName' not in txt: return
    def g(p):
        m=p.search(txt); return m.group(1) if m else None
    taxid,sci,genus,spec,infra,rank,status,acc,according = g(pat_taxid),g(pat_sci),g(pat_genus),g(pat_spec),g(pat_infra),g(pat_rank),g(pat_status),g(pat_accusage),g(pat_according)
    if not taxid or not sci: return
    rec={'taxonID':taxid,'scientificName':sci,'genus':genus,'specificEpithet':spec,'infraspecificEpithet':infra,'taxonRank':rank,'taxonomicStatus':status,'acceptedNameUsageID':acc,'nameAccordingTo':according}
    raw_scientific.setdefault(norm(sci),[]).append(rec)
    key=None
    if genus and spec and rank:
        rl=rank.lower()
        if rl=='species': key=norm(f'{genus} {spec}')
        elif rl=='subspecies' and infra: key=norm(f'{genus} {spec} subsp. {infra}')
        elif rl=='variety' and infra: key=norm(f'{genus} {spec} var. {infra}')
        elif 'notho' in rl:
            # derive named hybrid spelling from scientificName when possible
            m=re.match(r'^([A-Z][A-Za-z.-]+)\s+[×x]\s*([a-z][A-Za-z-]+)',sci)
            if m: key=norm(f'{m.group(1)} x {m.group(2)}')
    if key: index.setdefault(key,[]).append(rec)

with ttl_path.open('r',encoding='utf-8',errors='replace') as fh:
    for line in fh:
        if not line.strip(): flush(block); block=[]
        else: block.append(line.rstrip('\n'))
    flush(block)

results=[]; resolved=[]
for row in network['rows']:
    original=row['NOMBRE_RIOJA_VERBATIM']; skind,srank=source_rank_from_name(original)
    candidates=[]
    for nm in row.get('names') or []:
        can,rank=canonical_from_candidate(nm)
        if not can: continue
        if srank and rank != srank: # no rank collapse
            candidates.append({'name':nm,'canonical':can,'candidate_rank':rank,'state':'RANK_MISMATCH_REJECTED','records':[]}); continue
        recs=index.get(can,[])
        candidates.append({'name':nm,'canonical':can,'candidate_rank':rank,'state':'EIDOS_MATCH' if recs else 'NO_EIDOS_MATCH','records':recs})
    accepted=[]
    for c in candidates:
        if c['state']!='EIDOS_MATCH': continue
        for r in c['records']:
            if (r.get('taxonomicStatus') or '').lower() in ('aceptado/válido','aceptado/valido','accepted','valid'):
                accepted.append((c,r))
    uniq={r['taxonID']:(c,r) for c,r in accepted}
    terminal='UNRESOLVED_AFTER_FLORA_IBERICA_SWEEP'
    resolved_id=None; resolved_name=None
    if len(uniq)==1:
        resolved_id,(c,r)=next(iter(uniq.items())); resolved_name=r['scientificName']; terminal='RESOLVED_BY_SPANISH_SYNONYMY_TO_EIDOS'
        resolved.append({'B_SOURCE_RECORD_ID':row['B_SOURCE_RECORD_ID'],'original':original,'MITECO_IDTAXON':resolved_id,'EIDOS_NAME':resolved_name,'via_name':c['name'],'source':'FLORA_IBERICA'})
    elif len(uniq)>1:
        terminal='EIDOS_CONFLICT_MULTIPLE_ACCEPTED_IDS'
    if skind in ('OPEN_IDENTIFICATION','HYBRID_FORMULA','AMBIGUOUS'):
        terminal='NON_AUTOMATIC_SPECIAL_CASE'
        resolved_id=None; resolved_name=None
    results.append({'B_SOURCE_RECORD_ID':row['B_SOURCE_RECORD_ID'],'NOMBRE_RIOJA_VERBATIM':original,'source_kind':skind,'source_rank':srank,'flora_iberica_query_state':row.get('query_state'),'terminal_state':terminal,'MITECO_IDTAXON':resolved_id,'EIDOS_NAME':resolved_name,'candidate_evidence':candidates})

summary={
 'run_id':'09_CORPUS_B_SPANISH_SYNONYMY_EIDOS_DEEP_20260824_001',
 'eidos_source':'https://datos.iepnb.es/datasets/eidos.ttl',
 'eidos_ttl_bytes':ttl_path.stat().st_size,
 'eidos_ttl_sha256':hashlib.sha256(ttl_path.read_bytes()).hexdigest(),
 'total_rows':len(results),
 'resolved_by_spanish_synonymy_to_eidos':sum(r['terminal_state']=='RESOLVED_BY_SPANISH_SYNONYMY_TO_EIDOS' for r in results),
 'conflicts':sum(r['terminal_state']=='EIDOS_CONFLICT_MULTIPLE_ACCEPTED_IDS' for r in results),
 'special_cases':sum(r['terminal_state']=='NON_AUTOMATIC_SPECIAL_CASE' for r in results),
 'unresolved_after_flora_iberica':sum(r['terminal_state']=='UNRESOLVED_AFTER_FLORA_IBERICA_SWEEP' for r in results),
 'results':results
}
(outdir/'CORPUS_B_337_SPANISH_SYNONYMY_EIDOS_RESULTS.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(outdir/'CORPUS_B_337_NEW_EIDOS_IDS.json').write_text(json.dumps({'run_id':summary['run_id'],'count':len(resolved),'rows':resolved},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ('results',)},ensure_ascii=False))
