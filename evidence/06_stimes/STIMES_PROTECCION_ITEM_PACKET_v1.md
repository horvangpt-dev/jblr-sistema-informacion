# STIMES · LOCALIZACIÓN Y SELECCIÓN · PROTECCIÓN · ITEM PACKET v1

Fecha: 2026-08-18

## Estado

- ITEM: `STIMES.ITEM.PROTECCION`
- FIELD_ID formal analítico: `STIMES.ITEM.PROTECCION`
- SUBJECT: TAXON
- PROVIDER: `05_MOTORES_ANALITICOS_BOTANICOS`
- EVIDENCE: `PROTECCION_LEGAL_EVIDENCE_v2`
- PROVIDER MODEL: `PROTECCION_LEGAL_SCORING_MODEL_v1` (`WORKING_ANALYTICAL_MODEL`)
- STIMES METHOD: `PROTECCION_STIMES_SELECTION_v1`
- EQUIVALENCE: `PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v1`
- DATABASE SCHEMA CHANGES: NONE
- NEON WRITES: 0
- STATUS: `OPERATIONAL_WITH_EXPLICIT_PENDING_DEFINITIONS`

## Precedencia y reutilización

No se ha creado un segundo motor 05. Se conserva íntegramente la evidencia y el score previo de 05. El artefacto persistido `PROTECCION_LEGAL_OBJETIVO_02_FINAL_v1.xlsx` demuestra un universo de 2742 taxones, `PROTECCION_LEGAL_EVIDENCE_v2`, `PROTECCION_LEGAL_SCORING_MODEL_v1`, 1904 registros fuente, 286 taxones con evidencia válida y 286 scores producidos en esa proyección.

El modelo 05 existente multiplica severidad de categoría por peso jurisdiccional y selecciona el máximo registro vigente/aplicable. STIMES preserva ese resultado como `score_native_05` pero no lo usa como equivalente silencioso de la nueva regla jurídica efectiva.

## Diferencia versionada respecto a 05

El requisito STIMES actual establece que territorialidad es una condición de aplicabilidad: una norma válida de La Rioja, estatal o supranacional aplicable puede participar; una norma autonómica de otra comunidad no puede participar. Entre los registros elegibles gana la protección analíticamente más restrictiva según la tabla 0–100 heredada de 05.

Por ello `PROTECCION_STIMES_SELECTION_v1` realiza:

1. identidad taxonómica suficientemente resuelta;
2. fuente autorizada;
3. trazabilidad a fuente jurídica primaria/oficial;
4. norma identificada;
5. vigencia comprobada;
6. validez jurídica comprobada;
7. aplicabilidad en La Rioja comprobada;
8. equivalencia versionada;
9. máximo `score_100` entre candidatos elegibles.

Los pesos territoriales de 05 no se borran y permanecen en su score nativo/histórico.

## QA detectado en evidencia 05

### PROTECCION.QA.001

Existen registros EIDOS/05 con `sub_country=Castilla-La Mancha` que aparecen como `scope=Nacional` / `APPLICABLE_NATIONAL`. El adaptador STIMES corrige la aplicabilidad derivada: si existe una comunidad autónoma explícita distinta de La Rioja, el registro se convierte en `EXTERNAL_AUTONOMOUS_REFERENCE` para el cálculo de La Rioja. El registro original se conserva.

### PROTECCION.QA.002

Se observó al menos un registro con literal `Apéndice II` normalizado como `CITES_A_OR_APPENDIX_I`. La tabla conserva las clases heredadas, pero una clase CITES de fuente dependiente no puede producir score STIMES efectivo sin reconciliación con el literal y la fuente jurídica primaria vigente.

## Marco jurídico primario verificado

### La Rioja

`Ley 2/2023, de 31 de enero, de biodiversidad y patrimonio natural de La Rioja`, en redacción vigente tras `Ley 2/2025, de 23 de mayo`.

Estructuras verificadas:
- Registro Riojano de Especies Silvestres en Régimen de Protección Especial.
- Catálogo Riojano de Especies Amenazadas.
- categorías vigentes del Catálogo: `En peligro de extinción` y `Vulnerable`.
- la normativa permite a La Rioja incrementar el grado de protección respecto de la catalogación estatal.
- el Decreto 59/1998 está derogado; su evidencia histórica se conserva y no produce por sí sola el score vigente.

### España

`Ley 42/2007, de 13 de diciembre, del Patrimonio Natural y de la Biodiversidad`.

Estructuras verificadas:
- LESRPE.
- CEEA.
- categorías CEEA: `En peligro de extinción` y `Vulnerable`.

### Unión Europea

