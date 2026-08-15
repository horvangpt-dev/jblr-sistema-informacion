# TRASPASO A 00 · DIRECCIÓN GENERAL — 01.2R

Fecha: 2026-08-15
Sector: 01.2R · Reapertura mínima del baseline físico
Estado de producción: NO AUTORIZADA
Importación masiva: NO AUTORIZADA
PRODUCTION_READY: NO

## 1. Confirmación independiente del SHA histórico

El artefacto histórico exacto recuperado directamente de Google Drive fue verificado antes de cualquier modificación:

- archivo: `JBLR_01_2_R2_DDL_PILOT_DEFECTIVE_EVIDENCE.sql`
- tamaño: `107014 bytes`
- SHA-256: `50abe00a643d15e7b940580cce68d1abd34c6b6ccb06edd81f2e86973cb73d07`

El SHA y el tamaño coinciden con la referencia institucional de 00.

## 2. Confirmación de la secuencia espuria

Se verificó una única aparición de la secuencia de cuatro bytes `5c 6e 5c 6e`, texto literal `\n\n`, en el offset decimal `93948` (`0x16efc`), línea aproximada `2228`, inmediatamente antes de `-- JBLR 01.2 · RONDA 2 — PILOT HARDENING LAYER`.

Conteos en el histórico: literal `\n` = 2 apariciones; literal `\n\n` = 1 aparición.

## 3. Origen

Origen demostrado al nivel de la frontera de ensamblado R1→R2. El DDL completo de ronda 1 mide exactamente `93948 bytes`, tiene SHA-256 `984b9b43858372d76814cb20e763467c83a2605889e918b5509f2708503003a1` y coincide byte por byte con los primeros `93948 bytes` del artefacto R2 defectuoso. Los cuatro bytes espurios aparecen inmediatamente después de ese DDL R1 íntegro y antes de la capa `PILOT HARDENING LAYER`.

Conclusión: el defecto es de ensamblado/serialización del separador entre R1 y la capa R2, consistente con dos saltos de línea serializados como texto escapado. No se ha localizado evidencia suficiente para atribuir los cuatro bytes a un programa, comando o interfaz concreta; esa herramienta exacta queda `NO DETERMINADA`.

## 4. Corrección byte-exacta

Única modificación del candidato:

`5c 6e 5c 6e -> 0a 0a`

No se modificó ninguna sentencia SQL, comentario, espacio, encoding ni otro byte.

## 5. Nombre del candidato

`JBLR_01_2_R2_DDL_PILOT_FIX1.sql`

No sustituye ni elimina el artefacto histórico y no constituye por sí mismo una nueva declaración oficial de `CORE_PHYSICAL_MODEL_v1`.

## 6. Tamaño del candidato

`107012 bytes`

## 7. SHA-256 nuevo

`21c533e9e587eb1179ce54c951339f365599f60b9bb6905bb79641866787d8aa`

Coincide exactamente con la referencia determinista calculada previamente por 00.

## 8. Prueba binaria

La comparación realineada demuestra:

- prefijo anterior al offset `93948`: idéntico;
- histórico en offset `93948`: `5c 6e 5c 6e`;
- candidato en offset `93948`: `0a 0a`;
- sufijo posterior, realineado por la reducción de dos bytes: idéntico;
- transformación distinta de la autorizada: ninguna.

Resultado: `ONLY_AUTHORIZED_TRANSFORMATION=PASS`.

## 9. Versiones de servidor y cliente

Recertificación final, GitHub Actions run `31892521029`:

- imagen: `postgis/postgis:18-3.6`;
- servidor: PostgreSQL `18.4` (`Debian 18.4-1.pgdg13+1`);
- cliente ejecutor: `psql 18.4` (`Debian 18.4-1.pgdg13+1`), ejecutado dentro del mismo entorno PostgreSQL 18;
- PostGIS: `3.6.4`;
- pg_trgm: `1.6`.

Se corrige así la precisión documental del run anterior de 01.4R, donde el cliente host había sido psql 16.14.

## 10. Control negativo del histórico

El histórico exacto con SHA `50abe00a...d07` fue ejecutado mediante `psql 18.4` con `ON_ERROR_STOP=1` en base separada.

Resultado observado:

- exit code: `3`;
- mensaje: `invalid command \n`;
- resultado: `CONTROL_NEGATIVO=PASS` porque reproduce el defecto esperado sin modificar el histórico.

## 11. Instalación del candidato

En base nueva y limpia, el candidato FIX1 fue ejecutado mediante `psql 18.4` con `ON_ERROR_STOP=1`.

Resultado: `PASS`. No se ocultó ningún error de instalación.

## 12. Inventario físico

Inventario posterior a la instalación:

- tablas: `85`;
- vistas: `8`;
- funciones JBLR: `18`;
- triggers de usuario JBLR: `65`;
- schemas JBLR: `8` (`analytics`, `core`, `evidence`, `field`, `governance`, `material`, `security`, `taxonomy`);
- extensiones requeridas: `postgis 3.6.4` y `pg_trgm 1.6`.

No existe diferencia estructural no explicada respecto al inventario esperado de la certificación 01.2.

