# Reporte breve · Modelo 3 · T1 sintética · 08 · 2026-11-17

## Estado
- Alcance: implementación experimental + T1 exclusivamente sintética.
- Resultado local: **TECHNICAL_PASS**.
- Validación científica: **NO REALIZADA**.
- Calibración: **NO REALIZADA**.
- Casos reales/corpus: **0**.
- Event Bus / RC3 / maestros / actor 09: **sin modificación ni activación**.

## Fuentes congeladas para esta ejecución
- T0 v0.2 · Drive 1AYQVFOHtIYhk3i46fognwutDvRy2nJyY-xeThaV31X0 · revisión AHj4eMS6bmDuBsyxOlO73EekJ-7oKLSNbwxEog2jPu6Qk2wOL1yE0k8g1GFX3suuqKiTgJs8DWw5rM3wqdVC88v-PJTJgLrwT6cDWjIDp_Y.
- Diseño Modelo 3 v0.2 correctivo · Drive 1uHRWArJaOs_gSukP8BESQHHErFk8vLGzCrXdljdLje0 · revisión AHj4eMTz8b-rufsSQ8HnF9IdPaOXHg1iIKLc1YP-Q5iQcr_3-vfsfbZRQyE6ylPQZwFRFi5kbJuM9JvpwjyYhpqnBl_zPpQa5C8GfJCAJSE.
- 002 REV02 · Drive 1mX27QAQqGPjRoyMsxD_tDddFGBoxnKodJN69tI2sczU · revisión AHj4eMQ0-jm65PE40DFggZ6gRjipllmvOcNZPAJAOyDWdt8rVEYLvfQcaz74QVMamH4ey1ROd2-o6UWjxN0pyKP_FMh3bB4OxXLt-KxN0sM.

## Implementación
Se implementaron:
- validación de manifiesto, universo, hash, TAXON_KEY, claves y versiones;
- estados de valor, nulos y ceros según T0;
- mapeo sintético de protección conforme a T0 §17.1;
- agregación CWR por TAXON_KEY × CROP_ID y vistas CWR;
- vistas de protección y composición de filtros sin modificar U/I base;
- mecánica candidata LOW/HIGH y escenarios parametrizados solo con parámetros SYNTHETIC_TEST_ONLY;
- precedencia de confirmaciones regionales de T0 §17.2;
- regla de elegibilidad/ties de LOW de T0 §17.3;
- control de duplicados/backups y unidades de origen ex situ;
- preparación de solicitud desde escritorio, localidad histórica, falta de fenología y separación AUTHORIZED != COLLECTION_GO.

## Universo y parámetros
- Universo: 17 taxones ficticios, SYN-U001..SYN-U017.
- UNIVERSE_HASH: 8a4fa16bbbdaa568e11c8d44a9ecc29571e011f453b5d7864f8e2f3bcd6a099c.
- PARAMETER_SET_ID: SYNTHETIC_TEST_ONLY_MODEL3_T1_MECHANICS_v1.
- FINAL_WEIGHTS / U_WEIGHTS / I_WEIGHTS / N_REF / CWR_WEIGHT: UNSET.
- q_L/q_H/gamma/alpha usados en pruebas son exclusivamente valores mecánicos SYNTHETIC_TEST_ONLY; no son defaults ni recomendaciones científicas.
- Convención de percentil del prototipo: midrank empírico con (midrank-0.5)/n, únicamente para verificar lógica T1; no queda calibrada ni adoptada.

## Resultados reales
Comando ejecutado:
`python prototype.py --write-results`

Resultado:
- tests: 15/15 PASS;
- fixtures obligatorios: F01–F17 = 17/17 PASS;
- failures = 0;
- errors = 0;
- scientific_validation = NOT_PERFORMED;
- calibration = NOT_PERFORMED;
- real_cases = 0;
- corpus_rows = 0;
- event_bus_writes = 0;
- rc3_mutation = 0;
- actor_09_activation = 0.

## Incidencias
1. Una invocación auxiliar de `unittest discover` realizada desde un directorio de trabajo incorrecto produjo `ModuleNotFoundError`. No fue el comando reproducible oficial ni alteró datos. Se corrigió usando la ejecución desde la raíz del prototipo.
2. No se detectaron fallos semánticos en la ejecución oficial.
3. CI remoto: PENDING_AT_REPORT_CREATION; se actualizará tras readback del workflow.

## Límites
TECHNICAL_PASS acredita únicamente que el prototipo implementado satisface las pruebas sintéticas definidas. No acredita calibración, validez científica, selección de campaña, autorización administrativa ni aptitud para corpus real.
