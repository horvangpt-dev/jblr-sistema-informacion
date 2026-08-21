# TAXON_BY_TAXON_v2 · PROTOCOLO MAESTRO

## 1. Naturaleza

`TAXON_BY_TAXON_v2` es el protocolo transversal de adquisición y trazabilidad del Sistema JBLR.

No es un STIME. Es el mecanismo común que los STIMEs usan para consultar fuentes sin perder identidad, evidencia ni contexto.

Unidad mínima:

`QUERY_UNIT = ONE_TAXON_WORK_KEY × ONE_FIELD_TARGET × ONE_SOURCE_TARGET × ONE_QUERY_VALUE_VERBATIM`

## 2. Identidad de trabajo

Toda fila del corpus debe tener una clave técnica inmutable:

`TAXON_WORK_KEY = HASH_OR_STABLE_KEY(CORPUS_RELEASE_ID + CORPUS_ROW_ID)`

`TAXON_WORK_KEY` nunca cambia aunque cambien después `ID_TAXON_GOBIERNO`, `ID_TAXON_JBLR`, nombres aceptados o sinonimias.

El protocolo distingue:
- `TAXON_WORK_KEY`: ancla técnica estable.
- `ID_TAXON_GOBIERNO`: ID oficial EIDOS cuando se resuelve inequívocamente.
- `ID_TAXON_JBLR`: identificador operativo JBLR del STIME; igual al gubernamental cuando existe; temporal JBLR cuando no existe todavía.
- `PREVIOUS_ID_TAXON_JBLR[]`: historial de IDs operativos superseded, nunca borrado.

## 3. Binding obligatorio

Antes de cualquier consulta deben existir:
- `CORPUS_RELEASE_ID`
- `CORPUS_RELEASE_VERSION`
- `CORPUS_MANIFEST_POINTER`
- `CORPUS_MANIFEST_SHA256`
- `CORPUS_QA_STATE`
- `CORPUS_ROW_ID`
- `TAXON_WORK_KEY`

Si falta o no coincide alguno:

`QUERY_STATE = BLOCKED_INVALID_CORPUS_BINDING`

No se permite fallback a universos históricos.

## 4. Input de consulta

Cada unidad recibe explícitamente:
- `run_id`
- `query_unit_id`
- `protocol_version = TAXON_BY_TAXON_v2`
- `taxon_work_key`
- `id_taxon_jblr_current`
- `field_target`
- `source_target`
- `source_adapter_version`
- `query_value_verbatim`
- `query_value_origin`
- `query_reason`
- `required_source_snapshot_or_live_state`

`query_value_origin` debe ser uno de los orígenes autorizados por el STIME consumidor, p. ej. `TAX_RIOJA`, `TAX_EIDOS`, `TAX_ANTHOS`, `TAX_POWO_WCVP`, `TAX_WFO`, `TAX_EUROMED`, `TAX_HISTORICO_n`.

## 5. Preservación del nombre

Siempre conservar:
- `QUERY_VALUE_VERBATIM`
- `QUERY_VALUE_TRANSPORT`
- `TRANSPORT_TRANSFORMATION_RULE`

Si la fuente exige retirar autoría, escapar caracteres o adaptar sintaxis, esa transformación afecta solo a transporte. Nunca sustituye el valor verbatim.

## 6. Captura raw antes de interpretar

Orden obligatorio:
1. ejecutar request;
2. registrar status técnico;
3. preservar respuesta raw o activo descargado;
4. calcular hash cuando corresponda;
5. registrar fecha/hora, URL/endpoint/dataset/version;
6. solo entonces parsear/normalizar/interpretar.

Campos mínimos:
- `source_request_pointer`
- `source_response_status`
- `raw_payload_pointer`
- `raw_payload_hash`
- `source_snapshot_version`
- `queried_at`

Regla:

`RAW_RESPONSE_FIRST = MANDATORY`

## 7. Candidatos

La fuente puede devolver 0, 1 o N candidatos.

Todos los candidatos elegibles deben conservarse con:
- nombre devuelto;
- autoría si existe;
- rango;
- identificador externo;
- estado taxonómico fuente;
- relación declarada por fuente;
- puntero de evidencia.

