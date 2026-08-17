# STIMES_INTEGRATION_PACKET_v0

**Estado:** IN_PROGRESS · FIELD_REGISTRY_BLOCK_01_READY  
**Ámbito:** 06 · STIMES / Banco de Semillas JBLR  
**Producción pública:** NO AUTORIZADA  
**Importación masiva:** NO AUTORIZADA / NO EJECUTADA  
**Cambios Neon en este packet:** NONE

## A. Clasificación arquitectónica

STIMES se implementa como capa operativa/documental integrada sobre el núcleo JBLR existente. No crea una base paralela, no convierte MITECO en modelo central y no sustituye 04.1 ni 05.

Cadena aplicada:

`REALIDAD -> JBLR_STRUCTURED_DATA -> PROVENANCE/HISTORY -> VISTAS/DOCUMENTOS/MITECO`

## B. Componentes JBLR reutilizados

Verificados en Neon STAGING y/o implementación 04.1:

- `core.resource` + `core.jblr_code_registry`;
- `core.agent` + `core.agent_resource_role`;
- `field.location`, `field.population`, `field.collection_event`;
- `material.sample`, `material.sample_origin`, `material.processing_event`, `material.accession`, `material.accession_material`;
- `taxonomy.taxonomic_name`, `taxonomy.taxon_concept`, `taxonomy.identification`, `taxonomy.external_taxon_reference`, `taxonomy.v_current_adopted_name`;
- `evidence.external_source`, `evidence.external_record`, `evidence.external_record_snapshot`;
- `evidence.content_item`, `evidence.content_representation`, `evidence.content_link`, `evidence.digital_asset`;
- `evidence.provenance_link`;
- `governance.data_activity`, `governance.record_revision`, `governance.revision_change`;
- `analytics.analysis_run`, `analytics.analysis_result`, `analytics.metric_definition`.

## C. Gaps reales / gaps no cerrados

### C1. Identificador operativo de accesión Banco 2

`ES-0-JBLR-01/26` y sucesivos son identificadores institucionales/documentales de la accesión. El `jblr_code` técnico actual usa el patrón `JBLR-ACC-00000000`. No deben colapsarse.

**Clasificación actual:** `REAL_SCHEMA_GAP` para una representación tipada permanente del identificador operativo secundario.  
**Acción actual:** ninguna migración. Conservar documentalmente/provenance mientras se define la mínima extensión correcta.

### C2. Ubicación física estructurada del material

04.1 declara explícitamente que `structured physical storage location` no está representada por `CORE_PHYSICAL_MODEL_v1` y rechaza codificarla en free text o ResourceSet.

**Clasificación actual:** `REAL_SCHEMA_GAP` ya demostrado por 04.1.  
**Acción actual:** ninguna migración hasta que el Registro Maestro alcance los campos de conservación/ubicación y permita especificar el requisito completo.

### C3. No clasificados todavía

Laboratorio, viabilidad y otros campos posteriores no se etiquetan como gaps hasta mapearlos uno por uno contra el modelo real.

## D. Estructura GitHub elegida

Rama: `06-stimes-banco-semillas`, derivada del HEAD real de 04.1.

Estructura mínima compatible con el repositorio existente:

- `app/src/stimes/` — contratos/configuración máquina STIMES;
- `app/tests/stimes-*.js` — invariantes STIMES;
- `app/tests/fixtures/stimes/` — fixtures de esquemas/fuentes externas;
- `evidence/06_stimes/` — especificaciones y evidencia humana/versionada;
- `.github/workflows/jblr-06-stimes.yml` — CI sectorial.

No se crea una nueva arquitectura raíz paralela.

## E. Tratamiento Neon

Regla aplicada por requisito:

1. `EXISTING_CAPABILITY`;
2. `EXISTING_CAPABILITY_WITH_NEW_CONTRACT`;
3. `MINOR_EXTENSION_REQUIRED`;
4. `REAL_SCHEMA_GAP`.

Solo el cuarto caso puede proponer migración. Este packet no ejecuta ninguna migración.

## F. Registro Maestro de Campos v0

`STIMES_FIELD_REGISTRY_v0` creado como fuente máquina y copia humana.

**Bloque 01 READY:** 9 campos, `STIMES.FIELD.0001`–`0009`:

1. `id_acces`;
2. `cod_banco`;
3. `idtaxon`;
4. `nom_cient`;
5. `cod_origen`;
6. `fecha_reco`;
7. `recolec`;
8. `prot_reco`;
9. `estado`.

Cada FIELD_ID incluye las propiedades exigidas de significado, tipo/unidad, fase/proceso, entrada, fuente, automatización, dependencias/derivación, revisión, MITECO, vista rápida, fichas, obligatoriedad, unknown/no_medido/no_aplica, provenance e historia.

