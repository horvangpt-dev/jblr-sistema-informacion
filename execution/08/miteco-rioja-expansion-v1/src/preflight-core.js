'use strict';
const crypto = require('node:crypto');

function stableHash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function deterministicMitecoWorkKey(id, namespace = 'JBLR:MITECO_RIOJA_EXPANSION:v1') {
  if (id === null || id === undefined || String(id).trim() === '') throw new Error('ID_REQUIRED');
  return `twk_miteco_${stableHash(`${namespace}|${String(id).trim()}`).slice(0, 24)}`;
}

// Controlled-fixture rectangle geometry only. Productive geometry must use the pinned official polygon snapshots.
function classifyRectIntersection(cell, region, epsilon = 1e-6) {
  for (const o of [cell, region]) {
    if (!o || ![o.minX, o.minY, o.maxX, o.maxY].every(Number.isFinite) || o.maxX < o.minX || o.maxY < o.minY) {
      throw new Error('INVALID_GEOMETRY');
    }
  }
  const width = Math.max(0, Math.min(cell.maxX, region.maxX) - Math.max(cell.minX, region.minX));
  const height = Math.max(0, Math.min(cell.maxY, region.maxY) - Math.max(cell.minY, region.minY));
  const intersectionArea = width * height;
  const cellArea = (cell.maxX - cell.minX) * (cell.maxY - cell.minY);
  if (cellArea <= 0) throw new Error('INVALID_CELL_AREA');
  if (intersectionArea <= epsilon) {
    return { include: false, relation: 'TOUCH_ONLY_EXCLUDED', intersectionArea, cellArea, ratio: 0 };
  }
  const ratio = intersectionArea / cellArea;
  return {
    include: true,
    relation: Math.abs(intersectionArea - cellArea) <= epsilon ? 'FULLY_WITHIN_RIOJA' : 'PARTIAL_INTERSECTION',
    intersectionArea,
    cellArea,
    ratio
  };
}

function buildControlledGridManifest(cells, region, opts = {}) {
  const epsilon = opts.epsilon ?? 1e-6;
  const rows = [];
  for (const cell of cells) {
    const r = classifyRectIntersection(cell.geometry, region, epsilon);
    if (r.include) rows.push({
      nativeId: cell.nativeId,
      nativeCode: cell.nativeCode ?? null,
      relation: r.relation,
      intersectionArea: r.intersectionArea,
      cellArea: r.cellArea,
      ratio: r.ratio,
      crs: cell.crs ?? null
    });
  }
  rows.sort((a, b) => String(a.nativeId).localeCompare(String(b.nativeId)));
  return {
    rows,
    sha256: stableHash(JSON.stringify(rows)),
    selectedCount: rows.length,
    fullyWithinCount: rows.filter(x => x.relation === 'FULLY_WITHIN_RIOJA').length,
    partialCount: rows.filter(x => x.relation === 'PARTIAL_INTERSECTION').length
  };
}

function validateSourceBinding(binding) {
  const required = ['sourceId', 'role', 'authority', 'bindingState'];
  if (required.some(k => !binding?.[k])) return { ok: false, reason: 'MISSING_REQUIRED_FIELD' };
  if (!['VERIFIED', 'PARTIAL', 'UNVERIFIED', 'SOURCE_UNAVAILABLE', 'SCHEMA_CONFLICT'].includes(binding.bindingState)) {
    return { ok: false, reason: 'INVALID_BINDING_STATE' };
  }
  return { ok: binding.bindingState === 'VERIFIED', reason: binding.bindingState };
}

