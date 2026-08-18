# STIMES · LOCALIZACIÓN Y SELECCIÓN · PROTECCIÓN · ITEM PACKET v1.1

Fecha: 2026-08-18

## Estado

- ITEM / FIELD_ID analítico: `STIMES.ITEM.PROTECCION`
- SUBJECT: `TAXON`
- PROVIDER: `05_MOTORES_ANALITICOS_BOTANICOS`
- EVIDENCE: `PROTECCION_LEGAL_EVIDENCE_v2`
- PROVIDER MODEL PRESERVED: `PROTECCION_LEGAL_SCORING_MODEL_v1`
- STIMES METHOD: `PROTECCION_STIMES_SELECTION_v1_1`
- EQUIVALENCE: `PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2`
- DATABASE SCHEMA CHANGES: `NONE`
- NEON WRITES: `0`
- CORE STATUS: `OPERATIONAL`
- REMAINING CONFIGURATION: reliability weights/thresholds and external annual scheduler integration remain `PENDIENTE_DE_DEFINICION` because no canonical values exist in the prompt, AMENAZA or persisted evidence.

## Precedencia

05 is reused, not replaced. `PROTECCION_LEGAL_EVIDENCE_v2`, `PROTECCION_LEGAL_SCORING_MODEL_v1` and the native 05 score remain historical/provider truth. STIMES does not rewrite them.

The STIMES selection is a versioned downstream interpretation required by the current item contract: territorial applicability is an eligibility condition and not a multiplicative score discount.

## Effective-protection pipeline

1. sufficiently resolved taxon identity;
2. authorized source;
3. primary/official legal source traceable;
4. norm identified;
5. currentness verified;
6. legal validity verified;
7. La Rioja applicability verified;
8. category/equivalence guard verified;
9. select maximum effective `score_100` among eligible records.

A material unresolved conflict sets `state=CONFLICT` and `score_100=null`. A provisional downstream zero is permitted only when a descendant calculation requires a number.

## Territorial QA

The runtime now separates explicit autonomous territory from generic jurisdiction labels. A concrete autonomous community other than La Rioja is always `EXTERNAL_AUTONOMOUS_REFERENCE` for this calculation even if upstream metadata says `Nacional`.

EU and international scopes are not treated as autonomous communities. They may participate only with `legal_applicability_verified=true`.

This closes the previously detected defect where an EU/international jurisdiction name could be misread as an external autonomous territory.

## CITES / wildlife-trade QA

The existing 05 evidence contains at least one conflict between literal `Apéndice II` and normalized `CITES_A_OR_APPENDIX_I`. `PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2` therefore uses literal guards:

- `CITES_A_OR_APPENDIX_I` cannot accept a literal Appendix II / Annex B record;
- `CITES_B_OR_APPENDIX_II` requires literal Appendix II / Annex B;
- `CITES_D` requires literal Annex D.

The analytical grouping is preserved but STIMES does not claim legal identity between CITES appendices and EU Annexes A-D. Current primary legal membership must be verified.

## Primary-law QA resolved in v1.1

### Effective current frameworks

- La Rioja: `BOE-A-2023-4327` — RRPE and CREA; verified current CREA categories `En peligro de extinción` and `Vulnerable`.
- Spain: `BOE-A-2011-3582` — LESRPE and CEEA; verified current CEEA categories `En peligro de extinción` and `Vulnerable`.
- EU Habitats: `CELEX:31992L0043` — Article 13 strict protection for Annex IV(b) plants, conditional on current taxon annex membership and applicable implementation.
- EU wildlife trade: `CELEX:31997R0338` — Annexes A-D; literal annex and current membership required.

### Context-only classes resolved

The following provider classes keep their native 05 score for historical/analytical provenance but have `effective_score_100=null` in STIMES PROTECCION unless a different protective norm independently applies:

- `GENETIC_CONSERVATION` — `BOE-A-2022-3717`: conservation planning / in situ-ex situ framework; not by itself the restrictive taxon protection measured here.
- `MATERIAL_BASE` — `BOE-A-2003-4785`: forest reproductive material regulation; not by itself taxon protection.
- `NATURA_REFERENCE` — `CELEX:32023D2806`: Natura 2000 site-information/reference context; reference presence alone is not a protection category.

