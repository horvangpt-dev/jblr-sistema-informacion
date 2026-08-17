const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const { assertControlledRealEnabled } = require('./controlled-real-common');

const PACKET_ID = 'PILOT_DATA_PACKET_01';
const PILOT_MARKER = '03.1-B PILOT_DATA_PACKET_01';
const VERBATIM_TAXON_NAME = 'Artemisia herba-alba';
const VERBATIM_LOCATION_LABEL = 'El Campillo';
const SOURCE_SEMANTIC = 'OPERADOR_JBLR / REGISTRO_OPERATIVO_REAL';
const POPULATION_LABEL = 'Artemisia herba-alba · El Campillo';
const PROTECTED_IDS = [
  '01a00e58-ce35-7feb-b996-3f36766797b9',
  '01a00d2a-fdb9-7506-b1f6-e84e172c6ab5',
  '01a00d10-7d9b-7e10-859e-36f0e6b580c7',
  '01a00ce6-7146-7388-99cf-55299f3ab39c',
];

function normalizePacket(input = {}) {
  const allowed = ['packetId','verbatimTaxonName','verbatimLocationLabel','sourceSemantic'];
  const keys = Object.keys(input).sort();
  if (JSON.stringify(keys) !== JSON.stringify(allowed.slice().sort())) throw new Error('REAL_PILOT_PACKET_EXACT=FAIL: exact four-field packet required');
  if (input.packetId !== PACKET_ID) throw new Error('REAL_PILOT_PACKET_EXACT=FAIL: packetId');
  if (input.verbatimTaxonName !== VERBATIM_TAXON_NAME) throw new Error('REAL_PILOT_PACKET_EXACT=FAIL: verbatimTaxonName');
  if (input.verbatimLocationLabel !== VERBATIM_LOCATION_LABEL) throw new Error('REAL_PILOT_PACKET_EXACT=FAIL: verbatimLocationLabel');
  if (input.sourceSemantic !== SOURCE_SEMANTIC) throw new Error('REAL_PILOT_PACKET_EXACT=FAIL: sourceSemantic');
  return { ...input };
}

async function tableCount(client, qualifiedName) {
  return (await client.query(`SELECT count(*)::int AS n FROM ${qualifiedName}`)).rows[0].n;
}

async function criticalCounts(client) {
  const names = [
    ['taxonomicName','taxonomy.taxonomic_name'], ['taxonConcept','taxonomy.taxon_concept'],
    ['location','field.location'], ['locationGeometryVersion','field.location_geometry_version'],
    ['population','field.population'], ['populationLocation','field.population_location'],
    ['identification','taxonomy.identification'], ['dataActivity','governance.data_activity'],
    ['provenanceLink','evidence.provenance_link'], ['collectionEvent','field.collection_event'],
    ['fieldVisit','field.field_visit'], ['prospection','field.prospection'], ['observation','field.observation'],
    ['census','field.census'], ['individual','field.individual'], ['sample','material.sample'],
    ['processingEvent','material.processing_event'], ['processInput','material.process_input'],
    ['processOutput','material.process_output'], ['accession','material.accession'],
    ['accessionMaterial','material.accession_material'], ['registry','core.jblr_code_registry'],
    ['coreResource','core.resource'],
  ];
  const out = {};
  for (const [key,table] of names) out[key] = await tableCount(client,table);
  return out;
}

async function protectedSnapshot(client) {
  const { rows } = await client.query(`
    SELECT r.resource_id,r.resource_type_code,r.jblr_code,r.validation_status,r.currency_status,r.row_version,r.created_at,r.updated_at
    FROM core.resource r WHERE r.resource_id=ANY($1::uuid[]) ORDER BY r.resource_id
  `,[PROTECTED_IDS]);
  return rows;
}

async function hashQuery(client, sql, params=[]) {
  return (await client.query(sql,params)).rows[0];
}

