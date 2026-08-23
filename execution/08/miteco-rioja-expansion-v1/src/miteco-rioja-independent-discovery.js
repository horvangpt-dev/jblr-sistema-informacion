'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalJson,
  extractEidosDistributionFeature,
  buildEidosDistributionRequest,
  pageCompleteness
} = require('./eidos-distribution-adapter');

const PROTOCOL_VERSION = 'MITECO_RIOJA_INDEPENDENT_DISCOVERY_v1';
const BOUND_GRID_MANIFEST_SHA256 = '2130223540a220465b102d64f309e3eca821bc1c6334843912b7d9988df334ee';
const FORBIDDEN_DISCOVERY_INPUT_KEYS = new Set([
  'rc2','jblrCorpus','riojaCorpus','acceptedRiojaCorpus','existingRiojaTaxa','taxonUniverse'
]);

function sha256Utf8(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function normalizeGridCode(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).toUpperCase().replace(/\s+/g, '');
  return s || null;
}

function assertIndependentDiscoveryConfig(config = {}) {
  for (const key of Object.keys(config)) {
    if (FORBIDDEN_DISCOVERY_INPUT_KEYS.has(key) && config[key] !== undefined && config[key] !== null) {
      throw new Error(`FORBIDDEN_EXISTING_RIOJA_CORPUS_INPUT:${key}`);
    }
  }
  return true;
}

function manifestIndex(manifest) {
  if (!manifest) throw new Error('GRID_MANIFEST_INVALID');
  if (manifest.version === 'RIOJA_MITECO_GRID_CELL_RELATIONS_v1') {
    if (manifest.boundManifestSha256 !== BOUND_GRID_MANIFEST_SHA256) throw new Error('GRID_MANIFEST_HASH_MISMATCH');
    if (!Array.isArray(manifest.cells) || manifest.cells.length !== 77) throw new Error('GRID_MANIFEST_INVALID_OR_UNEXPECTED_COUNT');
    const byCode = new Map();
    for (const row of manifest.cells) {
      const code=normalizeGridCode(row.code);
      if (!code) throw new Error('GRID_MANIFEST_CELL_CODE_MISSING');
      if (byCode.has(code)) throw new Error('GRID_MANIFEST_DUPLICATE_CODE');
      const relation=row.relation;
      if (!['FULLY_WITHIN_RIOJA','PARTIAL_INTERSECTION'].includes(relation)) throw new Error('GRID_MANIFEST_RELATION_UNHANDLED');
      byCode.set(code,{nativeCode:code,nativeId:String(row.nativeId),relation,gridLowerLeftEasting:Number(row.x),gridLowerLeftNorthing:Number(row.y),normalizedCode:code});
    }
    const full=[...byCode.values()].filter(r=>r.relation==='FULLY_WITHIN_RIOJA').length;
    const partial=byCode.size-full;
    if (full!==26 || partial!==51) throw new Error('GRID_MANIFEST_RELATION_COUNT_MISMATCH');
    return byCode;
  }
  if (manifest.sha256 !== BOUND_GRID_MANIFEST_SHA256) throw new Error('GRID_MANIFEST_HASH_MISMATCH');
  const rows = manifest?.payload?.rows;
  if (!Array.isArray(rows) || rows.length !== 77) throw new Error('GRID_MANIFEST_INVALID_OR_UNEXPECTED_COUNT');
  const byCode = new Map();
  for (const row of rows) {
    const code = normalizeGridCode(row.nativeCode);
    if (!code) throw new Error('GRID_MANIFEST_CELL_CODE_MISSING');
    if (byCode.has(code)) throw new Error('GRID_MANIFEST_DUPLICATE_CODE');
    const relation = row.relation;
    if (!['FULLY_WITHIN_RIOJA','PARTIAL_INTERSECTION'].includes(relation)) throw new Error('GRID_MANIFEST_RELATION_UNHANDLED');
    byCode.set(code, { ...row, normalizedCode: code });
  }
  return byCode;
}

function vascularCacheIndex(cache) {
  if (cache === null || cache === undefined) return null;
  if (!cache || cache.version !== 'MITECO_FLORA_VASCULAR_ID_NAME_CACHE_v1' || (!Array.isArray(cache.records) && (!cache.idToName || typeof cache.idToName !== 'object'))) {
    throw new Error('VASCULAR_CACHE_INVALID');
  }
  if (!String(cache.scopeSemantics || '').includes('NOT_RIOJA_OCCURRENCE_EVIDENCE')) {
    throw new Error('VASCULAR_CACHE_SEMANTICS_UNSAFE');
  }
  const out = new Map();
  const rows = Array.isArray(cache.records) ? cache.records : Object.entries(cache.idToName).map(([idtaxon, scientificName]) => ({idtaxon, scientificName}));
  for (const row of rows) {
    const id = String(row.idtaxon);
    if (!/^\d+$/.test(id)) throw new Error('VASCULAR_CACHE_ID_INVALID');
    if (out.has(id)) throw new Error('VASCULAR_CACHE_DUPLICATE_ID');
    out.set(id, { idtaxon:id, scientificName:row.scientificName ?? null });
  }
  if (cache.count !== out.size) throw new Error('VASCULAR_CACHE_COUNT_MISMATCH');
  return out;
}

