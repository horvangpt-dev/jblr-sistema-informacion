# HUMAN_VIEW_MODEL_v1

Version: 1.1.0

## Navigation contract

`LANGUAGE → SPECIAL COLLECTION / PURPOSE / PROCESS → DOCUMENT`

## Rules

- `ONE_CANONICAL_DOCUMENT_IDENTITY = TRUE`
- `HUMAN_DISTRIBUTION_LIBRARY = PHYSICAL_DISTRIBUTION_COPIES`
- `HUMAN_COPY_NEW_LIB_FILE_ID = NO`
- `HUMAN_COPY_REDEFINES_CANONICAL_IDENTITY = NO`
- `MULTIPROCESS_DOCUMENT = MULTIPLE_HUMAN_DISTRIBUTION_COPIES_ALLOWED`
- Human folder placement is a view/distribution layer, not documentary identity.
- A rename, move or authorized human distribution copy does not change `LIB_FILE_ID`.
- A source document may appear physically in several human folders when it is useful for several processes or special collections.
- Accidental technical duplication and intentional human distribution copies are different concepts.
- Deduplication of canonical/technical files still requires strong identity evidence.

## Language

Primary human navigation uses verified `PRIMARY_LANGUAGE`.

Top-level language roots currently include:

- `ES · ESPAÑOL`
- `EN · ENGLISH`
- `FR · FRANÇAIS`
- `PT · PORTUGUÊS`
- `OTROS IDIOMAS`

`OTROS IDIOMAS` is a container of language-specific folders only. It must not contain a mixed-language document pool.

When a verified document introduces a language without a previous dedicated root, create one language-specific folder under `OTROS IDIOMAS` and route that language there. Do not infer language from country, institution or filename alone when evidence is insufficient.

Verified additional language roots currently include:

- `RU · РУССКИЙ`
- `ZH · 中文`
- `ID · BAHASA INDONESIA`
- `HR · HRVATSKI`
- `BG · БЪЛГАРСКИ`

The controlled vocabulary also supports `de` so a German branch can be created on first verified German occurrence without using a generic mixed-language bucket.

## Special collection 00 · complete manuals and guides

Each language root contains, or must create when needed, a priority `00` collection for complete manuals, handbooks, broad methodological guides and equivalent comprehensive reference works.

Examples of language-localized `00` folders:

- ES: `00 · MANUALES Y GUÍAS COMPLETAS`
- EN: `00 · COMPLETE MANUALS & GUIDES`
- FR: `00 · MANUELS ET GUIDES COMPLETS`
- PT: `00 · MANUAIS E GUIAS COMPLETOS`
- RU: `00 · РУКОВОДСТВА И МЕТОДИЧЕСКИЕ МАТЕРИАЛЫ`
- ZH: `00 · 指南与手册`
- ID: `00 · PANDUAN & MANUAL`
- HR: `00 · PRIRUČNICI I VODIČI`
- BG: `00 · РЪКОВОДСТВА И НАРЪЧНИЦИ`

Qualification is based on substantive scope and documentary form. Page count, title patterns such as manual/guide/handbook and layout are useful screening signals, but no single signal is authoritative by itself.

A complete manual or guide may simultaneously retain valid distribution copies in process folders. Its presence in `00` does not remove or replace process relationships.

## Purpose / Process

Human-purpose paths are generated from controlled `PROCESS` values. Multi-process documents may map to multiple process views.

A language root may also contain an `01` or later general/other-document collection when useful, but a specialized instruction or narrow document must not be promoted to the complete-manual collection merely because it resembles a guide.

## Metadata interaction

Human organization should progressively enrich at least:

- `PRIMARY_LANGUAGE`
- `DOCUMENT_TYPE`
- `TITLE`
- `PROCESS`
- `TOPICS`
- human distribution/projection pointers
- explicit field epistemic state

Missing values remain unknown/not assessed; they are never interpreted as zero or absence.

## Entity

`ENTITY` is a navigation reference, not a new identity layer. It should point to a catalogued entity such as institution, source family, standard, taxon or other named subject appropriate to the document.

## Existing V1 folders

V1 physical folders are preserved as historical/source locations. V2/V3 human-library organization does not require destructive migration of those source locations.

## Supersession note

The original v1.0.0 rule `SOURCE_BINARY_DUPLICATION = NO_BY_DEFAULT` remains valid for the canonical/technical corpus, but is superseded for the human distribution layer by the later user-authorized `PHYSICAL_DISTRIBUTION_COPIES` model.
