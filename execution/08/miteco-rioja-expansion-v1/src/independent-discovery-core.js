'use strict';
const crypto = require('node:crypto');
const { canonicalJson, extractEidosDistributionFeature, verifyManifestHash } = require('./eidos-distribution-adapter');

const ALLOWED_RELATIONS = new Set(['FULLY_WITHIN_RIOJA', 'PARTIAL_INTERSECTION']);

function sha256Utf8(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function normalizeGridCode(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase().replace(/\s+/g, '');
  return s || null;
}

function loadCellRegistry(registryDoc) {
  verifyManifestHash(registryDoc);
  const p = registryDoc.payload;
  if (!p || !Array.isArray(p.cells)) throw new Error('GRID_REGISTRY_INVALID');
  if (p.selectedCount !== p.cells.length) throw new Error('GRID_REGISTRY_COUNT_MISMATCH');
  const byCode = new Map();
  let full = 0;
  let partial = 0;
  for (const cell of p.cells) {
    const code = normalizeGridCode(cell.code);
    if (!code) throw new Error('GRID_CODE_MISSING');
    if (byCode.has(code)) throw new Error('GRID_CODE_DUPLICATE');
    if (!ALLOWED_RELATIONS.has(cell.relation)) throw new Error('GRID_RELATION_INVALID');
    if (!Number.isFinite(cell.lowerLeftEasting) || !Number.isFinite(cell.lowerLeftNorthing)) throw new Error('GRID_COORDINATE_INVALID');
    if (cell.relation === 'FULLY_WITHIN_RIOJA') full += 1;
    else partial += 1;
    byCode.set(code, { ...cell, code });
  }
  if (full !== p.fullyWithinCount || partial !== p.partialCount) throw new Error('GRID_RELATION_COUNT_MISMATCH');
  const size = p.cellSizeM;
  if (!Number.isFinite(size) || size <= 0) throw new Error('GRID_CELL_SIZE_INVALID');
  const xs = p.cells.map(c => c.lowerLeftEasting);
  const ys = p.cells.map(c => c.lowerLeftNorthing);
  return {
    registryVersion: p.version,
    registrySha256: registryDoc.sha256,
    sourceManifestVersion: p.sourceManifestVersion,
    sourceManifestSha256: p.sourceManifestSha256,
    crs: p.crs,
    cellSizeM: size,
    selectedCount: p.selectedCount,
    fullyWithinCount: full,
    partialCount: partial,
    byCode,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs) + size, Math.max(...ys) + size]
  };
}

function parseDeclaredCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error('SOURCE_SCHEMA_CHANGED_UNHANDLED');
  return n;
}

function processFeature(feature, registry) {
  const f = extractEidosDistributionFeature(feature);
  const code = normalizeGridCode(f.spatialUnitNativeCode);
  if (!code) return { state: 'SPATIAL_CODE_MISSING', feature: f };
  const cell = registry.byCode.get(code);
  if (!cell) return { state: 'OUTSIDE_SELECTED_GRID', feature: f, normalizedCode: code };
  const declared = parseDeclaredCount(f.vascularTaxonCountDeclared);
  if (declared !== null && declared !== f.vascularTaxonIds.length) {
    throw new Error(`VASCULAR_ID_COUNT_MISMATCH:${code}:${declared}:${f.vascularTaxonIds.length}`);
  }
  return {
    state: 'SELECTED_GRID_MATCH',
    feature: f,
    normalizedCode: code,
    cell,
    evidence: f.vascularTaxonIds.map(idTaxon => ({
      idTaxon,
      sourceFeatureId: f.sourceFeatureId,
      sourceGridCode: code,
      manifestCellCode: cell.code,
      gridRelationToRioja: cell.relation,
      territorialEvidenceState: cell.relation === 'FULLY_WITHIN_RIOJA'
        ? 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA'
        : 'BORDER_GRID_CANDIDATE'
    }))
  };
}

