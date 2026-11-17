# 08 · Modelo 3 · T1 sintética · reporte técnico

## Resultado

`TECHNICAL_PASS = YES` para el alcance experimental autorizado. Se ejecutaron 17/17 fixtures F01–F17 y 39/39 pruebas unitarias/contractuales con resultado PASS.

Esto **no** es validación científica, calibración ni ejecución de corpus. Los pesos científicos, `N_REF`, `q_L/q_H`, `gamma_L/gamma_H`, `alpha` y `lambda_CWR` permanecen `UNSET`.

## Universo y parámetros

- Universo: `SYNTHETIC_MODEL3_T1_UNIVERSE_v1`.
- Hash: `sha256:d6239c97f4ea4610fb4549dec30ab99718b0f165a2c60aa645f0a5ae1382bfc4`.
- Scope: `SYNTHETIC_TEST_ONLY`.
- Corpus real: 0.
- Parámetros numéricos presentes: únicamente escenarios sintéticos destinados a comprobar el cableado de componentes y la invariancia de filtros; no son defaults ni recomendaciones científicas.

## Cobertura implementada

1. Validación de RUN, universo/hash, claves, estados, nulos, ceros y versiones.
2. Componentes U/I separados y escenarios sintéticos parametrizados.
3. Agregación CWR multi-cultivo para estado de filtro, sin sumar por multiplicidad.
4. Vistas CWR y protección composables, implementadas como filtros puros que no modifican U/I.
5. Cobertura LOW: búsqueda incompleta deja LOW nulo; referencia degenerada deja LOW/HIGH UNSET; F17 evita imputación por empate si cambia la elegibilidad.
6. Protección conforme a `JBLR_PROT_MAP_LR_v0.1_2026-11-17`.
7. Precedencia de solicitud: `HOLD_CONFIRMATION > UNKNOWN_REQUIREMENT > READY`.
8. Separación de autorización y `COLLECTION_GO`.
9. Ex situ: copia de seguridad no crea segunda accesión biológica; dos accesiones del mismo origen siguen siendo dos accesiones y una unidad de origen; origen ambiguo no se agrupa por defecto.
10. Fenología ausente no altera U/I.
11. Solicitud de escritorio permitida con `HISTORICAL_LOCALITY` o `POTENTIAL_SECTOR`, sin exigir P03/P04/P05 como condición universal.

## Incidencias y límites

- **INC-01 · Parámetros científicos abiertos:** no se calcula un LOW/HIGH productivo ni se fija `N_REF`; F10 solo demuestra elegibilidad técnica y F11/F17 las reglas de nulidad/representación.
- **INC-02 · Escenarios numéricos de prueba:** cualquier peso numérico usado por el prototipo está etiquetado `SYNTHETIC_TEST_ONLY`; no se promueve a configuración científica.
- **INC-03 · Documentos 002 REV02:** el propio T0 indica que los candidatos REV02 requieren incorporar el delta final antes de una eventual adopción documental. Esta T1 usa el T0 final como contrato vinculante y no modifica esos documentos.
- **INC-04 · Sin persistencia canónica:** no se escriben BUS, Canonical State, RC3, maestros, bases de datos ni estados de 09.

## Resultado de fixtures

- F01–F08: filtros CWR/protección y agregación de estado, PASS.
- F09–F11: cobertura LOW y referencia degenerada, PASS.
- F12: empate en corte de capacidad requiere decisión humana, PASS.
- F13–F16: preparación/readiness/autorización, PASS.
- F17: mismo `R_i` con elegibilidad distinta, no imputación, PASS.

## Dictamen

`T1_TECHNICAL_PASS = YES` únicamente para el prototipo sintético. `SCIENTIFIC_VALIDATION = NO`. `CALIBRATION = NO`. `REAL_CASES = 0`.
