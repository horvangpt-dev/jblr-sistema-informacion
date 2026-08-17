const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const DEMO_LOCATION_ID = '01a00a00-11a1-7b76-8485-40774086eba7';
const DEMO_POPULATION_ID = '01a00a00-17d4-75af-94d6-6b7f079b4f9c';
const DEMO_METHOD = 'STAGING / DEMO / MVP14 SYNTHETIC GEOREFERENCE';
const DEMO_NOTES = 'STAGING / DEMO / NO REAL LOCATION / NO SCIENTIFIC MEANING';
const DEMO_VERBATIM_LOCALITY = 'Sitio sintético STAGING sin coordenadas reales';

function assertDemoLocationId(locationId) {
  if (locationId !== DEMO_LOCATION_ID) throw new Error('MVP14 restricted to the accepted STAGING demo Location');
}

function geometrySelect(whereClause = 'lgv.location_id=$1') {
  return `
    SELECT
      lgv.resource_id AS geometry_version_id,
      gr.resource_type_code AS geometry_resource_type,
      gr.validation_status AS geometry_validation_status,
      gr.created_at AS geometry_created_at,
      lgv.location_id,
      l.location_name,
      l.verbatim_locality,
      l.notes AS location_notes,
      lgv.version_no,
      GeometryType(lgv.geom) AS geometry_type,
      ST_SRID(lgv.geom) AS actual_srid,
      ST_AsText(lgv.geom) AS geometry_wkt,
      CASE WHEN ST_GeometryType(lgv.geom)='ST_Point' AND ST_SRID(lgv.geom)=4326 THEN ST_X(lgv.geom) END AS longitude,
      CASE WHEN ST_GeometryType(lgv.geom)='ST_Point' AND ST_SRID(lgv.geom)=4326 THEN ST_Y(lgv.geom) END AS latitude,
      lgv.geometry_role,
      lgv.source_srid,
      lgv.verbatim_coordinates,
      lgv.source_geometry_text,
      lgv.uncertainty_m,
      lgv.georeference_method,
      lgv.source_resource_id,
      lgv.valid_from,
      lgv.valid_to,
      lgv.is_preferred,
      lgv.notes,
      (
        SELECT count(*)::int FROM field.population_location pl WHERE pl.location_id=lgv.location_id
      ) AS linked_population_count,
      (
        SELECT json_agg(json_build_object(
          'population_id', p.resource_id,
          'population_label', p.population_label,
          'relation_role', pl.relation_role
        ) ORDER BY p.resource_id)
        FROM field.population_location pl
        JOIN field.population p ON p.resource_id=pl.population_id
        WHERE pl.location_id=lgv.location_id
      ) AS populations
    FROM field.location_geometry_version lgv
    JOIN core.resource gr ON gr.resource_id=lgv.resource_id
    JOIN field.location l ON l.resource_id=lgv.location_id
    WHERE ${whereClause}
  `;
}

async function getLocationGeoreference(locationId) {
  assertDemoLocationId(locationId);
  const location = await pool.query(`
    SELECT l.resource_id AS location_id,r.jblr_code AS location_code,r.validation_status,r.row_version,
           l.location_name,l.verbatim_locality,l.location_kind,l.resolution_status,l.notes,
           (SELECT count(*)::int FROM field.population_location pl WHERE pl.location_id=l.resource_id) AS population_count
    FROM field.location l
    JOIN core.resource r ON r.resource_id=l.resource_id
    WHERE l.resource_id=$1
  `, [locationId]);
  if (!location.rows[0]) throw new Error('Location not found');
  const versions = await pool.query(`${geometrySelect()} ORDER BY lgv.version_no`, [locationId]);
  return { location: location.rows[0], versions: versions.rows };
}

