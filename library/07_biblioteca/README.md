# 07 · LA BIBLIOTECA

## Propósito

07 · LA BIBLIOTECA es la capa documental botánica del Sistema JBLR.

- Google Drive conserva los documentos canónicos (PDF, libros, artículos, tesis, claves, censos, informes y demás fuentes).
- GitHub conserva el índice técnico, reglas de catalogación, automatizaciones y punteros a Drive.
- GitHub NO sustituye al archivo documental de Drive.

## Drive canónico

Raíz:
- `Botanico/07_BIBLIOTECA`
- Drive folder id: `1d3irAPiX5drg1FNlOzD6ENTe_83pSldr`

Subcarpetas principales:
- `00_CATALOGO_Y_FUENTES` — `11myFxqtMRkGyfEas06PNB-hGEaw2A31L`
- `01_RIOJA_DIRECTA` — `1Y1OuNTiUzisFgvX3hHVmzSnvK60u8hgK`
- `02_ENTORNO_BIOGEOGRAFICO` — `1ZIZejK-MpM5LCBn3MRV09Vc90Xpb1mSQ`
- `03_HERRAMIENTAS_IDENTIFICACION` — `1rbAos-mINPz9fia36IZCWYggnQS7bCrl`
- `04_CONSERVACION_SEMILLAS_Y_GERMINACION` — `1AihugTMQGP6xT4UOXRYAbi8cHtEUVj_Y`
- `90_REFERENCIAS_NO_DESCARGADAS` — `1nbsZApaWMSiGPv2qK71kLbRKC_f3qOAo`
- `99_PENDIENTE_DE_CATALOGAR` — `1Ez8gfBCTe_tTtK45wD97cjETO5CG9wZe`

### Corpus prioritario Rioja: taxones, localidades y censos

Carpeta:
- `01_RIOJA_DIRECTA/00_FUENTES_TAXONES_LOCALIZACIONES_Y_CENSOS`
- Drive folder id: `19VF7obX8KEXBEQvAv-fuSATSRF0k67LO`

Subcarpetas:
- `01_FLORAS_CATALOGOS_Y_REVISIONES` — `1s13HNW5lP_ift4RDJEkZp9gWxt_1YKOD`
- `02_CITAS_LOCALIDADES_Y_COROLOGIA` — `11Zpj24Fbckj0sfarp5yKT2T3ZbNko6Rf`
- `03_CENSOS_SEGUIMIENTOS_Y_POBLACIONES` — `1UjcECiN0VBMsiGodHYSSFXlrDV4pjRJO`
- `04_HISTORICAS_HASTA_1950` — `1u7R1-MkrkWxyv7MFyUmSV4Jn5aGC-0tg`

### Flora iberica

Toda la colección debe permanecer junta en:
- `03_HERRAMIENTAS_IDENTIFICACION/Flora_Iberica`
- Drive folder id: `12IcpdN4LDiXWjMxUS-FHxXaqAZ2SUdRu`

No se fragmentará la colección entre carpetas por familias o tomos. Cada volumen conservará su identificación bibliográfica individual en el manifiesto.

## Regla de catalogación

Cada documento incorporado debe tener una entrada individual en `manifest.json` con, como mínimo:

- `library_id`
- título
- autoría
- año
- tipo documental
- fuente/repo de origen
- URL de origen
- ruta e ID de Drive
- ámbito geográfico
- taxones citados o alcance taxonómico cuando se haya revisado
- si contiene localidades/corología
- si contiene censos/seguimientos/poblaciones
- si puede aportar novedades/citas para La Rioja
- estado de incorporación
- checksum cuando sea posible
- notas de procedencia y trazabilidad

## Regla de evidencia

`archivo_en_biblioteca != hecho_validado`

`referencia != afirmación`

`evidencia != conclusión`

Una obra puede ser fuente consultable sin que sus afirmaciones se conviertan automáticamente en datos validados del sistema.

## Prioridad de incorporación

1. La Rioja directa.
2. Fuentes con taxones, localidades, corología, censos o poblaciones riojanas.
3. Bibliografía histórica de La Rioja, incluida la antigua provincia de Logroño.
4. Entorno biogeográfico relevante.
5. Herramientas de identificación, incluida Flora iberica.
6. Conservación ex situ, semillas y germinación.

## Automatización de descargas

Cuando sea necesario usar GitHub Actions como puente de adquisición:

`repositorio institucional/web oficial -> GitHub Actions artifact temporal -> Google Drive`

Los PDF no deben versionarse como blobs permanentes en Git salvo decisión expresa. El destino documental final es Drive.
