const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function ensureTreatment(client) {
  const existing = await client.query(`
    SELECT ci.resource_id FROM evidence.content_item ci
    JOIN core.resource r ON r.resource_id=ci.resource_id
    WHERE ci.title='JBLR STAGING · MVP_PRODUCTIVO_1 · tratamiento de demostración'
      AND r.currency_status='current'
    LIMIT 1
  `);
  if (existing.rows[0]) return existing.rows[0].resource_id;
  const r = await client.query(`INSERT INTO core.resource(resource_id, resource_type_code, validation_status) VALUES(uuidv7(),'DOC','unreviewed') RETURNING resource_id`);
  await client.query(`
    INSERT INTO evidence.content_item(resource_id, content_kind, title, description, notes)
    VALUES($1,'document','JBLR STAGING · MVP_PRODUCTIVO_1 · tratamiento de demostración',
      'Recurso técnico interno para relacionar conceptos y nombres creados durante el MVP en STAGING.',
      'STAGING ONLY · no constituye fuente taxonómica ni validación científica')
  `,[r.rows[0].resource_id]);
  return r.rows[0].resource_id;
}

async function ensureTaxon(client, treatmentId, data) {
  const exists = await client.query(`
    SELECT tc.resource_id
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=nu.taxon_concept_id
    JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
    WHERE lower(tn.scientific_name)=lower($1)
    LIMIT 1
  `,[data.scientificName]);
  if (exists.rows[0]) return exists.rows[0].resource_id;

  const c = await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),'TXC','unreviewed') RETURNING resource_id`);
  await client.query(`INSERT INTO taxonomy.taxon_concept(resource_id,rank_term_key,concept_label,according_to_resource_id,resolution_status,notes) VALUES($1,'rank:species',$2,$3,'unresolved','STAGING DEMO · no validado científicamente')`,[c.rows[0].resource_id,data.scientificName,treatmentId]);
  const n = await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),'NAM','unreviewed') RETURNING resource_id`);
  await client.query(`INSERT INTO taxonomy.taxonomic_name(resource_id,rank_term_key,scientific_name,canonical_name,authorship,genus,specific_epithet,notes) VALUES($1,'rank:species',$2,$3,$4,$5,$6,'STAGING DEMO · no validado científicamente')`,[n.rows[0].resource_id,data.scientificName,data.canonicalName,data.authorship,data.genus,data.specificEpithet]);
  const u = await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),'NUS','unreviewed') RETURNING resource_id`);
  await client.query(`INSERT INTO taxonomy.name_usage(resource_id,taxon_concept_id,taxonomic_name_id,treatment_resource_id,usage_role,verbatim_name,notes) VALUES($1,$2,$3,$4,'unresolved',$5,'STAGING DEMO · relación no validada')`,[u.rows[0].resource_id,c.rows[0].resource_id,n.rows[0].resource_id,treatmentId,data.scientificName]);
  return c.rows[0].resource_id;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`
      INSERT INTO taxonomy.term(term_key,term_domain,term_code,label,sort_order,is_active)
      VALUES ('rank:species','rank','species','Especie',10,true),('rank:genus','rank','genus','Género',20,true)
      ON CONFLICT (term_key) DO NOTHING
    `);
    const treatmentId = await ensureTreatment(client);
    const ids = [];
    ids.push(await ensureTaxon(client,treatmentId,{scientificName:'Plantago major L.',canonicalName:'Plantago major',authorship:'L.',genus:'Plantago',specificEpithet:'major'}));
    ids.push(await ensureTaxon(client,treatmentId,{scientificName:'Papaver rhoeas L.',canonicalName:'Papaver rhoeas',authorship:'L.',genus:'Papaver',specificEpithet:'rhoeas'}));
    await client.query('COMMIT');
    console.log(JSON.stringify({seeded:true,environment:'STAGING',taxonConceptIds:ids}));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
