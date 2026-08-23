# MITECO_RIOJA_INDEPENDENT_DISCOVERY_AUTOMATION_v1

## 1. Authority and scope

Direct user design/execution authority applies to this geographic-map step. This protocol specializes, but does not replace, `04_MITECO_TERRITORIAL_DISCOVERY_PROTOCOL_v1` and `ID_TAXON_BY_ID_TAXON_v1`.

Its purpose is to create a reproducible, automatable, MITECO-only parallel corpus for La Rioja before any comparison with JBLR.

## 2. Non-negotiable independence rule

The MITECO-La Rioja corpus is discovered **only** from official MITECO/IEPNB/EIDOS sources plus the frozen Rioja grid manifest.

Forbidden discovery inputs:

- JBLR taxonomic RC2 or successors;
- the accepted/curated Flora de La Rioja corpus;
- names inferred from JBLR;
- manual taxon whitelists derived from JBLR;
- any cross result from a previous JBLR-vs-MITECO comparison.

The JBLR/Rioja corpus may be read only after the MITECO parallel corpus has been frozen and hashed.

## 3. Optimization strategy

`DISCOVERY_STRATEGY = CELL_FIRST_ID_SECOND`

The current EIDOS distribution layer is a grid aggregate. Each distribution feature exposes:

- `cuadricula`;
- `total_taxones_plantvas`;
- `lista_idstaxon_filtro_plantvas`;
- geometry/provenance fields.

Therefore the efficient discovery sequence is:

1. Query the current EIDOS distribution layer over the frozen 77-cell Rioja search window.
2. Preserve every raw response page and request before interpretation.
3. Extract `lista_idstaxon_filtro_plantvas` from each grid aggregate feature.
4. Match the feature's official grid code to the frozen MITECO 10x10 cell registry.
5. Emit one evidence relationship per `ID_TAXON × GRID_CELL`.
6. Deduplicate taxon-level records by exact EIDOS/MITECO ID only.
7. Resolve identity/name by exact ID using official MITECO cache/snapshot first.
8. Invoke live `ID_TAXON_BY_ID_TAXON` only for IDs that are missing, stale, redirected, conflicting, or otherwise unresolved.
9. Freeze and hash the independent MITECO corpus.
10. Only after freeze may a separate process compare it with JBLR.

This avoids 2,508 distribution queries. Distribution discovery is grid-first; taxon-by-taxon is reserved for identity resolution of the subset actually discovered.

## 4. Frozen geographic input

`RIOJA_MITECO_GRID_CELL_REGISTRY_v1`

- selected cells: 77;
- fully within Rioja: 26;
- partial intersection: 51;
- CRS: EPSG:25830;
- source manifest SHA256: `2130223540a220465b102d64f309e3eca821bc1c6334843912b7d9988df334ee`;
- registry SHA256: `70019631815dfb5446e257416e1d4e5616cc2abd68dfdde2eddd5639fc05a830`.

The registry is a technical execution projection of the preserved full grid manifest. It does not supersede the full manifest.

## 5. Territorial semantics

If at least one EIDOS distribution unit maps to a `FULLY_WITHIN_RIOJA` 10x10 cell:

`TERRITORIAL_EVIDENCE_STATE = DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA`

If a taxon is supported only by `PARTIAL_INTERSECTION` cells:

`TERRITORIAL_EVIDENCE_STATE = BORDER_GRID_CANDIDATE`

A border-grid candidate must never be silently promoted to confirmed Rioja presence.

A later, more precise official geometry may promote a border case only through explicit, versioned evidence.

## 6. Identity semantics

Primary deduplication key:

`EXACT_MITECO_EIDOS_ID_TAXON`

Name equality is never an identity merge rule.

For every discovered ID:

- first attempt exact-ID resolution from an official MITECO identity cache/snapshot;
- then use live `ID_TAXON_BY_ID_TAXON_v1` only when necessary;
- preserve redirects, historical IDs and conflicts as relationships/evidence;
- never use a parent ID as child identity;
- never infer identity from a scientific-name string alone.

## 7. Raw evidence and cache policy

Every live WFS page stores:

- request URL;
- pagination offset/count;
- HTTP status;
- response content type;
- exact raw body;
- raw SHA256;
- returned/matched counts;
- timestamp/run identity.

`CACHE_FIRST = MANDATORY`

A rerun against the same source snapshot and registry must be idempotent.

A changed live source produces a new observation/run; it never overwrites historical evidence.

## 8. Outputs

The executor produces:

- `MITECO_RIOJA_TAXA_BY_ID_v1.json`
- `MITECO_RIOJA_TAXA_BY_ID_v1.csv`
- `MITECO_RIOJA_CONFIRMED_INTERIOR_v1.json`
- `REVIEW_BORDER_GRID_TAXA_v1.json`
- `MITECO_RIOJA_UNRESOLVED_IDENTITY_v1.json`
- `MITECO_RIOJA_DISCOVERY_SELECTED_FEATURES_v1.json`
- `MITECO_RIOJA_DISCOVERY_OUTSIDE_FEATURES_v1.json`
- `MITECO_RIOJA_PARALLEL_CORPUS_v1.json`
- `RUN_MANIFEST_MITECO_DISCOVERY_v1.json`
- raw WFS response pages under `raw/`.

## 9. Systemic stop conditions

The run hard-stops on:

- grid registry/hash mismatch;
- EIDOS schema change;
- malformed vascular-ID list;
- declared vascular count inconsistent with the parsed ID list;
- pagination incomplete;
- source HTTP/network failure;
- duplicate raw feature IDs across the run;
- any attempt to pass RC2/JBLR/Rioja-corpus discovery input.

A local taxon identity ambiguity does **not** stop the full run. It is routed to `MITECO_RIOJA_UNRESOLVED_IDENTITY_v1`.

## 10. No false absence

A missing taxon from a completed MITECO run means only:

`NOT_RETURNED_BY_THIS_MITECO_DISCOVERY_RUN`

It never means:

- absent from La Rioja;
- absent from Spain;
- taxonomically invalid;
- not present in JBLR.

Source failure or incomplete pagination can never become `NOT_FOUND` or absence.

## 11. Execution model

The live GitHub workflow is explicit and non-recurring.

It is never run on every ordinary push.

A live run is triggered only by:

- `workflow_dispatch`; or
- an explicit commit to `run-control/REQUEST.json` with `enabled=true`.

The workflow:

- is read-only against MITECO;
- performs no Neon writes;
- performs no JBLR canonical membership writes;
- performs no comparison with RC2/JBLR;
- uploads the entire run as an immutable GitHub Actions artifact for inspection and later preservation in Drive.

## 12. Cross gate

`CROSS_WITH_JBLR = PROHIBITED_UNTIL_MITECO_CORPUS_FROZEN`

After freeze, the later comparison must be a distinct phase and preserve three independent result families:

- `MITECO ∩ JBLR`;
- `MITECO − JBLR`;
- `JBLR − MITECO`.

None of those result families silently changes canonical membership.
