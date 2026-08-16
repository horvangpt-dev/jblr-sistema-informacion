const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const AREA_NAME = 'La Rioja';
const AREA_KIND = 'autonomous_community';
const NOTE_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_11 · NO VALIDADO · ';
const DEFAULT_NOTE = 'estado regional desconocido; no implica presencia ni ausencia';

function exactOne(rows, label) {
  if (rows.length > 1) throw new Error(`${label} conflicts with duplicate MVP11 rows`);
  return rows[0] || null;
}

async function getTaxon(taxonId, client = pool) {
  const result = await client.query(`
    SELECT tc.resource_id AS taxon_concept_id,
           r.jblr_code AS taxon_concept_code,
           r.validation_status,
           r.row_version,
           tc.concept_label,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=tc.resource_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name
    FROM taxonomy.taxon_concept tc
    JOIN core.resource r ON r.resource_id=tc.resource_id AND r.currency_status='current'
    WHERE tc.resource_id=$1
  `,[taxonId]);
  return result.rows[0] || null;
}

async function getGeographicArea(areaId, client = pool) {
  const result = await client.query(`
    SELECT ga.resource_id AS geographic_area_id,
           r.jblr_code AS geographic_area_code,
           r.resource_type_code,
           r.validation_status,
           r.row_version,
           ga.area_kind,ga.name,ga.parent_area_id,ga.external_code,
           ga.external_code_system,ga.valid_from,ga.valid_to,ga.notes,
           (SELECT count(*)::int FROM field.location l WHERE l.geographic_area_id=ga.resource_id) AS linked_location_count
    FROM core.geographic_area ga
    JOIN core.resource r ON r.resource_id=ga.resource_id
    WHERE ga.resource_id=$1
  `,[areaId]);
  return result.rows[0] || null;
}

function decorateAssertion(row) {
  if (!row) return null;
  return {
    ...row,
    editable_note: row.notes && row.notes.startsWith(NOTE_PREFIX)
      ? row.notes.slice(NOTE_PREFIX.length)
      : row.notes || ''
  };
}

async function getRegionalAssertion(assertionId, client = pool) {
  const result = await client.query(`
    SELECT rta.resource_id AS regional_assertion_id,
           rr.jblr_code AS regional_assertion_code,
           rr.resource_type_code,
           rr.validation_status AS regional_assertion_validation_status,
           rr.row_version AS regional_assertion_row_version,
           rta.taxon_concept_id,
           tr.jblr_code AS taxon_concept_code,
           tr.validation_status AS taxon_validation_status,
           tr.row_version AS taxon_row_version,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=rta.taxon_concept_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name,
           rta.geographic_area_id,
           ga.name AS geographic_area_name,
           ga.area_kind AS geographic_area_kind,
           gr.jblr_code AS geographic_area_code,
           rta.presence_term_key,rta.presence_value_status,
           rta.origin_term_key,rta.origin_value_status,
           rta.establishment_term_key,rta.establishment_value_status,
           rta.context_term_key,rta.context_value_status,
           rta.temporality_term_key,rta.temporality_value_status,
           rta.catalog_inclusion_term_key,rta.catalog_inclusion_value_status,
           rta.source_resource_id,rta.valid_from,rta.valid_to,rta.notes
    FROM taxonomy.regional_taxon_assertion rta
    JOIN core.resource rr ON rr.resource_id=rta.resource_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=rta.taxon_concept_id
    JOIN core.resource tr ON tr.resource_id=tc.resource_id
    JOIN core.geographic_area ga ON ga.resource_id=rta.geographic_area_id
    JOIN core.resource gr ON gr.resource_id=ga.resource_id
    WHERE rta.resource_id=$1
  `,[assertionId]);
  return decorateAssertion(result.rows[0] || null);
}

async function getTaxonRegionalStatus(taxonId) {
  const taxon = await getTaxon(taxonId);
  if (!taxon) return null;

  const areas = await pool.query(`
    SELECT ga.resource_id AS geographic_area_id,r.jblr_code AS geographic_area_code,
           r.resource_type_code,r.validation_status,ga.area_kind,ga.name,ga.notes
    FROM core.geographic_area ga
    JOIN core.resource r ON r.resource_id=ga.resource_id
    WHERE lower(ga.name)=lower($1)
    ORDER BY ga.resource_id
  `,[AREA_NAME]);

  const assertions = await pool.query(`
    SELECT rta.resource_id AS regional_assertion_id,rr.jblr_code AS regional_assertion_code,
           rr.validation_status AS regional_assertion_validation_status,
           rta.geographic_area_id,ga.name AS geographic_area_name,ga.area_kind AS geographic_area_kind,
           rta.presence_term_key,rta.presence_value_status,
           rta.origin_term_key,rta.origin_value_status,
           rta.establishment_term_key,rta.establishment_value_status,
           rta.context_term_key,rta.context_value_status,
           rta.temporality_term_key,rta.temporality_value_status,
           rta.catalog_inclusion_term_key,rta.catalog_inclusion_value_status,
           rta.source_resource_id,rta.valid_from,rta.valid_to,rta.notes
    FROM taxonomy.regional_taxon_assertion rta
    JOIN core.resource rr ON rr.resource_id=rta.resource_id
    JOIN core.geographic_area ga ON ga.resource_id=rta.geographic_area_id
    WHERE rta.taxon_concept_id=$1
    ORDER BY ga.name,rta.resource_id
  `,[taxonId]);

  return {
    taxon,
    area: exactOne(areas.rows,'GeographicArea La Rioja'),
    assertions: assertions.rows.map(decorateAssertion)
  };
}

