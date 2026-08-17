const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

(async()=>{
  await assertAuthorizedStaging();
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM taxonomy.external_taxon_reference) AS external_taxon_reference,
      (SELECT count(*)::int FROM evidence.external_source) AS external_source,
      (SELECT count(*)::int FROM field.location_geometry_version) AS location_geometry_version,
      (SELECT count(*)::int FROM field.location) AS location,
      (SELECT count(*)::int FROM field.population) AS population,
      (SELECT count(*)::int FROM governance.validation_event) AS validation_event,
      (SELECT count(*)::int FROM governance.quality_assessment) AS quality_assessment,
      (SELECT count(*)::int FROM governance.quality_flag) AS quality_flag,
      (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
      (SELECT count(*)::int FROM taxonomy.taxonomic_name) AS taxonomic_name,
      (SELECT count(*)::int FROM evidence.digital_asset) AS digital_asset
  `)).rows[0];
  const expected = {
    external_taxon_reference:1, external_source:1, location_geometry_version:1, location:1, population:1,
    validation_event:1, quality_assessment:1, quality_flag:0, taxon_concept:4, taxonomic_name:4, digital_asset:0
  };
  for (const [k,v] of Object.entries(expected)) if (Number(counts[k]) !== v) throw new Error(`${k} expected ${v}, got ${counts[k]}`);

  const protectedRows = (await pool.query(`
    SELECT
      EXISTS(SELECT 1 FROM taxonomy.external_taxon_reference WHERE resource_id='01a00e58-ce35-7feb-b996-3f36766797b9') AS external_ref,
      EXISTS(SELECT 1 FROM field.location_geometry_version WHERE resource_id='01a00d2a-fdb9-7506-b1f6-e84e172c6ab5') AS geometry,
      EXISTS(SELECT 1 FROM governance.validation_event WHERE resource_id='01a00d10-7d9b-7e10-859e-36f0e6b580c7') AS validation,
      EXISTS(SELECT 1 FROM governance.quality_assessment WHERE resource_id='01a00ce6-7146-7388-99cf-55299f3ab39c') AS quality
  `)).rows[0];
  for (const [k,v] of Object.entries(protectedRows)) if (v !== true) throw new Error(`protected ${k} missing`);

  const status = { counts, protectedRows, POST_REVERSAL_BASELINE_STATE_EXACT:'PASS' };
  fs.mkdirSync(path.join(__dirname,'..','evidence'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'..','evidence','03-1-post-reversal-state.json'),JSON.stringify(status,null,2));
  console.log('POST_REVERSAL_BASELINE_STATE_EXACT=PASS');
  await pool.end();
})().catch(async(err)=>{ console.error(err.stack || err); try{await pool.end();}catch{} process.exit(1); });
