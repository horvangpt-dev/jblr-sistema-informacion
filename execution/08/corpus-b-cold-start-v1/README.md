# Actor 08 · Corpus B cold-start v1

Minimal implementation adaptation and controlled QA for `MILESTONE_01_CORPUS_B_COLD_START_v1`.

Scope is deliberately bounded:
- deterministic vascular filter: `Reino === Plantae && Phylum === Tracheophyta`;
- source `Especie EIDOS` parser using the binding regex;
- separation contract for 2262 raw vascular / 1924 source-mapped / 338 source-unresolved rows;
- fresh empty-cache resolution workflow mechanics for the 338 queue;
- hard isolation from Corpus A, RC2/2210, prior result tables, prior static MITECO dumps, prior synonym ledgers and prior lookup caches;
- 16 controlled QA tests required by 0000.V15.

This package contains **no productive taxon-resolution results** and performs **no Corpus A crosswalk**.

`PRODUCTIVE_EXTRACTION_BY_08 = 0`
`PRODUCTIVE_TAXON_RESOLUTION_BY_08 = 0`
`CROSS_WITH_A_PERFORMED = false`
