#!/usr/bin/env python3
import argparse, hashlib, json, re
from collections import defaultdict
from pathlib import Path


def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('×', 'x').strip()).casefold()


def canonical(name):
    s = re.sub(r'\s+', ' ', (name or '').replace('×', ' x ').strip())
    pat = re.compile(r'^([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+\s+(?:x\s+)?[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+(?:\s+(?:subsp\.?|ssp\.?|var\.?|f\.?|nothosubsp\.?)\s+[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+)?)')
    m = pat.match(s)
    c = m.group(1) if m else s
    c = re.sub(r'\bssp\.?(?=\s)', 'subsp.', c)
    c = re.sub(r'\bsubsp\.?(?=\s)', 'subsp.', c)
    c = re.sub(r'\bvar\.?(?=\s)', 'var.', c)
    c = re.sub(r'\bf\.?(?=\s)', 'f.', c)
    return re.sub(r'\s+', ' ', c).strip().replace(' x ', ' × ')


def rank_norm(s):
    x = norm(s).replace('.', '').replace('_', ' ')
    return {
        'sp': 'species', 'species': 'species', 'especie': 'species',
        'subsp': 'subspecies', 'ssp': 'subspecies', 'subspecies': 'subspecies', 'subespecie': 'subspecies',
        'var': 'variety', 'variety': 'variety', 'variedad': 'variety',
        'forma': 'form', 'form': 'form', 'f': 'form',
        'nothospecies': 'species', 'nothosubspecies': 'subspecies'
    }.get(x, x)


def hybrid(name):
    return bool(re.search(r'\s(?:x|×)\s', ' ' + re.sub(r'\s+', ' ', name or '').strip() + ' ', flags=re.I))


def build_eidos(path):
    idx = {}
    block = []
    def emit(lines):
        if not lines:
            return
        t = '\n'.join(lines)
        mn = re.search(r'Darwin:scientificName\s+"([^"]+)"', t)
        mi = re.search(r'Darwin:taxonID\s+"([^"]+)"', t)
        if not (mn and mi):
            return
        ms = re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"', t)
        mr = re.search(r'Darwin:taxonRank\s+"([^"]+)"', t)
        ma = re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"', t)
        c = canonical(mn.group(1))
        rec = {
            'scientificName': mn.group(1), 'canonicalName': c, 'taxonID': mi.group(1),
            'taxonomicStatus': ms.group(1) if ms else None,
            'rank': rank_norm(mr.group(1) if mr else ''),
            'nameAccordingTo': ma.group(1) if ma else None,
        }
        idx.setdefault(norm(c), []).append(rec)
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if not line.strip():
                emit(block); block = []
            else:
                block.append(line.rstrip())
        emit(block)
    if len(idx) < 1000:
        raise RuntimeError('EIDOS_INDEX_TOO_SMALL')
    return idx


