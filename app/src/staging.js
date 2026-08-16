const { pool } = require('./db');

const AUTHORIZED_STAGING = Object.freeze({
  projectId: 'crimson-hall-16978747',
  branchId: 'br-polished-pond-b24mvk11',
  endpointId: 'ep-hidden-sound-b2uab7di',
  database: 'neondb',
});

async function assertAuthorizedStaging(client = pool) {
  const { rows } = await client.query(`
    SELECT
      current_setting('neon.project_id', true) AS project_id,
      current_setting('neon.branch_id', true) AS branch_id,
      current_setting('neon.endpoint_id', true) AS endpoint_id,
      current_database() AS database_name
  `);
  const actual = rows[0] || {};
  const ok = actual.project_id === AUTHORIZED_STAGING.projectId
    && actual.branch_id === AUTHORIZED_STAGING.branchId
    && actual.endpoint_id === AUTHORIZED_STAGING.endpointId
    && actual.database_name === AUTHORIZED_STAGING.database;
  if (!ok) {
    throw new Error('Refusing database operation: connection is not the authorized JBLR STAGING target');
  }
  return { ok: true, environment: 'STAGING', ...AUTHORIZED_STAGING };
}

module.exports = { AUTHORIZED_STAGING, assertAuthorizedStaging };
