# JBLR 01.4R — BLOCKER · CORE_PHYSICAL_MODEL_v1

Fecha: 2026-08-15  
Sector: 01.4R · Cierre técnico preproductivo  
Clasificación: **BLOCKER**  
Propuesta sectorial: **01.4R_REPEAT_REQUIRED**

## Artefacto normativo

- Archivo: `JBLR_01_2_R2_DDL_PILOT.sql`
- Versión: `CORE_PHYSICAL_MODEL_v1`
- SHA-256 normativo: `50abe00a643d15e7b940580cce68d1abd34c6b6ccb06edd81f2e86973cb73d07`
- Tamaño comprobado: `107014` bytes

La reconstrucción byte-exacta del baseline obtuvo PASS independiente en GitHub Actions run `31890895234`.

## Ejecución que demuestra el defecto

- Repositorio: `horvangpt-dev/jblr-sistema-informacion` (Private)
- Rama: `01.4r-certification`
- PR: `#1` (draft)
- Commit técnico ensayado: `456b376b5c47ce0d9a24c9a9225bc93d20616251`
- GitHub Actions run: `31890895239`
- Job: `95026888353`
- PostgreSQL servidor: `18.4`
- `pg_dump` del servidor: `18.4`
- Imagen: `postgis/postgis:18-3.6`
- Digest observado: `sha256:93edcf470afb105e34d83bab74296537f63e773eda55026bd1bebbb5326c8a96`
- Sqitch disponible: `1.4.1`

El baseline pasó primero la comprobación SHA-256 exacta y a continuación falló al ser ejecutado por `psql`:

```text
psql:db/baseline/JBLR_01_2_R2_DDL_PILOT.sql:2228: error: invalid command \n
```

## Evidencia de bytes

En la línea 2228 del archivo con SHA-256 normativo aparecen literalmente los bytes:

```text
5c 6e 5c 6e
```

que representan los caracteres ASCII:

```text
\n\n
```

La secuencia está situada entre dos bloques SQL válidos. Al encontrarse al inicio lógico de línea, `psql` interpreta `\n` como un metacomando y detiene la ejecución.

## Por qué no se corrige en 01.4R

No es una discrepancia de transporte ni una reconstrucción con hash incorrecto: el archivo ejecutado coincide exactamente con el SHA normativo.

Eliminar, sustituir o normalizar esos cuatro bytes produciría un archivo distinto y un SHA-256 distinto. El protocolo 01.4R prohíbe modificar, regenerar o reformatear `CORE_PHYSICAL_MODEL_v1` y ordena detener el cierre si una prueba técnica demuestra un defecto nuevo concreto.

Por tanto, **no se ha modificado el baseline** y no se ejecuta una variante corregida informalmente.

## Consecuencia sobre 01.4R

La ejecución válida se detuvo antes de:

- Sqitch deploy/verify;
- revert seguro;
- C1-C5;
- backup portable;
- restore;
- segunda instalación limpia;
- certificación portable final de ownership/roles.

Ninguno de esos pasos se declara PASS en 01.4R.

El workflow sí preservó evidencia mediante `actions/upload-artifact`; artifact ID del run bloqueado: `9248517494`.

## Contradicción con la certificación anterior

La documentación institucional 01.2 declara el mismo archivo y SHA como físicamente PASS en PostgreSQL 18.4 y la declaración de `CORE_PHYSICAL_MODEL_v1` establece que el modelo solo debe reabrirse ante evidencia nueva y grave.

La ejecución reproducible de 01.4R constituye evidencia nueva concreta de que el artefacto normativo byte-exacto no es directamente ejecutable.

## Acción requerida de 00

Devolver el artefacto físico a revisión formal de 00/01.2 para:

1. confirmar el defecto de los bytes literales `\n\n`;
2. aprobar, si procede, una corrección mínima controlada del artefacto;
3. generar un nuevo SHA-256 normativo;
4. repetir la certificación física necesaria del DDL corregido;
5. solo entonces reanudar 01.4R para los pendientes infraestructurales.

## Restricciones mantenidas

- Producción: **NO AUTORIZADA**.
- `PRODUCTION_READY`: **NO DECLARADO**.
- Importación de ~2.700 taxones: **NO AUTORIZADA**.
- Flora real/PII/coordenadas confidenciales: **NO utilizadas**.