## 13. Recertificación mínima

Run final `31892521029`: `SUCCESS`.

Resultados:

- compilación completa FIX1 con `ON_ERROR_STOP=1`: PASS;
- A1–A17: PASS;
- ERROR ≠ 0: PASS mediante A2, que rechaza `failed + numeric_value=0`;
- R2 E1–E5: PASS, incluyendo dominios controlados, FieldGroup y DataUseConstraint;
- ExternalRecord/idempotencia secuencial E7: PASS;
- transición de validación/rollback atómico E8: PASS;
- PostGIS básico E10: PASS; `postgis_full_version()` y geometrías SRID 4326 ejecutados;
- geometría maestra y política S3 E11: PASS;
- proyección FieldGroup: conteos esperados `2/3`: PASS;
- funciones esenciales R2 verificadas en inventario y ejercicio funcional.

No se repitieron C1–C5 completos, conforme a la reducción de alcance autorizada para 01.2R; deberán repetirse obligatoriamente si 00 autoriza retomar 01.4R.

### Hallazgo auxiliar del paquete de pruebas

El primer run de recertificación, `31892394378`, alcanzó con éxito instalación e inventario de FIX1 y A1–A17, pero el archivo histórico `JBLR_01_2_CERT_QUERIES_CORRECTED.sql` contenía otra única secuencia literal `\n\n` en su offset `29820`, antes del bloque E. Es un defecto de serialización del test harness, no del DDL.

Se preservó el run fallido y se aplicó únicamente al paquete de pruebas la misma sustitución auxiliar `5c 6e 5c 6e -> 0a 0a`:

- test harness original: `36728 bytes`, SHA-256 `80a083c667fa33ec3c70c4255e80b060eb03fe53cab1b47c1237c560832809fe`;
- test harness FIX1: `36726 bytes`, SHA-256 `b685fb65cf7b8311c8bb7e4dfe7276015e9b7b7ed76811aa73d251092c67c082`.

No se cambió ninguna consulta SQL semántica. La repetición con ese test harness corregido y el mismo DDL FIX1 finalizó `SUCCESS`.

## 14. GitHub

Repositorio: `horvangpt-dev/jblr-sistema-informacion`.

Rama de corrección: `01.2r-baseline-fix`.

- commit de entrada a la recertificación final: `8b77788c24cd476abca630ac17e1e85068356e3e`;
- commit de evidencia generado exclusivamente después de que todas las pruebas pasaran: `8fcf9d87d2c2c556174da8ff39783a9a0ee3628b`.

Ese commit de evidencia contiene el candidato raw de `107012 bytes`, logs psql 18, hashes, inventario, resultados funcionales y test harness auxiliar corregido. PR #1 no fue mergeado y los commits de evidencia de 01.4R permanecen intactos.

## 15. Google Drive

Expediente nuevo, sin sobrescritura del histórico:

`Botanico/programación/0.1/01.2_ronda_2/01.2R_reapertura_minima_baseline_2026-08-15`

Folder ID: `1yB8xSTSFsAb8DZJTn9VPxht-QeRHNWn1`.

Se archivan candidato, hashes, prueba binaria, evidencia hexadecimal, diff, logs psql 18, resultados de pruebas, evidencia del primer run fallido por test harness, evidencia final y este traspaso.

## 16. Clasificación de hallazgos

- `BLOCKER`: 0 abiertos del DDL FIX1 dentro del alcance 01.2R.
- `MAJOR`: 0 nuevos del DDL.
- `MINOR`: 1 auxiliar, restringido al paquete histórico de consultas de certificación: separador `\n\n` literal; corregido byte-exactamente en el test harness 01.2R y preservada la evidencia.
- `IMPROVEMENT`: 0 incorporados.
- `OBSERVATION`: 1: el punto de inserción del defecto original está demostrado en la frontera de ensamblado R1→R2, pero la herramienta concreta que serializó el separador no puede determinarse con la evidencia disponible.

No se ha aprovechado la ronda para realizar mejoras de diseño.

## 17. Decisión técnica propuesta

`01.2R_PASS_WITH_CHANGES`

Motivo: el candidato FIX1 resuelve exclusivamente el BLOCKER B-01 mediante la sustitución autorizada, coincide con tamaño y SHA esperados, reproduce el fallo histórico con psql 18.4, instala limpiamente, mantiene el inventario certificado y supera la recertificación mínima funcional. Se propone `WITH_CHANGES` únicamente porque fue necesario corregir de manera auxiliar y byte-exacta un separador serializado en el paquete histórico de pruebas para poder ejecutar E1–E11; no hubo modificación adicional del DDL.

Esta decisión sectorial NO restaura por sí misma `CORE_PHYSICAL_MODEL_v1`. Corresponde exclusivamente a 00 decidir el estado institucional del SHA histórico, qué versión física queda vigente y si se autoriza retomar 01.4R.

Producción: `NO AUTORIZADA`.
Importación de aproximadamente 2.700 taxones: `NO AUTORIZADA`.
`PRODUCTION_READY`: `NO`.

FIN DE 01.2R. NO CONTINUAR AUTOMÁTICAMENTE CON 01.4R.
