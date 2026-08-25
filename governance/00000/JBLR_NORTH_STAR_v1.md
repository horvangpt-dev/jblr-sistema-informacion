# 00000 · JBLR · NORTH STAR v1

Status: `CANONICAL_DIRECTION_REFERENCE`
Date: 2026-08-26
Authority: `00000 · DIRECCIÓN GENERAL JBLR`
Superior: `000000 · COORDINACIÓN GENERAL` (`COORDINATION_ONLY`)

## Final objective

Build and operate one integrated information and management system for the Jardín Botánico de La Rioja (JBLR): a modular, traceable and cumulative software platform representing scientific, biological, documentary and operational reality and executing processes over that shared reality.

The final product is **not** a collection of spreadsheets, forms, chats or documents. Those are views, evidence containers or exports derived from the JBLR core.

## System invariants

- `ONE_JBLR_SYSTEM = TRUE`
- `ONE_MASTER_INFORMATION_UNIVERSE = TRUE`
- `PROJECTS_ARE_EXECUTION_CONTEXTS = TRUE`
- `FILES_ARE_NOT_THE_DATABASE = TRUE`
- `DATA_CAPTURE_ONCE_REUSE_MANY = TRUE`
- `CONVERSATIONAL_MEMORY_IS_NOT_CANONICAL = TRUE`
- `PERSISTED_EVIDENCE_FIRST = ACTIVE`
- `REALITY_FIRST = ACTIVE`
- `HISTORY = NEVER_DELETE`
- `COPY_NEVER_MOVE = ACTIVE`

## Biological universes

1. Living collections / cultivated plants inside JBLR.
2. Wild flora / conservation universe for La Rioja.

Both share the taxonomic layer. A taxon is not duplicated because it occurs in both universes.

## JBLR metamodel

The core is expressed through:

- Types
- Fields
- Subfields
- Composite Types
- Relations
- Rules
- Provenance
- History / revisions / supersession

A Field is a semantic reusable unit, not merely a spreadsheet column. Data is captured once in its natural entity and may feed multiple processes and outputs.

## Already materialized core domains

Neon schemas verified: `core`, `taxonomy`, `field`, `material`, `evidence`, `governance`, `analytics`, `security`.

Existing entities include TaxonConcept, TaxonomicName, Identification, Population, Location, Prospection, FieldVisit, Observation, Census, CollectionEvent, Individual, Sample, ProcessingEvent, Accession, BibliographicReference, ExternalRecord, Assertion, DigitalAsset, AnalysisRun, AnalysisResult, ValidationEvent, RecordRevision and QualityAssessment.

## Analytical architecture

Scientific Interest /100:
- M1 Publications 30%
- M2 Citations/impact 15%
- M3 Independent herbarium collections 20%
- M4 Number of herbaria/institutions 10%
- M5 Additional academic bibliography 10%
- M6 Public genetic/genomic evidence 15%

Collection urgency:
`THREAT + LEGAL_PROTECTION + EX_SITU_DEFICIT -> COLLECTION_URGENCY`

Taxon priority:
`COLLECTION_URGENCY + SCIENTIFIC_INTEREST -> TAXON_PRIORITY`

Operational engine:
`PRIORITY + PHENOLOGY + LOCATION + JBLR_STATE + OPERATIONAL_FEASIBILITY -> WHAT/WHERE/WHEN TO PROSPECT OR COLLECT`

Scores and confidence remain separate and versioned.

## Project hierarchy

`000000` = coordination across projects only.

`00000` = JBLR CEO and executive/strategic/scientific/technical authority.

`0000` = area directions / major delegated projects.

`0001+` = projects, phases and operational units.

Every project must declare the Types it consumes/creates, Fields it reads/writes, Relations it creates, Processes it executes, Events it emits and Human Outputs it requires.

Projects do not own the scientific truth. Data belongs to the JBLR universe; projects are recorded as creation/use/execution contexts.

## External outputs

JBLR is the master source. MITECO spreadsheets and other formats are versioned templates/mappings/exports.

One captured Field must be reusable across every compatible form, report, map, export or analysis without manual duplication.

## Direction anti-drift rule

Before accepting any new workstream, `00000` must identify:
1. which North Star objective it serves;
2. which system layer it changes;
3. which Type/Field/Relation/Process it affects;
4. which existing resource it reuses;
5. which persisted evidence establishes prior state;
6. which verifiable next state defines completion.

If this mapping cannot be made, the work is classified before expansion.