Un ranking textual/fuzzy solo puede ordenar candidatos para revisión.

`FUZZY_MATCH != VALIDATED_MATCH`

## 8. Guards de identidad

Prohibiciones duras:
- `SPECIES != SUBSPECIES`
- `SUBSPECIES != VARIETY`
- `VARIETY != SUBVARIETY`
- `PARENT_TAXON != TARGET_TAXON`
- `HYBRID != NON_HYBRID`
- `GROUP != SPECIES`
- `GENUS_ONLY != SPECIES`
- `ORTHOGRAPHIC_SIMILARITY != TAXONOMIC_IDENTITY`

Los tokens de identidad soportados por fuente se preservan: `×/x`, `subsp.`, `var.`, `subvar.`, `gr./grupo`, y equivalentes estructurales.

Encontrar la especie padre puede crear `PARENT_REFERENCE_ID`, pero nunca puede poblar el ID exacto ni convertir la identidad hija en la identidad padre.

## 9. Estados universales

Toda consulta termina en uno de estos estados de núcleo:
- `FOUND_VALIDATED`
- `FOUND_MULTIPLE_CANDIDATES`
- `FOUND_RELATED_ONLY`
- `FOUND_PARENT_ONLY`
- `NOT_FOUND`
- `SOURCE_UNAVAILABLE`
- `SOURCE_ERROR`
- `AMBIGUOUS`
- `CONFLICT`
- `BLOCKED`
- `NOT_EXECUTED`

Cada FIELD puede añadir estados específicos sin redefinir estos significados.

## 10. Regla de NOT_FOUND

`NOT_FOUND` solo puede emitirse cuando simultáneamente:
- `SOURCE_QUERY_EXECUTED = YES`
- `SOURCE_RESPONSE_VALID = YES`
- `SEARCH_SCOPE_COMPLETED = YES`
- `ELIGIBLE_RESULT_COUNT = 0`

Timeout, HTTP/transport error, dataset no adquirido, rate limit o parser roto nunca producen `NOT_FOUND`.

## 11. Reintentos

Errores temporales (`429`, timeout, `5xx`, red) admiten reintentos técnicos controlados.

Los reintentos:
- no cambian semántica;
- no cambian silenciosamente query;
- se registran individualmente.

Tras agotarlos:

`SOURCE_UNAVAILABLE` o `SOURCE_ERROR`

según corresponda.

## 12. Assertion

Solo después de evidencia + interpretación autorizada se materializa una afirmación:
- `field_target`
- `field_value`
- `field_state`
- `assertion_rule_id`
- `assertion_evidence_pointer`
- `asserted_at`

`FIELD_VALUE` nunca sobrescribe raw/candidatos.

## 13. Aislamiento de fuente

Una fuente solo puede escribir el FIELD que su contrato autoriza.

Ejemplo:
- POWO puede descubrir un nombre que después se consulte en ANTHOS.
- POWO nunca puede escribir `TAX_ANTHOS`.

`ONE_SOURCE = ONE_AUTHORIZED_FIELD_WRITER`

## 14. Aislamiento de taxón

Toda escritura verifica:

`INPUT_TAXON_WORK_KEY == OUTPUT_TAXON_WORK_KEY`

Si falla:

`SYSTEMIC_STOP = CROSS_TAXON_MUTATION_ATTEMPT`

## 15. Cola de nombres

Cada taxón mantiene `QUERY_NAME_QUEUE`.

Cada nombre contiene:
- valor verbatim;
- origen;
- relación con el taxón;
- estado de validación;
- evidencia;
- fuentes ya consultadas;
- fuentes pendientes.

Solo nombres con relación suficientemente evidenciada para el propósito del STIME entran en expansión automática.

## 16. Matriz de cobertura

Para un STIME de múltiples fuentes se materializa una matriz:

`QUERY_NAME × REQUIRED_SOURCE`

Cada celda debe tener un estado terminal o pendiente explícito.

Nunca inferir que una fuente fue comprobada porque otra fuente devolvió un resultado equivalente.

## 17. Dedupe e idempotencia

Clave determinista recomendada:

`QUERY_KEY = HASH(CORPUS_RELEASE_ID + TAXON_WORK_KEY + FIELD_TARGET + SOURCE_TARGET + QUERY_VALUE_VERBATIM + PROTOCOL_VERSION + SOURCE_ADAPTER_VERSION)`

Una repetición idéntica sobre la misma snapshot no duplica assertion.

Si la fuente cambió, se crea nueva observación/version y se conserva la anterior.

## 18. Convergencia iterativa

Cuando un nombre nuevo validado aparece:
1. añadirlo a `QUERY_NAME_QUEUE`;
2. generar las celdas requeridas aún no consultadas;
3. ejecutar;
4. incorporar nuevos nombres/relaciones válidos;
5. repetir.

El proceso solo alcanza `FIXPOINT_REACHED = YES` cuando:
- `NO_NEW_VALIDATED_QUERY_VALUES = TRUE`
- `ALL_REQUIRED_QUERY_SOURCE_PAIRS_HAVE_TERMINAL_STATE = TRUE`

## 19. Transaccionalidad

Una query no puede dejar una assertion parcial válida.

Secuencia conceptual:

`BEGIN → REQUEST → RAW_CAPTURE → PARSE → INTERPRET → ASSERT → QA → COMMIT`

Si falla antes de QA:
- conservar log/evidencia de fallo;
- no promover assertion parcial.

## 20. Stop local y sistémico

### TAXON_STOP
Problema restringido a un taxón:
- `AMBIGUOUS`
- `CONFLICT`
- `FOUND_MULTIPLE_CANDIDATES`
- `UNRESOLVED`

El resto del corpus puede continuar si el contrato del STIME lo permite.

### SYSTEMIC_STOP
- binding de release inválido;
- schema/contract mismatch;
- parser/adaptador sistemáticamente roto;
- pérdida de raw evidence;
- cross-taxon mutation;
- false-match sistemático;
- conversión sistemática de source failure en NOT_FOUND;
- pérdida de tokens de identidad.

Ante `SYSTEMIC_STOP`, la ejecución completa se detiene.

## 21. QA por query

Debe validar como mínimo:
- taxon_work_key presente;
- release binding válido;
- field/source autorizados;
- query verbatim preservada;
- raw evidence presente o estado técnico justificante;
- estado válido;
- provenance completo;
- no cross-taxon write;
- positive assertion con evidencia;
- no false NOT_FOUND.

## 22. QA por taxón

Resumen obligatorio:
- `taxon_work_key`
- `id_taxon_jblr_current`
- queries ejecutadas/pending;
- nombres descubiertos;
- fuentes cubiertas;
- assertions;
- conflicts;
- ambiguous;
- not_found;
- source_unavailable;
- evidence pointers;
- `taxon_qa_state`.

## 23. QA de corpus

Métricas obligatorias:
- expected taxa / processed taxa;
- expected query-source pairs / terminal pairs;
- found validated;
- not found;
- source unavailable;
- ambiguous;
- conflict;
- blocked;
- cross-taxon mutations;
- assertions without evidence;
- false NOT_FOUND from technical failure;
- untracked query names.

Debe cumplirse:
- `CROSS_TAXON_MUTATIONS = 0`
- `ASSERTIONS_WITHOUT_EVIDENCE = 0`
- `FALSE_NOT_FOUND_FROM_SOURCE_ERROR = 0`
- `UNTRACKED_QUERY_NAMES = 0`

## 24. Human view

El motor debe poder producir una vista humana por taxón con:
- ID actual;
- nombre de entrada;
- FIELD;
- fuente;
- nombre usado en la consulta;
- resultado;
- estado;
- evidencia.

Y una vista separada `REVIEW_REQUIRED` con ambigüedades, conflictos, múltiples candidatos, parent-only, unresolved y source-unavailable.

## 25. Versionado y aprendizaje

`TAXON_BY_TAXON_v2` es el baseline inicial para el primer STIME gobernado.

Tras ejecución completa + auditoría humana del `STIME_00 · REVISION_TAXONOMICA`, 04 evaluará falsos positivos/negativos, precisión de NOT_FOUND, expansión de nombres, calidad de evidencia y usabilidad humana.

Las mejoras se publican como nueva versión (`v2.1`, `v3`, etc.) sin reescribir ejecuciones históricas.
