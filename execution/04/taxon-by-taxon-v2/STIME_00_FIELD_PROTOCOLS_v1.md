# STIME_00 · REVISION TAXONOMICA · PROTOCOLOS DE FIELD

Versión: `STIME_00_FIELD_PROTOCOLS_v1`

Motor transversal requerido: `TAXON_BY_TAXON_v2`

## A. Objetivo global

Para cada taxón del corpus riojano autorizado:

1. preservar el nombre de La Rioja;
2. obtener un `ID_TAXON_GOBIERNO` EIDOS si existe y es inequívoco;
3. establecer `ID_TAXON_JBLR` igual al gubernamental o generar uno temporal;
4. obtener separadamente el tratamiento taxonómico de cada repositorio autorizado;
5. usar cada nombre/sinonimia validada para reconsultar los demás repositorios;
6. repetir hasta convergencia;
7. reconsultar el ID oficial con todo el conjunto de nombres validado;
8. buscar nombres históricos evidenciados;
9. introducir cada histórico validado en la misma cola de reconsulta;
10. cerrar solo cuando no aparezcan nuevos nombres/IDs y todas las consultas requeridas tengan estado terminal explícito.

## B. Fields humanos principales

Una fila por `TAXON_WORK_KEY` / taxón riojano:

- `ID_TAXON_GOBIERNO`
- `ID_TAXON_JBLR`
- `TAX_RIOJA`
- `TAX_EIDOS`
- `TAX_ANTHOS`
- `TAX_POWO_WCVP`
- `TAX_WFO`
- `TAX_EUROMED`
- `TAX_HISTORICO_1`
- `TAX_HISTORICO_2`
- `... TAX_HISTORICO_N`

Regla de presentación:

`ONE_CELL = ONE_NAME`

No concatenar varios nombres en una celda.

Internamente, todos los nombres y relaciones conservan source/provenance individual.

---

# FIELD 00 · TAX_RIOJA

## Fuente

`JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2` y su evidencia fuente de Flora Vascular de La Rioja.

## Procedimiento

1. verificar binding exacto al release autorizado;
2. leer el nombre fuente/verbatim de la fila;
3. copiarlo literalmente a `TAX_RIOJA`;
4. preservar rango, autoría y tokens estructurales cuando estén presentes en la fuente;
5. no corregir ortografía ni sustituir por otro tratamiento externo.

## Output

`TAX_RIOJA = nombre verbatim de la fuente riojana`

## Prohibido

- sobrescribirlo con EIDOS/ANTHOS/POWO/WFO/Euro+Med;
- convertir una revisión externa en corrección retroactiva del corpus.

---

# FIELD 01 · ID_TAXON_GOBIERNO

## Fuente autorizada

`EIDOS_LIVE_MITECO_IEPNB`

Fuente de apoyo solo para descubrimiento: listas patrón/versiones estáticas MITECO. Estas nunca pueden afirmar el FIELD sin confirmación EIDOS viva.

## Primera pasada

Input inicial:

`QUERY_VALUE = TAX_RIOJA`

Ejecutar:

`TAXON_BY_TAXON_v2(TAXON_WORK_KEY, FIELD=ID_TAXON_GOBIERNO, SOURCE=EIDOS_LIVE, QUERY=TAX_RIOJA)`

### Si EIDOS devuelve una ficha inequívoca del mismo taxón

Validar:
- mismo nivel taxonómico requerido;
- mismos tokens de identidad relevantes;
- no parent-only;
- no homónimo ambiguo;
- no candidato por mera similitud.

Entonces:

`ID_TAXON_GOBIERNO = EIDOS_TAXONID`

Estado:

`FOUND_VALIDATED`

### Si EIDOS devuelve solo la especie padre

Guardar:

`PARENT_REFERENCE_ID = EIDOS_TAXONID_PADRE`

Pero:

`ID_TAXON_GOBIERNO = NULL`

Estado:

`FOUND_PARENT_ONLY`

El ID padre nunca se convierte en ID exacto de un infraespecífico.

### Si hay múltiples candidatos

`ID_TAXON_GOBIERNO = NULL`

Estado:

`FOUND_MULTIPLE_CANDIDATES` o `AMBIGUOUS`

### Si la consulta válida no devuelve candidato elegible

`NOT_FOUND_WITH_CURRENT_QUERY`

No significa que el taxón carezca de ID oficial; solo que no se resolvió con los nombres consultados hasta ese momento.

### Si la fuente falla

`SOURCE_UNAVAILABLE` / `SOURCE_ERROR`

Nunca `NOT_FOUND`.

## Reconsulta obligatoria

Cada vez que aparezca un nuevo nombre validado en cualquier FIELD o histórico:

