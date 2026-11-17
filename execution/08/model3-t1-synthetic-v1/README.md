# Modelo 3 · T1 sintética · prototipo 08

Implementación experimental aislada del contrato T0 del Modelo 3. **No usa corpus real, no calibra, no fija pesos científicos ni N_REF, no modifica maestros/BUS/RC3 y no activa 09.**

## Ejecución

```bash
python run_fixtures.py
python -m unittest discover -s tests -v
```

Toda configuración numérica de escenario está marcada `SYNTHETIC_TEST_ONLY`. `FINAL_WEIGHTS`, `N_REF`, `q_L/q_H`, `gamma_L/gamma_H`, `alpha` y `lambda_CWR` permanecen `UNSET`.

## Alcance implementado

- validación de metadatos de RUN, universo/hash, claves, estados, nulos/ceros y versiones;
- componentes U/I separados y escenarios sintéticos parametrizados;
- agregación CWR multi-cultivo para filtros, sin score por multiplicidad;
- filtros CWR/protección puros, sin mutación de U/I;
- reglas LOW de cobertura, referencia degenerada y no imputación F17;
- precedencia de confirmaciones regionales;
- separación autorización / COLLECTION_GO;
- ex situ: acceso biológico vs copia de seguridad vs unidad de origen;
- preparación de solicitud desde escritorio con estados espaciales no confirmados;
- fixtures F01–F17 con expected y runner ejecutable.
