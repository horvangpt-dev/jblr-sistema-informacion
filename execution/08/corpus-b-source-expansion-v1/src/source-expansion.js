const crypto = require('node:crypto');

const MODE = 'CORPUS_B_SOURCE_EXPANSION_337_CONTROLLED_QA';

const RELATION_CLASSES = new Set([
  'ACCEPTED_NAME_OF',
  'SYNONYM_OF',
  'BASIONYM_OF',
  'HOMOTYPIC_SYNONYM_OF',
  'HETEROTYPIC_SYNONYM_OF',
  'NOMENCLATURAL_COMBINATION_OF',
  'INFRASPECIFIC_RELATION',
  'PARENT_OF',
  'CHILD_OF',
  'HYBRID_RELATION',
  'MISAPPLIED_NAME',
  'ORTHOGRAPHIC_VARIANT_OF',
  'OTHER_DOCUMENTED_RELATION',
  'UNKNOWN_RELATION',
]);

const SOURCE_PRIORITY = Object.freeze([
  'MITECO_EIDOS',
  'FLORA_IBERICA_RJB',
  'ANTHOS_RJB',
  'FLORA_MONTIBERICA',
  'FLORA_ANDALUCIA',
  'HVMO_UIB',
  'ATLAS_FLORA_ARAGON_JACA',
  'FLORA_CATALANA',
  'REGIONAL_SPANISH_SOURCES',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function createContext({runId, initialCache = []} = {}) {
  if (!runId) throw new Error('RUN_ID_REQUIRED');
  if (initialCache.length) {
    const e = new Error('PRIOR_CACHE_READ_PROHIBITED');
    e.code = 'CONTAMINATED_INPUT';
    throw e;
  }
  return {
    runId,
    mode: MODE,
    cache: new Map(),
    queryLedger: [],
    independence: {
      CORPUS_A_ROWS_READ_FOR_DISCOVERY: 0,
      RC2_ROWS_READ_FOR_DISCOVERY: 0,
      HISTORICAL_TAXON_ROWS_READ_FOR_DISCOVERY: 0,
      PRIOR_SEARCH_RESULT_ROWS_IMPORTED: 0,
      PRIOR_STATIC_MITECO_LIST_ROWS_IMPORTED: 0,
      PRIOR_LOOKUP_CACHE_HITS: 0,
      PRIOR_SYNONYM_LEDGER_ROWS_IMPORTED: 0,
      CROSS_WITH_A_PERFORMED: false,
      CROSSWALK_MODULE_EXECUTED: false,
      NEON_WRITES: 0,
      CACHE_INITIAL_STATE: 'EMPTY',
    },
  };
}

function assertNoDeniedDiscoveryRead(resourceLabel) {
  const s = String(resourceLabel || '');
  const denied = [
    /corpus[-_ ]?a/i, /rc2/i, /2210/i, /2742|v8|v10|b-v2/i,
    /prior.*search|historical.*taxon/i, /static.*miteco|miteco.*static/i,
    /prior.*cache|historical.*cache/i, /synonym.*ledger|ledger.*synonym/i,
    /crosswalk/i, /stime00/i,
  ];
  if (denied.some(r => r.test(s))) {
    const e = new Error(`CONTAMINATED_INPUT:${s}`);
    e.code = 'CONTAMINATED_INPUT';
    throw e;
  }
  return true;
}

function preserveNameVerbatim(name) {
  if (typeof name !== 'string' || name.length === 0) throw new Error('NAME_REQUIRED');
  return name;
}

function createNameNetwork(originalName, currentRunEvidence = []) {
  const original = preserveNameVerbatim(originalName);
  const names = new Map([[original, {
    name: original,
    relation: 'ORIGINAL_RIOJA_NAME',
    source: 'CORPUS_B_CURRENT_RUN',
    evidencePointer: 'CURRENT_COLD_START_RUN',
  }]]);
  for (const ev of currentRunEvidence) {
    addEvidenceName({originalName: original, names}, ev, {requireFresh: false, allowCurrentRunEvidence: true});
  }
  return {originalName: original, names};
}

function validateRelationEvidence(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (!ev.name || !ev.relation || !ev.evidencePointer || !ev.source) return false;
  if (!RELATION_CLASSES.has(ev.relation)) return false;
  return true;
}

function addEvidenceName(network, ev, {requireFresh = true, allowCurrentRunEvidence = false} = {}) {
  if (!validateRelationEvidence(ev)) return false;
  if (requireFresh && ev.fresh !== true) return false;
  if (!requireFresh && !allowCurrentRunEvidence && ev.fresh !== true) return false;
  const name = preserveNameVerbatim(ev.name);
  if (network.names.has(name)) return false;
  network.names.set(name, {
    name,
    relation: ev.relation,
    source: ev.source,
    evidencePointer: ev.evidencePointer,
    fresh: ev.fresh === true,
    rank: ev.rank ?? null,
  });
  return true;
}

function normalizeAccessResult(result) {
  if (!result) return {state: 'SOURCE_UNAVAILABLE'};
  if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED', 'TECHNICALLY_UNAVAILABLE'].includes(result.state)) {
    return {...result};
  }
  return result;
}

function normalizeSourceResult(sourceId, queryName, result) {
  const r = normalizeAccessResult(result);
  if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED', 'TECHNICALLY_UNAVAILABLE'].includes(r.state)) {
    return {
      sourceId,
      queryName,
      state: r.state,
      relations: [],
      matches: [],
      evidencePointer: r.evidencePointer ?? null,
      accessDetail: r.accessDetail ?? null,
    };
  }
  return {
    sourceId,
    queryName,
    state: r.state || 'OK',
    relations: Array.isArray(r.relations) ? r.relations : [],
    matches: Array.isArray(r.matches) ? r.matches : [],
    evidencePointer: r.evidencePointer ?? null,
    accessDetail: r.accessDetail ?? null,
  };
}

