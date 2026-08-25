# 08 · STIME00 RC3 reconciliation adapter

Scope: implementation + controlled QA only under `JBLR-EVT-0000-20260826-ACCEPT-04-STIME00-RC3-DESIGN-V18-001`.

This package does **not** execute STIME00 productively.

It implements:
- deterministic historical STIME00 -> RC3 reconciliation by `TAXON_WORK_KEY`;
- strict two-cohort classification;
- reuse-only handling for 562 `NEW_OFFICIAL` hubs;
- fresh-resolution scope formation for 261 `NEW_TEMP` hubs;
- explicit preservation of the 14 historical review taxa;
- extension terminal-state semantics;
- fail-closed source failure handling.

Controlled integration was executed against:
- historical STIME00 CSV Drive `1E0nq01LJnoKSAmX1aeatbj-WQwf5-4W8`;
- accepted RC3 package Drive `1g1ark3uunwMwhNJoIdeAqUQg-ZXJIGME`.

Result: `READY_FOR_09 = YES`.

No Neon/database write, RC2 mutation, STIME00 closure, taxonomic research, or full 3033-row productive execution was performed.
