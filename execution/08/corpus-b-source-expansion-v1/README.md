# 08 · Corpus B source expansion v1

Implementation-only layer for the 337-record Corpus B carry-forward queue authorized by 0000.V15.

This package does **not** run productive taxon resolution. It provides:

- deterministic 9-source priority orchestration;
- explicit source access-state inventory;
- fail-closed source adapters;
- EIDOS SOAP request/response mechanics;
- HVMO/UIB deterministic alphabetical-index access;
- configured-search adapter contract for traceable document/search sources;
- evidence-only name-network expansion;
- mandatory EIDOS requery for each new supported name;
- fixed-point control;
- exact name/rank/hybrid preservation;
- zero-contamination and no-cross guards.

`source_failure != not_found` and `not_found != absence` are enforced.