def accepted_exact(idx, alias, rank):
    same = [r for r in idx.get(norm(canonical(alias)), []) if r.get('rank') == rank]
    accepted = [r for r in same if norm(r.get('taxonomicStatus')) in {'aceptado/válido', 'aceptado/valido', 'accepted', 'valid'}]
    return same, accepted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baseline', required=True)
    ap.add_argument('--baseline-summary', required=True)
    ap.add_argument('--enrichment', required=True)
    ap.add_argument('--eidos', required=True)
    ap.add_argument('--batch', type=int, choices=[2,3], required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    expected = {2:100, 3:109}[args.batch]
    lo = {2:101, 3:201}[args.batch]
    hi = {2:200, 3:309}[args.batch]
    old = [json.loads(x) for x in Path(args.baseline).read_text(encoding='utf-8').splitlines() if x.strip()]
    old_summary = json.load(open(args.baseline_summary, encoding='utf-8'))
    enrichment = json.load(open(args.enrichment, encoding='utf-8'))
    relations = enrichment.get('relations') or []
    byid = defaultdict(list)
    for r in relations:
        byid[str(r['B_SOURCE_RECORD_ID'])].append(r)
    assert len(old) == expected and len({str(x['B_SOURCE_RECORD_ID']) for x in old}) == expected
    assert [int(x['position309']) for x in old] == list(range(lo, hi+1))
    ids_in_batch = {str(x['B_SOURCE_RECORD_ID']) for x in old}
    assert all(str(r['B_SOURCE_RECORD_ID']) in ids_in_batch for r in relations)
    assert all(r.get('sourceUrl','').startswith('https://') for r in relations)
    assert all(r.get('sourceNameVerbatim') and r.get('alias') and r.get('sourceRank') and r.get('aliasRank') for r in relations)

    eidx = build_eidos(args.eidos)
    results = []
    precedence_ledger = []
    new_recoveries = 0
    precedence_resolutions = 0
    spanish_vs_spanish = 0
    rank_guard_blocks = 0
    hybrid_guard_blocks = 0

    for row in old:
        rid = str(row['B_SOURCE_RECORD_ID'])
        sname = row['nameVerbatim']
        srank = row['sourceRank']
        ishyb = hybrid(sname)
        seen = set()
        old_aliases = []
        for a in row.get('documentedAliases', []):
            k = norm(canonical(a))
            if k and k not in seen:
                seen.add(k); old_aliases.append(a)
        newrels = byid.get(rid, [])
        queries = []
        old_ids = set(); spanish_ids = set(); local_multi = False; guarded = []

        if ishyb:
            hybrid_guard_blocks += 1
            for a in old_aliases:
                guarded.append({'alias':a,'reason':'HYBRID_FORMULA_REQUIRES_EXPLICIT_IDENTITY_EVIDENCE'})
        else:
            for a in old_aliases:
                same, acc = accepted_exact(eidx, a, srank)
                qids = sorted({x['taxonID'] for x in acc})
                queries.append({'alias':a,'aliasRank':srank,'origin':'PRIOR_DOCUMENTED_NETWORK','closureEligible':True,'exactSameRankRecords':same[:10],'acceptedExactIds':qids})
                if len(qids)>1: local_multi = True
                old_ids.update(qids)

        for rel in newrels:
            same, acc = accepted_exact(eidx, rel['alias'], rel['aliasRank'])
            qids = sorted({x['taxonID'] for x in acc})
            eligible = (not ishyb and rel['sourceRank'] == rel['aliasRank'] and 'RANK_CHANGE_GUARD' not in rel['relationState'])
            queries.append({'alias':rel['alias'],'aliasRank':rel['aliasRank'],'origin':'SPANISH_VERIFIED','relationState':rel['relationState'],'source':rel['source'],'sourceUrl':rel['sourceUrl'],'closureEligible':eligible,'exactRecords':same[:10],'acceptedExactIds':qids})
            if eligible:
                if len(qids)>1: local_multi = True
                spanish_ids.update(qids)
            else:
                guarded.append({'alias':rel['alias'],'reason':'RANK_OR_HYBRID_GUARD','eidosAcceptedExactIds':qids,'source':rel['source']})
                rank_guard_blocks += 1

        closure_ids = set(old_ids) | set(spanish_ids)
        prior_id = row.get('ID_TAXON_EXACT')
        competing = None
        precedence = False
        if ishyb:
            state = 'CONFLICT_HYBRID_FORMULA_REQUIRES_EXPLICIT_IDENTITY_EVIDENCE'; tid = None
        elif len(spanish_ids) > 1:
            state = 'CONFLICT_MULTIPLE_SPANISH_EXACT_EIDOS_IDS'; tid = None; spanish_vs_spanish += 1
        elif len(spanish_ids) == 1 and (local_multi or len(closure_ids) > 1):
            tid = next(iter(spanish_ids)); state = 'RESOLVED_BY_SPANISH_SOURCE_PRECEDENCE'; precedence = True; precedence_resolutions += 1
            competing = {'oldNetworkClosureIds':sorted(old_ids),'allClosureIds':sorted(closure_ids),'priorState':row.get('state')}
        elif local_multi or len(closure_ids) > 1:
            state = 'CONFLICT_MULTIPLE_EXACT_EIDOS_IDS_VIA_DOCUMENTED_NETWORK'; tid = None
        elif len(closure_ids) == 1:
            tid = next(iter(closure_ids)); state = 'RESOLVED_UNIQUE_EXACT_EIDOS_ID_VIA_DOCUMENTED_NETWORK'
        else:
            tid = None; state = 'UNRESOLVED_AFTER_SPANISH_NETWORK_AND_EIDOS'

        if tid and not prior_id and tid in spanish_ids:
            new_recoveries += 1
        result = {
            'batch':args.batch,'position309':row['position309'],'B_SOURCE_RECORD_ID':rid,
            'nameVerbatim':sname,'sourceRank':srank,'isHybrid':ishyb,'priorID_TAXON_EXACT':prior_id,
            'documentedAliases':old_aliases,'newSpanishRelations':newrels,'ID_TAXON_EXACT':tid,'state':state,
            'closureIds':sorted(closure_ids),'oldNetworkClosureIds':sorted(old_ids),'newSpanishClosureIds':sorted(spanish_ids),
            'precedenceApplied':precedence,'competingAlternativeEvidence':competing,'guardedRelations':guarded,'queries':queries,
        }
        results.append(result)
        if row.get('state','').startswith('CONFLICT_') or precedence:
            precedence_ledger.append({
                'position309':row['position309'],'B_SOURCE_RECORD_ID':rid,'nameVerbatim':sname,
                'baselineState':row.get('state'),'baselineID':prior_id,'oldNetworkClosureIds':sorted(old_ids),
                'spanishClosureIds':sorted(spanish_ids),'decision':state,'finalID_TAXON_EXACT':tid,
                'spanishRelations':newrels,'competingAlternativeEvidence':competing,
            })

    resolved = sum(1 for r in results if r.get('ID_TAXON_EXACT'))
    conflicts = sum(1 for r in results if str(r.get('state','')).startswith('CONFLICT_'))
    unresolved = len(results)-resolved-conflicts
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    with (out/'BATCH_RESULTS.jsonl').open('w',encoding='utf-8') as f:
        for r in results: f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
    with (out/'PRECEDENCE_LEDGER.jsonl').open('w',encoding='utf-8') as f:
        for r in precedence_ledger: f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
    sha = hashlib.sha256(Path(args.eidos).read_bytes()).hexdigest()
    summary = {
        'pass':True,'batch':args.batch,'processedRows':expected,'uniqueIds':expected,
        'verifiedSpanishRelationCount':len(relations),'rowsWithVerifiedSpanishRelations':len(byid),
        'resolved':resolved,'conflicts':conflicts,'unresolved':unresolved,
        'newRecoveriesViaSpanishAliases':new_recoveries,'spanishPrecedenceResolutions':precedence_resolutions,
        'spanishVsSpanishConflicts':spanish_vs_spanish,'rankGuardBlocks':rank_guard_blocks,'hybridGuardBlocks':hybrid_guard_blocks,
        'technicalBaselineSourceFailureEvents':old_summary.get('sourceFailureEvents',0),
        'technicalBaselineStatus':'SUPERSEDED_SCIENTIFICALLY_FOR_SPANISH_SOURCE_DISCOVERY',
        'eidosSha256':sha,
        'guards':{'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,'noSpeciesSubspeciesCollapse':True,'noHybridCollapse':True,'sourceFailureNotNotFound':True,'sourceNamePreserved':True},
        'rc2Mutation':0,'neonWrites':0,'databaseWrites':0,'stimes':'HOLD'
    }
    (out/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert len(results)==expected and len({r['B_SOURCE_RECORD_ID'] for r in results})==expected
    assert [int(r['position309']) for r in results]==list(range(lo,hi+1))
    assert resolved+conflicts+unresolved==expected
    assert all(results[i]['nameVerbatim']==old[i]['nameVerbatim'] for i in range(expected))
    print(json.dumps(summary,ensure_ascii=False))

if __name__ == '__main__':
    main()
