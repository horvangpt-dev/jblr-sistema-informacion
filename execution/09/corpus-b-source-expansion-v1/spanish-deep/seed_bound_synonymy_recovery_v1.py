#!/usr/bin/env python3
import re
from urllib.parse import urlparse

import secondary_web_synonymy_185_v2 as core

# Recovery-specific source extension. Keep the old discovery modules immutable.
_JOLUBE = {"key":"JOLUBE_BOTANICAL_CATALOGS","domain":"jolube.net","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]}
if not any(s["key"] == _JOLUBE["key"] for s in core.SOURCES):
    core.SOURCES = core.SOURCES + [_JOLUBE]

_SYMBOL_RE = re.compile(r"(?:≡|(?<![<>!])=(?!=))")
_LABEL_RE = re.compile(r"\b(?:syn\.?|synonym(?:s)?|sinonim(?:ia|ias|o|os)?|sinónim(?:ia|ias|o|os)?)\b", re.I)

def _canon_key(name):
    return core.norm(core.canonical(name))

def _names(text):
    return [core.canonical(x) for x in core.scientific_names(text or "")]

def _dedup_names(names):
    out, seen = [], set()
    for name in names:
        key = _canon_key(name)
        if key and key not in seen:
            seen.add(key)
            out.append(core.canonical(name))
    return out

def seed_bound_relation_evidence(text, seed):
    """
    Precision-first relation extractor.

    A candidate is accepted only if:
      1) an explicit synonymic relation marker is present (=, ≡, Syn./synonym/sinonimia), and
      2) the investigated seed taxon is explicitly present in the same bounded relation context.

    Broad synonymy sections with no seed occurrence are rejected.
    """
    seed_key = _canon_key(seed)
    lines = (text or "").splitlines()
    evidence = []

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        symbol_match = _SYMBOL_RE.search(line)
        if symbol_match:
            names = _dedup_names(_names(line))
            keys = {_canon_key(n) for n in names}
            if seed_key in keys:
                candidates = [n for n in names if _canon_key(n) != seed_key]
                if candidates:
                    evidence.append({
                        "relationKind": "SEED_BOUND_SYMBOL",
                        "marker": symbol_match.group(0),
                        "seed": core.canonical(seed),
                        "candidates": candidates,
                        "context": core.short(line, 700),
                    })

        label_match = _LABEL_RE.search(line)
        if label_match:
            # A label relation may span at most one neighboring line each side.
            # This deliberately sacrifices recall to avoid harvesting names from
            # broad taxonomic windows.
            block_lines = lines[max(0, i-1):min(len(lines), i+2)]
            block = "\n".join(x.strip() for x in block_lines if x.strip())
            names = _dedup_names(_names(block))
            keys = {_canon_key(n) for n in names}
            if seed_key in keys:
                candidates = [n for n in names if _canon_key(n) != seed_key]
                if candidates:
                    evidence.append({
                        "relationKind": "SEED_BOUND_LABEL",
                        "marker": label_match.group(0),
                        "seed": core.canonical(seed),
                        "candidates": candidates,
                        "context": core.short(block, 900),
                    })

    # Deduplicate relation evidence by relation kind + candidate set + context.
    out, seen = [], set()
    for ev in evidence:
        key = (
            ev["relationKind"],
            tuple(sorted(_canon_key(x) for x in ev["candidates"])),
            core.norm(ev["context"]),
        )
        if key not in seen:
            seen.add(key)
            out.append(ev)
    return out

def strict_source_hits(seed, src, max_results=6):
    """
    Use source-targeted search only for page discovery. Re-fetch returned pages
    and retain only seed-bound explicit synonym relations as evidence.
    """
    base = core.source_hits(seed, src, max_results=max_results)
    strict_pages = []
    fetch_failures = list(base.get("fetchFailures", []))

    seen_urls = set()
    for sr in base.get("searchResults", []):
        url = sr.get("url")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        host = (urlparse(url).netloc or "").lower()
        if src["domain"] not in host:
            continue
        try:
            doc = core.fetch_document(url)
        except Exception as exc:
            fetch_failures.append({
                "url": url,
                "error": f"STRICT_REFETCH:{type(exc).__name__}:{exc}",
            })
            continue

        rels = seed_bound_relation_evidence(doc.get("text", ""), seed)
        if not rels:
            continue

        names = []
        for rel in rels:
            names.extend(rel["candidates"])
        names = _dedup_names(names)
        if not names:
            continue

        strict_pages.append({
            "url": doc["url"],
            "kind": doc["kind"],
            "pagePrimary": core.canonical(doc.get("title") or ""),
            "names": names,
            "relationEvidence": rels,
            "discoverySeed": seed,
            "relationExtraction": "SEED_BOUND_EXPLICIT_RELATION_V1",
        })

    return {
        "source": src["key"],
        "domain": src["domain"],
        "searchErrors": base.get("searchErrors", []),
        "searchResults": base.get("searchResults", []),
        "explicitSynonymyPages": strict_pages,
        "fetchFailures": fetch_failures,
        "strictSeedBound": True,
        "broadDiscoveryPagesDiscarded": len(base.get("explicitSynonymyPages", [])),
    }
