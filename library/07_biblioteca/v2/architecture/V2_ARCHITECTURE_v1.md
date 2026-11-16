# V2_ARCHITECTURE_v1

Version: 1.0.0
Actor: 07.V2 · BIBLIOTECA CIENTÍFICA · DOCUMENTAL · CORPUS JBLR
Scope: persistence of accepted 07.0–07.4 design only

## Invariants

- Canonical document binaries remain in Google Drive.
- GitHub stores machine-readable inventory, schemas, rules, index artifacts, automation and pointers.
- `archivo_en_biblioteca != hecho_validado`
- `reference != assertion`
- `assertion != validated_fact`
- `evidence != conclusion`
- `raw != normalized`
- `unknown != zero`
- `unknown != absence`
- `not_found != absence`
- V1 history is immutable by this package.
- Conservation corpus mass ingestion, file moves, deletions and mass shortcut creation are out of scope.

## Logical architecture

SOURCE UNIVERSE
→ DISCOVERY
→ IDENTITY REGISTRY
→ METADATA + PROVENANCE + RELATIONS
→ FIXITY / DEDUP / VERSION CONTROL
→ CONTENT EXTRACTION
→ FILE / FULL-TEXT / PAGE / SECTION INDEXES
→ {
  HUMAN_VISUALIZATION_LAYER,
  AI_INFORMATION_LAYER
}
→ LIBRARY_QUERY
→ EVIDENCE RESPONSE

## Storage boundaries

### Canonical source layer
Google Drive retains original/managed files and stable Drive pointers.

### Structured control layer
GitHub under `library/07_biblioteca/v2/` retains schemas, vocabularies, protocols, models, query contracts and implementation plans.

### Index layer
Future software consumes the structured inventory without deriving identity from folder path, filename, language, title or institution.

## Two-view rule

HUMAN_VISUALIZATION_LAYER and AI_INFORMATION_LAYER are separate projections over the same documentary identities.

Human navigation:
`LANGUAGE → PURPOSE / PROCESS → ENTITY → DOCUMENT`

AI retrieval:
faceted metadata + relations + indexes + full text/page pointers.

One source binary may have many classifications and many human pointers. Physical source duplication is `NO_BY_DEFAULT`.

## V1 transition

`library/07_biblioteca/manifest.json` remains a V1 legacy artifact and is not replaced.
Historical IDs remain historical IDs. V2 introduces explicit `SOURCE_FAMILY_ID`, `SOURCE_ID`, and `LIB_FILE_ID` identities and may maintain a transition mapping without silently reinterpreting legacy identifiers.
