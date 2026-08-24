#!/usr/bin/env python3
import re
from urllib.parse import urlparse

import secondary_web_synonymy_185_v2 as core

# Recovery-specific source extension. Keep the old discovery modules immutable.
_JOLUBE = {"key":"JOLUBE_BOTANICAL_CATALOGS","domain":"jolube.net","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]}
if not any(s["key"] == _JOLUBE["key"] for s in core.SOURCES):
    core.SOURCES = core.SOURCES + [_JOLUBE]

_SYMBOL_RE = re.compile(r"(?:≡|(?<![<>!])=(?!=))")
_SYMBOL_LINE_START_RE = re.compile(r"^\s*(?:≡|(?<![<>!])=(?!=))\s*")
_LABEL_RE = re.compile(r"\b(?:syn\.?|synonym(?:s)?|sinonim(?:ia|ias|o|os)?|sinónim(?:ia|ias|o|os)?)\b", re.I)


def _canon_key(name):
    return core.norm(core.canonical(name))


def _dedup_names(names):
    out, seen = [], set()
    for name in names:
        key = _canon_key(name)
        if key and key not in seen:
            seen.add(key)
            out.append(core.canonical(name))
    return out


def _name_matches(text):
    out = []
    for match in core.SCI_RE.finditer(text or ""):
        name = core.canonical(match.group(1))
        key = _canon_key(name)
        if key:
            out.append({
                "name": name,
                "key": key,
                "start": match.start(1),
                "end": match.end(1),
            })
    return out


def _previous_nonempty_line(lines, index):
    j = index - 1
    while j >= 0:
        value = lines[j].strip()
        if value:
            return value
        j -= 1
    return ""


def _symbol_clause_evidence(line, seed, relation_kind="SEED_BOUND_SYMBOL_CHAIN"):
    """Return only names in the explicit =/≡ relation graph component containing seed."""
    seed_key = _canon_key(seed)
    matches = _name_matches(line)
    if len(matches) < 2:
        return []

    adjacency = {i: set() for i in range(len(matches))}
    edge_markers = {}
    for i in range(len(matches) - 1):
        left, right = matches[i], matches[i + 1]
        between = line[left["end"]:right["start"]]
        # ≠ is explicitly not a synonymic relation and blocks adjacency.
        if "≠" in between:
            continue
        marker = _SYMBOL_RE.search(between)
        if marker:
            adjacency[i].add(i + 1)
            adjacency[i + 1].add(i)
            edge_markers[(i, i + 1)] = marker.group(0)

    evidence = []
    seen_components = set()
    for seed_index, item in enumerate(matches):
        if item["key"] != seed_key:
            continue

        stack = [seed_index]
        component = {seed_index}
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor not in component:
                    component.add(neighbor)
                    stack.append(neighbor)

        if len(component) < 2:
            continue
        component_key = tuple(sorted(component))
        if component_key in seen_components:
            continue
        seen_components.add(component_key)

        ordered = sorted(component)
        candidates = _dedup_names([
            matches[i]["name"]
            for i in ordered
            if matches[i]["key"] != seed_key
        ])
        if not candidates:
            continue

        markers = []
        for i in ordered:
            if i + 1 in component and (i, i + 1) in edge_markers:
                markers.append(edge_markers[(i, i + 1)])
        start = matches[ordered[0]]["start"]
        end = matches[ordered[-1]]["end"]
        evidence.append({
            "relationKind": relation_kind,
            "marker": " ".join(markers),
            "seed": core.canonical(seed),
            "candidates": candidates,
            "context": core.short(line[start:end], 900),
            "relationClauseBound": True,
        })
    return evidence


def _multiline_symbol_clause_evidence(lines, seed):
    """
    Preserve explicit nomenclatural chains split over physical lines.

    A multiline chain starts on a line containing the investigated seed and may
    continue only through immediately following non-empty lines whose first
    non-whitespace token is '=' or '≡'. Any other non-empty line terminates the
    chain. This captures layouts such as:

        Chaenorhinum rupestre (Guss.) Speta
        ≡ Linaria rupestris ...
        = Linaria exilis ...

    without opening a broad multi-line name-harvesting window.
    """
    seed_key = _canon_key(seed)
    evidence = []

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue
        if seed_key not in {x["key"] for x in _name_matches(line)}:
            continue

        continuation = []
        j = i + 1
        while j < len(lines):
            nxt = lines[j].strip()
            if not nxt:
                j += 1
                continue
            if not _SYMBOL_LINE_START_RE.match(nxt):
                break
            # A relation marker without a scientific name is not sufficient
            # evidence and terminates this conservative chain.
            if not _name_matches(nxt):
                break
            continuation.append(nxt)
            j += 1

        if not continuation:
            continue

        synthetic_clause = " ".join([line] + continuation)
        for ev in _symbol_clause_evidence(
            synthetic_clause,
            seed,
            relation_kind="SEED_BOUND_MULTILINE_SYMBOL_CHAIN",
        ):
            ev["physicalLineSpan"] = [i + 1, i + len(continuation) + 1]
            ev["multilineRelationBound"] = True
            evidence.append(ev)

    return evidence


def _label_clause_evidence(lines, index, seed):
    """Bind Syn./synonym/sinonimia candidates to the label clause containing seed."""
    line = lines[index].strip()
    seed_key = _canon_key(seed)
    label_matches = list(_LABEL_RE.finditer(line))
    if not label_matches:
        return []

    previous_line = _previous_nonempty_line(lines, index)
    previous_keys = {x["key"] for x in _name_matches(previous_line)}
    evidence = []

    for label_pos, label in enumerate(label_matches):
        # The subject may occur on the same line before the label. Restrict it
        # to the current semicolon-delimited clause.
        subject_start = line.rfind(";", 0, label.start()) + 1
        subject_text = line[subject_start:label.start()]
        subject_matches = _name_matches(subject_text)
        subject_keys = {x["key"] for x in subject_matches}

        # Candidate side ends at the next independent clause. This prevents a
        # second relation on the same line from leaking into the seed clause.
        candidate_start = label.end()
        candidate_end = len(line)
        semicolon = line.find(";", candidate_start)
        if semicolon >= 0:
            candidate_end = min(candidate_end, semicolon)
        if label_pos + 1 < len(label_matches):
            candidate_end = min(candidate_end, label_matches[label_pos + 1].start())
        candidate_text = line[candidate_start:candidate_end]
        candidate_matches = _name_matches(candidate_text)
        candidate_keys = {x["key"] for x in candidate_matches}

        seed_in_clause = (
            seed_key in subject_keys
            or seed_key in candidate_keys
            or (not subject_matches and seed_key in previous_keys)
        )
        if not seed_in_clause:
            continue

        candidates = [
            x["name"] for x in candidate_matches if x["key"] != seed_key
        ]
        # If the seed itself is on the candidate side, a named subject on the
        # same clause is also directly bound by the label relation.
        if seed_key in candidate_keys:
            candidates.extend(
                x["name"] for x in subject_matches if x["key"] != seed_key
            )
        candidates = _dedup_names(candidates)
        if not candidates:
            continue

        context_parts = []
        if not subject_matches and seed_key in previous_keys:
            context_parts.append(previous_line)
        context_parts.append(line[subject_start:candidate_end].strip())
        evidence.append({
            "relationKind": "SEED_BOUND_LABEL_CLAUSE",
            "marker": label.group(0),
            "seed": core.canonical(seed),
            "candidates": candidates,
            "context": core.short("\n".join(context_parts), 900),
            "relationClauseBound": True,
        })

    return evidence


def seed_bound_relation_evidence(text, seed):
    """
    Precision-first relation extractor.

    A candidate is accepted only if:
      1) an explicit synonymic relation marker is present (=, ≡, Syn./synonym/sinonimia),
      2) the investigated seed taxon is explicitly present in the same relation clause/chain, and
      3) the candidate is connected to that seed by that exact explicit relation clause/chain.

    Explicit =/≡ chains split across consecutive physical lines are preserved
    only when each continuation line begins with a relation marker. Mere
    co-occurrence in a bounded block is insufficient. Broad synonymy sections
    and neighboring independent relations are rejected.
    """
    lines = (text or "").splitlines()
    evidence = []

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue
        evidence.extend(_symbol_clause_evidence(line, seed))
        evidence.extend(_label_clause_evidence(lines, i, seed))

    evidence.extend(_multiline_symbol_clause_evidence(lines, seed))

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
    and retain only seed-bound, clause-bound explicit synonym relations.
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

        names = _dedup_names(
            name for rel in rels for name in rel["candidates"]
        )
        if not names:
            continue

        strict_pages.append({
            "url": doc["url"],
            "kind": doc["kind"],
            "pagePrimary": core.canonical(doc.get("title") or ""),
            "names": names,
            "relationEvidence": rels,
            "discoverySeed": seed,
            "relationExtraction": "SEED_BOUND_RELATION_CLAUSE_MULTILINE_V3",
        })

    return {
        "source": src["key"],
        "domain": src["domain"],
        "searchErrors": base.get("searchErrors", []),
        "searchResults": base.get("searchResults", []),
        "explicitSynonymyPages": strict_pages,
        "fetchFailures": fetch_failures,
        "strictSeedBound": True,
        "relationClauseBound": True,
        "multilineExplicitRelationsPreserved": True,
        "broadDiscoveryPagesDiscarded": len(base.get("explicitSynonymyPages", [])),
    }
