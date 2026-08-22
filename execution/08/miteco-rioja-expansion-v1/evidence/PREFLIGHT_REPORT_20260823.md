# 08 · MITECO_RIOJA_EXPANSION_v1 · Preflight report

## Scope
Actor 08 implementation/preflight only. No productive territorial taxon discovery, productive corpus cross, canonical membership mutation, RC2 mutation or Neon productive writes were performed.

## Design binding
- Correlation: `JBLR-HANDOFF-04-08-MITECO-RIOJA-EXPANSION-v1`
- Delivery event: `JBLR-EVT-04-20260823-MSG-08-MITECO-RIOJA-EXPANSION-HANDOFF-001`
- Protocols: `MITECO_RIOJA_EXPANSION_v1`, `ID_TAXON_BY_ID_TAXON_v1`

## Implemented nonproductive core
Deterministic SHA256 serialization, positive-area spatial fixture engine, deterministic manifest serialization, source-binding state machine, ID-by-ID outcome model, exact-ID full outer join, duplicate-ID audit, hard actor-08 nonproductive guard and 110-slot A–G controlled harness remain implemented.

## Source findings after user-supplied official files

### MITECO IEET 10×10 grid — VERIFIED
User supplied the official MITECO ZIP `malla10x10terrestre_p_tcm30-199156.zip`.
- SHA256: `81eff6329051a6ee740b94ca42b49499c3d33721cce01738127246f4a9711c77`
- bytes: `3221811`
- feature count: `5441`
- CRS read from source metadata: `EPSG:25830`
- geometry type: Polygon
- invalid geometries: `0`
- native fields include `OBJECTID`, `UTMCODE`, `CUADRICULA`, `COD_INB`
- embedded metadata identifier: `ESMAGRAMAMALLA10201206250001`

Blocker `MITECO_GRID_SNAPSHOT_HASH_UNAVAILABLE` is RESOLVED.

### IDERioja WFS — PARTIAL, materially advanced
User supplied current GetCapabilities.
- SHA256: `89b06e8443f2396a5af09c61a15c71a3c4f211f25451cdd8bf167bbccb6463db`
- service version: `1.1.0`
- exact perimeter typename: `perimetro`
- exact crosscheck grid typename: `cuadricula_utm_de_10_x_10_km`
- default CRS for both: `EPSG:25830`

Remaining: DescribeFeatureType plus actual perimeter/grid geometries. No bbox approximation is permitted.

### EIDOS distribution WFS — PARTIAL, materially advanced
User supplied current GeoServer GetCapabilities.
- SHA256: `3ea1fec150641eccba1ff15d9bb289001aeb0f888901698d91bc49320e360fa9`
- service version: `2.0.0`
- exact typename: `especies:distribucion_especies`
- declared default CRS: `EPSG:3857`

Remaining: DescribeFeatureType to verify actual geometry and local species identifier/name fields.

### MITECO vascular-flora filter — VERIFIED
The available current MITECO Lista Patrón with normativa exposes an explicit row-level classifier.
- source SHA256: `6f98009923977acd53583b34f0bdc3307c4e7a8ef1ea8679bfaf825faaf4b15d`
- `Grupo taxonómico = Plantas vasculares`
- independent crosscheck: `LP Flora vascular = 1`
- unique idtaxon total: `4527`
- vascular IDs: `2508`
- excluded IDs: `2019`
- unresolved classifications: `0`
- cross-field consistency: PASS

Artifact: `contracts/MITECO_FLORA_VASCULAR_ID_SET_v1.json`.

Blocker `FLORA_VASCULAR_FILTER_UNVERIFIED` is RESOLVED.

### IEET static distribution — VERSION VERIFIED
The current MITECO IEET page exposes `BD_IEET` at `bd_ieet_2015_tcm30-207985.zip`. It remains a secondary static source and must stay provenance-separated from current EIDOS evidence. Snapshot bytes were not acquired by actor 08.

Blocker `IEET_STATIC_DISTRIBUTION_VERSION_UNVERIFIED` is RESOLVED at version-binding level.

## Grid manifest
`GRID_MANIFEST_POINTER = NOT_MATERIALIZED_BLOCKED`
`GRID_MANIFEST_SHA256 = NOT_AVAILABLE`
`EXACT_SELECTED_GRID_LIST_POINTER = NOT_AVAILABLE`

Reason: authoritative Rioja perimeter geometry and IDERioja 10×10 crosscheck geometries are still missing. No cell list is guessed or manually entered.

## Test/QA state
- `TEST_TOTAL = 110`
- `CONTROLLED_HARNESS_PASS = 110`
- `CONTROLLED_HARNESS_FAIL = 0`
- `PRODUCTIVE_TAXON_DISCOVERY_BY_08 = 0`
- `PRODUCTIVE_CORPUS_CROSS_BY_08 = 0`
- `CANONICAL_MEMBERSHIP_WRITES = 0`
- `RC2_MUTATION = 0`
- `NEON_PRODUCTIVE_WRITES = 0`

## Remaining exact blockers
1. `IDERIOJA_BOUNDARY_DESCRIBEFEATURETYPE_AND_GEOMETRY_MISSING`
2. `IDERIOJA_GRID_CROSSCHECK_DESCRIBEFEATURETYPE_AND_GEOMETRIES_MISSING`
3. `EIDOS_DISTRIBUTION_DESCRIBEFEATURETYPE_MISSING`
4. consequently `RIOJA_MITECO_GRID_MANIFEST_v1` cannot yet be materialized.

## Gate
`READY_FOR_09 = NO`

Do not instruct 09 until the three remaining source payloads above are verified and the real geographic preflight is rerun.