`EXTINCT` is retained as historical/source context and is not treated as a current CREA/CEEA protection category.

## SIN PROTECCION guard

`SIN_PROTECCION` may be emitted only when:

- query executed;
- taxon resolved;
- authorized source set verified;
- all configured authorized sources consulted;
- primary source checks complete;
- no required source remains unacquired;
- no material conflict exists;
- no current valid applicable potentially protective record remains blocked by unresolved category/equivalence QA.

This prevents a mapping failure from being silently converted into `SIN_PROTECCION`.

## Audit runtime

Every normalized evidence record receives a deterministic selection decision, including:

- selected effective protection;
- other autonomous community excluded;
- not current/currentness unverified;
- legal validity not verified;
- La Rioja applicability not verified;
- context-only not effective protection;
- literal category conflict;
- category/scope guard unresolved;
- less restrictive than effective maximum.

`auditProtection(result)` reconstructs the effective norm, selected evidence, alternatives and exclusion reasons, method/equivalence versions, score and reliability state without conversational memory.

## Annual update runtime

`annualRefreshDue(last_valid_update, as_of)` implements the deterministic due rule:

`next_due_at = last_valid_update + 1 calendar year`.

No exact execution clock time is invented. Integration with an external scheduler remains `PENDIENTE_DE_DEFINICION`.

Taxon-specific refresh continues to emit `full_localizacion_y_seleccion_refresh_requested=true`.

## Dependents

If PROTECCION materially changes, runtime emits recalculation requests for:

1. `URGENCIA_RECOLECCION` — direct dependency;
2. `PRIORIDAD_TAXON` — transitive dependency.

No downstream formula is implemented in this execution.

## Reliability

Seven objective checked-component booleans are implemented:

- QUERY_EXECUTED
- TAXON_RESOLVED
- SOURCE_AUTHORIZED
- NORM_IDENTIFIED
- CURRENTNESS_VERIFIED
- LA_RIOJA_APPLICABILITY_VERIFIED
- PRIMARY_LEGAL_SOURCE_TRACEABLE

The requested weighted formula is implemented conceptually, but exact weights and MUY ALTA/ALTA/MEDIA/BAJA/MUY BAJA thresholds do not exist in AMENAZA, 05 evidence or the prompt. Therefore:

- numeric reliability = `null`;
- human category = `null`;
- checked/total components remain auditable;
- `RELIABILITY_COMPONENT_WEIGHT_MODEL=PENDIENTE_DE_DEFINICION`;
- `RELIABILITY_CATEGORY_THRESHOLDS=PENDIENTE_DE_DEFINICION`.

This is intentional `NO_SILENT_INFERENCE`, not an implementation omission.

## Tests

`app/tests/stimes-proteccion-state.js` covers mandatory A-H plus additional QA:

- A La Rioja current protection;
- B applicable national protection;
- C most restrictive wins;
- D other autonomous community excluded despite bad upstream national label;
- E repealed evidence preserved but not current;
- F complete negative search => SIN PROTECCION 0;
- G source not acquired => semantic state + provisional downstream zero only;
- H legislative change => downstream recalculation requests;
- EU scope is not misclassified as external autonomous;
- context-only regulatory evidence does not create protection;
- unresolved CITES literal conflict blocks a false SIN PROTECCION;
- unresolved material legal conflict produces CONFLICT/null canonical score;
- annual due rule;
- audit reconstruction.

Independent local execution with Node 22 completed:

`STIMES_PROTECCION_CASES_A_H_AND_QA_PASS`

## Excel view

Required sheet remains:

`N.º | Familia | Taxón | La Rioja | España | Europa/UE | Internacional | Score protección | Norma efectiva | Última actualización | Evidencia | Confiabilidad`

The Excel is a projection only, never canonical storage.

## Remaining explicit pending definitions

1. `RELIABILITY_COMPONENT_WEIGHT_MODEL`
2. `RELIABILITY_CATEGORY_THRESHOLDS`
3. `EXTERNAL_ANNUAL_SCHEDULER_INTEGRATION`
4. primary-source QA for remaining source-dependent category classes if one of those classes is ever eligible in La Rioja.

No REPRESENTACIÓN EX SITU, URGENCIA or other LOCALIZACIÓN Y SELECCIÓN item has been implemented here.
