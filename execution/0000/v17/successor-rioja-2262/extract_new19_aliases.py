import json
from pathlib import Path

TARGET_IDS={
'5517','3682','4979','4058','1117','974','4676','4809','2487','1412','662','5338','2111','4415','4593','2603','627','1709','5343'
}
BATCH_FILES=[
Path('execution/06/v17/synonym-system-309/runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_01_precedence/BATCH_RESULTS.jsonl'),
Path('execution/06/v17/synonym-system-309/runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_02_final/BATCH_RESULTS.jsonl'),
Path('execution/06/v17/synonym-system-309/runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_03_final/BATCH_RESULTS.jsonl'),
]
out=[]
for p in BATCH_FILES:
    with p.open(encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            x=json.loads(line)
            sid=str(x['B_SOURCE_RECORD_ID'])
            if sid not in TARGET_IDS:
                continue
            selected=str(x.get('ID_TAXON_EXACT')) if x.get('ID_TAXON_EXACT') not in (None,'') else None
            aliases=[]
            selected_aliases=[]
            for q in x.get('queries',[]):
                accepted=[str(v) for v in q.get('acceptedExactIds',[]) if v not in (None,'')]
                selected_supported=selected in accepted if selected else False
                records=[]
                for r in q.get('exactSameRankRecords',[]) + q.get('exactRecords',[]):
                    records.append({
                        'scientificName':r.get('scientificName'),
                        'canonicalName':r.get('canonicalName'),
                        'taxonID':str(r.get('taxonID')) if r.get('taxonID') not in (None,'') else None,
                        'rank':r.get('rank'),
                        'taxonomicStatus':r.get('taxonomicStatus'),
                    })
                item={
                    'alias':q.get('alias'),
                    'aliasRank':q.get('aliasRank'),
                    'origin':q.get('origin'),
                    'closureEligible':q.get('closureEligible'),
                    'acceptedExactIds':accepted,
                    'selectedIdSupported':selected_supported,
                    'records':records,
                }
                aliases.append(item)
                if selected_supported:
                    selected_aliases.append({
                        'alias':q.get('alias'),
                        'aliasRank':q.get('aliasRank'),
                        'origin':q.get('origin'),
                        'closureEligible':q.get('closureEligible'),
                        'canonicalNames':sorted({r.get('canonicalName') for r in records if r.get('canonicalName')}),
                    })
            out.append({
                'sourceId':sid,
                'position309':x.get('position309'),
                'nameVerbatim':x.get('nameVerbatim'),
                'sourceRank':x.get('sourceRank'),
                'selectedIdTaxon':selected,
                'state':x.get('state'),
                'aliases':aliases,
                'selectedAliases':selected_aliases,
            })
assert len(out)==19, len(out)
out=sorted(out,key=lambda x:x['position309'])
outdir=Path('execution/0000/v17/successor-rioja-2262/preflight')
outdir.mkdir(parents=True,exist_ok=True)
(outdir/'NEW19_ALIAS_EVIDENCE.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
compact=[{
    'sourceId':x['sourceId'],
    'position309':x['position309'],
    'nameVerbatim':x['nameVerbatim'],
    'sourceRank':x['sourceRank'],
    'selectedIdTaxon':x['selectedIdTaxon'],
    'state':x['state'],
    'selectedAliases':x['selectedAliases'],
} for x in out]
(outdir/'NEW19_SELECTED_ALIASES.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'targetCount':19,'writtenCount':len(out),'qa':'PASS'}))
