'use strict';
const crypto = require('node:crypto');

function sha256Utf8(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifyManifestHash(manifest) {
  if (!manifest || !manifest.payload || !manifest.sha256) throw new Error('GRID_MANIFEST_INVALID');
  const actual = sha256Utf8(canonicalJson(manifest.payload));
  if (actual !== manifest.sha256) throw new Error('GRID_MANIFEST_HASH_MISMATCH');
  return true;
}

function parseVascularIdList(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return [];
  const s = String(raw).trim();
  const tokens = s.split(/[\s,;|]+/).filter(Boolean);
  if (!tokens.length || tokens.some(t => !/^\d+$/.test(t))) {
    throw new Error('SOURCE_SCHEMA_CHANGED_UNHANDLED');
  }
  return [...new Set(tokens.map(t => String(BigInt(t))))];
}

function extractEidosDistributionFeature(feature) {
  if (!feature || typeof feature !== 'object') throw new Error('SOURCE_FEATURE_INVALID');
  const p = feature.properties || {};
  const ids = parseVascularIdList(p.lista_idstaxon_filtro_plantvas);
  return {
    sourceFeatureId: feature.id ?? p.id ?? null,
    spatialUnitNativeCode: p.cuadricula ?? null,
    vascularTaxonIds: ids,
    vascularTaxonCountDeclared: p.total_taxones_plantvas ?? null,
    geometry: feature.geometry ?? null,
    rawProperties: p,
    identitySemantics: 'GRID_AGGREGATE_ID_LIST; RESOLVE_EACH_ID_VIA_CURRENT_EIDOS_IDENTITY_ROUTE'
  };
}

function buildEidosDistributionRequest({bbox, startIndex = 0, count = 10000, srsName = 'EPSG:25830'}) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error('BBOX_REQUIRED');
  if (!Number.isInteger(startIndex) || startIndex < 0) throw new Error('START_INDEX_INVALID');
  if (!Number.isInteger(count) || count <= 0) throw new Error('COUNT_INVALID');
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'especies:distribucion_especies',
    outputFormat: 'application/json',
    srsName,
    bbox: `${bbox.join(',')},${srsName}`,
    startIndex: String(startIndex),
    count: String(count)
  });
  return `https://geoserver.iepnb.es/geoserver/wfs?${params.toString()}`;
}

function pageCompleteness({numberMatched, numberReturned, startIndex, count}) {
  for (const n of [numberReturned, startIndex, count]) if (!Number.isInteger(n) || n < 0) throw new Error('PAGINATION_METADATA_INVALID');
  if (numberMatched !== null && numberMatched !== undefined && (!Number.isInteger(numberMatched) || numberMatched < 0)) throw new Error('PAGINATION_METADATA_INVALID');
  const nextIndex = startIndex + numberReturned;
  const complete = numberMatched !== null && numberMatched !== undefined
    ? nextIndex >= numberMatched
    : numberReturned < count;
  return { complete, nextIndex: complete ? null : nextIndex };
}

module.exports = {
  canonicalJson,
  verifyManifestHash,
  parseVascularIdList,
  extractEidosDistributionFeature,
  buildEidosDistributionRequest,
  pageCompleteness
};
