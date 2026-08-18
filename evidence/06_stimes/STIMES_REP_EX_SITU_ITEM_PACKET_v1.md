# STIMES · LOCALIZACIÓN Y SELECCIÓN · REPRESENTACIÓN EX SITU · ITEM PACKET v1

Fecha: 2026-08-18

## Estado

- ITEM: `STIMES.ITEM.REPRESENTACION_EX_SITU`
- FIELD_ID: `STIMES.ITEM.REPRESENTACION_EX_SITU`
- DERIVADO SEPARADO: `STIMES.ITEM.DEFICIT_EX_SITU`
- SUBJECT: TAXON
- METHOD: `REP_EX_SITU_MODEL_v1`
- BANK REGISTRY: `BANCO_SEMILLAS_ES_v1_2026`
- DATABASE SCHEMA CHANGES: NONE
- NEON WRITES: 0
- LOCAL TESTS: `STIMES_REP_EX_SITU_CORE_AND_QA_PASS`
- STATUS: `OPERATIONAL_CORE_REAL_SCALE_SNAPSHOT_PENDING_COMPLETE_ANNUAL_DATA`

## Realidad de la fuente MITECO entregada

Se inspeccionaron las dos variantes binarias entregadas del libro MITECO 2025.

- `2025 MITECO listado de semillas.xlsx` SHA256 `d67cbf97d9f0e314c55e07b2bb4cc7ccdf1f2bf9931e181932b4be3e72196fb3`
- `2025 MITECO listado de semillas(1).xlsx` SHA256 `fee3f64756a1594034a176803135b2a337e1993ceaaec967dd8f707691fab6b4`

Hechos: `lc_bancos` contiene 53 códigos/nombres; `ACCESIONES` contiene 175 filas; las 175 filas son JBR; `id_acces` y `cod_acces` tienen 0 valores no vacíos. La lista de 53 bancos es fuente inicial de descubrimiento, no censo verificado de actividad actual. Las 175 filas son evidencia JBR, no censo nacional de holdings.

## Registro maestro de bancos

`app/src/stimes/items/banco-semillas-es-v1-2026.json` queda con `active_universe_complete=false`. Las 53 entradas MITECO se preservan; JBR está `CONFIRMADO_ACTIVO` en la versión semilla y las restantes `EXISTENCIA_CONFIRMADA_ESTADO_NO_VERIFICADO` hasta verificación objetiva. Las no verificadas no entran en denominador. Ningún resultado nacional puede ser FINAL mientras el universo activo esté incompleto.

## Taxón × banco y confiabilidad

Estados: `COMPROBADO_CON_ACCESION`, `COMPROBADO_SIN_ACCESION`, `BANCO_NO_COMPROBADO_PARA_EL_TAXON`, `RESULTADO_NO_RESUELTO`. Un negativo exige búsqueda real auditable con nombre aceptado y sinonimias autorizadas. Un banco activo omitido queda no comprobado.

Confiabilidad = `100 * bancos comprobados correctamente / bancos activos que correspondía comprobar`.
Etiquetas: 90–100 MUY ALTA; 75–<90 ALTA; 50–<75 MEDIA; 25–<50 BAJA; <25 MUY BAJA. Score y confiabilidad son independientes.

## Accesiones, localización y población

Deduplicación: `institución de origen + código original de accesión`. Sin identificador solo cuenta si independencia está objetivamente documentada. Duplicados de custodia cuentan una accesión independiente y depósitos extra como `n_duplicados_seguridad`. Solo semillas actuales, confirmadas, taxonómicamente resueltas y no explícitamente no-silvestres entran en A.

La localización literal no se sobrescribe. Conflictos quedan `CONFLICTO_LOCALIZACION`. La unidad es `UNIDAD_OPERATIVA_DE_POBLACION_LOCALIZACION`; distancia y 10 km no son reglas automáticas. Dos accesiones independientes en una misma localidad precisa producen A=2 y por defecto P=1 salvo evidencia objetiva contraria. Se reutilizan `field.location`, `field.population` y `field.population_location`; no se crea una base paralela para mapas.

## Modelo estadístico

`REP_EX_SITU_MODEL_v1`: A=accesiones independientes; P=poblaciones operativas. Métricas: mediana, P75, P90, P95, P99, máximo y outliers IQR. Percentil `EMPIRICAL_LINEAR_N_MINUS_1_v1`.

- `S_A=min(100,100*A/P99_A)`
- `S_P=min(100,100*P/P99_P)`
- `REPRESENTACION_EX_SITU_100=0.70*S_P+0.30*S_A`
- `DEFICIT_EX_SITU_100=100-REPRESENTACION_EX_SITU_100`

70/30 es decisión metodológica STIMES v1, no estándar universal.

## Bloqueo deliberado del P99 real

No se crea todavía `REP_EX_SITU_MODEL_v1_2026`: faltan universo nacional activo completo, matriz taxón×banco para 2742 taxones y recuentos A/P completos. El runtime rechaza congelar snapshot con `active_universe_complete=false` o resultados no FINAL. No se fabrican P99 desde 175 filas JBR. Una actualización individual reutiliza siempre P99 congelado.

## Almacenamiento JBLR reutilizado

STAGING confirmó: bancos validados `core.agent`; catálogos/holdings externos `evidence.external_source`, `external_record`, `external_record_snapshot`; localización `field.location`; población `field.population` + `field.population_location`; accesiones propias JBLR `material.accession`; resultados `analytics.analysis_run`, `analysis_result`, `metric_definition`. Un holding externo no se fuerza a `material.accession` solo para puntuarlo. Sin cambios de esquema ni escrituras Neon.

## Pruebas

`app/tests/stimes-rep-ex-situ-state.js` cubre fuente real, peso unitario por banco, negativos auditables, duplicados, accesiones sin ID, origen cultivado, conservación no confirmada, A=2/P=1 en misma localidad, conflicto espacial, prohibición de distancia, Rioja/resto España, percentiles, bloqueo P99 real, fórmula 70/30, déficit, provisional/límite inferior, downstream, auditoría y 27 columnas Excel. Datos sintéticos de pruebas no son afirmaciones reales.

## Dependencias y terminación

`REPRESENTACION_EX_SITU -> DEFICIT_EX_SITU -> URGENCIA_RECOLECCION -> PRIORIDAD_TAXON`. Aquí solo se calcula déficit y se emiten solicitudes downstream; no se implementan URGENCIA ni PRIORIDAD.

El núcleo funcional está materializado. La producción de scores nacionales reales queda pendiente de datos: `COMPLETE_CURRENT_VERIFICATION_OF_SPANISH_WILD_FLORA_SEED_BANK_UNIVERSE`, `TAXON_BY_BANK_NATIONAL_CATALOGUE_ACQUISITION_FOR_2742_TAXA`, `REAL_2026_P99_A_AND_P99_P_DATED_SNAPSHOT`.

No se inició el nuevo sistema de organización de Drive.