- Directiva 92/43/CEE: artículo 13 exige protección estricta para plantas del Anexo IV(b). La pertenencia taxonómica al anexo y su implementación aplicable deben verificarse por registro.
- Reglamento (CE) 338/97: controles jurídicos por anexos A-D; la versión/anexo vigente debe verificarse antes del score.

## Tabla de equivalencias

Se formalizó `app/src/stimes/items/proteccion-category-equivalence-v1.json` copiando los valores de `PROTECCION_LEGAL_SCORING_MODEL_v1`, sin inventar valores nuevos.

Las clases directamente verificadas en los marcos La Rioja/Estado incluyen:
- `ENDANGERED` = 100
- `VULNERABLE` = 85
- `SPECIAL_PROTECTION_REGIME` = 70

Las restantes clases heredadas mantienen su valor 05, pero pueden exigir comprobación primaria antes de ser elegibles. `MATERIAL_BASE`, `GENETIC_CONSERVATION` y `NATURA_REFERENCE` quedan `PENDIENTE_DE_DEFINICION` respecto a si representan protección jurídica efectiva en el sentido estricto de este ítem.

## Ausencia vs desconocimiento

`SIN_PROTECCION` solo se emite cuando la búsqueda configurada está completa, el taxón está resuelto y se completaron las comprobaciones de fuente primaria. Entonces `score_100=0` es un hecho analítico derivado de una ausencia comprobada en el conjunto de fuentes configurado.

Para `SOURCE_NOT_ACQUIRED`, `NO_COMPROBADO`, `TAXON_UNRESOLVED`, `UNKNOWN` o `CONFLICT`, `score_100=null`. Si un descendiente exige número, puede emitirse `score_operativo=0` con `score_operativo_status=PROVISIONAL`; nunca cambia el estado semántico.

## Confiabilidad

Se almacenan siete componentes verificables:
- QUERY_EXECUTED
- TAXON_RESOLVED
- SOURCE_AUTHORIZED
- NORM_IDENTIFIED
- CURRENTNESS_VERIFIED
- LA_RIOJA_APPLICABILITY_VERIFIED
- PRIMARY_LEGAL_SOURCE_TRACEABLE

El modelo de pesos y los umbrales MUY ALTA/ALTA/MEDIA/BAJA/MUY BAJA no están definidos por evidencia previa ni por el prompt con valores exactos. Estado:

- `RELIABILITY_COMPONENT_WEIGHT_MODEL=PENDIENTE_DE_DEFINICION`
- `RELIABILITY_CATEGORY_THRESHOLDS=PENDIENTE_DE_DEFINICION`

No se inventa porcentaje ni categoría. Sí se conservan `checked_components/total_components` para auditar incompletitud.

## Actualización

- política anual declarada: todos los taxones;
- scheduler runtime: `PENDIENTE_DE_DEFINICION`;
- búsqueda de taxón: solicita refresh integral de todos los ítems automáticamente actualizables de LOCALIZACIÓN Y SELECCIÓN;
- PROTECCIÓN vuelve a comprobar fuentes primarias, normativa nueva, modificaciones/derogaciones, anexos/listas y taxonomía;
- cada actualización genera revisión inmutable;
- si cambia PROTECCIÓN se emiten solicitudes de recálculo para `URGENCIA_RECOLECCION` y transitivamente `PRIORIDAD_TAXON`, sin implementar sus fórmulas.

## Excel

Hoja `PROTECCIÓN`:

`N.º | Familia | Taxón | La Rioja | España | Europa/UE | Internacional | Score protección | Norma efectiva | Última actualización | Evidencia | Confiabilidad`

La vista no es repositorio canónico.

## Pruebas A–H

`app/tests/stimes-proteccion-state.js` cubre:

A. protección La Rioja vigente;
B. protección estatal aplicable;
C. varias normas aplicables y selección de la más restrictiva;
D. norma de otra comunidad excluida aunque upstream la etiquete como nacional;
E. norma derogada conservada pero no usada frente a norma vigente;
F. búsqueda completa sin protección => `SIN_PROTECCION`, 0;
G. fuente inaccesible/incompleta => estado real + 0 provisional downstream, no score canónico;
H. cambio legislativo => nueva revisión + solicitud de recálculo descendente.

Las asociaciones taxón-norma de los casos de prueba son fixtures sintéticos y no constituyen afirmaciones legales sobre especies reales.

## Pendientes explícitos

- pesos de confiabilidad;
- umbrales de confiabilidad;
- scheduler anual runtime;
- QA primario de todas las clases heredadas de 05;
- reconciliación CITES literal/clase donde exista conflicto;
- decisión formal sobre MATERIAL_BASE / GENETIC_CONSERVATION / NATURA_REFERENCE como protección jurídica efectiva.

No se avanzó a REPRESENTACIÓN EX SITU, URGENCIA ni otros ítems.