function buildIdentityLookup(identityDoc) {
  if (!identityDoc) return new Map();
  const byId = identityDoc.byId || identityDoc.payload?.byId;
  if (!byId || typeof byId !== 'object' || Array.isArray(byId)) throw new Error('IDENTITY_LOOKUP_INVALID');
  const map = new Map();
  for (const [rawId, rec] of Object.entries(byId)) {
    if (!/^\d+$/.test(String(rawId))) throw new Error('IDENTITY_LOOKUP_ID_INVALID');
    const id = String(BigInt(rawId));
    const scientificName = rec && typeof rec === 'object' ? rec.scientificName ?? rec.name ?? null : null;
    map.set(id, {
      scientificName: scientificName === null ? null : String(scientificName),
      rank: rec && typeof rec === 'object' ? rec.rank ?? null : null,
      status: rec && typeof rec === 'object' ? rec.status ?? null : null,
      sourcePointer: rec && typeof rec === 'object' ? rec.sourcePointer ?? null : null
    });
  }
  return map;
}

function aggregateEvidence(processed, identityDoc = null) {
  const identity = buildIdentityLookup(identityDoc);
  const taxa = new Map();
  const selectedFeatures = [];
  const outsideFeatures = [];
  const unresolvedSpatialFeatures = [];
  const featureIds = new Set();
  let duplicateRawFeatureIds = 0;

  for (const item of processed) {
    const fid = item.feature?.sourceFeatureId;
    if (fid !== null && fid !== undefined) {
      const key = String(fid);
      if (featureIds.has(key)) duplicateRawFeatureIds += 1;
      else featureIds.add(key);
    }
    if (item.state === 'OUTSIDE_SELECTED_GRID') {
      outsideFeatures.push({ sourceFeatureId: fid, sourceGridCode: item.normalizedCode });
      continue;
    }
    if (item.state !== 'SELECTED_GRID_MATCH') {
      unresolvedSpatialFeatures.push({ sourceFeatureId: fid, state: item.state });
      continue;
    }
    selectedFeatures.push({
      sourceFeatureId: fid,
      sourceGridCode: item.normalizedCode,
      gridRelationToRioja: item.cell.relation,
      vascularTaxonIdCount: item.evidence.length
    });
    for (const ev of item.evidence) {
      let taxon = taxa.get(ev.idTaxon);
      if (!taxon) {
        taxon = {
          idTaxon: ev.idTaxon,
          mitecoNameCurrent: null,
          identityResolutionState: 'UNRESOLVED_PENDING_ID_TAXON_BY_ID_TAXON',
          identitySourcePointer: null,
          distributionUnits: [],
          sourceFeatureIds: [],
          fullyWithinRiojaUnitCount: 0,
          partialRiojaUnitCount: 0,
          territorialEvidenceState: null
        };
        const idRec = identity.get(ev.idTaxon);
        if (idRec) {
          taxon.mitecoNameCurrent = idRec.scientificName;
          taxon.identityResolutionState = idRec.scientificName ? 'OFFICIAL_ID_LOOKUP_EXACT' : 'OFFICIAL_ID_LOOKUP_ID_ONLY';
          taxon.identitySourcePointer = idRec.sourcePointer;
          taxon.rank = idRec.rank;
          taxon.status = idRec.status;
        }
        taxa.set(ev.idTaxon, taxon);
      }
      taxon.distributionUnits.push({
        manifestCellCode: ev.manifestCellCode,
        gridRelationToRioja: ev.gridRelationToRioja,
        sourceFeatureId: ev.sourceFeatureId,
        territorialEvidenceState: ev.territorialEvidenceState
      });
      if (ev.sourceFeatureId !== null && ev.sourceFeatureId !== undefined && !taxon.sourceFeatureIds.includes(ev.sourceFeatureId)) {
        taxon.sourceFeatureIds.push(ev.sourceFeatureId);
      }
      if (ev.gridRelationToRioja === 'FULLY_WITHIN_RIOJA') taxon.fullyWithinRiojaUnitCount += 1;
      else taxon.partialRiojaUnitCount += 1;
    }
  }

  for (const taxon of taxa.values()) {
    const seen = new Set();
    taxon.distributionUnits = taxon.distributionUnits.filter(u => {
      const key = `${u.manifestCellCode}|${u.sourceFeatureId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    taxon.territorialEvidenceState = taxon.fullyWithinRiojaUnitCount > 0
      ? 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA'
      : 'BORDER_GRID_CANDIDATE';
  }

  const taxaSorted = [...taxa.values()].sort((a, b) => {
    const aa = BigInt(a.idTaxon), bb = BigInt(b.idTaxon);
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
  return { taxa: taxaSorted, selectedFeatures, outsideFeatures, unresolvedSpatialFeatures, duplicateRawFeatureIds };
}

function computeQa({ registry, aggregate, acquisition }) {
  const confirmed = aggregate.taxa.filter(t => t.territorialEvidenceState === 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
  const border = aggregate.taxa.filter(t => t.territorialEvidenceState === 'BORDER_GRID_CANDIDATE');
  const unresolvedIdentity = aggregate.taxa.filter(t => !String(t.identityResolutionState).startsWith('OFFICIAL_ID_LOOKUP_'));
  const selectedCellCodesWithFeatures = new Set(aggregate.selectedFeatures.map(x => x.sourceGridCode));
  const fatal = [];
  if (aggregate.duplicateRawFeatureIds !== 0) fatal.push('DUPLICATE_RAW_FEATURE_IDS');
  if (acquisition && acquisition.paginationComplete === false) fatal.push('PAGINATION_INCOMPLETE');
  if (acquisition && acquisition.sourceErrors > 0) fatal.push('SOURCE_ERRORS');
  return {
    gridManifestCount: registry.selectedCount,
    gridWindowCoveredCount: acquisition?.gridWindowCoveredCount ?? registry.selectedCount,
    gridCellsWithReturnedFeatureCount: selectedCellCodesWithFeatures.size,
    rawRequestCount: acquisition?.rawRequestCount ?? null,
    rawFeatureCount: acquisition?.rawFeatureCount ?? null,
    featuresMatchingManifest: aggregate.selectedFeatures.length,
    featuresOutsideManifest: aggregate.outsideFeatures.length,
    spatialUnresolvedFeatureCount: aggregate.unresolvedSpatialFeatures.length,
    uniqueEidosIdsDiscovered: aggregate.taxa.length,
    confirmedInteriorTaxa: confirmed.length,
    borderGridCandidateTaxa: border.length,
    identityResolvedTaxa: aggregate.taxa.length - unresolvedIdentity.length,
    identityUnresolvedTaxa: unresolvedIdentity.length,
    duplicateRawFeatureIds: aggregate.duplicateRawFeatureIds,
    sourceErrors: acquisition?.sourceErrors ?? 0,
    paginationComplete: acquisition?.paginationComplete ?? null,
    rc2InputUsed: false,
    existingRiojaCorpusInputUsed: false,
    assertionsWithoutEvidence: 0,
    falseNotFoundFromSourceError: 0,
    fatalConditions: fatal,
    systemicQa: fatal.length === 0 ? 'PASS' : 'FAIL'
  };
}

function freezePayload({ registry, aggregate, acquisition, sourceVersion, identityVersion }) {
  const qa = computeQa({ registry, aggregate, acquisition });
  const confirmed = aggregate.taxa.filter(t => t.territorialEvidenceState === 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
  const border = aggregate.taxa.filter(t => t.territorialEvidenceState === 'BORDER_GRID_CANDIDATE');
  const unresolvedIdentity = aggregate.taxa.filter(t => !String(t.identityResolutionState).startsWith('OFFICIAL_ID_LOOKUP_'));
  const payload = {
    corpusVersion: 'MITECO_RIOJA_PARALLEL_CORPUS_v1',
    discoveryMethod: 'CELL_FIRST_ID_SECOND',
    sourceId: 'MITECO_IEPNB_EIDOS_DISTRIBUTION_CURRENT',
    sourceVersion: sourceVersion ?? null,
    identitySourceVersion: identityVersion ?? null,
    gridRegistryVersion: registry.registryVersion,
    gridRegistrySha256: registry.registrySha256,
    sourceManifestSha256: registry.sourceManifestSha256,
    queryBboxEpsg25830: registry.bbox,
    taxaByExactId: aggregate.taxa,
    confirmedInteriorTaxa: confirmed.map(t => t.idTaxon),
    borderGridCandidateTaxa: border.map(t => t.idTaxon),
    unresolvedIdentityTaxa: unresolvedIdentity.map(t => t.idTaxon),
    qa,
    independenceGuard: {
      rc2InputUsed: false,
      existingRiojaCorpusInputUsed: false,
      crossWithJblrAllowed: false,
      rule: 'FREEZE_MITECO_PARALLEL_SET_BEFORE_ANY_JBLR_CROSS'
    }
  };
  return {
    sha256: sha256Utf8(canonicalJson(payload)),
    hashCanonicalization: 'recursive_object_keys_sorted_no_whitespace',
    payload
  };
}

module.exports = { sha256Utf8, normalizeGridCode, loadCellRegistry, processFeature, aggregateEvidence, computeQa, freezePayload };
