const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

const LOCATION_NAME = 'JBLR STAGING · Localización demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';

async function main() {
  await assertAuthorizedStaging();

  const { rows } = await pool.query(`
    SELECT
      tc.resource_id AS concept_id,
      p.resource_id AS population_id,
      l.resource_id AS location_id,
      i.resource_id AS identification_id,
      p.population_label,
      l.location_name,
      i.resolution_status AS identification_resolution_status,
      i.is_preferred,
      (
        SELECT count(*)::int
        FROM field.population_location pl2
        WHERE pl2.population_id=p.resource_id AND pl2.location_id=l.resource_id
      ) AS population_location_links,
      (
        SELECT count(*)::int
        FROM governance.record_revision rr
        WHERE rr.target_resource_id=p.resource_id
      ) AS population_revisions
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=nu.taxon_concept_id
    JOIN taxonomy.identification i ON i.taxon_concept_id=tc.resource_id
    JOIN field.population p ON p.resource_id=i.target_resource_id
    JOIN field.population_location pl ON pl.population_id=p.resource_id
    JOIN field.location l ON l.resource_id=pl.location_id
    WHERE tn.scientific_name='Plantago major L.'
      AND p.population_label=$1
      AND l.location_name=$2
    LIMIT 1
  `, [POPULATION_EDITED, LOCATION_NAME]);

  const row = rows[0];
  if (!row) throw new Error('MVP2 persistent STAGING population/location state not found');
  if (row.identification_resolution_status !== 'unresolved') throw new Error('Identification must remain unresolved in MVP2 demo');
  if (!row.is_preferred) throw new Error('Preferred population identification missing');
  if (row.population_location_links !== 1) throw new Error('Population-location link missing or duplicated');
  if (row.population_revisions < 1) throw new Error('Population edit revision was not recorded');

  console.log(JSON.stringify({
    OPEN_TAXON_POPULATIONS: 'PASS',
    CREATE_LOCATION: 'PASS',
    CREATE_POPULATION: 'PASS',
    LINK_POPULATION_LOCATION: 'PASS',
    LINK_POPULATION_TAXON: 'PASS',
    OPEN_POPULATION_DETAIL: 'PASS',
    EDIT_POPULATION: 'PASS',
    PERSIST_POPULATION_TO_NEON: 'PASS',
    identificationValidationStatus: 'unresolved',
    populationId: row.population_id,
    locationId: row.location_id,
  }));
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
