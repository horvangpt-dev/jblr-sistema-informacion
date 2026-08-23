#!/usr/bin/env python3
import argparse,csv,hashlib,json,os,subprocess,tempfile,urllib.request,zipfile
from collections import defaultdict
from datetime import datetime,timezone

SOURCE_URL='https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/bd_ieet_2015_tcm30-207985.zip'
PINNED_SHA256='5244f91485f7b421883240c007d7a8b459f0f0a067c17e82605d46c3a1d31262'


def sha256_bytes(b): return hashlib.sha256(b).hexdigest()
def sha256_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def write_json(p,obj):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f: json.dump(obj,f,ensure_ascii=False,indent=2); f.write('\n')
    return sha256_file(p)
def normalize_code(v): return (v or '').replace(' ','').strip().upper()

def load_registry(p):
    doc=json.load(open(p,encoding='utf-8'))
    payload=doc.get('payload',{})
    cells=payload.get('cells',[])
    if payload.get('selectedCount')!=77 or len(cells)!=77: raise RuntimeError('GRID_REGISTRY_UNEXPECTED_COUNT')
    idx={normalize_code(c['code']):c for c in cells}
    if len(idx)!=77: raise RuntimeError('GRID_REGISTRY_DUPLICATE_CODE')
    full=sum(1 for c in cells if c.get('relation')=='FULLY_WITHIN_RIOJA')
    partial=sum(1 for c in cells if c.get('relation')=='PARTIAL_INTERSECTION')
    if (full,partial)!=(26,51): raise RuntimeError('GRID_REGISTRY_RELATION_COUNT_MISMATCH')
    return doc,idx

def download_source():
    req=urllib.request.Request(SOURCE_URL,headers={'User-Agent':'Mozilla/5.0 JBLR/1.0','Accept':'application/zip,application/octet-stream;q=0.9,*/*;q=0.5','Referer':'https://www.miteco.gob.es/'})
    with urllib.request.urlopen(req,timeout=90) as r: return r.read(),getattr(r,'status',200)