function idQueryOutcome({ executed, responseValid, requestIdExact, scopeCompleted, eligibleRecords, errorKind, returnedIds = [], queryId }) {
  if (errorKind) return { state: ['timeout', '429', '5xx', 'dns'].includes(errorKind) ? 'SOURCE_UNAVAILABLE' : 'SOURCE_ERROR' };
  if (!executed || !responseValid) return { state: 'SOURCE_ERROR' };
  if (returnedIds.length > 1) return { state: 'ID_MULTIPLE_RECORDS' };
  if (returnedIds.length === 1 && String(returnedIds[0]) !== String(queryId)) return { state: 'SOURCE_REDIRECTS_TO_OTHER_ID' };
  if (returnedIds.length === 1) return { state: 'ID_EXACT_SAME' };
  if (requestIdExact && scopeCompleted && eligibleRecords === 0) return { state: 'ID_NOT_FOUND' };
  return { state: 'UNRESOLVED' };
}

function fullOuterJoinById(riojaRows, mitecoRows) {
  const rioja = new Map();
  const miteco = new Map();
  const out = [];
  for (const row of riojaRows) {
    if (row.id == null) out.push({ class: 'RIOJA_WITHOUT_ID', rioja: row });
    else if (rioja.has(String(row.id))) out.push({ class: 'ID_CONFLICT', id: String(row.id), reason: 'DUPLICATE_RIOJA_ID' });
    else rioja.set(String(row.id), row);
  }
  for (const row of mitecoRows) {
    if (row.id == null) out.push({ class: 'MITECO_WITHOUT_ID', miteco: row });
    else if (miteco.has(String(row.id))) out.push({ class: 'ID_CONFLICT', id: String(row.id), reason: 'DUPLICATE_MITECO_ID' });
    else miteco.set(String(row.id), row);
  }
  const ids = new Set([...rioja.keys(), ...miteco.keys()]);
  for (const id of [...ids].sort()) {
    const r = rioja.get(id), m = miteco.get(id);
    if (r && m) out.push({ class: 'MATCH_BY_ID', id, rioja: r, miteco: m });
    else if (r) out.push({ class: 'RIOJA_ONLY_WITH_ID', id, rioja: r });
    else out.push({ class: 'MITECO_ONLY_ID', id, miteco: m, workKey: deterministicMitecoWorkKey(id) });
  }
  return out;
}

function assertActor08NonProductive({ productiveDiscovery = 0, productiveCross = 0, canonicalMembershipWrites = 0 }) {
  if (productiveDiscovery !== 0 || productiveCross !== 0 || canonicalMembershipWrites !== 0) {
    throw new Error('PRODUCTIVE_RUN_PROHIBITED_FOR_ACTOR_08');
  }
  return true;
}

function readiness(gates) {
  const blockers = [];
  if (!gates.allPrimarySourceBindingsVerified) blockers.push('PRIMARY_SOURCE_BINDINGS_UNVERIFIED');
  if (!gates.gridManifestReady) blockers.push('GRID_MANIFEST_UNAVAILABLE_OR_UNVERIFIED');
  if (!gates.floraVascularFilterVerified) blockers.push('FLORA_VASCULAR_FILTER_UNVERIFIED');
  if (!gates.idExecutorReady) blockers.push('ID_TAXON_BY_ID_TAXON_NOT_READY');
  if (!gates.discoveryExecutorReady) blockers.push('DISCOVERY_EXECUTOR_NOT_READY');
  if (!gates.crossByIdReady) blockers.push('CROSS_BY_ID_NOT_READY');
  if (!gates.allTestsPass) blockers.push('TESTS_NOT_ALL_PASS');
  if (!gates.systemicQaPass) blockers.push('SYSTEMIC_QA_NOT_PASS');
  if ((gates.productiveDiscovery ?? 0) !== 0) blockers.push('PRODUCTIVE_DISCOVERY_BY_08_NONZERO');
  if ((gates.productiveCross ?? 0) !== 0) blockers.push('PRODUCTIVE_CROSS_BY_08_NONZERO');
  return { ready: blockers.length === 0, blockers };
}

module.exports = {
  stableHash,
  deterministicMitecoWorkKey,
  classifyRectIntersection,
  buildControlledGridManifest,
  validateSourceBinding,
  idQueryOutcome,
  fullOuterJoinById,
  assertActor08NonProductive,
  readiness
};
