# Modelo 3 · T1 sintética · prototipo 08

Implementación experimental aislada del contrato T0 del Modelo 3.

## Límites

- Solo `T1` con datos sintéticos.
- `SYNTHETIC_TEST_ONLY` en universo y parámetros.
- Sin casos reales, calibración, corpus, maestros, Event Bus, RC3 ni actor 09.
- `FINAL_WEIGHTS`, pesos U/I, `N_REF` y peso CWR permanecen `UNSET`.
- Los parámetros q/gamma/alpha incluidos se usan únicamente para comprobar mecánica de fórmulas candidatas; no son defaults ni recomendaciones científicas.

## Ejecución

```bash
python prototype.py --write-results
```

Los resultados se escriben en el mismo directorio.
