const crypto = require('node:crypto');

const MODE = 'B_CLEAN_COLD_START';
const DENIED_TAXON_LEVEL_PATTERNS = [
  /corpus[-_ ]?a/i,
  /flora_vascular_rioja_baseline/i,
  /\brc2\b/i,
  /\b2210\b/i,
  /2742|v8|v10|b-v2/i,
  /crosswalk/i,
  /stime00/i,
  /static.*miteco|miteco.*static/i,
  /synonym.*ledger|ledger.*synonym/i,
  /prior.*cache|historical.*cache/i,
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

function assertAllowedDiscoveryRead(resourcePath, { taxonLevel = true } = {}) {
  if (!taxonLevel) return true;
  for (const pattern of DENIED_TAXON_LEVEL_PATTERNS) {
    if (pattern.test(String(resourcePath))) {
      const err = new Error(`CONTAMINATED_INPUT: denied discovery resource ${resourcePath}`);
      err.code = 'CONTAMINATED_INPUT';
      throw err;
    }
  }
  return true;
}

function createRunContext({ runId, initialCache = [] } = {}) {
  if (!runId) throw new Error('RUN_ID_REQUIRED');
  if (initialCache.length !== 0) {
    const err = new Error('PRIOR_CACHE_READ_PROHIBITED');
    err.code = 'CONTAMINATED_INPUT';
    throw err;
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
      CACHE_INITIAL_STATE: 'EMPTY',
    },
  };
}

function assertNoPriorStaticMitecoInput(sourceLabel) {
  if (/static.*miteco|miteco.*static|lista.?patron.*miteco/i.test(String(sourceLabel))) {
    const err = new Error('PRIOR_STATIC_MITECO_LIST_INPUT_PROHIBITED');
    err.code = 'CONTAMINATED_INPUT';
    throw err;
  }
  return true;
}

function assertNoPriorSynonymLedger(sourceLabel) {
  if (/synonym.*ledger|ledger.*synonym|sinonim.*ledger|ledger.*sinonim/i.test(String(sourceLabel))) {
    const err = new Error('PRIOR_SYNONYM_LEDGER_PROHIBITED');
    err.code = 'CONTAMINATED_INPUT';
    throw err;
  }
  return true;
}

function isVascularRow(row) {
  return row['Reino'] === 'Plantae' && row['Phylum'] === 'Tracheophyta';
}

function preserveRawRow(row, { sourceRowPointer, sourceSnapshotId }) {
  const raw = JSON.parse(JSON.stringify(row));
  return {
    B_SOURCE_RECORD_ID: String(row['Id.'] ?? sourceRowPointer),
    SOURCE_ROW_POINTER: sourceRowPointer,
    SOURCE_SNAPSHOT_ID: sourceSnapshotId,
    RAW_ROW: raw,
    SOURCE_RECORD_HASH: sha256(raw),
  };
}

function parseEidosField(raw) {
  const verbatim = raw == null ? '' : String(raw);
  if (verbatim.trim() === '') {
    return { state: 'NOT_PROVIDED_IN_RIOJA_SOURCE', raw: verbatim, idTaxon: null, name: null };
  }
  const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(verbatim);
  if (!match) return { state: 'PARSE_FAILURE', raw: verbatim, idTaxon: null, name: null };
  return { state: 'SOURCE_MAPPED', raw: verbatim, idTaxon: match[1], name: match[2] };
}

function extractSourceRows(rows, { runContext, sourceSnapshotId, expected } = {}) {
  if (!runContext || runContext.mode !== MODE) throw new Error('B_CLEAN_RUN_CONTEXT_REQUIRED');
  const raw = [];
  const mapped = [];
  const unresolved = [];
  let parseFailures = 0;
  rows.forEach((row, i) => {
    const preserved = preserveRawRow(row, { sourceRowPointer: i + 2, sourceSnapshotId });
    if (!isVascularRow(row)) return;
    raw.push(preserved);
    const parsed = parseEidosField(row['Especie EIDOS']);
    if (parsed.state === 'SOURCE_MAPPED') mapped.push({ ...preserved, EIDOS_RAW: parsed.raw, EIDOS_ID_TAXON_SOURCE: parsed.idTaxon, EIDOS_NAME_SOURCE: parsed.name });
    else if (parsed.state === 'NOT_PROVIDED_IN_RIOJA_SOURCE') unresolved.push({ ...preserved, EIDOS_STATE_INITIAL: parsed.state });
    else parseFailures += 1;
  });
  const metrics = { VASCULAR_RAW_ROWS: raw.length, EIDOS_PRESENT_AND_PARSEABLE: mapped.length, EIDOS_EMPTY_IN_SOURCE: unresolved.length, EIDOS_PARSE_FAILURE: parseFailures };
  if (expected) {
    for (const [key, value] of Object.entries(expected)) {
      if (metrics[key] !== value) throw new Error(`SOURCE_CONTRACT_MISMATCH:${key}:${metrics[key]}!=${value}`);
    }
  }
  return { raw, mapped, unresolved, metrics };
}

