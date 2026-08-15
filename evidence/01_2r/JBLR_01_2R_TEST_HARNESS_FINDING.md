# 01.2R · hallazgo auxiliar en paquete de pruebas

Durante el run 31892394378 el DDL FIX1 compiló e inventarió correctamente, pero el paquete `JBLR_01_2_CERT_QUERIES_CORRECTED.sql` se detuvo antes de las pruebas E por una secuencia literal `\\n\\n` ajena al DDL.

Evidencia byte-exacta del paquete de pruebas original:
- tamaño: 36728 bytes
- SHA-256: `80a083c667fa33ec3c70c4255e80b060eb03fe53cab1b47c1237c560832809fe`
- única secuencia `5c 6e 5c 6e`: offset decimal 29820, línea aproximada 621
- ubicación: frontera entre el bloque A/consultas previas y el encabezado `E. RONDA 2: MAJOR RESUELTOS`.

Corrección auxiliar del test harness, sin modificar el DDL ni la semántica de las consultas:
- `5c 6e 5c 6e -> 0a 0a`
- tamaño resultante: 36726 bytes
- SHA-256: `b685fb65cf7b8311c8bb7e4dfe7276015e9b7b7ed76811aa73d251092c67c082`

El run inicial queda preservado como evidencia. La recertificación se repite con el paquete de pruebas corregido y el mismo DDL FIX1.