async function historicalTouchedSnapshot(client, manifest, excludeCodes=[]) {
  const ids = manifest.planned.resourceIds;
  const plId = manifest.planned.populationLocationId;
  const prov = manifest.planned.provenanceLinkIds;
  return {
    coreResource: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM core.resource t WHERE NOT (t.resource_id=ANY($1::uuid[]))`,[ids]),
    taxonomicName: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM taxonomy.taxonomic_name t WHERE t.resource_id<>$1`,[manifest.planned.taxonomicNameId]),
    taxonConcept: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM taxonomy.taxon_concept t WHERE t.resource_id<>$1`,[manifest.planned.taxonConceptId]),
    location: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM field.location t WHERE t.resource_id<>$1`,[manifest.planned.locationId]),
    population: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM field.population t WHERE t.resource_id<>$1`,[manifest.planned.populationId]),
    populationLocation: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.population_location_id),'')) AS hash FROM field.population_location t WHERE t.population_location_id<>$1`,[plId]),
    identification: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM taxonomy.identification t WHERE t.resource_id<>$1`,[manifest.planned.identificationId]),
    dataActivity: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM governance.data_activity t WHERE t.resource_id<>$1`,[manifest.planned.dataActivityId]),
    provenanceLink: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.provenance_link_id),'')) AS hash FROM evidence.provenance_link t WHERE NOT (t.provenance_link_id=ANY($1::uuid[]))`,[prov]),
    registry: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.jblr_code),'')) AS hash FROM core.jblr_code_registry t WHERE NOT (t.jblr_code=ANY($1::text[]))`,[excludeCodes]),
    geometry: await hashQuery(client,`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY t.resource_id),'')) AS hash FROM field.location_geometry_version t`),
  };
}

async function newUuid(client) {
  return (await client.query('SELECT uuidv7() AS id')).rows[0].id;
}

