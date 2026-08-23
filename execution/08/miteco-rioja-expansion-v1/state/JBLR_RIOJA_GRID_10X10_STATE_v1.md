# STATE JBLR · MAPA CUADRÍCULA RIOJA 10×10 · v1

- `STATE_ID = JBLR_RIOJA_GRID_10X10_STATE_v1`
- `STATE_CLASS = FOUNDATIONAL_GEOGRAPHIC_ASSET`
- `STATE_INTENT = PRESERVE_AND_EVOLVE`
- `STATE_PRESERVATION = ACTIVE_BY_DIRECT_USER_DIRECTIVE`
- `CANONICAL_STATE_REGISTRATION = PENDING_0000_CANONICALIZATION`

## Baseline

- MITECO 10×10 + perímetro oficial IDERioja + crosscheck IDERioja
- `CRS_BASE = EPSG:25830`
- `GRID_SELECTED_COUNT = 77`
- `GRID_FULLY_WITHIN_COUNT = 26`
- `GRID_PARTIAL_COUNT = 51`
- Selection rule: positive-area intersection with official Rioja boundary; edge/corner-only touch excluded.
- Partial cells may extend beyond La Rioja and still belong to the operational JBLR grid. This does not assert that the full cell lies administratively inside La Rioja.

## Frozen evidence

- MITECO grid SHA256: `81eff6329051a6ee740b94ca42b49499c3d33721cce01738127246f4a9711c77`
- Grid manifest SHA256: `2130223540a220465b102d64f309e3eca821bc1c6334843912b7d9988df334ee`
- Drive state doc: `1n4S4w6X-4mY7WEtBv_dYqExbf3Hi23mDTyYCfN-99nw`
- Drive package folder: `18byihH3xEx9a7ZvpLmpZrtZh-Kl30-Zp`
- Manifest: `1bylY9pRrV8xL564G9CDiiUApRzGePz3R`
- Selected codes: `1UZMLpR49xtJm5dwHSFWrgkUTrYbxJj7b`
- IDERioja crosscheck: `1HJXKXtFfqfiHjF0TCZy-5aSjOAKwFw5o`
- EIDOS schema binding: `1PqDVWgggaeam5WrW99g_yNuDYybk5o89`

## Strategic role

This state preserves the 10×10 territorial grid as reusable JBLR infrastructure. Future data may be explicitly linked to one or more grid cells: populations, observations, surveys, field visits, collections, samples, accessions, images, historical evidence and analytical layers.

The grid does not replace precise source geometry. Precise coordinates/geometries remain primary evidence; 10×10 cells are a territorial indexing/aggregation layer.

## Versioning

`EVOLUTION_POLICY = IMMUTABLE_BASELINE_PLUS_VERSIONED_SUCCESSORS`

Future corrections or redesigns must create versioned successors and preserve the baseline, source hashes, cell membership changes, geometry/code changes and migration provenance.

`MAPA_JBLR_10X10_RIOJA = PRESERVE · VERSION · LINK · NEVER SILENTLY REPLACE`
