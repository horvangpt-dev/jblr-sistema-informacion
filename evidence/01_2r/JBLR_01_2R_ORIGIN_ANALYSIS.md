# JBLR 01.2R · análisis de origen del defecto de serialización

## Evidencia directa

- El artefacto histórico R2 de Drive mide 107014 bytes y tiene SHA-256 `50abe00a643d15e7b940580cce68d1abd34c6b6ccb06edd81f2e86973cb73d07`.
- La única secuencia literal `\\n\\n` comienza en el offset decimal 93948 (`0x16efc`).
- El DDL de ronda 1 `JBLR_01_2_DDL_PILOT.sql` de Drive mide exactamente 93948 bytes.
- Los primeros 93948 bytes del R2 son byte por byte idénticos al DDL completo de ronda 1; ambos tienen SHA-256 `984b9b43858372d76814cb20e763467c83a2605889e918b5509f2708503003a1`.
- Inmediatamente después de ese prefijo aparecen los cuatro bytes `5c 6e 5c 6e`, seguidos del encabezado `JBLR 01.2 · RONDA 2 — PILOT HARDENING LAYER`.
- El changelog de R2 documenta expresamente que la base fue `JBLR_01_2_DDL_PILOT.sql` (ronda 1) más las decisiones R2.
- El bundle R2 no contiene un generador o comando de concatenación que permita atribuir la inserción a una herramienta concreta.

## Conclusión

El origen técnico queda demostrado al nivel de la frontera de ensamblado R1→R2: la secuencia espuria fue insertada entre el DDL R1 íntegro y la capa R2 añadida, y representa una serialización escapada de dos saltos de línea. No existe evidencia suficiente para identificar de forma garantista el programa, comando o interfaz exactos que produjo esos cuatro bytes.
