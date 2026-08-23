# JBLR_RIOJA_SPATIAL_GRID_SYSTEM_v1

Direct user-authorized design + execution by actor 08 for this geographic step only.

## Scope override

`WORKFLOW_OVERRIDE = SKIP_04_DESIGN_FOR_THIS_STEP_ONLY`

This override applies only to the construction of the hierarchical geographic map. It does not authorize taxonomic membership changes, productive botanical discovery, Neon writes, or a general bypass of JBLR governance.

## Materialized layers

- **10 km:** 77 cells — 26 fully within La Rioja, 51 partial. Frozen MITECO-based baseline.
- **5 km:** 261 cells — 147 fully within, 114 partial. Deterministic EPSG:25830 subdivision aligned to the frozen 10 km baseline.
- **1 km:** 5,375 cells — 4,706 fully within, 669 partial. Deterministic UTM/MGRS-compatible operational grid.
- **100 m:** virtual/on-demand.
- **10 m:** virtual/on-demand.

## Area control

Official IDERioja perimeter area: **5,041.355517 km²**.
The sum of positive intersections at 5 km and 1 km reproduces the same area within floating-point tolerance.

## Core rule

Exact coordinates/geometries are primary evidence. Grid membership is a derived spatial index and never replaces the original coordinate/geometry.

## Source distinction

MITECO officially declares terrestrial 10 km, 5 km and 1 km grids. This release reuses the frozen official 10 km snapshot. Direct 5 km/1 km binary snapshots were not acquired in this runtime, so those geometries are explicitly labelled **derived/aligned** rather than falsely claimed as byte-identical official snapshots. Future official snapshot comparison creates a new version; it never silently replaces this baseline.

## QA

`JBLR_RIOJA_SPATIAL_GRID_QA_v1 = 25/25 PASS`

No taxon discovery, canonical taxon mutation, or Neon write was performed.

## Drive primary package

- Folder: `1r1fHYx9DcuutRmfYAtdpYa31xvM77ydi`
- State document: `1Su15BR5XcykQyn4zwKlawYg3ONjKY19_wSRWsqYTrb0`
- GeoPackage: `1kSgb-L7h_pj5mrqevbf9g7Ilrn9Oh_gf`
- Interactive viewer: `1mPqxSevyjM2mjK8DIM2LjuUDLNE__gjx`
- 1 km manifest: `1uXYGtIzj_stDvdATanYvVYM11mOLDokm`
- 5 km manifest: `1jAS0_eYGTouIoVvdp2kfkaof3tv3xdVj`
- QA report: `15BesnQcj83XFY_5Cp2vb0QG9YDdA1A3D`
- Release manifest: `1FFPEYViO6KmhzhBneIq7wLwLbwC3cZlP`
- Release ZIP: `1f58swsIh8vunMioqiFVi2gaH2qSA74R3`

## Release hashes

- `RELEASE_SHA256 = 789e693587153ae22df0a1d0b1f36878364ef0b77f1a9ca59cce7cfc591dba9d`
- `ZIP_SHA256 = e8de1344417620b925b367378550d5f6f3a4ee7e278a1b6c9fc4c97f197cebd0`

## Evolution rule

`IMMUTABLE_BASELINE_PLUS_VERSIONED_SUCCESSORS`

Never silently replace historic cell identity, geometry, source binding, or an exact observation coordinate.