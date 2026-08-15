# TRASPASO A 00 · DIRECCIÓN GENERAL — 01.4R

**Fecha:** 2026-08-15  
**Decisión técnica propuesta:** `01.4R_REPEAT_REQUIRED`  
**Producción:** NO AUTORIZADA  
**Importación ~2.700 taxones:** NO AUTORIZADA

## 1. Commit SHA

No existe commit certificado PASS de 01.4R.  
Commit técnico ensayado que demostró el BLOCKER: `456b376b5c47ce0d9a24c9a9225bc93d20616251`.  
GitHub Actions run: `31890895239`.

## 2. Privacidad/repositorio

`horvangpt-dev/jblr-sistema-informacion` — **Private**.  
Rama: `01.4r-certification`.  
PR: `#1`, draft.  
No se utilizó `flora-rioja-openalex`.

## 3. Inventario técnico final

Recuperación y auditoría del bundle 01.4; transporte verificable del baseline; fuentes legibles de Sqitch deploy/revert/verify; roles; ownership infraestructural; inventario; harness original C1-C5; workflows de GitHub Actions; evidencia de runs. La ejecución fue detenida al demostrar un defecto nuevo del baseline normativo.

## 4. Hash del baseline

`JBLR_01_2_R2_DDL_PILOT.sql`  
SHA-256: `50abe00a643d15e7b940580cce68d1abd34c6b6ccb06edd81f2e86973cb73d07`  
Tamaño: `107014` bytes.  
Verificación byte-exacta independiente: **PASS**, Actions run `31890895234`.

## 5. Sqitch real

**NO CERTIFICADO** en la ronda válida. Sqitch `1.4.1` y sus fuentes quedaron preparados/versionados, pero el baseline exacto falló antes de alcanzar deploy/verify.

## 6. GitHub Actions

CI real ejecutada sobre PostgreSQL `18.4` y `postgis/postgis:18-3.6`.  
Run `31890895239`: **FAILURE** durante instalación del baseline exacto.  
Error: `line 2228: invalid command \n`.

## 7. C1-C5

**NO EJECUTADAS** en la ronda válida 01.4R debido al BLOCKER previo. El harness original fue preservado; no se reutiliza el PASS histórico de 01.2 como sustituto.

## 8. Backup portable y SHA-256

**NO GENERADO** en la ronda válida. No existe SHA-256 de backup certificable 01.4R.

## 9. Restore

**NO EJECUTADO** en la ronda válida.

## 10. Segunda instalación limpia

**NO EJECUTADA** en la ronda válida.

## 11. Ownership/roles

Auditoría separada en Neon: existen los 8 roles institucionales y fueron observados NOLOGIN. Neon mantiene ownership técnico bajo `neondb_owner` en el entorno auditado, con memberships JBLR. La certificación portable de ownership/roles prevista en CI quedó bloqueada antes de su ejecución.

## 12. Evidence pack Drive/GitHub

GitHub conserva rama, PR, workflows, fuentes, informe de BLOCKER y artifacts.  
Artifact del run bloqueado: ID `9248517494`.  
Drive conserva el bundle histórico 01.4 y el documento institucional `JBLR_01_4R_TRASPASO_A_00_BLOCKER_2026-08-15` en la carpeta oficial 01.4, file ID `11i_a328hRpNJXc9cBEzKi8EGNX-wlROXYatrsjA3-Rc`.

## 13. Hallazgos

### BLOCKER

El artefacto normativo con SHA correcto contiene literalmente en la línea 2228 los bytes `5c 6e 5c 6e` (`\n\n`). `psql` 18.4 interpreta `\n` como metacomando inválido y detiene el despliegue. No es corrupción de reconstrucción: el SHA del archivo ejecutado coincide con el normativo.

### MAJOR

Ninguno adicional clasificado.

### MINOR

El wrapper histórico `tests/run_c1_c5.sh` no suministra el argumento DATABASE requerido por el harness. Se preservó; la solución prevista era invocar directamente el harness original, sin modificar las condiciones C1-C5.

### IMPROVEMENT

Mantener ejecución CI del artefacto byte-exacto como puerta obligatoria de futuras declaraciones físicas.

### OBSERVATION

Un transporte Base64 bootstrap histórico de GitHub era incompleto/defectuoso y fue descartado como fuente certificable, preservando la evidencia.

## 14. Limitación del proveedor

Neon usa `neondb_owner` como ownership técnico efectivo en el entorno auditado. Debe distinguirse del rol institucional objetivo `jblr_db_owner`. Esta diferencia no causa el BLOCKER actual.

## 15. Decisión técnica propuesta

**`01.4R_REPEAT_REQUIRED`**

Existe evidencia nueva, concreta y reproducible contra el artefacto físico certificado e inalterable. 01.4R no puede normalizar esos bytes porque alteraría el SHA normativo. Se devuelve el problema a 00/01.2 para una corrección formal, nuevo hash y certificación física correspondiente. Después podrá repetirse exclusivamente el cierre infraestructural pendiente.

**No se declara `PRODUCTION_READY`. No se autoriza producción ni importación masiva.**
