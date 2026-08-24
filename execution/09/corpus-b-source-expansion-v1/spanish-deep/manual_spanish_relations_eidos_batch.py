#!/usr/bin/env python3
import hashlib,json,re,sys
from pathlib import Path

def norm(s):
    return re.sub(r'\s+',' ',(s or '').replace('×','x')).strip(' .;,').lower()

def canonical(s):
    s=re.sub(r'\s+',' ',(s or '').replace('×','x')).strip()
    m=re.match(r'^([A-Z][A-Za-zÀ-ÿ-]+\s+(?:x\s+)?[a-z][A-Za-zÀ-ÿ0-9.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-z][A-Za-zÀ-ÿ0-9.-]+)?)',s)
    return m.group(1).replace('ssp.','subsp.').strip() if m else s

def parse_eidos(ttl, target_names):
    wanted={norm(x) for x in target_names}; found={k:[] for k in wanted}; block=[]
    def emit(lines):
        if not lines:return
        t='\n'.join(lines)
        mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t)
        mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not (mn and mi):return
        c=canonical(mn.group(1)); k=norm(c)
        if k not in wanted:return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t)
        mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t)
        ma=re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"',t)
        found[k].append({'scientificName':mn.group(1),'canonical':c,'taxonID':mi.group(1),'taxonomicStatus':ms.group(1) if ms else None,'taxonRank':mr.group(1) if mr else None,'nameAccordingTo':ma.group(1) if ma else None})
    with open(ttl,encoding='utf-8',errors='replace') as f:
        for line in f:
            if not line.strip(): emit(block); block=[]
            else:block.append(line.rstrip())
        emit(block)
    return found

def main(relations_path,ttl_path,out_path):
    doc=json.loads(Path(relations_path).read_text(encoding='utf-8'))
    rows=doc['rows']; names=[r['candidate'] for r in rows]
    idx=parse_eidos(ttl_path,names)
    outrows=[]; counts={}
    for r in rows:
        recs=idx.get(norm(r['candidate']),[])
        accepted=[x for x in recs if norm(x.get('taxonomicStatus')) in ('aceptado/válido','aceptado/valido')]
        if not r['idEligible']:
            state='RELATION_DOCUMENTED_NOT_ID_ELIGIBLE'; taxon=None
        elif len(accepted)==1:
            state='RESOLVED_SPANISH_DOCUMENTED_NAME'; taxon=accepted[0]['taxonID']
        elif len(accepted)>1:
            state='AMBIGUOUS_MULTIPLE_ACCEPTED_EIDOS_IDS'; taxon=None
        elif recs:
            state='EIDOS_NAME_PRESENT_NO_UNIQUE_ACCEPTED_RECORD'; taxon=None
        else:
            state='EIDOS_NAME_NOT_FOUND_IN_CURRENT_DUMP'; taxon=None
        counts[state]=counts.get(state,0)+1
        z=dict(r); z.update({'EIDOS_RECORDS':recs,'RESULT_STATE':state,'MITECO_IDTAXON':taxon}); outrows.append(z)
    ttl=Path(ttl_path)
    receipt={'runClass':'SPANISH_DOCUMENTED_RELATIONS_TO_OFFICIAL_CURRENT_EIDOS_DUMP','inputRelations':len(rows),'outputRelations':len(outrows),'counts':counts,'newIdCandidates':sum(1 for r in outrows if r['MITECO_IDTAXON']),'eidosBytes':ttl.stat().st_size,'eidosSha256':hashlib.sha256(ttl.read_bytes()).hexdigest(),'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,'rows':outrows}
    p=Path(out_path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:receipt[k] for k in ('inputRelations','counts','newIdCandidates','eidosBytes','eidosSha256')},ensure_ascii=False))

if __name__=='__main__': main(*sys.argv[1:4])