function deriveRiojaBBox(manifest) {
  const idx = manifestIndex(manifest);
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for (const row of idx.values()) {
    const x=Number(row.gridLowerLeftEasting), y=Number(row.gridLowerLeftNorthing);
    if (!Number.isFinite(x)||!Number.isFinite(y)) throw new Error('GRID_COORDINATE_INVALID');
    minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x+10000); maxy=Math.max(maxy,y+10000);
  }
  return [minx,miny,maxx,maxy];
}

function territorialState(cells) {
  if (cells.some(c => c.relation === 'FULLY_WITHIN_RIOJA')) return 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA';
  if (cells.some(c => c.relation === 'PARTIAL_INTERSECTION')) return 'BORDER_GRID_CANDIDATE';
  return 'NO_RIOJA_MANIFEST_SUPPORT';
}

function buildIndependentCorpus({manifest, vascularCache, pages, config={}}) {
  assertIndependentDiscoveryConfig(config);
  const cellsByCode = manifestIndex(manifest);
  const vascularById = vascularCacheIndex(vascularCache);
  if (!Array.isArray(pages)) throw new Error('PAGES_REQUIRED');

  const rawFeatureIds = new Set();
  const taxa = new Map();
  const unresolvedFloraScope = new Map();
  const outsideFeatures = [];
  let rawFeatureCount = 0;
  let matchedFeatureCount = 0;

  for (const page of pages) {
    const features = Array.isArray(page?.features) ? page.features : [];
    rawFeatureCount += features.length;
    for (const feature of features) {
      const extracted = extractEidosDistributionFeature(feature);
      const sourceFeatureId = String(extracted.sourceFeatureId ?? `ANON:${rawFeatureCount}`);
      if (rawFeatureIds.has(sourceFeatureId)) throw new Error('DUPLICATE_RAW_FEATURE_ID');
      rawFeatureIds.add(sourceFeatureId);
      const code = normalizeGridCode(extracted.spatialUnitNativeCode);
      const cell = code ? cellsByCode.get(code) : null;
      if (!cell) {
        outsideFeatures.push({sourceFeatureId, spatialUnitNativeCode: extracted.spatialUnitNativeCode});
        continue;
      }
      matchedFeatureCount++;
      for (const id of extracted.vascularTaxonIds) {
        const cacheRec = vascularById ? vascularById.get(id) : null;
        const target = (!vascularById || cacheRec) ? taxa : unresolvedFloraScope;
        if (!target.has(id)) target.set(id, {
          idTaxon: id,
          mitecoNameCurrent: cacheRec?.scientificName ?? null,
          nameSource: cacheRec ? 'MITECO_CURRENT_PATTERN_LIST_SNAPSHOT' : null,
          floraScopeState: cacheRec ? 'VASCULAR_CONFIRMED_BY_MITECO_PATTERN_LIST' : (vascularById ? 'FLORA_SCOPE_UNRESOLVED' : 'SOURCE_ASSERTED_VASCULAR_ID_LIST'),
          distributionFeatureIds: new Set(),
          cells: new Map()
        });
        const rec = target.get(id);
        rec.distributionFeatureIds.add(sourceFeatureId);
        rec.cells.set(code, {
          code,
          relation:cell.relation,
          manifestNativeId:String(cell.nativeId),
          evidenceSourceFeatureId:sourceFeatureId
        });
      }
    }
  }

  function finalize(map) {
    return [...map.values()].map(rec => {
      const cells=[...rec.cells.values()].sort((a,b)=>a.code.localeCompare(b.code));
      const full=cells.filter(c=>c.relation==='FULLY_WITHIN_RIOJA').length;
      const partial=cells.filter(c=>c.relation==='PARTIAL_INTERSECTION').length;
      return {
        idTaxon:rec.idTaxon,
        mitecoNameCurrent:rec.mitecoNameCurrent,
        nameSource:rec.nameSource,
        floraScopeState:rec.floraScopeState,
        territorialEvidenceState:territorialState(cells),
        fullyWithinRiojaUnitCount:full,
        partialRiojaUnitCount:partial,
        distributionFeatureIds:[...rec.distributionFeatureIds].sort(),
        distributionUnits:cells
      };
    }).sort((a,b)=>BigInt(a.idTaxon)<BigInt(b.idTaxon)?-1:BigInt(a.idTaxon)>BigInt(b.idTaxon)?1:0);
  }

  const resolved = finalize(taxa);
  const unresolved = finalize(unresolvedFloraScope);
  const confirmed = resolved.filter(r=>r.territorialEvidenceState==='DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
  const borderOnly = resolved.filter(r=>r.territorialEvidenceState==='BORDER_GRID_CANDIDATE');

  return {
    protocolVersion:PROTOCOL_VERSION,
    independenceGuard:'RC2_AND_EXISTING_RIOJA_CORPUS_NOT_USED_AS_DISCOVERY_INPUT',
    occurrenceEvidenceSource:'MITECO_IEPNB_EIDOS_DISTRIBUTION_CURRENT_ONLY',
    nameAndScopeCacheSemantics: vascularById ? 'MITECO_NATIONAL_DICTIONARY_ONLY_NOT_OCCURRENCE_EVIDENCE' : 'NO_NAME_CACHE_USED; EIDOS_SOURCE_ASSERTED_VASCULAR_ID_LIST_ONLY',
    counts:{
      manifestCells:cellsByCode.size,
      rawFeatures:rawFeatureCount,
      matchedFeatures:matchedFeatureCount,
      outsideFeatures:outsideFeatures.length,
      resolvedVascularTaxa:resolved.length,
      confirmedByInternalCellTaxa:confirmed.length,
      borderOnlyTaxa:borderOnly.length,
      floraScopeUnresolvedTaxa:unresolved.length
    },
    taxaById:resolved,
    confirmedByInternalCell:confirmed,
    borderGridCandidates:borderOnly,
    floraScopeUnresolved:unresolved,
    outsideFeatures
  };
}

async function fetchAllPages({manifest, fetchImpl=globalThis.fetch, count=10000, onPage}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED');
  const bbox=deriveRiojaBBox(manifest);
  let startIndex=0;
  let pageNo=0;
  const pages=[];
  while (true) {
    const url=buildEidosDistributionRequest({bbox,startIndex,count,srsName:'EPSG:25830'});
    const response=await fetchImpl(url, {headers:{accept:'application/json','user-agent':'JBLR-MITECO-Rioja-Discovery/1.0'}});
    if (!response || !response.ok) throw new Error(`SOURCE_ERROR_HTTP_${response?.status ?? 'UNKNOWN'}`);
    const text=await response.text();
    let json;
    try { json=JSON.parse(text); } catch { throw new Error('SOURCE_SCHEMA_CHANGED_UNHANDLED'); }
    const rawHash=sha256Utf8(text);
    const numberReturned=Number.isInteger(json.numberReturned) ? json.numberReturned : (Array.isArray(json.features)?json.features.length:NaN);
    const numberMatched=Number.isInteger(json.numberMatched) ? json.numberMatched : null;
    if (!Number.isInteger(numberReturned)) throw new Error('PAGINATION_METADATA_INVALID');
    const meta={pageNo,startIndex,count,numberReturned,numberMatched,url,rawHash};
    if (onPage) await onPage({meta,text,json});
    pages.push(json);
    const p=pageCompleteness({numberMatched,numberReturned,startIndex,count});
    if (p.complete) break;
    if (p.nextIndex === startIndex) throw new Error('PAGINATION_INCOMPLETE');
    startIndex=p.nextIndex;
    pageNo++;
    if (pageNo>10000) throw new Error('PAGINATION_INCOMPLETE');
  }
  return {pages,bbox};
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const text=JSON.stringify(value,null,2)+'\n';
  fs.writeFileSync(file,text,'utf8');
  return sha256Utf8(text);
}

function freezeOutputs({outDir, result, runMeta={}}) {
  fs.mkdirSync(outDir,{recursive:true});
  const hashes={};
  hashes.taxaById=writeJson(path.join(outDir,'MITECO_RIOJA_TAXA_BY_ID_v1.json'), result.taxaById);
  hashes.confirmed=writeJson(path.join(outDir,'MITECO_RIOJA_CONFIRMED_INTERNAL_v1.json'), result.confirmedByInternalCell);
  hashes.border=writeJson(path.join(outDir,'REVIEW_BORDER_GRID_TAXA_v1.json'), result.borderGridCandidates);
  hashes.unresolved=writeJson(path.join(outDir,'MITECO_RIOJA_UNRESOLVED_v1.json'), result.floraScopeUnresolved);
  hashes.outside=writeJson(path.join(outDir,'MITECO_RIOJA_OUTSIDE_QUERY_WINDOW_MATCH_v1.json'), result.outsideFeatures);
  const run={
    protocolVersion:PROTOCOL_VERSION,
    frozenAt:new Date().toISOString(),
    counts:result.counts,
    independenceGuard:result.independenceGuard,
    occurrenceEvidenceSource:result.occurrenceEvidenceSource,
    outputHashes:hashes,
    ...runMeta,
    crossWithJblrCorpus:'PROHIBITED_UNTIL_THIS_RUN_IS_REVIEWED_AND_FROZEN'
  };
  hashes.runManifest=writeJson(path.join(outDir,'RUN_MANIFEST_MITECO_RIOJA_DISCOVERY_v1.json'),run);
  return {run,hashes};
}

module.exports={
  PROTOCOL_VERSION,
  BOUND_GRID_MANIFEST_SHA256,
  normalizeGridCode,
  assertIndependentDiscoveryConfig,
  manifestIndex,
  vascularCacheIndex,
  deriveRiojaBBox,
  territorialState,
  buildIndependentCorpus,
  fetchAllPages,
  freezeOutputs,
  sha256Utf8,
  canonicalJson
};