function assertExistingDemo(row) {
  if (!row) throw new Error('MVP14 fail-closed: missing demo geometry row');
  const checks = [
    [row.geometry_resource_type === 'LGE', 'resource type'],
    [row.location_id === DEMO_LOCATION_ID, 'location'],
    [Number(row.version_no) === 1, 'version_no'],
    [row.geometry_type === 'POINT', 'geometry type'],
    [Number(row.actual_srid) === 4326, 'actual SRID'],
    [row.geometry_wkt === 'POINT(0 0)', 'synthetic geometry'],
    [Number(row.longitude) === 0 && Number(row.latitude) === 0, 'coordinate order'],
    [row.geometry_role === 'interpreted', 'geometry role'],
    [Number(row.source_srid) === 4326, 'source_srid'],
    [row.verbatim_coordinates === null, 'verbatim_coordinates'],
    [row.source_geometry_text === null, 'source_geometry_text'],
    [row.uncertainty_m === null, 'uncertainty'],
    [row.georeference_method === DEMO_METHOD, 'method'],
    [row.source_resource_id === null, 'source'],
    [row.valid_from === null && row.valid_to === null, 'validity'],
    [row.is_preferred === true, 'preferred'],
    [row.notes === DEMO_NOTES, 'notes'],
    [row.verbatim_locality === DEMO_VERBATIM_LOCALITY, 'Location verbatim_locality'],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`MVP14 fail-closed: existing geometry conflicts with authorized demo ${failed[1]}`);
}

async function createOrReuseDemoGeometry(locationId) {
  assertDemoLocationId(locationId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('JBLR:MVP14:LOCATION-GEOMETRY:DEMO'))`);

    const location = await client.query(`
      SELECT l.resource_id,l.location_name,l.verbatim_locality,l.notes
      FROM field.location l
      JOIN core.resource r ON r.resource_id=l.resource_id
      WHERE l.resource_id=$1 AND r.currency_status='current'
      FOR UPDATE OF l
    `, [locationId]);
    if (!location.rows[0]) throw new Error('Location not found');
    if (location.rows[0].verbatim_locality !== DEMO_VERBATIM_LOCALITY) {
      throw new Error('MVP14 fail-closed: Location verbatim_locality changed');
    }

    const populationLink = await client.query(`
      SELECT population_id,location_id FROM field.population_location
      WHERE population_id=$1 AND location_id=$2
    `, [DEMO_POPULATION_ID, locationId]);
    if (populationLink.rows.length !== 1) throw new Error('MVP14 fail-closed: accepted PopulationLocation link missing or duplicated');

    const all = await client.query(`${geometrySelect()} FOR UPDATE OF lgv`, [locationId]);
    if (all.rows.length > 1) throw new Error('MVP14 fail-closed: more than one geometry version exists for demo Location');
    if (all.rows.length === 1) {
      assertExistingDemo(all.rows[0]);
      await client.query('COMMIT');
      return { created: false, geometry: all.rows[0] };
    }

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'LGE','unreviewed')
      RETURNING resource_id
    `);
    const id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.location_geometry_version(
        resource_id,location_id,version_no,geom,geometry_role,source_srid,
        verbatim_coordinates,source_geometry_text,uncertainty_m,georeference_method,
        source_resource_id,valid_from,valid_to,is_preferred,notes
      ) VALUES(
        $1,$2,1,ST_SetSRID(ST_MakePoint(0,0),4326),'interpreted',4326,
        NULL,NULL,NULL,$3,NULL,NULL,NULL,true,$4
      )
    `, [id, locationId, DEMO_METHOD, DEMO_NOTES]);

    const preferred = await client.query(`
      SELECT count(*)::int AS n FROM field.location_geometry_version
      WHERE location_id=$1 AND is_preferred=true
    `, [locationId]);
    if (preferred.rows[0].n !== 1) throw new Error('MVP14 fail-closed: preferred geometry cardinality invalid');

    const inserted = await client.query(geometrySelect('lgv.resource_id=$1'), [id]);
    assertExistingDemo(inserted.rows[0]);
    await client.query('COMMIT');
    return { created: true, geometry: inserted.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getGeometryVersion(id) {
  const result = await pool.query(geometrySelect('lgv.resource_id=$1'), [id]);
  if (!result.rows[0]) return null;
  if (result.rows[0].location_id === DEMO_LOCATION_ID) assertExistingDemo(result.rows[0]);
  return result.rows[0];
}

module.exports = {
  DEMO_LOCATION_ID,
  DEMO_POPULATION_ID,
  DEMO_METHOD,
  DEMO_NOTES,
  DEMO_VERBATIM_LOCALITY,
  getLocationGeoreference,
  createOrReuseDemoGeometry,
  getGeometryVersion,
};
