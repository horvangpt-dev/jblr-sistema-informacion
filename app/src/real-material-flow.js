const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const { assertControlledRealEnabled } = require('./controlled-real-common');

const FLOW_MARKER = '04.1 REAL_BOTANICAL_MATERIAL_FLOW';
const SUPPORTED_STAGES = [
  'collection','sample','reception','quarantine','cleaning','drying','conditioning','subsampling','packaging','accession','history'
];

function text(value, field, required=false, max=3000) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  const v = String(value).trim();
  if (!v && required) throw new Error(`${field} is required`);
  if (v.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return v || null;
}
function bool(value) { return value === true; }
function number(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${field} is invalid`); return n;
}
function iso(value, field) {
  if (!value) return null; const d = new Date(value); if (Number.isNaN(d.getTime())) throw new Error(`${field} is invalid`); return d.toISOString();
}

function normalizeFlowInput(input={}) {
  const processing = Array.isArray(input.processing) ? input.processing.map((step,i)=>({
    occurred: bool(step.occurred),
    processType: text(step.processType,`processing[${i}].processType`,bool(step.occurred),200),
    at: iso(step.at,`processing[${i}].at`),
    producesDistinctMaterial: bool(step.producesDistinctMaterial),
    outputSampleKind: text(step.outputSampleKind,`processing[${i}].outputSampleKind`,bool(step.occurred)&&bool(step.producesDistinctMaterial),200),
    outputMaterialState: text(step.outputMaterialState,`processing[${i}].outputMaterialState`,false,200),
    quantityValue: number(step.quantityValue,`processing[${i}].quantityValue`),
    quantityUnit: text(step.quantityUnit,`processing[${i}].quantityUnit`,false,80),
    notes: text(step.notes,`processing[${i}].notes`,false,1500),
  })) : [];
  return {
    mode: text(input.mode,'mode',true,40),
    sourceKey: text(input.sourceKey,'sourceKey',true,160),
    sourceDocumentId: text(input.sourceDocumentId,'sourceDocumentId',true,240),
    sourceDocumentTitle: text(input.sourceDocumentTitle,'sourceDocumentTitle',true,500),
    taxonVerbatim: text(input.taxonVerbatim,'taxonVerbatim',false,300),
    taxonProvisional: bool(input.taxonProvisional),
    locationName: text(input.locationName,'locationName',false,300),
    populationLabel: text(input.populationLabel,'populationLabel',false,300),
    collectionOccurred: bool(input.collectionOccurred),
    collectionAt: iso(input.collectionAt,'collectionAt'),
    collectionMethod: text(input.collectionMethod,'collectionMethod',false,800),
    collectorName: text(input.collectorName,'collectorName',false,300),
    sampleOccurred: bool(input.sampleOccurred),
    sampleKind: text(input.sampleKind,'sampleKind',bool(input.sampleOccurred),200),
    sampleMaterialState: text(input.sampleMaterialState,'sampleMaterialState',false,200),
    quantityValue: number(input.quantityValue,'quantityValue'),
    quantityUnit: text(input.quantityUnit,'quantityUnit',false,80),
    plantsObserved: number(input.plantsObserved,'plantsObserved'),
    plantsSampled: number(input.plantsSampled,'plantsSampled'),
    rawMaterialVerbatim: text(input.rawMaterialVerbatim,'rawMaterialVerbatim',false,300),
    identificationStatus: text(input.identificationStatus,'identificationStatus',false,160),
    reception: input.reception && bool(input.reception.occurred) ? {
      occurred: true, at: iso(input.reception.at,'reception.at'), notes: text(input.reception.notes,'reception.notes',false,1200)
    } : { occurred:false },
    processing,
    accession: input.accession && bool(input.accession.occurred) ? {
      occurred:true, date:text(input.accession.date,'accession.date',false,20), status:text(input.accession.status,'accession.status',false,120),
      materialRole:text(input.accession.materialRole,'accession.materialRole',false,120), notes:text(input.accession.notes,'accession.notes',false,1200)
    } : { occurred:false },
    storage: input.storage || null,
    notes: text(input.notes,'notes',false,2500),
  };
}

function planFlow(input={}) {
  const p = normalizeFlowInput(input);
  if (!['retrospective','new_collection'].includes(p.mode)) throw new Error('mode must be retrospective or new_collection');
  if (p.collectionOccurred && !p.collectionAt) throw new Error('collectionAt is required when collectionOccurred=true');
  if (p.collectionOccurred && !p.populationLabel) throw new Error('populationLabel is required for a documented collection origin');
  if (p.sampleOccurred && !p.sampleKind) throw new Error('sampleKind is required when sampleOccurred=true');
  if (!p.collectionOccurred && !p.sampleOccurred) throw new Error('At least CollectionEvent or Sample must be documented');
  if (p.storage && Object.keys(p.storage).length) {
    throw new Error('MODEL_DEFECT: structured physical storage location is not represented by CORE_PHYSICAL_MODEL_v1; do not encode it as ResourceSet or free-text state');
  }
  const stages=[];
  if (p.collectionOccurred) stages.push('collection');
  if (p.sampleOccurred) stages.push('sample');
  if (p.reception.occurred) stages.push('reception');
  for (const step of p.processing) if (step.occurred) stages.push(step.processType);
  if (p.accession.occurred) stages.push('accession');
  return {
    packetVersion:'04.1-v1', mode:p.mode, sourceKey:p.sourceKey, provisionalTaxon:p.taxonProvisional,
    stages, firstDemonstrableStage:p.collectionOccurred?'CollectionEvent':'Sample',
    prospectionRequired:false, fieldVisitRequired:false,
    storageStructured:false, historyStructured:true,
    normalized:p
  };
}

async function newResource(client,typeCode) {
  return (await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),$1,'unreviewed') RETURNING resource_id,jblr_code`,[typeCode])).rows[0];
}
async function reuseOrCreateAgent(client,name) {
  if (!name) return null;
  const found=(await client.query(`SELECT a.resource_id,r.jblr_code FROM core.agent a JOIN core.resource r ON r.resource_id=a.resource_id WHERE lower(a.display_name)=lower($1) ORDER BY a.resource_id LIMIT 2`,[name])).rows;
  if (found.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact agents');
  if (found[0]) return {...found[0],reused:true};
  const r=await newResource(client,'AGT');
  await client.query(`INSERT INTO core.agent(resource_id,agent_kind,display_name,notes) VALUES($1,'person',$2,$3)`,[r.resource_id,name,`${FLOW_MARKER} · documented collector; identity unreviewed`]);
  return {...r,reused:false};
}
async function reuseOrCreateTaxon(client,p) {
  if (!p.taxonVerbatim) return {name:null,concept:null};
  const names=(await client.query(`SELECT tn.resource_id,r.jblr_code FROM taxonomy.taxonomic_name tn JOIN core.resource r ON r.resource_id=tn.resource_id WHERE lower(tn.scientific_name)=lower($1)`,[p.taxonVerbatim])).rows;
  if (names.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact taxonomic names');
  let name=names[0];
  if (!name) {
    name=await newResource(client,'NAM');
    await client.query(`INSERT INTO taxonomy.taxonomic_name(resource_id,scientific_name,canonical_name,notes) VALUES($1,$2,$2,$3)`,[name.resource_id,p.taxonVerbatim,`${FLOW_MARKER} · verbatim provisional field identification; no automatic taxonomic validation`]);
  }
  const conceptLabel=p.taxonProvisional?`${p.taxonVerbatim} [provisional]`:p.taxonVerbatim;
  const concepts=(await client.query(`SELECT tc.resource_id,r.jblr_code FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id WHERE lower(COALESCE(tc.concept_label,''))=lower($1)`,[conceptLabel])).rows;
  if (concepts.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact taxon concepts');
  let concept=concepts[0];
  if (!concept) {
    concept=await newResource(client,'TXC');
    await client.query(`INSERT INTO taxonomy.taxon_concept(resource_id,concept_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[concept.resource_id,conceptLabel,`${FLOW_MARKER} · provisional=${p.taxonProvisional}; no automatic validation`]);
  }
  return {name,concept};
}
async function reuseOrCreateLocationPopulation(client,p,taxon) {
  if (!p.locationName || !p.populationLabel) return {location:null,population:null,identification:null};
  const locs=(await client.query(`SELECT l.resource_id,r.jblr_code FROM field.location l JOIN core.resource r ON r.resource_id=l.resource_id WHERE lower(l.location_name)=lower($1)`,[p.locationName])).rows;
  if (locs.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact locations');
  let location=locs[0];
  if (!location) {
    location=await newResource(client,'LOC');
    await client.query(`INSERT INTO field.location(resource_id,location_name,verbatim_locality,resolution_status,notes) VALUES($1,$2,$2,'unresolved',$3)`,[location.resource_id,p.locationName,`${FLOW_MARKER} · documentary locality; no geometry written`]);
  }
  const pops=(await client.query(`SELECT p.resource_id,r.jblr_code FROM field.population p JOIN core.resource r ON r.resource_id=p.resource_id WHERE lower(COALESCE(p.population_label,''))=lower($1)`,[p.populationLabel])).rows;
  if (pops.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple exact populations');
  let population=pops[0];
  if (!population) {
    population=await newResource(client,'POP');
    await client.query(`INSERT INTO field.population(resource_id,population_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[population.resource_id,p.populationLabel,`${FLOW_MARKER} · documentary retrospective population`]);
    await client.query(`INSERT INTO field.population_location(population_location_id,population_id,location_id,relation_role,notes) VALUES(uuidv7(),$1,$2,'documented_locality',$3)`,[population.resource_id,location.resource_id,`${FLOW_MARKER} · NEW_04_RELATIONSHIP`]);
  }
  let identification=null;
  if (taxon.concept && taxon.name) {
    const existing=(await client.query(`SELECT i.resource_id,r.jblr_code FROM taxonomy.identification i JOIN core.resource r ON r.resource_id=i.resource_id WHERE i.target_resource_id=$1 AND i.taxon_concept_id=$2 AND i.taxonomic_name_id=$3`,[population.resource_id,taxon.concept.resource_id,taxon.name.resource_id])).rows;
    if (existing.length>1) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: multiple equivalent identifications');
    identification=existing[0];
    if (!identification) {
      identification=await newResource(client,'IDN');
      await client.query(`INSERT INTO taxonomy.identification(resource_id,target_resource_id,taxon_concept_id,taxonomic_name_id,verbatim_identification,resolution_status,is_preferred,notes) VALUES($1,$2,$3,$4,$5,'unresolved',false,$6)`,[identification.resource_id,population.resource_id,taxon.concept.resource_id,taxon.name.resource_id,p.taxonVerbatim,`${FLOW_MARKER} · ${p.identificationStatus||'provisional'}; no automatic validation`]);
    }
  }
  return {location,population,identification};
}
async function addProvenance(client,subjectId,activityId,p) {
  if (!subjectId) return;
  await client.query(`INSERT INTO evidence.provenance_link(provenance_link_id,subject_resource_id,data_activity_id,generation_mode,relation_role,notes) VALUES(uuidv7(),$1,$2,'manual_entry','documented_source',$3)`,[subjectId,activityId,`${FLOW_MARKER} · SOURCE_KEY=${p.sourceKey} · SOURCE_DOCUMENT=${p.sourceDocumentTitle} · SOURCE_ID=${p.sourceDocumentId}`]);
}
async function createFlow(input={}) {
  assertControlledRealEnabled();
  const plan=planFlow(input), p=plan.normalized;
  const client=await pool.connect();
  try {
    await assertAuthorizedStaging(client); await client.query('BEGIN');
    const duplicate=(await client.query(`SELECT ce.resource_id,r.jblr_code FROM field.collection_event ce JOIN core.resource r ON r.resource_id=ce.resource_id WHERE COALESCE(ce.notes,'') LIKE '%' || $1 || '%'`,[`SOURCE_KEY=${p.sourceKey}`])).rows;
    if (duplicate.length) throw new Error('DUPLICATE_SEMANTIC_RESOURCE: sourceKey already has a real CollectionEvent');
    const agent=await reuseOrCreateAgent(client,p.collectorName);
    const taxon=await reuseOrCreateTaxon(client,p);
    const origin=await reuseOrCreateLocationPopulation(client,p,taxon);
    const activity=await newResource(client,'ACT');
    await client.query(`INSERT INTO governance.data_activity(resource_id,activity_type,performed_by_agent_id,process_outcome,notes) VALUES($1,$2,$3,'committed',$4)`,[activity.resource_id,p.mode==='retrospective'?'retrospective_collection_entry':'new_collection_entry',agent&&agent.resource_id,`${FLOW_MARKER} · SOURCE_KEY=${p.sourceKey} · source=${p.sourceDocumentTitle}`]);
    const created={agent,taxon,origin,activity,collection:null,samples:[],processing:[],accession:null};
    let collection=null,currentSample=null;
    if (p.collectionOccurred) {
      collection=await newResource(client,'COL');
      await client.query(`INSERT INTO field.collection_event(resource_id,population_id,collection_at,method_text,notes) VALUES($1,$2,$3,$4,$5)`,[collection.resource_id,origin.population&&origin.population.resource_id,p.collectionAt,p.collectionMethod,`${FLOW_MARKER} · SOURCE_KEY=${p.sourceKey} · raw_material=${p.rawMaterialVerbatim||'NOT_RECORDED'} · plants_observed=${p.plantsObserved??'NOT_RECORDED'} · plants_sampled=${p.plantsSampled??'NOT_RECORDED'} · provisional_taxon=${p.taxonProvisional}`]);
      if (agent) await client.query(`INSERT INTO core.agent_resource_role(agent_resource_role_id,agent_id,resource_id,role_code,notes) VALUES(uuidv7(),$1,$2,'collector',$3)`,[agent.resource_id,collection.resource_id,`${FLOW_MARKER} · documented collector`]);
      created.collection=collection;
    }
    if (p.sampleOccurred) {
      currentSample=await newResource(client,'SMP');
      await client.query(`INSERT INTO material.sample(resource_id,sample_kind,quantity_value,quantity_unit,material_state,notes) VALUES($1,$2,$3,$4,$5,$6)`,[currentSample.resource_id,p.sampleKind,p.quantityValue,p.quantityUnit,p.sampleMaterialState,`${FLOW_MARKER} · SOURCE_KEY=${p.sourceKey} · initial physical sample; quantity unknown remains NULL`]);
      if (collection) await client.query(`INSERT INTO material.sample_origin(sample_origin_id,sample_id,collection_event_id,origin_role,notes) VALUES(uuidv7(),$1,$2,'source_collection',$3)`,[currentSample.resource_id,collection.resource_id,`${FLOW_MARKER} · documentary origin`]);
      created.samples.push(currentSample);
    }
    const steps=[];
    if (p.reception.occurred) steps.push({processType:'garden_reception',at:p.reception.at,producesDistinctMaterial:false,notes:p.reception.notes});
    steps.push(...p.processing.filter(x=>x.occurred));
    for (const step of steps) {
      if (!currentSample) throw new Error('Processing/reception requires an existing Sample');
      const ev=await newResource(client,'PRC');
      await client.query(`INSERT INTO material.processing_event(resource_id,process_type,started_at,ended_at,operator_agent_id,notes) VALUES($1,$2,$3,$3,$4,$5)`,[ev.resource_id,step.processType,step.at,agent&&agent.resource_id,`${FLOW_MARKER} · ${step.notes||''}`]);
      await client.query(`INSERT INTO material.process_input(process_input_id,processing_event_id,sample_id,quantity_value,quantity_unit,ordinal) VALUES(uuidv7(),$1,$2,$3,$4,1)`,[ev.resource_id,currentSample.resource_id,step.quantityValue??null,step.quantityUnit??null]);
      let output=currentSample;
      if (step.producesDistinctMaterial) {
        output=await newResource(client,'SMP');
        await client.query(`INSERT INTO material.sample(resource_id,sample_kind,quantity_value,quantity_unit,material_state,notes) VALUES($1,$2,$3,$4,$5,$6)`,[output.resource_id,step.outputSampleKind,step.quantityValue??null,step.quantityUnit??null,step.outputMaterialState,`${FLOW_MARKER} · physically distinct process output`]);
        created.samples.push(output); currentSample=output;
      }
      await client.query(`INSERT INTO material.process_output(process_output_id,processing_event_id,sample_id,quantity_value,quantity_unit,ordinal) VALUES(uuidv7(),$1,$2,$3,$4,1)`,[ev.resource_id,output.resource_id,step.quantityValue??null,step.quantityUnit??null]);
      created.processing.push(ev);
    }
    if (p.accession.occurred) {
      if (!currentSample) throw new Error('Accession requires an existing Sample');
      const acc=await newResource(client,'ACC');
      await client.query(`INSERT INTO material.accession(resource_id,accession_date,accession_status,curator_agent_id,notes) VALUES($1,$2::date,$3,$4,$5)`,[acc.resource_id,p.accession.date,p.accession.status,agent&&agent.resource_id,`${FLOW_MARKER} · SOURCE_KEY=${p.sourceKey} · ${p.accession.notes||''}`]);
      await client.query(`INSERT INTO material.accession_material(accession_material_id,accession_id,sample_id,material_role,quantity_value,quantity_unit,notes) VALUES(uuidv7(),$1,$2,$3,$4,$5,$6)`,[acc.resource_id,currentSample.resource_id,p.accession.materialRole||'source_material',p.quantityValue,p.quantityUnit,`${FLOW_MARKER} · Sample != Accession`]);
      created.accession=acc;
    }
    const subjects=[agent&&agent.resource_id,taxon.name&&taxon.name.resource_id,taxon.concept&&taxon.concept.resource_id,origin.location&&origin.location.resource_id,origin.population&&origin.population.resource_id,origin.identification&&origin.identification.resource_id,collection&&collection.resource_id,...created.samples.map(x=>x.resource_id),...created.processing.map(x=>x.resource_id),created.accession&&created.accession.resource_id].filter(Boolean);
    for (const id of subjects) await addProvenance(client,id,activity.resource_id,p);
    await client.query('COMMIT');
    return {flow:plan,created};
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function recordRevision(targetResourceId,{changedByAgentId=null,reason=null,changes=[]}={}) {
  assertControlledRealEnabled(); const client=await pool.connect();
  try { await assertAuthorizedStaging(client); await client.query('BEGIN');
    const exists=(await client.query('SELECT 1 FROM core.resource WHERE resource_id=$1',[targetResourceId])).rows[0]; if(!exists) throw new Error('target resource not found');
    const n=(await client.query('SELECT COALESCE(max(revision_no),0)+1 AS n FROM governance.record_revision WHERE target_resource_id=$1',[targetResourceId])).rows[0].n;
    const rev=await newResource(client,'REV');
    await client.query(`INSERT INTO governance.record_revision(resource_id,target_resource_id,revision_no,changed_at,changed_by_agent_id,operation,reason) VALUES($1,$2,$3,now(),$4,'update',$5)`,[rev.resource_id,targetResourceId,n,changedByAgentId,reason]);
    for (const c of changes) await client.query(`INSERT INTO governance.revision_change(revision_change_id,record_revision_id,field_path,old_value,new_value,change_kind,sensitive_value) VALUES(uuidv7(),$1,$2,$3::jsonb,$4::jsonb,$5,$6)`,[rev.resource_id,text(c.fieldPath,'fieldPath',true,300),JSON.stringify(c.oldValue??null),JSON.stringify(c.newValue??null),text(c.changeKind,'changeKind',false,60)||'replace',bool(c.sensitiveValue)]);
    await client.query('COMMIT'); return {revisionId:rev.resource_id,revisionNo:Number(n)};
  } catch(err){await client.query('ROLLBACK');throw err;} finally{client.release();}
}

module.exports={FLOW_MARKER,SUPPORTED_STAGES,normalizeFlowInput,planFlow,createFlow,recordRevision};