## G. Integración con 04.1

04.1 permanece propietario del flujo botánico real. STIMES reutiliza sus entidades y relaciones y añade contratos de captura/consulta para:

- recuperar hechos ya conocidos;
- preguntar solo lo desconocido;
- aceptar entrada retrospectiva sin inventar etapas;
- conservar documento fuente/provenance;
- proyectar después las mismas entidades hacia fichas y exportaciones.

No se duplican Population, CollectionEvent, Sample ni Accession.

## H. Integración con 05

05 permanece `VERSIONED_ANALYTICAL_ENRICHMENT_PROVIDER`.

STIMES consumirá resultados liberados/versionados con, como mínimo:

`ENGINE / METRIC / VALUE / EVIDENCE_VERSION / SCORING_VERSION / METHOD_VERSION / ANALYSIS_RUN / CALCULATED_AT / PROVENANCE / REVIEW_STATE`.

`ANALYTICAL_RESULT != OBSERVED_FACT`.

No se copian métricas calculadas como atributos eternos de la accesión o taxón.

## I. Integración Drive

Se reutiliza exclusivamente `Botanico/STIMES` existente.

Verificado y preservado:

- `01_PLANTILLAS_MODELOS`;
- `02_ARCHIVO_BOTANICO`.

Tras verificar ausencia, se creó únicamente:

- `05_MAESTRO_Y_VISTAS`.

Dentro se creó `STIMES_FIELD_REGISTRY_v0` y se realizó read-back.

## J. Ingestión multimodal

Contrato conceptual mantenido:

`CHAT / FORMULARIO / WORD / PDF / EXCEL / ESCANEADO / FOTO / HISTORICO / AUTOMATISMO`
`-> conservar original`
`-> extracción/captura`
`-> FIELD_ID`
`-> validación/resolución`
`-> JBLR structured data`
`-> vistas regenerables`.

Extracción automática no equivale a validación. Una asociación incierta permanece candidata/pending; no se crea vínculo científico definitivo.

## K. Mapeos MITECO

Esquema externo recuperado: **101 encabezados exactos** preservados como fixture ordenado.

Primer mapeo 1:1 de salida cerrado para los campos 1–9 del Bloque 01.

MITECO se mantiene como `EXTERNAL_OUTPUT_SCHEMA`, no como tabla física central.

## L. Riesgos y pendientes conocidos

- `JBLR_Banco2_Maestro_ACTUAL_REPARADO.xlsx = NOT_FOUND`; no se interpreta como ausencia. Se usa el maestro `ACTUAL.xlsx` y el diccionario histórico solo como fuentes explícitamente etiquetadas.
- `VISTA_RAPIDA` completa: `PARTIALLY_RECOVERED`; la visibilidad de los 9 campos del Bloque 01 está demostrada, pero no se afirma todavía el orden/cabecera completos.
- Código de accesión Banco 2 vs `jblr_code`: gap real pendiente de diseño mínimo.
- Ubicación física estructurada: gap real pendiente de especificación en el bloque correspondiente.
- CI: workflow creado; ejecución no se declara PASS hasta observar run real.
- Validación taxonómica automática silenciosa: prohibida; lookups requieren estado de resolución/revisión.

## M. Tests y fixtures

Implementados:

- `app/tests/stimes-field-registry-state.js`;
- `app/tests/fixtures/stimes/external-schemas-v0.json`;
- `.github/workflows/jblr-06-stimes.yml`.

Invariantes cubiertos:

- 28 propiedades requeridas por FIELD_ID;
- unicidad de FIELD_ID/nombre canónico;
- provenance e history obligatorios;
- cero schema changes en Bloque 01;
- 101 encabezados MITECO y orden de los nueve primeros;
- 16 encabezados Missouri recuperados como referencia;
- VISTA_RAPIDA completa permanece `PARTIALLY_RECOVERED`;
- `id_acces` no se colapsa en `core.resource.jblr_code`;
- taxonomía no se valida silenciosamente;
- `BAJA` no equivale a borrado.

## N. Criterio del primer vertical slice

NO ejecutar hasta que estén READY:

- `FIELD_REGISTRY_v0` suficiente para la accesión seleccionada;
- contratos iniciales de procesos implicados;
- mapeo `FIELD_ID <-> JBLR`;
- mapeo de salidas requerido;
- manejo explícito de gaps que afecten a esa accesión.

Después usar una única accesión histórica real:

`fuente histórica -> extracción -> FIELD_ID -> revisión/enriquecimiento -> JBLR STAGING -> ficha -> maestro/vista rápida -> Word simple -> MITECO aplicable -> Archivo Botánico -> imágenes -> QA humano`.

`MASS_IMPORT_BEFORE_VERTICAL_SLICE_PASS = PROHIBITED`.