`NEW_NAME -> QUERY EIDOS AGAIN`

Si un nombre alternativo resuelve el ID oficial, actualizar:

`ID_TAXON_GOBIERNO = EIDOS_TAXONID`

preservando todas las consultas anteriores.

## Evidencia mínima

- query name;
- EIDOS returned name;
- EIDOS TAXONID;
- rank;
- match state;
- record pointer;
- query date;
- raw response/snapshot;
- evidence pointer.

---

# FIELD 02 · ID_TAXON_JBLR

## Naturaleza

FIELD derivado; no se consulta en una fuente externa.

## Regla

### Caso A · ID gubernamental exacto disponible

`ID_TAXON_JBLR = ID_TAXON_GOBIERNO`

Estado:

`GOVERNMENT_ID_INHERITED`

### Caso B · ID gubernamental no disponible todavía

Generar un identificador temporal JBLR:

`ID_TAXON_JBLR = TEMPORARY_JBLR_ID`

Requisitos del temporal:
- único;
- determinista o persistentemente estable para el mismo `TAXON_WORK_KEY`;
- nunca reutilizado para otro taxón;
- claramente marcado como temporal.

Estado:

`TEMPORARY_JBLR_GENERATED`

### Caso C · aparece posteriormente ID gubernamental

Cambiar el ID operativo actual a:

`ID_TAXON_JBLR = ID_TAXON_GOBIERNO`

El temporal anterior se conserva en:

`PREVIOUS_ID_TAXON_JBLR[]`

Estado:

`TEMPORARY_SUPERSEDED_BY_GOVERNMENT_ID`

`TAXON_WORK_KEY` no cambia.

---

# FIELD 03 · TAX_EIDOS

## Fuente

`EIDOS_LIVE_MITECO_IEPNB`

## Primera consulta

Input:

`QUERY_VALUE = TAX_RIOJA`

Ejecutar TAXON_BY_TAXON.

## Regla de escritura

Si EIDOS identifica inequívocamente el taxón, guardar en:

`TAX_EIDOS`

el nombre científico que EIDOS muestra/afirma para la ficha taxonómica correspondiente.

Si el nombre consultado es tratado por EIDOS como sinónimo y EIDOS enlaza inequívocamente a otro tratamiento, guardar el tratamiento EIDOS en `TAX_EIDOS` y conservar por separado la relación de sinonimia y el nombre consultado.

No concatenar sinónimos dentro de `TAX_EIDOS`.

## Reconsultas

Todo nuevo nombre validado procedente de ANTHOS, POWO/WCVP, WFO, Euro+Med o históricos se consulta también en EIDOS si la combinación `nombre × EIDOS` aún no tiene estado terminal.

## Resultado ambiguo

No escribir valor definitivo en `TAX_EIDOS`; preservar candidatos/estado.

---

# FIELD 04 · TAX_ANTHOS

## Fuente

`ANTHOS_RJB_CSIC`

Transporte preferido:
- servicio/interfaz oficial ANTHOS cuando esté operativo;
- alternativamente, archivo Darwin Core oficial de ANTHOS publicado por RJB-CSIC/infraestructura oficial asociada, versionado y con hash.

El transporte alternativo no cambia la identidad de la fuente: sigue siendo evidencia ANTHOS.

## Primera consulta

`QUERY_VALUE = TAX_RIOJA`

Ejecutar:

`TAXON_BY_TAXON_v2(... FIELD=TAX_ANTHOS, SOURCE=ANTHOS, QUERY=TAX_RIOJA)`

## Regla de escritura

Si ANTHOS relaciona inequívocamente la consulta con un taxón y proporciona su tratamiento taxonómico, guardar exactamente el nombre de tratamiento ANTHOS en:

`TAX_ANTHOS`

Conservar:
- nombre consultado;
- nombre devuelto;
- external ID si existe;
- taxonomic status;
- sinonimias/relaciones fuente;
- evidence pointer.

## Reconsulta cruzada

Cada nombre nuevo validado descubierto en EIDOS, POWO/WCVP, WFO, Euro+Med o históricos se vuelve a consultar en ANTHOS.

Un `NOT_FOUND` anterior con `TAX_RIOJA` no bloquea una consulta posterior con una sinonimia descubierta.

---

# FIELD 05 · TAX_POWO_WCVP

## Fuente

`Royal Botanic Gardens, Kew · Plants of the World Online / WCVP`

POWO y WCVP se consideran una única familia de tratamiento Kew para este FIELD, evitando duplicar el mismo backbone como dos votos independientes.

Transporte:
- portal POWO actual;
- dataset WCVP descargable desde POWO cuando sea más reproducible/eficiente, con versión/hash.