async function createOrReuseRegionalStatus(taxonId) {
  if (taxonId !== TAXON_ID) {
    throw new Error('MVP11 synthetic regional status is restricted to the Plantago STAGING TaxonConcept');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`MVP11:regional:${taxonId}:${AREA_NAME}`]);

    const taxon = await getTaxon(taxonId, client);
    if (!taxon) throw new Error('TaxonConcept not found');

    let area = exactOne((await client.query(`
      SELECT ga.*,r.resource_type_code,r.jblr_code,r.validation_status
      FROM core.geographic_area ga
      JOIN core.resource r ON r.resource_id=ga.resource_id
      WHERE lower(ga.name)=lower($1)
      ORDER BY ga.resource_id
    `,[AREA_NAME])).rows,'GeographicArea La Rioja');
    let areaCreated = false;

    if (!area) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'GAR','unreviewed')
        RETURNING resource_id
      `)).rows[0];
      area = (await client.query(`
        INSERT INTO core.geographic_area(
          resource_id,area_kind,name,parent_area_id,external_code,external_code_system,
          valid_from,valid_to,notes
        ) VALUES($1,$2,$3,NULL,NULL,NULL,NULL,NULL,$4)
        RETURNING *
      `,[resource.resource_id,AREA_KIND,AREA_NAME,
         'Área geográfica administrativa. Su existencia no implica presencia de ningún taxón.'])).rows[0];
      areaCreated = true;
    } else if (
      area.resource_type_code !== 'GAR' ||
      area.name !== AREA_NAME ||
      area.area_kind !== AREA_KIND
    ) {
      throw new Error('Existing GeographicArea La Rioja conflicts with MVP11 semantics');
    }

    const demoRows = (await client.query(`
      SELECT rta.*,r.resource_type_code,r.jblr_code,r.validation_status
      FROM taxonomy.regional_taxon_assertion rta
      JOIN core.resource r ON r.resource_id=rta.resource_id
      WHERE rta.taxon_concept_id=$1
        AND rta.geographic_area_id=$2
        AND rta.notes LIKE $3
      ORDER BY rta.resource_id
    `,[taxonId,area.resource_id,`${NOTE_PREFIX}%`])).rows;

    let assertion = exactOne(demoRows,'RegionalTaxonAssertion MVP11');
    let assertionCreated = false;

    if (!assertion) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'RTA','unreviewed')
        RETURNING resource_id
      `)).rows[0];
      assertion = (await client.query(`
        INSERT INTO taxonomy.regional_taxon_assertion(
          resource_id,taxon_concept_id,geographic_area_id,
          presence_term_key,presence_value_status,
          origin_term_key,origin_value_status,
          establishment_term_key,establishment_value_status,
          context_term_key,context_value_status,
          temporality_term_key,temporality_value_status,
          catalog_inclusion_term_key,catalog_inclusion_value_status,
          source_resource_id,valid_from,valid_to,notes
        ) VALUES(
          $1,$2,$3,
          NULL,'unknown',
          NULL,'not_recorded',
          NULL,'not_recorded',
          NULL,'not_recorded',
          NULL,'not_recorded',
          NULL,'not_recorded',
          NULL,NULL,NULL,$4
        )
        RETURNING *
      `,[resource.resource_id,taxonId,area.resource_id,`${NOTE_PREFIX}${DEFAULT_NOTE}`])).rows[0];
      assertionCreated = true;
    } else {
      const termKeys = [
        assertion.presence_term_key,assertion.origin_term_key,assertion.establishment_term_key,
        assertion.context_term_key,assertion.temporality_term_key,assertion.catalog_inclusion_term_key
      ];
      if (
        assertion.resource_type_code !== 'RTA' ||
        assertion.presence_value_status !== 'unknown' ||
        assertion.origin_value_status !== 'not_recorded' ||
        assertion.establishment_value_status !== 'not_recorded' ||
        assertion.context_value_status !== 'not_recorded' ||
        assertion.temporality_value_status !== 'not_recorded' ||
        assertion.catalog_inclusion_value_status !== 'not_recorded' ||
        termKeys.some((value) => value !== null) ||
        assertion.source_resource_id !== null
      ) {
        throw new Error('Existing RegionalTaxonAssertion conflicts with MVP11 unknown/not_recorded semantics');
      }
    }

    await client.query('COMMIT');
    return {
      created: { geographicArea: areaCreated, regionalTaxonAssertion: assertionCreated },
      area: await getGeographicArea(area.resource_id),
      assertion: await getRegionalAssertion(assertion.resource_id)
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editRegionalAssertion(assertionId, body = {}) {
  const keys = Object.keys(body);
  if (keys.some((key) => key !== 'userNote')) {
    throw new Error('MVP11 edit is restricted to the editorial note');
  }
  const userNote = body.userNote == null ? '' : String(body.userNote).trim();
  if (userNote.length > 1000) throw new Error('Regional status note exceeds 1000 characters');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await getRegionalAssertion(assertionId, client);
    if (!current) throw new Error('RegionalTaxonAssertion not found');
    if (!current.notes || !current.notes.startsWith(NOTE_PREFIX)) {
      throw new Error('MVP11 edit is restricted to the synthetic STAGING regional assertion');
    }
    const updated = await client.query(`
      UPDATE taxonomy.regional_taxon_assertion
      SET notes=$2
      WHERE resource_id=$1
      RETURNING resource_id
    `,[assertionId,`${NOTE_PREFIX}${userNote || DEFAULT_NOTE}`]);
    if (updated.rows.length !== 1) throw new Error('RegionalTaxonAssertion not found');
    await client.query('COMMIT');
    return await getRegionalAssertion(assertionId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  TAXON_ID,
  AREA_NAME,
  AREA_KIND,
  NOTE_PREFIX,
  getTaxonRegionalStatus,
  createOrReuseRegionalStatus,
  getGeographicArea,
  getRegionalAssertion,
  editRegionalAssertion
};