function recordQuery(context, {sourceId, queryName, response}) {
  const entry = {
    RUN_ID: context.runId,
    QUERY_SEQUENCE: context.queryLedger.length + 1,
    SOURCE_NAME: sourceId,
    QUERY_NAME: preserveNameVerbatim(queryName),
    ACCESS_STATE: response.state,
    EVIDENCE_POINTER: response.evidencePointer ?? null,
    RETURNED_NAMES: response.relations.map(x => x.name).filter(Boolean),
    RETURNED_IDS: response.matches.map(x => x.idTaxon).filter(Boolean).map(String),
    DECISION_STATE: response.state,
  };
  context.queryLedger.push(entry);
  return entry;
}

function candidateEvidenceFromResponse(sourceId, response) {
  const out = [];
  for (const rel of response.relations || []) {
    if (!rel || !rel.name || !rel.relation || !rel.evidencePointer) continue;
    out.push({
      name: preserveNameVerbatim(rel.name),
      relation: rel.relation,
      evidencePointer: rel.evidencePointer,
      source: sourceId,
      rank: rel.rank ?? null,
      fresh: true,
    });
  }
  return out;
}

function classifyMitecoMatches(matches, {requiredRank} = {}) {
  const valid = (matches || []).filter(m => m && m.idTaxon != null);
  const exact = valid.filter(m => m.sameConcept === true && (!requiredRank || m.rank === requiredRank));
  const ids = [...new Set(exact.map(m => String(m.idTaxon)))];
  if (ids.length > 1) return {state:'AMBIGUOUS_MULTIPLE_IDS', ids, idTaxon:null};
  if (ids.length === 1) return {state:'RESOLVED_EXACT_OR_DOCUMENTED_ALIAS', idTaxon:ids[0]};
  const parent = valid.find(m => m.parentOnly === true);
  if (parent) return {state:'PARENT_ONLY', idTaxon:null, parentReferenceId:String(parent.idTaxon)};
  return {state:'UNRESOLVED_CURRENT_SOURCE_PLAN', idTaxon:null};
}

