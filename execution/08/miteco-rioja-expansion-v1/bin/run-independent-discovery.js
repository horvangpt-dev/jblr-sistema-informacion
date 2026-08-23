#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  buildEidosDistributionRequest,
  pageCompleteness
} = require('../src/eidos-distribution-adapter');
const {
  loadCellRegistry,
  processFeature,
  aggregateEvidence,
  freezePayload,
  sha256Utf8
} = require('../src/independent-discovery-core');

const EIDOS_WFS_ENDPOINTS = [
  'https://geoserver.iepnb.es/geoserver/wfs',
  'https://geoserver.iepnb.es/geoserver/especies/wfs',
  'https://geoserver.iepnb.es/geoserver/especies/distribucion_especies/wfs'
];

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`ARG_INVALID:${a}`);
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) out[key] = true;
    else { out[key] = value; i += 1; }
  }
  return out;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeTaxaCsv(p, taxa) {
  const rows = [['idtaxon','scientific_name','identity_state','territorial_state','full_cells','partial_cells','cells'].join(',')];
  for (const t of taxa) {
    rows.push([
      t.idTaxon,
      t.mitecoNameCurrent,
      t.identityResolutionState,
      t.territorialEvidenceState,
      t.fullyWithinRiojaUnitCount,
      t.partialRiojaUnitCount,
      t.distributionUnits.map(u => u.manifestCellCode).join('|')
    ].map(csvEscape).join(','));
  }
  fs.writeFileSync(p, rows.join('\n') + '\n');
}

function parseMatched(value) {
  if (value === null || value === undefined || value === '' || value === 'unknown') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'accept': 'application/json,application/geo+json;q=0.9,*/*;q=0.5',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.7',
        'cache-control': 'no-cache',
        'referer': 'https://iepnb.gob.es/',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 JBLR/1.0'
      }
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`SOURCE_HTTP_${res.status}`);
      err.status = res.status;
      err.responsePreview = text.slice(0, 500);
      throw err;
    }
    return { status: res.status, text, contentType: res.headers.get('content-type') };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithEndpointFallback({registry,startIndex,pageSize,timeoutMs}) {
  const attempts=[];
  let lastErr=null;
  for (const endpoint of EIDOS_WFS_ENDPOINTS) {
    const url=buildEidosDistributionRequest({bbox:registry.bbox,startIndex,count:pageSize,srsName:registry.crs,endpoint});
    try {
      const fetched=await fetchText(url,timeoutMs);
      return {fetched,url,endpoint,attempts};
    } catch(err) {
      lastErr=err;
      attempts.push({endpoint,status:err.status ?? null,error:err.message,responsePreview:err.responsePreview ?? null});
      if (![403,404].includes(err.status)) break;
    }
  }
  const detail=attempts.map(a=>`${a.endpoint}:${a.status ?? a.error}`).join('|');
  throw new Error(`SOURCE_UNAVAILABLE:${lastErr?.message || 'UNKNOWN'}:ENDPOINT_ATTEMPTS=${detail}`);
}

async function acquireLive({ registry, outDir, pageSize, timeoutMs, maxPages }) {
  const rawDir = path.join(outDir, 'raw');
  ensureDir(rawDir);
  const pages = [];
  const requests = [];
  let startIndex = 0;
  let paginationComplete = false;
  let sourceErrors = 0;
  for (let pageNo = 0; pageNo < maxPages; pageNo += 1) {
    let result;
    try {
      result = await fetchWithEndpointFallback({registry,startIndex,pageSize,timeoutMs});
    } catch (err) {
      sourceErrors += 1;
      throw err;
    }
    const {fetched,url,endpoint,attempts}=result;
    const rawHash = sha256Utf8(fetched.text);
    const rawFile = `eidos-page-${String(pageNo + 1).padStart(4, '0')}.json`;
    fs.writeFileSync(path.join(rawDir, rawFile), fetched.text);
    let json;
    try { json = JSON.parse(fetched.text); }
    catch { throw new Error('SOURCE_SCHEMA_CHANGED_UNHANDLED:NON_JSON_RESPONSE'); }
    if (!Array.isArray(json.features)) throw new Error('SOURCE_SCHEMA_CHANGED_UNHANDLED:FEATURES_MISSING');
    const numberReturned = Number.isInteger(json.numberReturned) ? json.numberReturned : json.features.length;
    const numberMatched = parseMatched(json.numberMatched ?? json.totalFeatures ?? null);
    requests.push({
      requestId: `REQ-${String(pageNo + 1).padStart(4, '0')}`,
      requestUrl: url,
      endpointUsed:endpoint,
      endpointFallbackAttempts:attempts,
      startIndex,
      count: pageSize,
      httpStatus: fetched.status,
      contentType: fetched.contentType,
      rawFile,
      rawHash,
      numberReturned,
      numberMatched
    });
    pages.push(json);
    const p = pageCompleteness({ numberMatched, numberReturned, startIndex, count: pageSize });
    if (p.complete) { paginationComplete = true; break; }
    if (p.nextIndex === null || p.nextIndex <= startIndex) throw new Error('PAGINATION_INCOMPLETE');
    startIndex = p.nextIndex;
  }
  if (!paginationComplete) throw new Error('PAGINATION_INCOMPLETE');
  return {
    pages,
    requests,
    acquisition: {
      rawRequestCount: requests.length,
      rawFeatureCount: pages.reduce((n, p) => n + p.features.length, 0),
      paginationComplete,
      sourceErrors,
      gridWindowCoveredCount: registry.selectedCount,
      bbox: registry.bbox
    }
  };
}

