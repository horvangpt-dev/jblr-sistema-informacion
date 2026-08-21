# STIME 00 · External source bindings verification

Verified: 2026-08-21T10:55:00+02:00  
Actor: 08 · technical implementation and controlled test  
Protocol: TAXON_BY_TAXON_v2  
Scope: source acquisition binding only; no full-corpus execution by 08.

## Result

`LIVE_SOURCE_BINDINGS_COMPLETE = YES`

All five external source families required by the STIME 00 field registry now have either an exact official live endpoint or an official/versioned dataset binding. This satisfies the source-binding gate requested in `JBLR-EVT-0000-20260821-RESPONSE-08-STIME00-ID-GATE-001`.

## Bindings

### EIDOS · MITECO / IEPNB

- Official live SOAP WSDL: `https://eportal.miteco.gob.es/IEPNB_EIDOS_WS/services/IEPNB_EIDOS?wsdl`
- State: `VERIFIED_OFFICIAL_LIVE_WSDL`
- Authority: `ID_TAXON_GOBIERNO`, `TAX_EIDOS`
- Guard: only exact, unequivocal same-taxon identity may trigger government-ID supersession; parent/broader IDs remain contextual references.

### ANTHOS · Real Jardín Botánico (CSIC)

- Official/versioned GBIF Spain IPT resource: `https://ipt.gbif.es/resource?r=rjb-anthos`
- Versioned DwC-A: `https://ipt.gbif.es/archive.do?r=rjb-anthos&v=1.19`
- Dataset version: `1.19`
- Published: `2021-11-30`
- DOI: `10.15468/4wnutv`
- UUID: `4cf3eec1-b902-40c9-b15b-05c5fe5928b6`
- State: `VERIFIED_OFFICIAL_VERSIONED_DWCA`

### POWO / WCVP · Royal Botanic Gardens, Kew

- Current POWO query endpoint: `https://powo.science.kew.org/results?q={QUERY_URLENCODED}`
- Current WCVP rolling DwC-A: `https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip`
- Official WCVP repository index: `https://sftp.kew.org/pub/data-repositories/WCVP/`
- Rolling snapshot last-modified observed: `2026-06-04`
- Latest numbered immutable archive observed: WCVP v15 (`2026-01-07`)
- State: `VERIFIED_OFFICIAL_LIVE_PORTAL_AND_CURRENT_WCVP_ROLLING_SNAPSHOT`

### World Flora Online

- Current WFO Plant List API/portal: `https://list.worldfloraonline.org/`
- Versioned release: `WFO_PLANT_LIST_2026-06`
- Snapshot: `https://zenodo.org/records/20782718`
- State: `VERIFIED_OFFICIAL_API_AND_VERSIONED_BACKBONE`

### Euro+Med PlantBase

- Current portal: `https://europlusmed.org/`
- Current CDM API base: `https://api.cybertaxonomy.org/euromed/`
- API documentation pointer: `http://api.cybertaxonomy.org/euromed/doc`
- Dataset mode: continuously updated live CDM
- Legacy portal: `https://ww2.bgbm.org/euroPlusmed/` is retained as support-only and is not current assertion authority.
- State: `VERIFIED_CURRENT_PORTAL_AND_LIVE_CDM_ENDPOINT`
- Guard: transport failure, blocking or unavailability must remain `SOURCE_UNAVAILABLE` / `SOURCE_ERROR`; it must never be converted to `NOT_FOUND`.

## QA / governance state

- `ID_MAPPING_CANONICAL_GATE = RESOLVED`
- `IMPLEMENTATION_COMPLETE = YES`
- `CONTROLLED_TEST_MATRIX = PASS_53_OF_53`
- `SYSTEMIC_QA = PASS`
- `FULL_CORPUS_EXECUTION_BY_08 = 0`
- `LIVE_SOURCE_BINDINGS_COMPLETE = YES`
- `READY_FOR_09 = YES` from the 08 implementation/source-binding perspective.
- `09_INSTRUCTION_SENT = NO` until an explicit governed green light is received, per the user's instruction and STIME governance.

No remote-CI PASS is asserted by this report. No Neon writes and no full-corpus STIME execution were performed.
