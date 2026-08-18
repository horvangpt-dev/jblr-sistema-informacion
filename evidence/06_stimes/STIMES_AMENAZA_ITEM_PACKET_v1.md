# STIMES_AMENAZA_ITEM_PACKET_v1

Date: 2026-08-18

## 1. Scope

This packet materializes only `STIMES.ITEM.AMENAZA` for `LOCALIZACION_Y_SELECCION_TAXONES`.

AMENAZA is a TAXON analytical property. It is not persisted as a population, locality, collection or accession property.

No PROTECCION or other analytical item is implemented in this packet.

## 2. Precedence and analytical ownership

Analytical ownership remains in module 05.

Required provider versions:

- evidence: `AMENAZA_EVIDENCE_v2`
- scoring: `AMENAZA_SCORING_MODEL_v1_2`

STIMES does not copy or reimplement the scoring engine. The 06 adapter validates the provider identity, stores/exports the result and preserves provenance/history.

Current provider self-status is preserved exactly:

- `model_status = WORKING_ANALYTICAL_MODEL`
- `canonical_status = NOT_CANONICAL_UNTIL_00D_ADOPTION`

No 06 artifact changes those statuses.

## 3. Data layers

The canonical STIMES item keeps separate:

1. original evidence;
2. normalized evidence;
3. selected evidence for scoring;
4. analytical result;
5. reliability metadata.

Original evidence is never replaced by normalized or calculated values.

## 4. Existing scoring v1.2 retained

The current v1.2 provider is authoritative for this integration.

It uses category severity, territorial relevance and temporal relevance, and aggregates selected logical units as:

`0.8 * highest weighted assessment + 0.2 * mean(up to three highest distinct logical-unit weighted assessments)`

with a cap of 100.

Missing/non-evaluable states remain `null/UNKNOWN` according to v1.2. STIMES does not inject provisional numeric zero.

Manual score entry/override is prohibited by the adapter.

## 5. Authorized source registry

The item contract registers the already-developed AMENAZA sources without inventing new ones:

- `RIOJA_RED_BOOK`
- `EIDOS`
- `SPAIN_RED_LISTS`
- `EUROPE_CONTINENTAL_2011`
- `EUROPE_NATIONAL_REDLISTS`
- `IUCN_GLOBAL`

Direct IUCN remains `NOT_ACQUIRED_AUTHENTICATION_REQUIRED`. When authenticated direct acquisition exists, it may become the preferred direct global source while older indirect evidence is retained.

## 6. Acquisition and evidence preservation

Provider acquisition remains source-preserving/cache-first.

For each evidence/result revision STIMES can retain:

- queried taxon;
- taxonomic identity used;
- source key/name;
- territorial scope;
- original category;
- consultation time;
- method version;
- dataset/reference identity;
- RAW evidence/reference;
- taxonomic/evidence state;
- selected scoring evidence;
- scoring version/result;
- changes from prior revision.

## 7. Conflict policy

Existing v1.2 conflict semantics are retained.

Same logical unit/version with incompatible evaluable categories:

- preserve all;
- mark unresolved conflict in evidence;
- scoring projection uses precautionary maximum evaluable severity.

Human Excel projection joins visible valid categories with ` / ` and does not add a `CONFLICTO` label.

## 8. Update policy

Two triggers are represented:

- annual refresh: all taxa once per year;
- taxon query: AMENAZA refresh plus request for integral refresh of automatically refreshable LOCALIZACION_Y_SELECCION items.

The exact annual scheduler is `PENDIENTE_DE_DEFINICION`; this packet does not invent infrastructure that is not proven to exist.

Every AMENAZA refresh appends a revision. A timestamp-only repeat is preserved in history but is not considered a new analytical value for dependency cascade.

## 9. Dependency cascade

When the AMENAZA canonical revision changes, 06 emits recalculation requests for:

- `URGENCIA_RECOLECCION`
- `PRIORIDAD_TAXON`

This packet does not implement either dependent formula because the user explicitly authorized only AMENAZA in this execution.

## 10. Neon mapping

Read-only schema verification found existing reusable capacity:

- `analytics.metric_definition`
- `analytics.analysis_run`
- `analytics.analysis_result`
- `evidence.external_source`
- `evidence.external_record`
- `evidence.external_record_snapshot`
- `evidence.provenance_link`

Therefore:

`SCHEMA_CHANGE_REQUIRED = NO`

`NEON_CHANGES = NONE`

AMENAZA remains a versioned analytical enrichment whose `subject_resource_id` is the taxon resource.

## 11. Human Excel view

Sheet: `AMENAZA`

Exact columns:

