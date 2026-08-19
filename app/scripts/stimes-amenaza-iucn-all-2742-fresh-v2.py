#!/usr/bin/env python3
import base64,csv,gzip,hashlib,importlib.util,io
from pathlib import Path

EXPECTED_N=2742
EXPECTED_SHA='901f748d8733dfb85cb566bbc0308274248718bd98fb10c72721fbdd415685ed'
PART_GLOB='app/data/stimes/amenaza/iucn-all-2742-queue.b64.part-*'
ENGINE='app/scripts/stimes-amenaza-iucn-all-2742-fresh.py'

parts=sorted(Path('.').glob(PART_GLOB))
if len(parts)!=4:
    raise SystemExit(f'QUEUE_PART_COUNT_MISMATCH expected=4 got={len(parts)}')
encoded=''.join(p.read_text(encoding='utf-8').strip() for p in parts)
try:
    raw=gzip.decompress(base64.b64decode(encoded,validate=True))
except Exception as exc:
    raise SystemExit(f'QUEUE_DECODE_FAILURE {exc}')
got_sha=hashlib.sha256(raw).hexdigest()
if got_sha!=EXPECTED_SHA:
    raise SystemExit(f'QUEUE_SHA_MISMATCH expected={EXPECTED_SHA} got={got_sha}')
rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
if len(rows)!=EXPECTED_N:
    raise SystemExit(f'QUEUE_COUNT_MISMATCH expected={EXPECTED_N} got={len(rows)}')
if rows[0].get('taxon')!='Abies alba' or rows[-1].get('taxon')!='Zannichellia peltata':
    raise SystemExit('QUEUE_BOUNDARY_MISMATCH')
print(f'QUEUE_VERIFIED count={len(rows)} sha256={got_sha} first={rows[0]["taxon"]} last={rows[-1]["taxon"]}',flush=True)

spec=importlib.util.spec_from_file_location('jblr_iucn_full_engine',ENGINE)
if spec is None or spec.loader is None:
    raise SystemExit('ENGINE_IMPORT_FAILURE')
engine=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
engine.QB64=encoded
engine.main()
