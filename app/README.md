# JBLR · MVP_PRODUCTIVO_1

Aplicación web mínima para trabajar exclusivamente contra Neon STAGING. Usa el modelo JBLR existente: `TaxonConcept`, `TaxonomicName` y `NameUsage`; no crea tablas paralelas.

## Ejecutar

1. Node.js 22 o posterior.
2. `npm install`
3. Definir `DATABASE_URL` únicamente en el entorno del servidor.
4. Primera preparación de STAGING: `npm run seed:staging`
5. Arrancar: `npm start`
6. Abrir `http://127.0.0.1:3000`

La aplicación se niega a arrancar o mutar datos si la conexión no corresponde al Project/Branch/Endpoint STAGING autorizados.

## Pruebas

- `npm run test:e2e`: búsqueda, ficha, alta, edición y persistencia real.
- `npm run test:ui`: interfaz de escritorio y viewport móvil.

Los datos de demostración se marcan como STAGING y permanecen `unreviewed` / `unresolved`. No constituyen validación taxonómica.