function acquireFixture(fixturePath, registry) {
  const doc = readJson(fixturePath);
  const pages = Array.isArray(doc) ? doc : [doc];
  for (const p of pages) if (!Array.isArray(p.features)) throw new Error('FIXTURE_FEATURES_MISSING');
  return {
    pages,
    requests: [],
    acquisition: {
      rawRequestCount: pages.length,
      rawFeatureCount: pages.reduce((n, p) => n + p.features.length, 0),
      paginationComplete: true,
      sourceErrors: 0,
      gridWindowCoveredCount: registry.selectedCount,
      bbox: registry.bbox,
      fixtureMode: true
    }
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.mode || 'fixture';
  const registryPath = args.registry || path.resolve(__dirname, '../contracts/rioja-grid-cell-registry-v1.json');
  const outDir = path.resolve(args.out || 'miteco-rioja-discovery-output');
  const identityPath = args['identity-map'] ? path.resolve(args['identity-map']) : null;
  if (args.rc2 || args['rioja-corpus'] || args['jblr-corpus']) throw new Error('INDEPENDENCE_GUARD_REJECTED_JBLR_CORPUS_INPUT');
  ensureDir(outDir);
  const registry = loadCellRegistry(readJson(registryPath));
  const identityDoc = identityPath ? readJson(identityPath) : null;

  let acquired;
  if (mode === 'live') {
    acquired = await acquireLive({
      registry,
      outDir,
      pageSize: Number(args['page-size'] || 5000),
      timeoutMs: Number(args['timeout-ms'] || 60000),
      maxPages: Number(args['max-pages'] || 100)
    });
  } else if (mode === 'fixture') {
    if (!args.fixture) throw new Error('FIXTURE_REQUIRED');
    acquired = acquireFixture(path.resolve(args.fixture), registry);
  } else {
    throw new Error(`MODE_INVALID:${mode}`);
  }

  const processed = [];
  for (const page of acquired.pages) for (const feature of page.features) processed.push(processFeature(feature, registry));
  const aggregate = aggregateEvidence(processed, identityDoc);
  const frozen = freezePayload({
    registry,
    aggregate,
    acquisition: acquired.acquisition,
    sourceVersion: args['source-version'] || new Date().toISOString(),
    identityVersion: args['identity-version'] || null
  });

  const confirmed = aggregate.taxa.filter(t => t.territorialEvidenceState === 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
  const border = aggregate.taxa.filter(t => t.territorialEvidenceState === 'BORDER_GRID_CANDIDATE');
  const unresolved = aggregate.taxa.filter(t => !String(t.identityResolutionState).startsWith('OFFICIAL_ID_LOOKUP_'));

  writeJson(path.join(outDir, 'MITECO_RIOJA_TAXA_BY_ID_v1.json'), aggregate.taxa);
  writeTaxaCsv(path.join(outDir, 'MITECO_RIOJA_TAXA_BY_ID_v1.csv'), aggregate.taxa);
  writeJson(path.join(outDir, 'MITECO_RIOJA_CONFIRMED_INTERIOR_v1.json'), confirmed);
  writeJson(path.join(outDir, 'REVIEW_BORDER_GRID_TAXA_v1.json'), border);
  writeJson(path.join(outDir, 'MITECO_RIOJA_UNRESOLVED_IDENTITY_v1.json'), unresolved);
  writeJson(path.join(outDir, 'MITECO_RIOJA_DISCOVERY_SELECTED_FEATURES_v1.json'), aggregate.selectedFeatures);
  writeJson(path.join(outDir, 'MITECO_RIOJA_DISCOVERY_OUTSIDE_FEATURES_v1.json'), aggregate.outsideFeatures);
  writeJson(path.join(outDir, 'MITECO_RIOJA_PARALLEL_CORPUS_v1.json'), frozen);
  writeJson(path.join(outDir, 'RUN_MANIFEST_MITECO_DISCOVERY_v1.json'), {
    generatedAt: new Date().toISOString(),
    mode,
    registryPath,
    identityMapPath: identityPath,
    requests: acquired.requests,
    corpusSha256: frozen.sha256,
    qa: frozen.payload.qa,
    corpusCrossWithJblrPerformed: false,
    existingRiojaCorpusInputUsed: false
  });

  if (frozen.payload.qa.systemicQa !== 'PASS') {
    process.stderr.write(JSON.stringify(frozen.payload.qa, null, 2) + '\n');
    process.exitCode = 2;
    return;
  }
  process.stdout.write(JSON.stringify({
    corpusSha256: frozen.sha256,
    uniqueIds: aggregate.taxa.length,
    confirmedInterior: confirmed.length,
    borderCandidates: border.length,
    unresolvedIdentity: unresolved.length,
    qa: frozen.payload.qa.systemicQa,
    outDir
  }, null, 2) + '\n');
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