## Primera consulta

`QUERY_VALUE = TAX_RIOJA`

## Regla de escritura

Si Kew considera el nombre consultado aceptado:

`TAX_POWO_WCVP = accepted Kew name`

Si lo considera sinónimo de un accepted name inequívoco:

`TAX_POWO_WCVP = accepted Kew name`

Y conservar adicionalmente:

`QUERY_NAME -> SYNONYM_OF -> TAX_POWO_WCVP`

según la afirmación fuente.

## No permitido

- usar coincidencia textual para crear sinonimia;
- borrar el nombre riojano;
- tratar POWO y WCVP como dos fuentes independientes para consenso.

## Reconsulta

Todo nuevo nombre validado se consulta contra el mismo tratamiento Kew si aún no se ha consultado esa combinación.

---

# FIELD 06 · TAX_WFO

## Fuente

`WORLD_FLORA_ONLINE`

Transporte:
- portal/API oficial actual cuando sea reproducible;
- backbone oficial versionado cuando sea más estable, conservando versión/hash.

## Primera consulta

`QUERY_VALUE = TAX_RIOJA`

## Regla de escritura

Si WFO devuelve una entrada Accepted inequívoca para el taxón:

`TAX_WFO = WFO accepted scientific name`

Si la entrada consultada es Synonym y WFO la vincula a un accepted name:

`TAX_WFO = WFO accepted name`

Preservar:
- WFO-ID del nombre consultado;
- WFO-ID del accepted name cuando proceda;
- `taxonomicStatus`;
- rank;
- relación de sinonimia;
- evidence pointer.

`ambiguous` o `unchecked` nunca se promueven silenciosamente a equivalencia validada.

## Reconsulta

Todo nombre nuevo validado se consulta en WFO si aún no existe esa pareja query-source.

---

# FIELD 07 · TAX_EUROMED

## Fuente

`EURO+MED PLANTBASE`

Fuente actual preferida:

`CURRENT_EUROPLUSMED_PORTAL`

El portal legado `ww2.bgbm.org/EuroPlusMed` está documentado por la propia fuente como no actualizado y solo puede servir como evidencia histórica/soporte, nunca como sustituto silencioso del tratamiento actual.

## Primera consulta

`QUERY_VALUE = TAX_RIOJA`

## Regla de escritura

Si la fuente Euro+Med actual identifica inequívocamente el taxón y proporciona un tratamiento aceptado:

`TAX_EUROMED = current Euro+Med accepted treatment`

Si solo se dispone del portal legado:
- conservar resultado como evidencia histórica/supporting;
- `TAX_EUROMED` permanece unresolved/current-source-unavailable salvo regla futura explícita.

## Transformación de consulta

Si el buscador Euro+Med requiere nombre sin autoría, conservar:
- `QUERY_VALUE_VERBATIM` completo;
- `QUERY_VALUE_TRANSPORT` sin autoría;
- regla de transformación.

## Reconsulta

Todo nuevo nombre validado se vuelve a consultar en Euro+Med.

---

# FIELD 08 · TAX_HISTORICOS

## Estructura

FIELD compuesto con cardinalidad 0..N:

- `TAX_HISTORICO_1`
- `TAX_HISTORICO_2`
- ...
- `TAX_HISTORICO_N`

Cada subfield contiene un único nombre.

## Fuentes autorizadas de descubrimiento

Primera capa:
- sinonimias/relaciones históricas declaradas por EIDOS;
- ANTHOS;
- POWO/WCVP;
- WFO;
- Euro+Med.

Segunda capa documental:
- consultas a `ACTOR_07_DOCUMENTARY_LIBRARY_QUERY`;
- literatura botánica histórica riojana/ibérica autorizada, siempre con referencia precisa.

## Regla de promoción

Un nombre candidato solo se convierte en `TAX_HISTORICO_N` cuando existe evidencia suficiente que lo vincule al mismo taxón/identidad del registro.

No basta:
- similitud ortográfica;
- compartir género/epíteto;
- aparecer cerca en una obra;
- inferencia contextual.

## Metadatos por subfield

Por cada `TAX_HISTORICO_N` conservar:
- `SOURCE`
- `SOURCE_WORK_OR_DATASET`
- `SOURCE_DATE_OR_VERSION`
- `PAGE_OR_RECORD_POINTER`
- `RELATION_TO_CURRENT_TAXON`
- `EVIDENCE_POINTER`

## Reconsulta obligatoria

Cada histórico validado entra en `QUERY_NAME_QUEUE`.