`N.º | Familia | Taxón | La Rioja | España | Europa | Mundial | Score amenaza | Ámbito efectivo | Última actualización | Evidencia | Confiabilidad`

Rules implemented by the adapter/template:

- territorial columns preserve source-original category text;
- multiple visible valid categories join with ` / `;
- semantic missing states are text, never zero;
- score is shown with max 2 decimals;
- update is one date;
- evidence is one short auditable reference to the principal scoring assessment;
- confidence column accepts only the requested five categories when a versioned method exists.

## 12. Explicit precedence incompatibilities

### AMENAZA.INCOMPAT.001 — single effective territory

Prompt asks first available scope:

`La Rioja -> España -> Europa -> Mundial -> Subsidiario`

Existing v1.2 aggregates multiple weighted logical units. It does not choose one first-available scope.

Decision: `KEEP_EXISTING_MODEL`.

Consequence: `Ámbito efectivo` exists in the Excel contract, but the adapter leaves it blank unless a future versioned semantic supplies one. It must not be invented from v1.2.

State: `PENDIENTE_DE_DEFINICION`.

### AMENAZA.INCOMPAT.002 — provisional zero

Prompt permits provisional numeric zero in some downstream-calculation circumstances.

Existing v1.2 maps missing/non-evaluable states to `null/UNKNOWN`.

Decision: `KEEP_EXISTING_MODEL`.

06 rejects an `UNKNOWN` AMENAZA payload carrying numeric zero.

State: `RESOLVED_BY_PRECEDENCE`.

### AMENAZA.INCOMPAT.003 — internal score precision

Prompt asks max 2 decimals only for display without reducing internal precision.

Current provider scorer writes final `amenaza_score` rounded to two decimals.

Decision: `DO_NOT_CHANGE_PROVIDER_IN_06`.

Higher precision is not available from the current provider output and cannot be claimed by STIMES.

State: `PENDIENTE_DE_DEFINICION`.

## 13. Reliability blocker

The prompt gives the general formula:

`checked weighted components / total component weights * 100`

but neither the prompt nor `AMENAZA_SCORING_MODEL_v1_2` fixes:

- the exact reliability component weight model;
- thresholds for `MUY ALTA / ALTA / MEDIA / BAJA / MUY BAJA`.

STIMES therefore stores a reliability slot/state but does not fabricate a number/category.

State: `PENDIENTE_DE_DEFINICION`.

## 14. Auditability

The item must answer from stored data, not chat memory:

- why the score exists;
- which sources/scopes contributed;
- original categories;
- alternate evidence;
- unacquired/unchecked evidence;
- scoring model version;
- update time;
- change from previous revision.

## 15. Tests

`app/tests/stimes-amenaza-state.js` uses a clearly synthetic test-only taxon and verifies:

- provider version lock;
- manual score prohibition;
- UNKNOWN is not zero;
- RAW/normalized/selected layers remain distinct;
- source-original category projection;
- conflict display with `/`;
- `Ámbito efectivo` remains unasserted when undefined;
- reliability remains unasserted when undefined;
- refresh appends immutable history;
- previous RAW remains unchanged after a later score;
- changed AMENAZA emits dependency recalculation requests;
- unchanged analytical revision does not emit a redundant dependency cascade;
- taxon query requests full LOCALIZACION_Y_SELECCION refresh context;
- annual due/not-due policy.

CI workflow `JBLR 06 STIMES` includes this test in addition to the existing field-registry test.

## 16. Materialized artifacts

- `app/src/stimes/items/amenaza-v1.contract.json`
- `app/src/stimes/items/amenaza-v1.js`
- `app/src/stimes/item-registry-v0.json`
- `app/tests/stimes-amenaza-state.js`
- `.github/workflows/jblr-06-stimes.yml`
- `evidence/06_stimes/STIMES_AMENAZA_ITEM_PACKET_v1.md`
- Drive/Excel view: `STIMES_LOCALIZACION_SELECCION_AMENAZA_v1`

## 17. Completion state

`AMENAZA_STIMES_INTEGRATION = OPERATIONAL_WITH_EXPLICIT_PENDING_DEFINITIONS`

Operational now:

- provider binding;
- version enforcement;
- evidence/result separation;
- score consumption;
- missingness semantics;
- conflict projection;
- immutable update history contract;
- audit payload;
- Excel schema;
- dependency cascade request;
- existing JBLR storage mapping without schema change.

Pending without invention:

- reliability weight model;
- reliability category thresholds;
- one-scope `Ámbito efectivo` semantic compatible with multiscope v1.2;
- annual scheduler implementation;
- higher-precision provider output if required.
