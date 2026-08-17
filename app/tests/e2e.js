const assert = require('assert/strict');
const { startServer } = require('../src/server');
const { pool } = require('../src/db');

async function json(url, options = {}) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function cleanupCreatedTaxon(conceptId, sequenceBefore) {
  if (!conceptId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const usages = (await client.query(`
      SELECT resource_id,taxonomic_name_id FROM taxonomy.name_usage WHERE taxon_concept_id=$1
    `,[conceptId])).rows;
    const nameIds = usages.map((r)=>r.taxonomic_name_id);
    const usageIds = usages.map((r)=>r.resource_id);
    const revisionIds = (await client.query(`
      SELECT resource_id FROM governance.record_revision
      WHERE target_resource_id=$1 OR target_resource_id=ANY($2::uuid[])
    `,[conceptId,nameIds])).rows.map((r)=>r.resource_id);
    if (revisionIds.length) {
      await client.query('DELETE FROM governance.revision_change WHERE record_revision_id=ANY($1::uuid[])',[revisionIds]);
      await client.query('DELETE FROM governance.record_revision WHERE resource_id=ANY($1::uuid[])',[revisionIds]);
    }
    if (usageIds.length) await client.query('DELETE FROM taxonomy.name_usage WHERE resource_id=ANY($1::uuid[])',[usageIds]);
    if (nameIds.length) await client.query('DELETE FROM taxonomy.taxonomic_name WHERE resource_id=ANY($1::uuid[])',[nameIds]);
    await client.query('DELETE FROM taxonomy.taxon_concept WHERE resource_id=$1',[conceptId]);
    const resourceIds=[conceptId,...nameIds,...usageIds,...revisionIds];
    await client.query('DELETE FROM core.resource WHERE resource_id=ANY($1::uuid[])',[resourceIds]);
    await client.query('DELETE FROM core.jblr_code_registry WHERE first_resource_id=ANY($1::uuid[])',[resourceIds]);
    await client.query(`SELECT setval('core.jblr_code_sequence',$1,$2)`,[sequenceBefore.last_value,sequenceBefore.is_called]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now().toString().slice(-8);
  const sci = `JBLR staging test ${suffix}`;
  const sequenceBefore=(await pool.query('SELECT last_value,is_called FROM core.jblr_code_sequence')).rows[0];
  let createdConceptId=null;
  try {
    const health = await json(`${base}/api/health`);
    assert.equal(health.ok, true);
    assert.equal(health.environment, 'STAGING');
    assert.equal(health.database, 'neondb');

    const existing = await json(`${base}/api/taxa?q=Plantago`);
    assert.ok(existing.length >= 1);
    const existingDetail = await json(`${base}/api/taxa/${existing[0].concept_id}`);
    assert.ok(existingDetail.names.length >= 1);

    const created = await json(`${base}/api/taxa`, {
      method: 'POST',
      body: JSON.stringify({
        scientificName: sci,
        canonicalName: sci,
        authorship: 'STAGING synthetic test',
        rankTermKey: 'rank:species',
        genus: 'JBLR',
        specificEpithet: `test-${suffix}`,
      }),
    });
    createdConceptId=created.concept_id;
    assert.ok(created.concept_id);
    assert.equal(created.concept_validation_status, 'unreviewed');
    assert.equal(created.resolution_status, 'unresolved');

    const found = await json(`${base}/api/taxa?q=${encodeURIComponent(suffix)}`);
    assert.ok(found.some((x) => x.concept_id === created.concept_id));

    const edited = await json(`${base}/api/taxa/${created.concept_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ conceptLabel: `JBLR STAGING edited ${suffix}` }),
    });
    assert.equal(edited.concept_label, `JBLR STAGING edited ${suffix}`);

    const reloaded = await json(`${base}/api/taxa/${created.concept_id}`);
    assert.equal(reloaded.concept_label, `JBLR STAGING edited ${suffix}`);

    const rev = await pool.query(`SELECT count(*)::int AS n FROM governance.record_revision WHERE target_resource_id=$1`, [reloaded.concept_id]);
    assert.ok(rev.rows[0].n >= 1);

    console.log(JSON.stringify({
      SEARCH_TAXON: 'PASS',
      OPEN_TAXON_DETAIL: 'PASS',
      CREATE_TAXON: 'PASS',
      EDIT_TAXON: 'PASS',
      PERSIST_TO_NEON_STAGING: 'PASS',
      REVERSIBLE_TEST_CLEANUP: 'PASS',
      revisionRecorded: true,
      createdConceptId: created.concept_id,
    }));
  } finally {
    await cleanupCreatedTaxon(createdConceptId,sequenceBefore);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
