# RIOJA_SYNONYM_TO_EIDOS_EXHAUSTIVE_v1

Fecha: 2026-08-23

## Misión
Resolver el máximo número posible de `MITECO_IDTAXON` para los taxones vegetales de la Lista Patrón del Banco de Datos de Biodiversidad de La Rioja que siguen sin ID nacional, conservando siempre `RIOJA_ID` y el nombre original.

## Principios
- REALITY_FIRST = ACTIVE
- NO_SILENT_INFERENCE = ACTIVE
- unknown != zero
- not_found != absence
- SOURCE_FAILURE != NOT_FOUND
- Un nombre/sinónimo único se cruza una sola vez por ciclo contra EIDOS/MITECO.
- Nunca asignar el ID del taxón parental a un subtaxón sin equivalencia demostrada.
- Nunca seleccionar arbitrariamente entre varios `idtaxon`.
- `RIOJA_ID` y `MITECO_IDTAXON` son identificadores distintos y se conservan separados.

## Entrada
Solo registros de flora vascular de la Lista Patrón de La Rioja determinados a especie o rango infraespecífico y que todavía carezcan de `MITECO_IDTAXON` inequívoco.

Excluir de resolución específica automática: `sp.`, `spp.`, `gr.` y rangos superiores sin epíteto específico. Conservarlos en auditoría, no borrarlos silenciosamente.

## FASE A — Búsqueda exhaustiva de sinonimias, taxón por taxón
Para cada `NOMBRE_RIOJA` pendiente consultar, cuando exista cobertura útil:
1. ANTHOS / Real Jardín Botánico-CSIC.
2. Flora Iberica / RJB-CSIC.
3. Florandalucía / Flora Vascular de Andalucía.
4. Herbario Virtual del Mediterráneo Occidental (UIB).
5. Floras, catálogos y herbarios virtuales españoles/regionales pertinentes al taxón.
6. Lista Patrón Española de Flora Vascular / MITECO como capa nacional.
7. POWO/WCVP y WFO como contraste taxonómico internacional y fuente suplementaria de sinonimia.
8. Euro+Med cuando aporte sinonimia europea/mediterránea no obtenida anteriormente.

Por fuente registrar:
`RIOJA_ID | NOMBRE_RIOJA | SOURCE | QUERY_NAME | RETURNED_NAME | RELATION | SOURCE_URL/REFERENCE | RETRIEVAL_STATUS`

`RELATION` solo puede declararse cuando la fuente la soporta: ACCEPTED_NAME, SYNONYM, BASIONYM, HOMOTYPIC_SYNONYM, HETEROTYPIC_SYNONYM, INFRASPECIFIC_RELATION, HYBRID_RELATION, OTHER_DOCUMENTED_RELATION, UNKNOWN_RELATION.

## FASE B — Conjunto de nombres deduplicado
Para cada taxón construir `UNIQUE_QUERY_NAMES` como unión de:
- nombre original riojano;
- nombres aceptados encontrados;
- sinonimias documentadas;
- basiónimos documentados;
- combinaciones nomenclaturales documentadas.

Normalizar únicamente para deduplicación técnica (espacios, símbolo ×/x y equivalentes de codificación). No cambiar el concepto taxonómico.

Ejemplo: si A aparece en tres fuentes y B en dos, consultar `{A,B}` una sola vez cada uno, no cinco consultas.

## FASE C — Cruce EIDOS/MITECO taxón por taxón
Para cada nombre único:
1. consultar EIDOS/IEPNB por nombre;
2. recuperar `TaxonRecordID/idtaxon` solo de coincidencia identificable;
3. recuperar `scientificName`, `taxonomicStatus`, `grupoTaxonomico` cuando estén disponibles;
4. exigir `grupoTaxonomico = Plantas vasculares` para incorporación automática;
5. registrar también NO_MATCH, AMBIGUOUS y SOURCE_FAILURE.

Salida por consulta:
`RIOJA_ID | NOMBRE_RIOJA | QUERY_ALIAS | MITECO_IDTAXON | MITECO_NAME | MITECO_STATUS | MITECO_GROUP | QUERY_RESULT`

## FASE D — Regla de unificación
- Si uno o varios alias documentados convergen en UN MISMO `MITECO_IDTAXON`: `RESOLVED_CONVERGENT`.
- Si solo un alias documentado produce un único ID y no existe conflicto: `RESOLVED_SINGLE_ALIAS`.
- Si distintos alias producen IDs distintos: `AMBIGUOUS_MULTIPLE_IDS`; no unificar automáticamente.
- Si solo aparece el parental: `PARENT_ONLY`; no heredar ID.
- Si ninguna consulta produce ID: `UNRESOLVED_AFTER_EXHAUSTIVE_SYNONYMY`.
- Un `SOURCE_FAILURE` obliga a conservar la consulta como pendiente; no puede convertirse en NO_MATCH.

## FASE E — Iteración
Después de cada ciclo:
1. incorporar solo resoluciones inequívocas;
2. tomar exclusivamente el remanente;
3. buscar fuentes/sinonimias NUEVAS no consultadas previamente;
4. deduplicar contra todo el historial;
5. consultar EIDOS únicamente para nombres nuevos;
6. repetir hasta que una iteración completa produzca `NEW_UNIQUE_SYNONYMS = 0` o solo queden conflictos/revisiones manuales justificadas.

## FASE F — Cierre
Generar:
- `CORPUS_RIOJA_VASCULAR_EIDOS_RESOLVED.tsv`
- `RIOJA_SYNONYM_EVIDENCE.tsv`
- `RIOJA_EIDOS_QUERY_LEDGER.tsv`
- `RIOJA_UNRESOLVED_AFTER_EXHAUSTIVE.tsv`
- `RIOJA_AMBIGUOUS_MULTIPLE_IDS.tsv`
- `RIOJA_EXECUTION_SUMMARY.json`

El corpus final conserva siempre:
`RIOJA_ID | NOMBRE_RIOJA | MITECO_IDTAXON | MITECO_NAME | RESOLUTION_STATUS | MATCHING_ALIAS | EVIDENCE_SOURCES`

## Criterio de terminación
`DONE` solo cuando:
- todos los taxones de entrada han sido procesados;
- no quedan fuentes programadas sin consultar;
- no quedan alias nuevos sin cruzar;
- cada remanente está explícitamente clasificado como UNRESOLVED, AMBIGUOUS, PARENT_ONLY o SOURCE_FAILURE_PENDING;
- no se ha inferido ningún `idtaxon`.
