#!/usr/bin/env python3
import json, sys
from pathlib import Path

queue_path, batch_path, out_path = map(Path, sys.argv[1:4])
q = json.loads(queue_path.read_text(encoding='utf-8'))
b = json.loads(batch_path.read_text(encoding='utf-8'))

source_rows = [r for r in q['rows'] if not r.get('MITECO_IDTAXON')]
if len(source_rows) != 337:
    raise RuntimeError(f'expected 337 carry-forward source rows, got {len(source_rows)}')
source_by_id = {str(r['B_SOURCE_RECORD_ID']): r for r in source_rows}
if len(source_by_id) != 337:
    raise RuntimeError('source B_SOURCE_RECORD_ID values are not unique')

accepted_relation_rows = [
    r for r in b['rows']
    if r.get('RESULT_STATE') == 'RESOLVED_SPANISH_DOCUMENTED_NAME'
    and r.get('MITECO_IDTAXON') not in (None, '')
]

groups = {}
for r in accepted_relation_rows:
    bid = str(r['B_SOURCE_RECORD_ID'])
    if bid not in source_by_id:
        raise RuntimeError(f'batch resolution references non-queue B_SOURCE_RECORD_ID {bid}')
    groups.setdefault(bid, []).append(r)

resolved_unique = []
conflicting = []
for bid, rows in sorted(groups.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else kv[0]):
    ids = sorted({str(r['MITECO_IDTAXON']) for r in rows})
    if len(ids) == 1:
        resolved_unique.append({
            'B_SOURCE_RECORD_ID': bid,
            'NOMBRE_RIOJA_VERBATIM': source_by_id[bid].get('NOMBRE_RIOJA_VERBATIM'),
            'MITECO_IDTAXON': ids[0],
            'acceptedRelationCount': len(rows),
            'evidenceRelations': [
                {
                    'candidate': r.get('candidate'),
                    'candidateRank': r.get('candidateRank'),
                    'relation': r.get('relation'),
                    'source': r.get('source'),
                    'evidence': r.get('evidence')
                } for r in rows
            ]
        })
    else:
        conflicting.append({
            'B_SOURCE_RECORD_ID': bid,
            'NOMBRE_RIOJA_VERBATIM': source_by_id[bid].get('NOMBRE_RIOJA_VERBATIM'),
            'conflictingMitecoIds': ids,
            'relationCount': len(rows)
        })

resolved_ids = {r['B_SOURCE_RECORD_ID'] for r in resolved_unique}
remaining_rows = [r for r in source_rows if str(r['B_SOURCE_RECORD_ID']) not in resolved_ids]

receipt = {
    'runClass': 'CORPUS_B_DEDUPLICATED_CARRY_FORWARD_AFTER_BATCH02_V2',
    'sourceQueueRows': len(source_rows),
    'acceptedResolvedRelationRows': len(accepted_relation_rows),
    'uniqueSourceRecordsWithAcceptedRelations': len(groups),
    'uniqueResolvedSourceRecords': len(resolved_unique),
    'duplicateAcceptedRelationsCollapsed': len(accepted_relation_rows) - len(groups),
    'conflictingSourceRecordsNotResolved': len(conflicting),
    'remainingCarryForwardRows': len(remaining_rows),
    'invariant': f"{len(source_rows)} = {len(resolved_unique)} resolved_unique + {len(remaining_rows)} carry_forward",
    'resolvedUnique': resolved_unique,
    'conflicts': conflicting,
    'carryForwardRows': remaining_rows,
    'sourceBatchResolverVersion': b.get('resolverVersion'),
    'sourceBatchEidosSha256': b.get('eidosSha256'),
    'crossWithA': False,
    'neonWrites': 0,
    'corpusBFreeze': False,
    'noFuzzy': True,
    'noParentIdInheritance': True,
    'noRankCollapse': True,
    'canonicalEffect': 'NONE_PENDING_0000_ACCEPTANCE_OF_DEDUPLICATED_CARDINALITY'
}

if receipt['sourceQueueRows'] != receipt['uniqueResolvedSourceRecords'] + receipt['remainingCarryForwardRows']:
    raise RuntimeError('carry-forward cardinality invariant failed')

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: receipt[k] for k in [
    'sourceQueueRows','acceptedResolvedRelationRows','uniqueSourceRecordsWithAcceptedRelations',
    'uniqueResolvedSourceRecords','duplicateAcceptedRelationsCollapsed',
    'conflictingSourceRecordsNotResolved','remainingCarryForwardRows','invariant'
]}, ensure_ascii=False))
