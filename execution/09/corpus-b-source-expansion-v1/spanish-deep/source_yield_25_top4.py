#!/usr/bin/env python3
import json, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import secondary_web_synonymy_185_v3 as v3

ROOT_GROUP = v3.core.ROOT_GROUP


def audit_one(row, src, max_results=6):
    seed = row['name']
    query = f'"{seed}" site:{src["domain"]}'
    vals, search_error = v3.core.web_search(query, max_results=max_results)
    seen_urls = set()
    urls = []
    names = {}
    fetch_failures = []

    for sr in vals:
        url = sr.get('href') or sr.get('url') or ''
        host = (urlparse(url).netloc or '').lower()
        if not url or src['domain'] not in host or url in seen_urls:
            continue
        seen_urls.add(url)
        urls.append(url)
        try:
            doc = v3.core.fetch_document(url)
        except Exception as e:
            fetch_failures.append({'url': url, 'error': f'{type(e).__name__}:{e}'})
            continue

        windows = []
        for w in v3.core.marker_windows(doc.get('text', ''), src.get('markers', [])):
            windows.append(w)
        for rel in v3.symbolic_relation_windows(doc.get('text', '')):
            windows.append(rel.get('text', ''))

        for w in windows:
            for n in v3.core.scientific_names(w):
                c = v3.core.canonical(n)
                k = v3.core.norm(c)
                if not k or k == v3.core.norm(seed):
                    continue
                names.setdefault(k, {'name': c, 'urls': set()})['urls'].add(doc['url'])

    out_names = [
        {'name': ent['name'], 'urls': sorted(ent['urls'])}
        for ent in sorted(names.values(), key=lambda x: x['name'].lower())
    ]
    return {
        'B_SOURCE_RECORD_ID': str(row['B_SOURCE_RECORD_ID']),
        'taxon': seed,
        'source': src['key'],
        'domain': src['domain'],
        'searchError': search_error,
        'searchResultUrls': urls,
        'fetchFailures': fetch_failures,
        'synonymNames': out_names,
        'synonymCount': len(out_names),
    }


def main(groups_path, outdir):
    data = json.loads(Path(groups_path).read_text(encoding='utf-8'))
    all_rows = data['groups'][ROOT_GROUP]
    assert len(all_rows) == 185, len(all_rows)
    rows = all_rows[:25]
    sources = v3.core.SOURCES
    assert len(sources) == 15, len(sources)

    detail = []
    with ThreadPoolExecutor(max_workers=32) as ex:
        futs = {
            ex.submit(audit_one, row, src, 6): (row, src)
            for row in rows for src in sources
        }
        done = 0
        for fut in as_completed(futs):
            row, src = futs[fut]
            try:
                rec = fut.result()
            except Exception as e:
                rec = {
                    'B_SOURCE_RECORD_ID': str(row['B_SOURCE_RECORD_ID']),
                    'taxon': row['name'],
                    'source': src['key'],
                    'domain': src['domain'],
                    'searchError': f'WORKER:{type(e).__name__}:{e}',
                    'searchResultUrls': [],
                    'fetchFailures': [],
                    'synonymNames': [],
                    'synonymCount': 0,
                }
            detail.append(rec)
            done += 1
            if done % 25 == 0:
                print(f'[{done}/375]', flush=True)

    stats = {}
    for src in sources:
        key = src['key']
        recs = [r for r in detail if r['source'] == key]
        stats[key] = {
            'source': key,
            'domain': src['domain'],
            'taxaAudited': 25,
            'totalSynonyms': sum(r['synonymCount'] for r in recs),
            'taxaWithSynonyms': sum(1 for r in recs if r['synonymCount'] > 0),
            'searchHitTaxa': sum(1 for r in recs if r['searchResultUrls']),
            'searchFailureTaxa': sum(1 for r in recs if r['searchError']),
            'fetchFailures': sum(len(r['fetchFailures']) for r in recs),
        }

    ranking = sorted(
        stats.values(),
        key=lambda x: (-x['totalSynonyms'], -x['taxaWithSynonyms'], x['searchFailureTaxa'], x['source'])
    )
    top4 = ranking[:4]

    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    receipt = {
        'runClass': 'CORPUS_B_SOURCE_YIELD_CALIBRATION_25_TOP4',
        'sampleRule': 'FIRST_25_ROWS_OF_NO_RESULT_IN_SPANISH_SOURCES_CONSULTED_185',
        'inputTaxa': 25,
        'sourceCount': 15,
        'totalSourceTaxonQueries': 375,
        'searchQueriesPerTaxonSource': 1,
        'maxSearchResultsPerTaxonSource': 6,
        'eidosUsed': False,
        'rankingCriterion': 'SUM_OF_PER_TAXON_DEDUPLICATED_SYNONYM_NAMES_PER_SOURCE',
        'seedNameExcludedFromSynonymCount': True,
        'ranking': ranking,
        'top4': [x['source'] for x in top4],
        'top4Detail': top4,
        'crossWithA': False,
        'neonWrites': 0,
        'corpusBFreeze': False,
        'semantics': [
            'SEARCH_HIT!=SYNONYM',
            'SOURCE_FAILURE!=NOT_FOUND',
            'RANKING_ONLY_DOES_NOT_CANONICALIZE_TAXONOMY'
        ]
    }
    (out / 'SOURCE_YIELD_25_TOP4_RECEIPT.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'SOURCE_YIELD_25_TOP4_DETAIL.json').write_text(json.dumps({'receipt': receipt, 'rows': detail}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main(*sys.argv[1:3])