async function preflightDuplicates(client) {
  const name = (await client.query(`SELECT tn.*,r.jblr_code,r.validation_status FROM taxonomy.taxonomic_name tn JOIN core.resource r ON r.resource_id=tn.resource_id WHERE lower(tn.scientific_name)=lower($1)`,[VERBATIM_TAXON_NAME])).rows;
  if (name.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact taxonomic names');
  const location = (await client.query(`SELECT l.*,r.jblr_code,r.validation_status,(SELECT count(*)::int FROM field.location_geometry_version g WHERE g.location_id=l.resource_id) AS geometry_count FROM field.location l JOIN core.resource r ON r.resource_id=l.resource_id WHERE lower(l.location_name)=lower($1) OR lower(COALESCE(l.verbatim_locality,''))=lower($1)`,[VERBATIM_LOCATION_LABEL])).rows;
  if (location.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact locations');
  if (location[0] && Number(location[0].geometry_count)>0) throw new Error('AUTOMATIC_VALIDATION_RISK: matching location already has geometry; do not reuse in no-coordinate pilot');
  const concept = (await client.query(`SELECT tc.*,r.jblr_code,r.validation_status FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id WHERE lower(COALESCE(tc.concept_label,''))=lower($1)`,[VERBATIM_TAXON_NAME])).rows;
  if (concept.some((x)=>!(x.notes||'').includes(PILOT_MARKER))) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: pre-existing concept label cannot be silently equated to supplied name');
  const population = (await client.query(`SELECT p.resource_id,p.notes FROM field.population p WHERE lower(COALESCE(p.population_label,''))=lower($1) OR COALESCE(p.notes,'') LIKE '%' || $2 || '%'`,[POPULATION_LABEL,PILOT_MARKER])).rows;
  if (population.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple pilot-equivalent populations');
  return { name:name[0]||null, location:location[0]||null, concept:concept[0]||null, population:population[0]||null };
}

async function createResource(client,id,typeCode) {
  return (await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES($1,$2,'unreviewed') RETURNING resource_id,jblr_code,validation_status`,[id,typeCode])).rows[0];
}

async function verifyPersistentPilot(manifest, clientOverride=null) {
  assertControlledRealEnabled();
  const client = clientOverride || await pool.connect();
  const own = !clientOverride;
  try {
    await assertAuthorizedStaging(client);
    const p = manifest.planned;
    const name = (await client.query(`SELECT tn.*,r.jblr_code,r.validation_status FROM taxonomy.taxonomic_name tn JOIN core.resource r ON r.resource_id=tn.resource_id WHERE tn.resource_id=$1`,[p.taxonomicNameId])).rows[0];
    const concept = (await client.query(`SELECT tc.*,r.jblr_code,r.validation_status FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id WHERE tc.resource_id=$1`,[p.taxonConceptId])).rows[0];
    const location = (await client.query(`SELECT l.*,r.jblr_code,r.validation_status FROM field.location l JOIN core.resource r ON r.resource_id=l.resource_id WHERE l.resource_id=$1`,[p.locationId])).rows[0];
    const population = (await client.query(`SELECT p.*,r.jblr_code,r.validation_status FROM field.population p JOIN core.resource r ON r.resource_id=p.resource_id WHERE p.resource_id=$1`,[p.populationId])).rows[0];
    const relation = (await client.query(`SELECT * FROM field.population_location WHERE population_location_id=$1 AND population_id=$2 AND location_id=$3`,[p.populationLocationId,p.populationId,p.locationId])).rows[0];
    const identification = (await client.query(`SELECT i.*,r.jblr_code,r.validation_status FROM taxonomy.identification i JOIN core.resource r ON r.resource_id=i.resource_id WHERE i.resource_id=$1 AND i.target_resource_id=$2`,[p.identificationId,p.populationId])).rows[0];
    const activity = (await client.query(`SELECT a.*,r.jblr_code,r.validation_status FROM governance.data_activity a JOIN core.resource r ON r.resource_id=a.resource_id WHERE a.resource_id=$1`,[p.dataActivityId])).rows[0];
    const geometryCount = (await client.query(`SELECT count(*)::int AS n FROM field.location_geometry_version WHERE location_id=$1`,[p.locationId])).rows[0].n;
    const provenanceCount = (await client.query(`SELECT count(*)::int AS n FROM evidence.provenance_link WHERE provenance_link_id=ANY($1::uuid[]) AND data_activity_id=$2`,[p.provenanceLinkIds,p.dataActivityId])).rows[0].n;
    const identities = (await client.query(`SELECT r.resource_id,r.resource_type_code,r.jblr_code,rt.requires_jblr_code,rt.code_prefix,reg.first_resource_id AS registry_resource FROM core.resource r JOIN core.resource_type rt ON rt.resource_type_code=r.resource_type_code LEFT JOIN core.jblr_code_registry reg ON reg.jblr_code=r.jblr_code WHERE r.resource_id=ANY($1::uuid[]) ORDER BY r.resource_id`,[p.resourceIds])).rows;
    const sequenceAfter = (await client.query('SELECT last_value,is_called FROM core.jblr_code_sequence')).rows[0];
    const afterCounts = await criticalCounts(client);
    const protectedAfter = await protectedSnapshot(client);
    const historicalAfter = await historicalTouchedSnapshot(client,manifest,manifest.jblrCodes||[]);
    const requiredCreated = identities.filter((x)=>x.requires_jblr_code===true).length;
    const beforeSeq = Number(manifest.sequenceBefore.last_value);
    const afterSeq = Number(sequenceAfter.last_value);
    const unauthorizedKeys = ['collectionEvent','fieldVisit','prospection','observation','census','individual','sample','processingEvent','processInput','processOutput','accession','accessionMaterial'];
    const unauthorizedStable = unauthorizedKeys.every((k)=>afterCounts[k]===manifest.beforeCounts[k]);
    const historicalStable = JSON.stringify(historicalAfter)===JSON.stringify(manifest.historicalBefore);
    const protectedStable = JSON.stringify(protectedAfter)===JSON.stringify(manifest.protectedBefore);
    const identityOk = identities.length===p.resourceIds.length && identities.every((x)=>x.requires_jblr_code ? (typeof x.jblr_code==='string' && x.jblr_code.startsWith(`JBLR-${x.code_prefix}-`) && x.registry_resource===x.resource_id) : (x.jblr_code===null && x.registry_resource===null));
    const exactFields = !!name && !!concept && !!location && !!population && !!relation && !!identification && !!activity
      && name.scientific_name===VERBATIM_TAXON_NAME && name.canonical_name===VERBATIM_TAXON_NAME && name.authorship===null
      && name.genus==='Artemisia' && name.specific_epithet==='herba-alba' && name.rank_term_key===null
      && concept.concept_label===VERBATIM_TAXON_NAME && concept.resolution_status==='unresolved' && concept.rank_term_key===null && concept.according_to_resource_id===null
      && location.location_name===VERBATIM_LOCATION_LABEL && location.verbatim_locality===VERBATIM_LOCATION_LABEL && location.location_kind===null && location.parent_location_id===null && location.geographic_area_id===null && location.resolution_status==='unresolved'
      && population.population_label===POPULATION_LABEL && population.resolution_status==='unresolved' && population.valid_from===null && population.valid_to===null
      && relation.relation_role===null && relation.confidence===null && relation.valid_from===null && relation.valid_to===null
      && identification.taxon_concept_id===p.taxonConceptId && identification.taxonomic_name_id===p.taxonomicNameId && identification.verbatim_identification===VERBATIM_TAXON_NAME
      && identification.identified_by_agent_id===null && identification.identified_at===null && identification.method_text===null && identification.confidence===null && identification.qualifier===null && identification.resolution_status==='unresolved' && identification.is_preferred===false
      && activity.performed_by_agent_id===null && activity.activity_type==='persistent_real_pilot_entry';
    const checks = {
      REAL_PILOT_PACKET_EXACT: manifest.packet.packetId===PACKET_ID && manifest.packet.verbatimTaxonName===VERBATIM_TAXON_NAME && manifest.packet.verbatimLocationLabel===VERBATIM_LOCATION_LABEL && manifest.packet.sourceSemantic===SOURCE_SEMANTIC,
      NO_UNAUTHORIZED_FIELDS: exactFields && unauthorizedStable,
      NO_SILENT_INFERENCE: exactFields,
      NO_AUTOMATIC_TAXONOMIC_VALIDATION: name.validation_status==='unreviewed' && concept.validation_status==='unreviewed' && identification.validation_status==='unreviewed' && concept.resolution_status==='unresolved' && identification.resolution_status==='unresolved',
      TAXON_NAME_TRACEABLE: identification.taxonomic_name_id===p.taxonomicNameId && identification.verbatim_identification===VERBATIM_TAXON_NAME,
      LOCATION_TRACEABLE: location.location_name===VERBATIM_LOCATION_LABEL && location.verbatim_locality===VERBATIM_LOCATION_LABEL,
      POPULATION_TRACEABLE: population.population_label===POPULATION_LABEL,
      POPULATION_TO_LOCATION: !!relation,
      POPULATION_TO_TAXON_CONCEPT: identification.taxon_concept_id===p.taxonConceptId,
      NO_GEOMETRY_CREATED: geometryCount===0 && afterCounts.locationGeometryVersion===manifest.beforeCounts.locationGeometryVersion,
      NO_COORDINATES_WRITTEN: geometryCount===0,
      NO_COLLECTION_DATA_CREATED: unauthorizedStable,
      RESOURCE_IDENTITY_POLICY: identityOk,
      PERSISTENT_CANONICAL_JBLR_CODES: identityOk && identities.filter((x)=>x.requires_jblr_code).every((x)=>manifest.jblrCodes.includes(x.jblr_code)),
      UNEXPLAINED_SEQUENCE_DRIFT: afterSeq-beforeSeq===requiredCreated,
      REAL_PILOT_MANIFEST_COMPLETE: p.resourceIds.length===6 && p.provenanceLinkIds.length===5 && (manifest.jblrCodes||[]).length===5,
      ACCEPTED_HISTORICAL_RESOURCES_CHANGED: historicalStable && protectedStable,
      PROVENANCE_TRACEABLE: provenanceCount===5 && activity.notes.includes(SOURCE_SEMANTIC),
    };
    return { checks, sequenceAfter, afterCounts, protectedAfter, historicalAfter, identities, geometryCount, provenanceCount };
  } finally {
    if (own) client.release();
  }
}

async function rollbackPersistentPilot(manifest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const p=manifest.planned;
    await client.query('DELETE FROM evidence.provenance_link WHERE provenance_link_id=ANY($1::uuid[])',[p.provenanceLinkIds]);
    await client.query('DELETE FROM taxonomy.identification WHERE resource_id=$1',[p.identificationId]);
    await client.query('DELETE FROM field.population_location WHERE population_location_id=$1',[p.populationLocationId]);
    await client.query('DELETE FROM field.population WHERE resource_id=$1',[p.populationId]);
    await client.query('DELETE FROM field.location WHERE resource_id=$1',[p.locationId]);
    await client.query('DELETE FROM taxonomy.taxon_concept WHERE resource_id=$1',[p.taxonConceptId]);
    await client.query('DELETE FROM taxonomy.taxonomic_name WHERE resource_id=$1',[p.taxonomicNameId]);
    await client.query('DELETE FROM governance.data_activity WHERE resource_id=$1',[p.dataActivityId]);
    await client.query('DELETE FROM core.resource WHERE resource_id=ANY($1::uuid[])',[p.resourceIds]);
    await client.query('DELETE FROM core.jblr_code_registry WHERE jblr_code=ANY($1::text[])',[manifest.jblrCodes||[]]);
    await client.query('COMMIT');
    return { rolledBack:true };
  } catch(err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

async function createPersistentRealPilot(input={}) {
  assertControlledRealEnabled();
  const packet=normalizePacket(input);
  const client=await pool.connect();
  let manifest;
  let committed=false;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['JBLR:03.1-B:PILOT_DATA_PACKET_01']);
    const duplicates=await preflightDuplicates(client);
    if (duplicates.population) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: pilot population already exists; refuse a second write');
    const sequenceBefore=(await client.query('SELECT last_value,is_called FROM core.jblr_code_sequence')).rows[0];
    const beforeCounts=await criticalCounts(client);
    const protectedBefore=await protectedSnapshot(client);
    if (protectedBefore.length!==PROTECTED_IDS.length) throw new Error('UNEXPLAINED_BASELINE_DRIFT: protected historical resource missing');

    const planned={
      dataActivityId:await newUuid(client), taxonomicNameId:duplicates.name?duplicates.name.resource_id:await newUuid(client),
      taxonConceptId:duplicates.concept?duplicates.concept.resource_id:await newUuid(client), locationId:duplicates.location?duplicates.location.resource_id:await newUuid(client),
      populationId:await newUuid(client), identificationId:await newUuid(client), populationLocationId:await newUuid(client),
      provenanceLinkIds:[await newUuid(client),await newUuid(client),await newUuid(client),await newUuid(client),await newUuid(client)],
    };
    planned.resourceIds=[planned.dataActivityId];
    if(!duplicates.name) planned.resourceIds.push(planned.taxonomicNameId);
    if(!duplicates.concept) planned.resourceIds.push(planned.taxonConceptId);
    if(!duplicates.location) planned.resourceIds.push(planned.locationId);
    planned.resourceIds.push(planned.populationId,planned.identificationId);
    manifest={version:'03.1-B',marker:PILOT_MARKER,packet,sequenceBefore,beforeCounts,protectedBefore,planned,reused:{taxonomicName:duplicates.name?duplicates.name.resource_id:null,taxonConcept:duplicates.concept?duplicates.concept.resource_id:null,location:duplicates.location?duplicates.location.resource_id:null},newResources:[],jblrCodes:[]};
    manifest.historicalBefore=await historicalTouchedSnapshot(client,manifest,[]);

    const act=await createResource(client,planned.dataActivityId,'ACT'); manifest.newResources.push({key:'dataActivity',resourceId:act.resource_id,resourceTypeCode:'ACT',jblrCode:act.jblr_code});
    await client.query(`INSERT INTO governance.data_activity(resource_id,activity_type,started_at,ended_at,software_name,software_version,code_commit,parameters,process_outcome,notes) VALUES($1,'persistent_real_pilot_entry',current_timestamp,current_timestamp,'JBLR','03.1-B',$2,$3::jsonb,'committed',$4)`,[planned.dataActivityId,process.env.GITHUB_SHA||null,JSON.stringify(packet),`${PILOT_MARKER} · ${SOURCE_SEMANTIC} · technical data-entry provenance; no scientific validation`]);

    if(!duplicates.name){ const r=await createResource(client,planned.taxonomicNameId,'NAM'); manifest.newResources.push({key:'taxonomicName',resourceId:r.resource_id,resourceTypeCode:'NAM',jblrCode:r.jblr_code}); await client.query(`INSERT INTO taxonomy.taxonomic_name(resource_id,scientific_name,canonical_name,authorship,genus,specific_epithet,notes) VALUES($1,$2,$2,NULL,'Artemisia','herba-alba',$3)`,[planned.taxonomicNameId,VERBATIM_TAXON_NAME,`${PILOT_MARKER} · VERBATIM_TAXON_NAME; canonical/genus/epithet are structural parsing only; not validated`]); }
    if(!duplicates.concept){ const r=await createResource(client,planned.taxonConceptId,'TXC'); manifest.newResources.push({key:'taxonConcept',resourceId:r.resource_id,resourceTypeCode:'TXC',jblrCode:r.jblr_code}); await client.query(`INSERT INTO taxonomy.taxon_concept(resource_id,concept_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[planned.taxonConceptId,VERBATIM_TAXON_NAME,`${PILOT_MARKER} · operational unresolved concept; scientific name is not validated identity`]); }
    if(!duplicates.location){ const r=await createResource(client,planned.locationId,'LOC'); manifest.newResources.push({key:'location',resourceId:r.resource_id,resourceTypeCode:'LOC',jblrCode:r.jblr_code}); await client.query(`INSERT INTO field.location(resource_id,location_name,verbatim_locality,resolution_status,notes) VALUES($1,$2,$2,'unresolved',$3)`,[planned.locationId,VERBATIM_LOCATION_LABEL,`${PILOT_MARKER} · VERBATIM_LOCATION_LABEL only; no coordinates, geometry, altitude, municipality or derived spatial data`]); }
    const pop=await createResource(client,planned.populationId,'POP'); manifest.newResources.push({key:'population',resourceId:pop.resource_id,resourceTypeCode:'POP',jblrCode:pop.jblr_code});
    await client.query(`INSERT INTO field.population(resource_id,population_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[planned.populationId,POPULATION_LABEL,`${PILOT_MARKER} · real operational population record; unknown fields intentionally left NULL`]);
    await client.query(`INSERT INTO field.population_location(population_location_id,population_id,location_id,notes) VALUES($1,$2,$3,$4)`,[planned.populationLocationId,planned.populationId,planned.locationId,`${PILOT_MARKER} · exact packet relation; no spatial precision asserted`]);
    const idn=await createResource(client,planned.identificationId,'IDN'); manifest.newResources.push({key:'identification',resourceId:idn.resource_id,resourceTypeCode:'IDN',jblrCode:idn.jblr_code});
    await client.query(`INSERT INTO taxonomy.identification(resource_id,target_resource_id,taxon_concept_id,taxonomic_name_id,verbatim_identification,resolution_status,is_preferred,notes) VALUES($1,$2,$3,$4,$5,'unresolved',false,$6)`,[planned.identificationId,planned.populationId,planned.taxonConceptId,planned.taxonomicNameId,VERBATIM_TAXON_NAME,`${PILOT_MARKER} · operational association only; no automatic taxonomic validation`]);

    const subjects=[planned.taxonomicNameId,planned.taxonConceptId,planned.locationId,planned.populationId,planned.identificationId];
    for(let i=0;i<subjects.length;i+=1) await client.query(`INSERT INTO evidence.provenance_link(provenance_link_id,subject_resource_id,data_activity_id,generation_mode,relation_role,notes) VALUES($1,$2,$3,'manual_entry','operational_source',$4)`,[planned.provenanceLinkIds[i],subjects[i],planned.dataActivityId,`${PILOT_MARKER} · ${SOURCE_SEMANTIC}`]);

    manifest.jblrCodes=manifest.newResources.filter((x)=>x.jblrCode).map((x)=>x.jblrCode);
    await client.query('COMMIT'); committed=true;
  } catch(err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally { client.release(); }

  if(!committed) throw new Error('REAL_DATA_COMMITTED=FAIL');
  try {
    const verified=await verifyPersistentPilot(manifest);
    if(!Object.values(verified.checks).every((v)=>v===true)) throw new Error(`Persistent pilot verification failed: ${JSON.stringify(verified.checks)}`);
    return { manifest, ...verified };
  } catch(err) {
    try { await rollbackPersistentPilot(manifest); } catch(rollbackErr) { throw new Error(`ROLLBACK_FAILURE after post-commit verification error: ${rollbackErr.message}; original=${err.message}`); }
    throw err;
  }
}

module.exports={PACKET_ID,PILOT_MARKER,VERBATIM_TAXON_NAME,VERBATIM_LOCATION_LABEL,SOURCE_SEMANTIC,normalizePacket,createPersistentRealPilot,verifyPersistentPilot,rollbackPersistentPilot,criticalCounts};
