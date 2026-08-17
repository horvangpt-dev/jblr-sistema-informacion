# JBLR 05 · AMENAZA · Evidence Collection Method v1

Date: 2026-08-17

## Scope

This method closes only Stage A (`EVIDENCE_COLLECTION`) of `OBJETIVO_01 = AMENAZA`.
It does **not** score, weight, rank, select territorial precedence, or select temporal precedence.

## Canonical universe

- Taxa: 2742
- SHA-256: `3a0f9badf84a6798d01f0b5f3c01d72875d28f852db0b2ec49592bccfb2f31e4`
- Entry to the scientific query layer is fail-closed unless row count and SHA-256 both match.

## Source layers

### IEPNB / EIDOS

Structured official Spanish source. Acquisition is separated into:

1. input-name query;
2. source taxon identity;
3. accepted identity resolution where applicable;
4. conservation-status query by accepted source taxon id.

`INPUT_NAME`, `SOURCE_RETURNED_NAME`, and `ACCEPTED_TAXON_IDENTITY` are preserved separately.
Multiple valid assessments, including historical assessments, are retained as distinct evidence records.
Empty conservation results mean `NO_EVALUATION_FOUND` in the searched source, never `NO_THREAT`.

The final validated normalization is rebuilt from cached RAW using `AMENAZA_EIDOS_EVIDENCE_v2_RAW_RENORMALIZED` so pre-v2 normalized output cannot enter the validated milestone.

### Database of European vascular plants red lists

Scientific compilation of national and subnational European red lists. It is **not** treated as a continental European assessment. Each country/sub-country evaluation retains its real territorial scope, reference, category, taxonomic identity state, and source traceability.

Taxonomically unresolved source records are not promoted to validated evidence.

### Sources located but not bulk-integrated

- `Libro Rojo de la Flora Silvestre Amenazada de La Rioja`: existence located; complete reproducible structured dataset not located.
- `European Red List of Vascular Plants` (2011): continental source located, but selective rather than comprehensive for the complete JBLR universe.
- `IUCN Red List`: global authoritative source located; API acquisition requires authorized authentication. No access controls are bypassed.

These limitations are recorded explicitly and do not become negative threat assertions.

## Canonical evidence states

- `VALID_SOURCE_EVIDENCE`
- `NO_EVALUATION_FOUND`
- `TAXON_UNRESOLVED`
- `SOURCE_ERROR`
- `UNKNOWN`
- `UNRESOLVED_CONFLICT`

Semantics:

- `NO_EVALUATION_FOUND != NO_THREAT`
- `SOURCE_ERROR != NO_EVALUATION_FOUND`
- `TAXON_UNRESOLVED != NO_EVALUATION_FOUND`
- `UNKNOWN != ZERO`

## Conflict rule

Different dates, territories, countries, source systems, or versions are not conflicts by themselves.
`UNRESOLVED_CONFLICT` is restricted to incompatible categories within the same comparable logical unit of taxonomic identity + source + territorial scope + version/date where documentary resolution is not available.

## QA requirements

The milestone can close only when:

- all 2742 universe rows are present exactly once in the taxon summary;
- source RAW is preserved where acquired;
- negative results, source errors, and unresolved taxonomic identities are separated;
- all validated evidence is traceable to a source/reference;
- source-specific evidence remains separate from the universe-level summary;
- canonical state vocabulary is enforced;
- scoring, weighting, and absence inference are false;
- a human-reviewable Drive spreadsheet is written, read back, and verified.

## Scoring prohibition

`SCORING_PERFORMED = NO`

Scoring remains reserved for `00D_DEFINE_AMENAZA_SCORING` after the complete evidence milestone.
