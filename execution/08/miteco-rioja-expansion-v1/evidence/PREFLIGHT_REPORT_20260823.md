# 08 · MITECO_RIOJA_EXPANSION_v1 · Final preflight report

## Scope
Actor 08 implementation/preflight only. No productive territorial taxon discovery, productive corpus cross, canonical membership mutation, RC2 mutation or Neon productive writes were performed.

## Design binding
- Correlation: `JBLR-HANDOFF-04-08-MITECO-RIOJA-EXPANSION-v1`
- Delivery event: `JBLR-EVT-04-20260823-MSG-08-MITECO-RIOJA-EXPANSION-HANDOFF-001`
- Protocols: `MITECO_RIOJA_EXPANSION_v1`, `ID_TAXON_BY_ID_TAXON_v1`

## Source bindings
All required primary source bindings are verified.

### MITECO IEET 10×10 grid
- snapshot SHA256: `81eff6329051a6ee740b94ca42b49499c3d33721cce01738127246f4a9711c77`
- feature count: `5441`
- CRS: `EPSG:25830`
- geometry type: Polygon
- invalid geometries: `0`
- native identity/code fields preserved: `OBJECTID`, `UTMCODE`, `CUADRICULA`, `COD_INB`

### IDERioja boundary and crosscheck grid
- WFS version: `1.1.0`
- perimeter typename: `perimetro`
- grid typename: `cuadricula_utm_de_10_x_10_km`
- CRS: `EPSG:25830`
- DescribeFeatureType SHA256: `1429e60eacdd790d7b1732708d27bbc8e04a8c885ff956481473f31e658845c4`
- perimeter GML SHA256: `e4e2364121b2bb3d2cb1825a0d77c51a529ab97f6c3d19bc0ceb55d885c4be24`
- grid GML SHA256: `1ab588d1f0eceb85fb2cb90364e15f53e76678c18b8d398f8df4669496044828`
- geometry field: `msGeometry`
- perimeter feature count: `1`
- IDERioja 10×10 candidate cell count: `117`

### EIDOS distribution WFS
- service version: `2.0.0`
- typename: `especies:distribucion_especies`
- DescribeFeatureType SHA256: `e2bf7d274fc6934094fb76beb3850d0c525c99cfc544f54ecff54fb9b3774c31`
- source feature ID field: `id`
- grid field: `cuadricula`
- vascular count field: `total_taxones_plantvas`
- vascular taxon ID-list field: `lista_idstaxon_filtro_plantvas`
- geometry field: `geom`
- geometry type: `gml:MultiSurfacePropertyType`
- JSON output is supported by GetCapabilities.
- distribution records are grid aggregates, not one-species-per-feature records. Identity extraction is therefore ID-first: parse the vascular ID list and resolve each ID through the current EIDOS identity route. No taxon name is inferred from this layer.
- unexpected list encoding or schema change => `SYSTEMIC_STOP_SOURCE_SCHEMA_CHANGED_UNHANDLED`.

### MITECO vascular-flora filter
- snapshot SHA256: `6f98009923977acd53583b34f0bdc3307c4e7a8ef1ea8679bfaf825faaf4b15d`
- classifier: `Grupo taxonómico = Plantas vasculares`
- independent crosscheck: `LP Flora vascular = 1`
- unique IDs: `4527`
- vascular IDs: `2508`
- excluded IDs: `2019`
- unresolved classifications: `0`
- consistency: PASS

### IEET static distribution
- version binding: `2015_STATIC_RESOURCE_EXPOSED_BY_CURRENT_MITECO_PAGE`
- secondary source only; provenance must remain separate from current EIDOS evidence.

## Frozen Rioja grid manifest
Drive folder: `18byihH3xEx9a7ZvpLmpZrtZh-Kl30-Zp`

- manifest Drive ID: `1bylY9pRrV8xL564G9CDiiUApRzGePz3R`
- manifest SHA256: `2130223540a220465b102d64f309e3eca821bc1c6334843912b7d9988df334ee`
- selected-code list Drive ID: `1UZMLpR49xtJm5dwHSFWrgkUTrYbxJj7b`
- selected cells: `77`
- fully within Rioja: `26`
- partial positive-area intersections: `51`
- Rioja perimeter area: `5041355517.269160 m²`
- selected intersection-area sum: `5041355517.269161 m²`

Selection is derived only from positive-area intersection with the official IDERioja perimeter. No manual cell list or bbox approximation was used.

## IDERioja crosscheck
Drive ID: `1HJXKXtFfqfiHjF0TCZy-5aSjOAKwFw5o`

- IDERioja candidate cells: `117`
- IDERioja positive-area cells: `77`
- same coordinate cell set as MITECO selection: YES
- code matches: `61`
- native-code differences: `16`
- material geometry mismatch count: `0`
- maximum per-cell symmetric-difference area: `0.350364 m²`
- state: `PASS_WITH_CODE_DIFFERENCE`
- primary grid/code authority retained: MITECO

The 16 code-label differences are preserved as evidence and are not silently harmonized.

## Implementation and tests
- controlled acceptance matrix: `110/110 PASS`
- additional EIDOS aggregate-adapter unit tests: `6/6 PASS`
- source-dependent A/B evidence gate: PASS
- systemic QA: PASS
- strict manifest-hash guard implemented
- strict EIDOS vascular-ID-list parser implemented
- WFS JSON request builder and pagination completeness guard implemented
- exact-ID full outer join remains implemented
- actor-08 nonproductive guard remains active

Remote CI has not been established for this branch; no remote CI PASS is claimed.

## Required zeros
- `PRODUCTIVE_TAXON_DISCOVERY_BY_08 = 0`
- `PRODUCTIVE_CORPUS_CROSS_BY_08 = 0`
- `CANONICAL_MEMBERSHIP_WRITES = 0`
- `RC2_MUTATION = 0`
- `NEON_PRODUCTIVE_WRITES = 0`
- `MATERIAL_GEOMETRY_MISMATCH = 0`

## Gate
`ALL_PRIMARY_SOURCE_BINDINGS_VERIFIED = YES`
`GRID_MANIFEST_READY_FOR_09 = YES`
`FLORA_VASCULAR_FILTER_VERIFIED = YES`
`ID_TAXON_BY_ID_TAXON_READY = YES`
`DISCOVERY_EXECUTOR_READY = YES`
`CROSS_BY_ID_READY = YES`
`ALL_REQUIRED_TESTS_PASS = YES`
`SYSTEMIC_QA = PASS`

`READY_FOR_09 = YES`

Per governance, 08 does not initiate the productive run directly from this report. 04 must review/accept the implementation handoff before 09 is instructed to execute.