Debe reconsultarse, si no se hizo previamente, contra:
- EIDOS para `ID_TAXON_GOBIERNO` y `TAX_EIDOS`;
- ANTHOS;
- POWO/WCVP;
- WFO;
- Euro+Med.

Esto puede resolver fields anteriormente `NOT_FOUND_WITH_CURRENT_NAMES`.

---

# C. CICLO OPERATIVO COMPLETO POR TAXON

Para cada `TAXON_WORK_KEY`:

## PASO 1 · INTAKE

1. bind exacto a RC2;
2. materializar `TAX_RIOJA`;
3. crear/recuperar `TAXON_WORK_KEY`.

## PASO 2 · PRIMER ID OFICIAL

4. buscar `TAX_RIOJA` en EIDOS para `ID_TAXON_GOBIERNO`;
5. si exacto, asignarlo;
6. si no, dejar estado explícito.

## PASO 3 · ID JBLR

7. si hay ID gobierno exacto: `ID_TAXON_JBLR = mismo ID`;
8. si no: generar/recuperar temporal JBLR.

## PASO 4 · PRIMERA RONDA DE LOS CINCO REPOSITORIOS

9. consultar `TAX_RIOJA` en EIDOS -> `TAX_EIDOS`;
10. consultar `TAX_RIOJA` en ANTHOS -> `TAX_ANTHOS`;
11. consultar `TAX_RIOJA` en POWO/WCVP -> `TAX_POWO_WCVP`;
12. consultar `TAX_RIOJA` en WFO -> `TAX_WFO`;
13. consultar `TAX_RIOJA` en Euro+Med -> `TAX_EUROMED`.

## PASO 5 · EXPANSION DE NOMBRES

14. reunir todos los nombres/sinonimias validadas descubiertos;
15. añadir nuevos nombres a `QUERY_NAME_QUEUE` con provenance;
16. para cada nombre, crear las consultas aún no ejecutadas contra cada repositorio requerido;
17. ejecutar;
18. incorporar nuevos nombres validados;
19. repetir hasta que una iteración no produzca nuevos nombres.

## PASO 6 · REBUSQUEDA DE ID OFICIAL

20. consultar en EIDOS para `ID_TAXON_GOBIERNO` cada nombre validado aún no usado para ese FIELD;
21. si aparece ID exacto, promoverlo;
22. si existía temporal JBLR, supersederlo preservando historial.

## PASO 7 · HISTORICO

23. extraer nombres históricos/sinónimos históricos de los repositorios actuales;
24. consultar capa documental 07/literatura autorizada cuando corresponda;
25. validar la relación de cada candidato histórico;
26. materializar `TAX_HISTORICO_1..N`, uno por subfield.

## PASO 8 · ULTIMA EXPANSION

27. introducir cada histórico validado en la cola;
28. reconsultar las cinco fuentes + ID gobierno donde falten parejas query-source;
29. incorporar cualquier resultado nuevo;
30. repetir hasta fixpoint.

## PASO 9 · CIERRE DEL TAXON

Un taxón queda terminal cuando:
- todas las parejas requeridas `QUERY_NAME × SOURCE` están en estado terminal explícito;
- no hay nuevos nombres validados pendientes;
- ID gobierno tiene estado explícito;
- ID JBLR está materializado;
- cada field tiene valor o estado explícito;
- conflicts/ambiguous quedan visibles;
- QA por taxón PASS o REVIEW_REQUIRED.

---

# D. CIERRE DEL STIME

El corpus completo solo lo ejecuta 09 tras PASS técnico de 08.

09 debe producir:

## INTERNAL_JBLR

- registro de queries;
- raw evidence/provenance;
- graph/relaciones de nombres;
- estados;
- fields materializados;
- QA;
- run manifest.

## HUMAN_VIEW

Una tabla principal con:

`ID_TAXON_GOBIERNO | ID_TAXON_JBLR | TAX_RIOJA | TAX_EIDOS | TAX_ANTHOS | TAX_POWO_WCVP | TAX_WFO | TAX_EUROMED | TAX_HISTORICO_1 | ... TAX_HISTORICO_N`

Más una vista `REVIEW_REQUIRED` con:
- conflictos;
- ambiguos;
- múltiples candidatos;
- parent-only;
- source unavailable;
- unresolved IDs;
- taxones con diferencias fuertes entre repositorios.

El usuario realiza auditoría obligatoria.

Después 08 + 09 reportan a 04 y 04 decide:
- `ACCEPT_STIME_AND_ADVANCE`
- `MODIFY_PROTOCOL_AND_REEXECUTE`
- `REEXECUTE_WITHOUT_SEMANTIC_CHANGE`

No comienza el siguiente STIME hasta cierre explícito de 04.
