#!/usr/bin/env python3
import hashlib,json,re,unicodedata
from pathlib import Path
ROOT=Path('execution/0000/v18/successor-rioja-2262')
src=json.loads((ROOT/'NONRESOLVED_262_EXPLICIT_NAMES.json').read_text())
outdir=ROOT/'candidate_keys_262_parts';outdir.mkdir(exist_ok=True)
def norm(v):
 s=unicodedata.normalize('NFKC',str(v or '').strip()).replace('×','x');return re.sub(r'\s+',' ',s).casefold()
def hyb(v):return bool(re.search(r'\sx\s',' '+str(v or '').replace('×','x')+' ',re.I))
def kh(name,rank):
 k=f'{norm(name)}|{str(rank).casefold()}|{int(hyb(name))}'
 return hashlib.sha256(k.encode()).hexdigest()
lines=[]
for r in src['rows']:
 lines.append(f"{r['sid']}\tSOURCE\t{kh(r['name'],r['rank'])}\n")
 for a in r.get('explicit') or []:
  lines.append(f"{r['sid']}\tALIAS\t{kh(a['name'],a['rank'])}\n")
# deterministic 5 parts
n=(len(lines)+4)//5
for i in range(5):
 p=outdir/f'part{i+1:02d}.tsv';p.write_text(''.join(lines[i*n:(i+1)*n]))
manifest={'schema':'JBLR_V18_CANDIDATE_KEYS_262_V1','sourceRows':len(src['rows']),'keyRows':len(lines),'parts':5,'hash':'SHA256(NFKC_CASEFOLD_SPACE_NORMALIZED_NAME|rank|hybrid_flag)'}
(ROOT/'CANDIDATE_KEYS_262_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
