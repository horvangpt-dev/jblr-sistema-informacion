const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

const LOCATION_NAME = 'JBLR STAGING · Localización demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';
const PROSPECTION_EDITED = 'JBLR STAGING · Prospección demo MVP3 · editada';
const VISIT_EDITED = 'JBLR STAGING · Visita demo MVP3 · editada';

async function main() {
  await assertAuthorizedStaging();

  const { rows } = await pool.query(`
    SELECT
      tc.resource_id AS concept_id,
      p.resource_id AS population_id,
      l.resource_id AS location_id,
      pr.resource_id AS prospection_id,
      fv.resource_id AS field_visit_id,
      prr.validation_status AS prospection_validation_status,
      vr.validation_status AS field_visit_validation_status,
      i.resolution_status AS identification_resolution_status,
      fv.prospection_id AS linked_prospection_id,
      fv.location_id AS linked_location_id,
      fvp.population_id AS linked_population_id,
      fv.sequence_no,
      (SELECT count(*)::int FROM field.field_visit_population x WHERE x.field_visit_id=fv.resource_id AND x.population_id=p.resource_id) AS visit_population_links,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=pr.resource_id) AS prospection_revisions,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=fv.resource_id) AS field_visit_revisions,
      (SELECT count(*)::int FROM field.prospection p2 WHERE p2.purpose LIKE 'JBLR STAGING · Prospección demo MVP3%') AS mvp3_prospection_count,
      (SELECT count(*)::int FROM field.field_visit fv2 WHERE fv2.visit_purpose LIKE 'JBLR STAGING · Visita demo MVP3%') AS mvp3_visit_count
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=nu.taxon_concept_id
    JOIN taxonomy.identification i ON i.taxon_concept_id=tc.resource_id
    JOIN field.population p ON p.resource_id=i.target_resource_id
    JOIN field.field_visit_population fvp ON fvp.population_id=p.resource_id
    JOIN field.field_visit fv ON fv.resource_id=fvp.field_visit_id
    JOIN field.prospection pr ON pr.resource_id=fv.prospection_id
    JOIN field.location l ON l.resource_id=fv.location_id
    JOIN core.resource prr ON prr.resource_id=pr.resource_id
    JOIN core.resource vr ON vr.resource_id=fv.resource_id
    WHERE tn.scientific_name='Plantago major L.'
      AND p.population_label=$1
      AND l.location_name=$2
      AND pr.purpose=$3
      AND fv.visit_purpose=$4
    LIMIT 1
  `, [POPULATION_EDITED, LOCATION_NAME, PROSPECTION_EDITED, VISIT_EDITED]);

  const row = rows[0];
  if (!row) throw new Error('MVP3 persistent STAGING field activity state not found');
  if (row.prospection_validation_status !== 'unreviewed') throw new Error('Prospection must remain unreviewed');
  if (row.field_visit_validation_status !== 'unreviewed') throw new Error('FieldVisit must remain unreviewed');
  if (row.identification_resolution_status !== 'unresolved') throw new Error('Population Identification must remain unresolved');
  if (row.linked_prospection_id !== row.prospection_id) throw new Error('FieldVisit-Prospection link missing');
  if (row.linked_location_id !== row.location_id) throw new Error('FieldVisit-Location link missing');
  if (row.linked_population_id !== row.population_id || row.visit_population_links !== 1) throw new Error('FieldVisit-Population link missing or duplicated');
  if (row.sequence_no < 1) throw new Error('FieldVisit sequence is invalid');
  if (row.prospection_revisions < 1) throw new Error('Prospection edit revision was not recorded');
  if (row.field_visit_revisions < 1) throw new Error('FieldVisit edit revision was not recorded');
  if (row.mvp3_prospection_count !== 1) throw new Error('MVP3 synthetic prospection duplicated');
  if (row.mvp3_visit_count !== 1) throw new Error('MVP3 synthetic field visit duplicated');

  console.log(JSON.stringify({
    OPEN_POPULATION_FIELD_ACTIVITY: 'PASS',
    CREATE_PROSPECTION: 'PASS',
    CREATE_FIELD_VISIT: 'PASS',
    LINK_VISIT_PROSPECTION: 'PASS',
    LINK_VISIT_LOCATION: 'PASS',
    LINK_VISIT_POPULATION: 'PASS',
    OPEN_FIELD_VISIT_DETAIL: 'PASS',
    OPEN_PROSPECTION_DETAIL: 'PASS',
    EDIT_PROSPECTION: 'PASS',
    EDIT_FIELD_VISIT: 'PASS',
    PERSIST_FIELD_ACTIVITY_TO_NEON: 'PASS',
    prospectionId: row.prospection_id,
    fieldVisitId: row.field_visit_id,
    populationId: row.population_id,
    locationId: row.location_id,
  }));
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
