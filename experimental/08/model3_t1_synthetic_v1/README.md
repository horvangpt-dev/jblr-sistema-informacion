# Modelo 3 · T1 sintética correctiva · prototipo 08

Implementación experimental aislada del contrato T0 del Modelo 3.

## Estado

- T1 exclusivamente sintética.
- Corrección solicitada por 04 en issue #14.
- T2 permanece PREPARADO_NO_AUTORIZADO.
- Sin casos reales, calibración, corpus, maestros, Event Bus, RC3 ni actor 09.
- FINAL_WEIGHTS, pesos U/I, N_REF y peso CWR permanecen UNSET.
- q_L, q_H, gamma_L, gamma_H y alpha son exclusivamente SYNTHETIC_TEST_ONLY para verificar mecánica.

## Fuentes congeladas

RUN_MANIFEST.json conserva ID + revisionId individuales de T0, diseño, P1, MAN-01, IT-01, MAN-02 e IT-02.
La congelación de REV02 no significa concordancia completa con T0 §17.

## Ejecución

python prototype.py --write-results

Artefactos regenerables:
- RUN_MANIFEST.json
- FIXTURE_RESULTS.json
- T1_RESULT.json
- SYNTHETIC_UNIVERSE.json

El CI final debe regenerarlos y demostrar que siguen idénticos a los comprometidos.
