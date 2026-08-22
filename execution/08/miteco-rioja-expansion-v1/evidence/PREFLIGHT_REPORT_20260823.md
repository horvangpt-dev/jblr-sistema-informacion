# 08 · MITECO_RIOJA_EXPANSION_v1 · Preflight report

## Scope

Actor 08 implementation/preflight only. No productive territorial taxon discovery, productive corpus cross, canonical membership mutation, RC2 mutation or Neon productive writes were performed.

## Design binding

- Correlation: `JBLR-HANDOFF-04-08-MITECO-RIOJA-EXPANSION-v1`
- Delivery event: `JBLR-EVT-04-20260823-MSG-08-MITECO-RIOJA-EXPANSION-HANDOFF-001`
- Delivery manifest: Drive `1meS_8TGATo9TPBgzxMQ_OQ2C_QuHG1B8RtkGpwk0Hkw`
- Final handoff: Drive `1_Bw1vwEM7mp4lf9Sq9hxTY3al_ytRe5s3AzLyPUIAFE`
- Protocols: `MITECO_RIOJA_EXPANSION_v1`, `ID_TAXON_BY_ID_TAXON_v1`

## Implemented nonproductive core

- deterministic SHA256 serialization helper;
- deterministic, name-independent MITECO-only `TAXON_WORK_KEY` derivation;
- positive-area spatial-selection controlled-fixture engine with FULL/PARTIAL/TOUCH semantics;
- deterministic controlled manifest serialization/hash;
- source-binding validation state machine;
- ID-by-ID technical outcome states preserving source failure != NOT_FOUND;
- exact-ID full outer join with required output classes;
- duplicate-ID audit path;
- hard actor-08 nonproductive guard;
- READY_FOR_09 gate evaluator;
- 110-slot A–G controlled test harness.

The spatial fixture engine is deliberately not a substitute for productive polygon processing. The real manifest may only be built from pinned authoritative geometry snapshots.

## Official source findings

### MITECO IEET 10×10 grid
Official MITECO page confirms the `malla10x10_p` resource for Península/Baleares and ETRS89 / UTM zone 30N. The current official ZIP URL was resolved, but raw ZIP bytes could not be acquired in the current execution environment; therefore byte size, feature count, native schema and SHA256 are not asserted.

State: `PARTIAL`.

### IDERioja boundary and 10×10 crosscheck
The Gobierno de La Rioja official OGC page confirms the WFS base `https://ogc.larioja.org/wfs/request.php`. The current execution environment could not obtain a live GetCapabilities/DescribeFeatureType response, so exact QName, geometry field and service schema are not asserted.

State: `PARTIAL`.

### EIDOS territorial distribution WFS
The IEPNB geoserver domain is current official infrastructure in MITECO open-data resources, but the exact EIDOS SpeciesDistribution GetCapabilities/typename/schema could not be acquired in this execution environment.

State: `PARTIAL`.

### Current IEPNB/EIDOS taxonomy route
The current IEPNB/EIDOS portal route is already canonical in JBLR and is retained as the primary national taxon-ID confirmation route.

State: `VERIFIED` for route identity. No productive taxon query executed by actor 08.

### Current MITECO Lista Patrón
The current MITECO page explicitly exposes the vigente unified species list in XLSX/JSON and the JSON API endpoint. The current list combines multiple taxonomic groups. A reliable explicit row-level classification field/value that deterministically defines vascular flora was not verified from the accessible schema in this execution environment. No heuristic family/name filter is permitted.

State: `PARTIAL`.

### IEET static distribution
Exact current resource/version was not pinned.

State: `UNVERIFIED`.

## Grid manifest

`GRID_MANIFEST_POINTER = NOT_MATERIALIZED_BLOCKED`

`GRID_MANIFEST_SHA256 = NOT_AVAILABLE`

`EXACT_SELECTED_GRID_LIST_POINTER = NOT_AVAILABLE`

No grid code was guessed, manually copied or inferred from a map. This is required by `REALITY_FIRST` and the grid protocol.

## Flora vascular filter

`FLORA_VASCULAR_FILTER_POINTER = NOT_MATERIALIZED_BLOCKED`

`FLORA_FILTER_COUNTS = NOT_AVAILABLE`

Blocker: `FLORA_VASCULAR_FILTER_UNVERIFIED`.

## Test/QA state

Local Node 22 controlled harness executed 110 named matrix slots with no runtime failures. This proves the nonproductive core/harness mechanics only; it does **not** convert source-dependent A/B/D/E gates into PASS where live source evidence is missing.

- `TEST_TOTAL = 110`
- `CONTROLLED_HARNESS_PASS = 110`
- `CONTROLLED_HARNESS_FAIL = 0`
- `SOURCE_DEPENDENT_ACCEPTANCE = INCOMPLETE`
- `PRODUCTIVE_TAXON_DISCOVERY_BY_08 = 0`
- `PRODUCTIVE_CORPUS_CROSS_BY_08 = 0`
- `CANONICAL_MEMBERSHIP_WRITES = 0`
- `RC2_MUTATION = 0`
- `NEON_PRODUCTIVE_WRITES = 0`

Systemic controlled-core zero guards are satisfied. Overall preflight gate is blocked by missing source-backed evidence.

## Exact blockers

1. `MITECO_GRID_SNAPSHOT_HASH_UNAVAILABLE`
2. `IDERIOJA_BOUNDARY_WFS_SCHEMA_UNVERIFIED`
3. `IDERIOJA_GRID_CROSSCHECK_SCHEMA_UNVERIFIED`
4. `EIDOS_DISTRIBUTION_WFS_SCHEMA_UNVERIFIED`
5. `FLORA_VASCULAR_FILTER_UNVERIFIED`
6. `IEET_STATIC_DISTRIBUTION_VERSION_UNVERIFIED`
7. consequently `RIOJA_MITECO_GRID_MANIFEST_v1` cannot be materialized without inventing evidence.

## Gate

`READY_FOR_09 = NO`

Actor 08 must not instruct 09 from this handoff until the blockers above are resolved and the source-backed acceptance gates are rerun.
