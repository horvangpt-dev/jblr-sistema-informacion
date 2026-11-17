# T1 correctiva · trazabilidad issue #14

Base histórica conservada:
- ejecución probada anterior: 1f33d0224794bf77a1861c9406ed8271ebc2343f
- commit documental anterior: cfbe927202c9959fd17fdab6750dd9f7f469135e
- CI anterior: run 44143219971

T2 permanece PREPARADO_NO_AUTORIZADO.

| Issue #14 | Corrección | Prueba |
|---|---|---|
| 1 · APPLICATION_DATA_STATE | data_state() devuelve INCOMPLETE / DATA_READY / DATA_READY_WITH_OPEN_CONFIRMATIONS; el validador rechaza el literal antiguo. | test_07_application_interface_and_states |
| 2 · referencia vacía | research() usa EMPTY_REFERENCE, percentil/LOW/HIGH nulos y no declara VALID. | test_14_empty_reference_not_valid; F09 |
| 3 · protección §17.1 | ENDANGERED_CRITICAL, LESRPE_ONLY, directiva/convenio, SOURCE_UNAVAILABLE, conflicto, identidad no resuelta y clase conflictiva con presencia confirmada. | tests 10–11; F01–F04 |
| 4 · CWR | Prueba directa de ONLY_CONFIRMED_CWR y CONFLICT en perfil combinado; precedencia conservada. | test_12_cwr_precedence_and_views; F05–F08 |
| 5 · empates LOW | Detección de empate que cruza q_L/q_H sin dividir el grupo; F17 conserva nulo del no elegible. | tests 15–17; F17 |
| 6 · métricas referencia | Se emiten N total, N elegible, excluidos por cobertura y tasa de elegibilidad. | test_17_reference_metrics_and_f17 |
| 7 · interfaces | Validadores mínimos separados para valoración, cartera mensual, dossier y solicitud; FILTERED_OUT exige motivo. | tests 04–07 |
| 8 · regeneración CI | El workflow regenera los cuatro artefactos y exige git diff limpio para ellos. | workflow 08-model3-t1-synthetic.yml |
| 9 · freeze documental | SOURCE_DOCUMENTS contiene ID+revisionId individuales de T0/diseño y cinco candidatos; el manifiesto exige coincidencia exacta. | test_01_manifest_hash_keys_and_freeze |
| 10 · aislamiento | Manifiesto exige ceros para corpus, casos reales, calibración, Event Bus, RC3, maestros, consultas externas y actor 09. | test_24_open_parameters_and_isolation |

Ningún punto modifica pesos, N_REF, calibración o validación científica.

Staging CI: run 44152944756, 24/24 tests PASS, F01–F17 17/17 PASS. El commit final debe volver a ejecutar la misma suite y comprobar artefactos limpios.