def export_mdb(mdb_path,csv_path):
    tables=subprocess.run(['mdb-tables','-1',mdb_path],capture_output=True,text=True,check=True).stdout.splitlines()
    tables=[t.strip() for t in tables if t.strip()]
    if tables!=['BD_IEET_2015']: raise RuntimeError('STATIC_IEET_SCHEMA_CHANGED_TABLES:'+','.join(tables))
    with open(csv_path,'wb') as out:
        subprocess.run(['mdb-export',mdb_path,'BD_IEET_2015'],stdout=out,check=True)
    return tables

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--registry',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--allow-source-hash-change',action='store_true')
    a=ap.parse_args()
    os.makedirs(a.out,exist_ok=True)
    registry_doc,cells=load_registry(a.registry)
    data,status=download_source()
    source_sha=sha256_bytes(data)
    if source_sha!=PINNED_SHA256 and not a.allow_source_hash_change: raise RuntimeError('STATIC_SOURCE_HASH_CHANGED_REVIEW_REQUIRED:'+source_sha)
    with tempfile.TemporaryDirectory(prefix='jblr-ieet-') as td:
        zp=os.path.join(td,'source.zip');open(zp,'wb').write(data)
        with zipfile.ZipFile(zp) as z: z.extractall(td)
        mdbs=[]
        for root,_,files in os.walk(td):
            for fn in files:
                if fn.lower().endswith(('.mdb','.accdb')): mdbs.append(os.path.join(root,fn))
        if len(mdbs)!=1: raise RuntimeError('STATIC_IEET_DATABASE_FILE_COUNT_UNEXPECTED')
        csv_path=os.path.join(td,'BD_IEET_2015.csv')
        export_mdb(mdbs[0],csv_path)
        raw=[]
        with open(csv_path,encoding='utf-8-sig',errors='replace',newline='') as f:
            r=csv.DictReader(f)
            required=['IdEspecie','Grupo','Nombre','CUTM10x10','EstadoCUTM','FechaCUTM','OrigenCUTM','DescripcionOrigenCUTM','Autor','Reino','Division','Clase','Orden','Familia']
            missing=[x for x in required if x not in (r.fieldnames or [])]
            if missing: raise RuntimeError('STATIC_IEET_SCHEMA_CHANGED_MISSING_FIELDS:'+','.join(missing))
            for rownum,row in enumerate(r,start=2):
                if (row.get('Grupo') or '').strip()!='Flora vascular': continue
                code=normalize_code(row.get('CUTM10x10'))
                cell=cells.get(code)
                if not cell: continue
                raw.append({
                    'sourceRow':rownum,
                    'staticSpeciesId':(row.get('IdEspecie') or '').strip(),
                    'group':(row.get('Grupo') or '').strip(),
                    'nameVerbatim':(row.get('Nombre') or '').strip(),
                    'genus':(row.get('Genero') or '').strip() or None,
                    'species':(row.get('Especie') or '').strip() or None,
                    'infra':(row.get('Infra') or '').strip() or None,
                    'utm10x10':code,
                    'gridRelationToRioja':cell.get('relation'),
                    'estadoCUTM':(row.get('EstadoCUTM') or '').strip() or None,
                    'fechaCUTM':(row.get('FechaCUTM') or '').strip() or None,
                    'origenCUTM':(row.get('OrigenCUTM') or '').strip() or None,
                    'descripcionOrigenCUTM':(row.get('DescripcionOrigenCUTM') or '').strip() or None,
                    'author':(row.get('Autor') or '').strip() or None,
                    'kingdom':(row.get('Reino') or '').strip() or None,
                    'division':(row.get('Division') or '').strip() or None,
                    'class':(row.get('Clase') or '').strip() or None,
                    'order':(row.get('Orden') or '').strip() or None,
                    'family':(row.get('Familia') or '').strip() or None
                })
    byid=defaultdict(list)
    for r in raw:
        sid=r['staticSpeciesId'] or 'MISSING_STATIC_ID:'+r['nameVerbatim']
        byid[sid].append(r)
    taxa=[]
    for sid,rows in byid.items():
        names=sorted(set(r['nameVerbatim'] for r in rows if r['nameVerbatim']))
        units={r['utm10x10']:r['gridRelationToRioja'] for r in rows}
        full=sorted(k for k,v in units.items() if v=='FULLY_WITHIN_RIOJA')
        partial=sorted(k for k,v in units.items() if v=='PARTIAL_INTERSECTION')
        state='DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA' if full else 'BORDER_GRID_CANDIDATE'
        taxa.append({
            'staticSpeciesId':sid,
            'nameVerbatim':names[0] if len(names)==1 else None,
            'allNamesObserved':names,
            'nameConflict':len(names)>1,
            'identityState':'MITECO_IEET_STATIC_ID_ONLY_NOT_CURRENT_EIDOS_ID',
            'sourceVersion':'BD_IEET_2015',
            'territorialEvidenceState':state,
            'fullyWithinRiojaCells':full,
            'partialRiojaCells':partial,
            'sourceRowCount':len(rows),
            'sourceRowPointers':[r['sourceRow'] for r in rows],
            'sourceEvidenceStates':sorted(set(r['estadoCUTM'] for r in rows if r['estadoCUTM'])),
            'sourceOrigins':sorted(set(r['descripcionOrigenCUTM'] or r['origenCUTM'] for r in rows if r['descripcionOrigenCUTM'] or r['origenCUTM'])),
            'taxonomy':{
                'kingdom':sorted(set(r['kingdom'] for r in rows if r['kingdom'])),
                'division':sorted(set(r['division'] for r in rows if r['division'])),
                'class':sorted(set(r['class'] for r in rows if r['class'])),
                'order':sorted(set(r['order'] for r in rows if r['order'])),
                'family':sorted(set(r['family'] for r in rows if r['family']))
            }
        })
    taxa.sort(key=lambda x:((x['nameVerbatim'] or ''),x['staticSpeciesId']))
    confirmed=[t for t in taxa if t['territorialEvidenceState']=='DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA']
    border=[t for t in taxa if t['territorialEvidenceState']=='BORDER_GRID_CANDIDATE']
    raw_path=os.path.join(a.out,'MITECO_RIOJA_IEET_STATIC_2015_RAW_v1.json')
    taxa_path=os.path.join(a.out,'MITECO_RIOJA_IEET_STATIC_2015_TAXA_v1.json')
    confirmed_path=os.path.join(a.out,'MITECO_RIOJA_IEET_STATIC_2015_CONFIRMED_INTERIOR_v1.json')
    border_path=os.path.join(a.out,'MITECO_RIOJA_IEET_STATIC_2015_BORDER_CANDIDATES_v1.json')
    hashes={
        'raw':write_json(raw_path,raw),
        'taxa':write_json(taxa_path,taxa),
        'confirmed':write_json(confirmed_path,confirmed),
        'border':write_json(border_path,border)
    }
    qa={
        'sourceHttpStatus':status,
        'sourceSha256':source_sha,
        'sourceHashMatchesPinned':source_sha==PINNED_SHA256,
        'registrySelectedCells':77,
        'floraVascularRowsSelected':len(raw),
        'uniqueStaticSpeciesIds':len(taxa),
        'confirmedInteriorTaxa':len(confirmed),
        'borderGridCandidateTaxa':len(border),
        'missingStaticIdRows':sum(1 for r in raw if not r['staticSpeciesId']),
        'taxaWithNameConflict':sum(1 for t in taxa if t['nameConflict']),
        'jblrCorpusInputUsed':False,
        'rc2InputUsed':False,
        'crossWithJblrPerformed':False,
        'systemicQa':'PASS'
    }
    manifest={
        'release':'MITECO_RIOJA_IEET_STATIC_2015_v1',
        'generatedAt':datetime.now(timezone.utc).isoformat(),
        'sourceUrl':SOURCE_URL,
        'sourceSha256':source_sha,
        'sourceSemantics':'OFFICIAL_MITECO_HISTORICAL_SECONDARY_DISTRIBUTION_SNAPSHOT_2015',
        'scopeFilter':{'Grupo':'Flora vascular','CUTM10x10':'IN_FROZEN_77_CELL_REGISTRY'},
        'gridRegistrySha256':registry_doc.get('sha256'),
        'gridSourceManifestSha256':registry_doc.get('payload',{}).get('sourceManifestSha256'),
        'territorialRule':'FULL_CELL=>CONFIRMED_BY_STATIC_GRID_EVIDENCE; PARTIAL_ONLY=>BORDER_GRID_CANDIDATE',
        'identityRule':'STATIC_GUID_IS_PRESERVED_AND_IS_NOT_SILENTLY_TREATED_AS_CURRENT_EIDOS_ID',
        'independenceGuard':'NO_JBLR_RC2_OR_EXISTING_RIOJA_CORPUS_INPUT',
        'completenessWarning':'THIS_STATIC_DATASET_IS_NOT_ASSUMED_TO_BE_A_COMPLETE_CURRENT_FLORA_OF_LA_RIOJA',
        'qa':qa,
        'outputHashes':hashes,
        'nextGate':'CURRENT_EIDOS_COMPLETENESS_PASS_AND_CURRENT_IDENTITY_RESOLUTION_BEFORE_CROSS_WITH_JBLR'
    }
    manifest_hash=write_json(os.path.join(a.out,'RUN_MANIFEST_MITECO_RIOJA_IEET_STATIC_2015_v1.json'),manifest)
    print(json.dumps({'status':'PASS','manifestSha256':manifest_hash,'qa':qa,'out':a.out},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