function createNameNetwork(originalName) {
  return { originalName, names: new Map([[originalName, { name: originalName, relation: 'ORIGINAL', evidence: 'RAW_B' }]]) };
}

function addFreshEvidenceName(network, { name, relation, evidencePointer, fresh }) {
  if (!fresh || !evidencePointer || !relation || !name) return false;
  if (network.names.has(name)) return false;
  network.names.set(name, { name, relation, evidence: evidencePointer });
  return true;
}

function normalizeSourceFailure(result) {
  if (!result) return { state: 'SOURCE_UNAVAILABLE' };
  if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED'].includes(result.state)) return { ...result };
  return result;
}

function classifyIdMatches(matches, { requiredRank } = {}) {
  const valid = (matches || []).filter(m => m && m.idTaxon);
  const exact = valid.filter(m => m.sameConcept === true && (!requiredRank || m.rank === requiredRank));
  const ids = [...new Set(exact.map(m => String(m.idTaxon)))];
  if (ids.length > 1) return { state: 'AMBIGUOUS_MULTIPLE_IDS', ids };
  if (ids.length === 1) return { state: 'RESOLVED_EXACT_OR_DOCUMENTED_ALIAS', idTaxon: ids[0] };
  const parent = valid.find(m => m.parentOnly === true);
  if (parent) return { state: 'PARENT_ONLY', parentReferenceId: String(parent.idTaxon), idTaxon: null };
  return { state: 'UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH', idTaxon: null };
}

async function resolveFreshQueueItem(initialName, { queryMiteco, querySpanish, maxSteps = 100 }) {
  const network = createNameNetwork(initialName);
  const queue = [initialName];
  const queriedMiteco = new Set();
  let steps = 0;
  let sourceFailure = null;
  while (queue.length) {
    if (++steps > maxSteps) throw new Error('FIXED_POINT_GUARD_EXCEEDED');
    const name = queue.shift();
    if (queriedMiteco.has(name)) continue;
    queriedMiteco.add(name);
    const response = normalizeSourceFailure(await queryMiteco(name));
    if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED'].includes(response.state)) {
      sourceFailure = response.state;
      continue;
    }
    for (const rel of response.relations || []) {
      if (addFreshEvidenceName(network, { ...rel, fresh: true })) queue.push(rel.name);
    }
  }
  if (querySpanish) {
    const snapshot = [...network.names.keys()];
    for (const baseName of snapshot) {
      const response = normalizeSourceFailure(await querySpanish(baseName));
      if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED'].includes(response.state)) continue;
      for (const rel of response.relations || []) {
        if (addFreshEvidenceName(network, { ...rel, fresh: true })) queue.push(rel.name);
      }
    }
    while (queue.length) {
      if (++steps > maxSteps) throw new Error('FIXED_POINT_GUARD_EXCEEDED');
      const name = queue.shift();
      if (queriedMiteco.has(name)) continue;
      queriedMiteco.add(name);
      const response = normalizeSourceFailure(await queryMiteco(name));
      if (['SOURCE_UNAVAILABLE', 'ACCESS_FAILED'].includes(response.state)) { sourceFailure = response.state; continue; }
      for (const rel of response.relations || []) {
        if (addFreshEvidenceName(network, { ...rel, fresh: true })) queue.push(rel.name);
      }
    }
  }
  return { network, queriedMiteco: [...queriedMiteco], fixedPoint: true, sourceFailure };
}

function assertCrosswalkDisabled() {
  const err = new Error('CROSSWALK_PROHIBITED_IN_B_CLEAN_MODE');
  err.code = 'CROSSWALK_PROHIBITED';
  throw err;
}

function buildRunManifest(runContext, extraction) {
  return {
    RUN_ID: runContext.runId,
    MODE: runContext.mode,
    ...runContext.independence,
    EXTRACTION_METRICS: extraction?.metrics ?? null,
    PRODUCTIVE_TAXON_RESOLUTION_BY_08: 0,
    PRODUCTIVE_EXTRACTION_BY_08: 0,
  };
}

module.exports = {
  MODE, sha256, assertAllowedDiscoveryRead, createRunContext, assertNoPriorStaticMitecoInput,
  assertNoPriorSynonymLedger, isVascularRow, preserveRawRow, parseEidosField, extractSourceRows,
  createNameNetwork, addFreshEvidenceName, normalizeSourceFailure, classifyIdMatches,
  resolveFreshQueueItem, assertCrosswalkDisabled, buildRunManifest,
};
