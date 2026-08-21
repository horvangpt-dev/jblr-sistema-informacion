#!/usr/bin/env python3
import csv, gzip, importlib.util, json
from collections import defaultdict
from pathlib import Path

V4_PATH = Path('execution/09/stime00/stime00_hybrid_recovery_v4.py')
spec = importlib.util.spec_from_file_location('stime00_v4_audit', V4_PATH)
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)
v3 = v4.v3
legacy = v4.legacy

OUT = legacy.OUT
MACHINE = OUT / 'STIME00_INTERNAL_JBLR_MACHINE.jsonl'
EVIDENCE = OUT / 'STIME00_QUERY_EVIDENCE.jsonl.gz'
JSON_OUT = OUT / 'STIME00_CONFLICT_34_PROVENANCE_AUDIT.json'
CSV_OUT = OUT / 'STIME00_CONFLICT_34_PROVENANCE_AUDIT.csv'

def nk(x):
    return legacy.norm(legacy.canonical_name(x or ''))

def add_prov(bucket, item):
    sig = json.dumps(item, sort_keys=True, ensure_ascii=False)
    if sig not in bucket['_seen']:
        bucket['_seen'].add(sig)
        bucket['items'].append(item)

def main():
    records = [json.loads(x) for x in MACHINE.read_text(encoding='utf-8').splitlines() if x.strip()]
    evidence_by_key = defaultdict(list)
    with gzip.open(EVIDENCE, 'rt', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                e = json.loads(line)
                evidence_by_key[e['taxon_work_key']].append(e)

    db_paths = {
        'POWO_WCVP': legacy.CACHE / 'wcvp.sqlite',
        'WFO': legacy.CACHE / 'wfo.sqlite',
    }

    audits = []
    for rec in records:
        cand_ids = [str(x) for x in (rec.get('ID_TAXON_GOBIERNO_CANDIDATES_UNRESOLVED') or [])]
        if len(cand_ids) < 2:
            continue

        network = []
        seen = set()
        for q in rec.get('query_names', []) or []:
            cq = legacy.canonical_name(q)
            k = nk(cq)
            if cq and k not in seen:
                seen.add(k); network.append(cq)

        expanded = list(network)
        reverse_full = []
        for src, db in db_paths.items():
            if not Path(db).exists():
                continue
            names, prov = v4.reverse_synonym_names(db, network, src)
            reverse_full.extend(prov)
            for nm in names:
                k = nk(nm)
                if k not in seen:
                    seen.add(k); expanded.append(nm)

        ids2, by_name2 = v4.all_static_hits(expanded)
        direct = v3.static_candidates(rec['TAX_RIOJA'])
        direct_ids = sorted({str(h.get('idtaxon')) for h in direct if h.get('idtaxon')})

        name_prov = defaultdict(lambda: {'items': [], '_seen': set()})
        name_prov[nk(rec['TAX_RIOJA'])]['items'].append({
            'source': 'TAX_RIOJA', 'relation': 'SOURCE_LITERAL', 'introduced_name': True,
            'name': legacy.canonical_name(rec['TAX_RIOJA'])
        })

        for h in rec.get('TAX_HISTORICOS', []) or []:
            if isinstance(h, dict) and h.get('name'):
                add_prov(name_prov[nk(h['name'])], {
                    'source': h.get('source'),
                    'relation': h.get('relation') or 'SOURCE_DECLARED_SYNONYM',
                    'introduced_name': True,
                    'evidence_query': h.get('evidence_query'),
                    'name': legacy.canonical_name(h.get('name')),
                })

        for e in evidence_by_key[rec['taxon_work_key']]:
            src = e.get('source')
            if src not in ('ANTHOS','POWO_WCVP','WFO'):
                continue
            res = e.get('result') or {}
            q = legacy.canonical_name(e.get('query'))
            status = str(res.get('status') or '')
            for field, relation in [('accepted_name','ACCEPTED_NAME_RETURNED'),('returned_name','RETURNED_NAME')]:
                nm = legacy.canonical_name(res.get(field))
                if not nm:
                    continue
                rel = relation
                if field == 'returned_name' and 'synonym' in status.lower():
                    rel = 'SOURCE_DECLARED_SYNONYM'
                add_prov(name_prov[nk(nm)], {
                    'source': src,
                    'relation': rel,
                    'introduced_name': nk(q) != nk(nm),
                    'evidence_query': q,
                    'status': status,
                    'name': nm,
                })

        for p in reverse_full:
            nm = legacy.canonical_name(p.get('discovered_name'))
            if not nm:
                continue
            add_prov(name_prov[nk(nm)], {
                'source': p.get('source'),
                'relation': p.get('relation'),
                'introduced_name': True,
                'seed_query': p.get('seed_query'),
                'accepted_concept_id': p.get('accepted_concept_id'),
                'record_taxon_id': p.get('record_taxon_id'),
                'record_rank': p.get('record_rank'),
                'record_status': p.get('record_status'),
                'name': nm,
            })

        candidate_details = []
        anthos_candidate_ids = set()
        for tid in cand_ids:
            matches = []
            for name, hits in by_name2.items():
                matching = [h for h in hits if str(h.get('idtaxon')) == tid]
                if not matching:
                    continue
                prov_items = name_prov[nk(name)]['items']
                anthos_introduced = any(
                    p.get('source') == 'ANTHOS' and p.get('introduced_name') and
                    p.get('relation') in ('ACCEPTED_NAME_RETURNED','SOURCE_DECLARED_SYNONYM','SAME_ACCEPTED_CONCEPT_REVERSE_NAME')
                    for p in prov_items
                )
                if anthos_introduced:
                    anthos_candidate_ids.add(tid)
                matches.append({
                    'name': name,
                    'iepn_b_hits': matching,
                    'provenance': prov_items,
                    'anthos_introduced_alternate_name': anthos_introduced,
                })
            candidate_details.append({'idtaxon': tid, 'match_names': matches})

        audits.append({
            'rioja_order': rec['rioja_order'],
            'taxon_work_key': rec['taxon_work_key'],
            'TAX_RIOJA': rec['TAX_RIOJA'],
            'direct_tax_rioja_ids': direct_ids,
            'has_direct_tax_rioja_id': bool(direct_ids),
            'candidate_ids': cand_ids,
            'candidate_ids_from_anthos_introduced_name': sorted(anthos_candidate_ids),
            'has_candidate_from_anthos_introduced_name': bool(anthos_candidate_ids),
            'candidate_details': candidate_details,
            'network_names': network,
            'expanded_names_count': len(expanded),
            'reverse_provenance_count': len(reverse_full),
        })

    summary = {
        'audit_kind': 'STIME00_CONFLICT_34_PROVENANCE_AUDIT',
        'conflict_rows': len(audits),
        'with_direct_tax_rioja_id': sum(x['has_direct_tax_rioja_id'] for x in audits),
        'without_direct_tax_rioja_id': sum(not x['has_direct_tax_rioja_id'] for x in audits),
        'with_candidate_from_anthos_introduced_name': sum(x['has_candidate_from_anthos_introduced_name'] for x in audits),
        'without_candidate_from_anthos_introduced_name': sum(not x['has_candidate_from_anthos_introduced_name'] for x in audits),
        'rows': audits,
    }
    JSON_OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    fields = ['rioja_order','TAX_RIOJA','direct_tax_rioja_ids','candidate_id','match_name','source','relation','introduced_name','record_status','seed_query','evidence_query','anthos_introduced_alternate_name']
    with CSV_OUT.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for row in audits:
            for cand in row['candidate_details']:
                tid = cand['idtaxon']
                if not cand['match_names']:
                    w.writerow({'rioja_order':row['rioja_order'],'TAX_RIOJA':row['TAX_RIOJA'],'direct_tax_rioja_ids':'|'.join(row['direct_tax_rioja_ids']),'candidate_id':tid})
                    continue
                for mn in cand['match_names']:
                    if not mn['provenance']:
                        w.writerow({'rioja_order':row['rioja_order'],'TAX_RIOJA':row['TAX_RIOJA'],'direct_tax_rioja_ids':'|'.join(row['direct_tax_rioja_ids']),'candidate_id':tid,'match_name':mn['name'],'anthos_introduced_alternate_name':mn['anthos_introduced_alternate_name']})
                    else:
                        for p in mn['provenance']:
                            w.writerow({
                                'rioja_order':row['rioja_order'],'TAX_RIOJA':row['TAX_RIOJA'],'direct_tax_rioja_ids':'|'.join(row['direct_tax_rioja_ids']),
                                'candidate_id':tid,'match_name':mn['name'],'source':p.get('source'),'relation':p.get('relation'),
                                'introduced_name':p.get('introduced_name'),'record_status':p.get('record_status') or p.get('status'),
                                'seed_query':p.get('seed_query'),'evidence_query':p.get('evidence_query'),
                                'anthos_introduced_alternate_name':mn['anthos_introduced_alternate_name'],
                            })
    print(json.dumps({k:v for k,v in summary.items() if k!='rows'}, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