function makeSourceAdapters({transports = {}, inventory = {}} = {}) {
  const adapters = {};
  for (const sourceId of SOURCE_PRIORITY) {
    adapters[sourceId] = {
      sourceId,
      descriptor: inventory[sourceId] || {ACCESS_STATE:'UNASSESSED'},
      async query(name, context) {
        preserveNameVerbatim(name);
        const transport = transports[sourceId];
        let raw;
        if (!transport) {
          raw = {state: this.descriptor.ADAPTER_STATE === 'TECHNICALLY_UNAVAILABLE' ? 'TECHNICALLY_UNAVAILABLE' : 'SOURCE_UNAVAILABLE', accessDetail:'NO_RUNTIME_TRANSPORT_BOUND'};
        } else {
          try {
            raw = await transport(name, {sourceId, context});
          } catch (err) {
            raw = {state:'ACCESS_FAILED', accessDetail:String(err && err.message || err)};
          }
        }
        const response = normalizeSourceResult(sourceId, name, raw);
        recordQuery(context, {sourceId, queryName:name, response});
        return response;
      },
    };
  }
  return adapters;
}

async function expandOneRecord({originalName, requiredRank = null, currentRunEvidence = [], context, adapters, maxCycles = 50} = {}) {
  if (!context || context.mode !== MODE) throw new Error('SOURCE_EXPANSION_CONTEXT_REQUIRED');
  const network = createNameNetwork(originalName, currentRunEvidence);
  const queried = new Map(SOURCE_PRIORITY.map(s => [s, new Set()]));
  let cycle = 0;
  let changed = true;
  const sourceStates = {};
  let latestMitecoMatches = [];

  while (changed) {
    if (++cycle > maxCycles) throw new Error('FIXED_POINT_GUARD_EXCEEDED');
    changed = false;
    const snapshot = [...network.names.keys()];
    for (const sourceId of SOURCE_PRIORITY) {
      const adapter = adapters[sourceId];
      if (!adapter) continue;
      for (const name of snapshot) {
        if (queried.get(sourceId).has(name)) continue;
        queried.get(sourceId).add(name);
        const response = await adapter.query(name, context);
        sourceStates[sourceId] = response.state;
        if (sourceId === 'MITECO_EIDOS') latestMitecoMatches.push(...response.matches);
        for (const ev of candidateEvidenceFromResponse(sourceId, response)) {
          if (addEvidenceName(network, ev, {requireFresh:true})) changed = true;
        }
      }
    }
  }

  const miteco = adapters.MITECO_EIDOS;
  if (miteco) {
    for (const name of network.names.keys()) {
      if (queried.get('MITECO_EIDOS').has(name)) continue;
      queried.get('MITECO_EIDOS').add(name);
      const response = await miteco.query(name, context);
      sourceStates.MITECO_EIDOS = response.state;
      latestMitecoMatches.push(...response.matches);
    }
  }

  const idState = classifyMitecoMatches(latestMitecoMatches, {requiredRank});
  return {
    originalName,
    requiredRank,
    fixedPoint: true,
    nameNetwork: [...network.names.values()],
    sourceStates,
    queried: Object.fromEntries([...queried.entries()].map(([k,v]) => [k,[...v]])),
    idState,
  };
}

function buildQaManifest(context, extras = {}) {
  return {
    RUN_ID: context.runId,
    MODE: context.mode,
    SOURCE_PRIORITY: [...SOURCE_PRIORITY],
    ...context.independence,
    PRODUCTIVE_RESOLUTION_BY_08: 0,
    PRODUCTIVE_EXTRACTION_BY_08: 0,
    CURRENT_CARRY_FORWARD_QUEUE_SIZE: 337,
    QUERY_LEDGER_ROWS: context.queryLedger.length,
    ...extras,
  };
}

module.exports = {
  MODE,
  RELATION_CLASSES,
  SOURCE_PRIORITY,
  sha256,
  createContext,
  assertNoDeniedDiscoveryRead,
  preserveNameVerbatim,
  createNameNetwork,
  validateRelationEvidence,
  addEvidenceName,
  normalizeAccessResult,
  normalizeSourceResult,
  recordQuery,
  candidateEvidenceFromResponse,
  classifyMitecoMatches,
  makeSourceAdapters,
  expandOneRecord,
  buildQaManifest,
};
