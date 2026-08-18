'use strict';

const fs = require('fs');
const path = require('path');

function text(v) { return String(v == null ? '' : v).trim(); }
function fold(v) {
  return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
}
function aliasesForTaxon(taxon) {
  const values = [taxon.taxon_name, taxon.accepted_name, ...(Array.isArray(taxon.authorized_synonyms) ? taxon.authorized_synonyms : [])]
    .map(text).filter(Boolean);
  return [...new Set(values.map(v => fold(v)))];
}
function scientificNameOf(row) {
  return text(row.scientificName || row.scientific_name || row.taxon || row.taxon_name || row.nom_cient);
}
function indexSnapshot(rows) {
  const idx = new Map();
  for (const row of rows || []) {
    const k = fold(scientificNameOf(row));
    if (!k) continue;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(row);
  }
  return idx;
}
function sourceMatchesTaxon(taxon, source) {
  const aliases = aliasesForTaxon(taxon);
  const idx = source._index || indexSnapshot(source.rows || []);
  const out = [];
  for (const a of aliases) for (const row of idx.get(a) || []) out.push(row);
  const seen = new Set();
  return out.filter(r => {
    const key = text(r.source_record_id || r.occurrenceID || r.occurrenceId || r.catalogNumber || JSON.stringify(r));
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function normalizeAccession(row, source, taxon) {
  // A bank-local catalog/occurrence identifier is provenance, not proof of an independent accession.
  // Independence requires the canonical pair: origin institution + original accession code.
  const originalCode = text(row.original_accession_code || row.originalAccessionCode || row.codigo_original_accesion || row.cod_acces || row.id_acces);
  const sourceId = text(row.source_record_id || row.occurrenceID || row.occurrenceId || row.gbifID || row.catalogNumber || row.catalog_number);
  const originInstitution = text(row.origin_institution || row.institution_of_origin || row.institucion_origen);
  const currentConfirmed = source.current_holding_snapshot === true && source.bank_current_active_verified === true;
  return {
    source_name: source.source_name,
    source_key: source.source_key || source.source_name,
    source_record_id: sourceId || null,
    custody_bank_id: source.BANK_ID,
    origin_institution: originInstitution || null,
    original_accession_code: originalCode || null,
    independence_documented: Boolean(originInstitution && originalCode),
    material_type: text(row.material_type || row.type || 'SEED'),
    taxon_match_resolved: true,
    matched_taxon_name: scientificNameOf(row),
    matched_against: aliasesForTaxon(taxon),
    origin_country: text(row.countryCode || row.country || row.origin_country || 'ES'),
    origin_region: text(row.stateProvince || row.state_province || row.origin_region),
    current_conservation_confirmed: currentConfirmed,
    current_status: currentConfirmed ? 'CURRENT' : 'CURRENTNESS_NOT_CONFIRMED',
    origin_type: text(row.origin_type || 'WILD_PRESUMED_UNLESS_EXPLICIT_NONWILD'),
    locality_literal: text(row.locality || row.locality_literal),
    municipio: text(row.municipality || row.municipio),
    precision_geografica: text(row.coordinateUncertaintyInMeters || row.decimalLatitude || row.decimalLongitude) ? 'COORDINATE_OR_LOCALITY_DATA_AVAILABLE' : 'UNKNOWN',
    collection_date: text(row.eventDate || row.collection_date || row.fecha_reco),
    coordinates: row.decimalLatitude != null && row.decimalLongitude != null ? {
      lat: Number(row.decimalLatitude), long: Number(row.decimalLongitude)
    } : null,
    provenance: {
      source_name: source.source_name,
      source_url: source.source_url || null,
      source_snapshot_date: source.snapshot_date || null,
      raw_record_id: sourceId || null
    }
  };
}
function bankCheckForTaxon(taxon, bank, source) {
  if (!source || source.snapshot_loaded !== true) {
    return { BANK_ID: bank.BANK_ID, state: 'BANCO_NO_COMPROBADO_PARA_EL_TAXON', reason: 'SOURCE_SNAPSHOT_NOT_LOADED' };
  }
  const matches = sourceMatchesTaxon(taxon, source);
  if (matches.length) {
    return {
      BANK_ID: bank.BANK_ID,
      state: 'COMPROBADO_CON_ACCESION',
      search_executed: true,
      audit_source_available: true,
      accepted_name_used: true,
      authorized_synonyms_checked: true,
      match_count: matches.length,
      source_name: source.source_name,
      source_url: source.source_url || null,
      snapshot_date: source.snapshot_date || null
    };
  }
  if (source.snapshot_complete_for_holdings === true && source.current_holding_snapshot === true && source.bank_current_active_verified === true) {
    return {
      BANK_ID: bank.BANK_ID,
      state: 'COMPROBADO_SIN_ACCESION',
      search_executed: true,
      audit_source_available: true,
      accepted_name_used: true,
      authorized_synonyms_checked: true,
      match_count: 0,
      source_name: source.source_name,
      source_url: source.source_url || null,
      snapshot_date: source.snapshot_date || null
    };
  }
  return {
    BANK_ID: bank.BANK_ID,
    state: 'BANCO_NO_COMPROBADO_PARA_EL_TAXON',
    reason: 'SNAPSHOT_NOT_COMPLETE_AND_CURRENT_ENOUGH_FOR_NEGATIVE_ASSERTION',
    source_name: source.source_name,
    source_url: source.source_url || null,
    snapshot_date: source.snapshot_date || null
  };
}
function executeTaxon({taxon, registry, sources}) {
  const active = (registry.banks || []).filter(b => b.denominator_eligible === true && b.estado === 'CONFIRMADO_ACTIVO' && b.trabaja_flora_silvestre === true);
  const byBank = new Map((sources || []).map(s => [s.BANK_ID, {...s, _index:indexSnapshot(s.rows || [])}]));
  const bankChecks = [];
  const accessions = [];
  for (const bank of active) {
    const source = byBank.get(bank.BANK_ID);
    const check = bankCheckForTaxon(taxon, bank, source);
    bankChecks.push(check);
    if (source && check.state === 'COMPROBADO_CON_ACCESION') {
      for (const row of sourceMatchesTaxon(taxon, source)) accessions.push(normalizeAccession(row, source, taxon));
    }
  }
  return {taxon, bankChecks, accessions, active_bank_count:active.length};
}
function matrixCompleteForTaxon(x) {
  return x.bankChecks.length === x.active_bank_count && x.bankChecks.every(c => c.state === 'COMPROBADO_CON_ACCESION' || c.state === 'COMPROBADO_SIN_ACCESION');
}
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function loadJsonl(p) { return fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x)); }
function loadSources(manifest, baseDir) {
  return (manifest.sources || []).map(s => {
    const z = {...s};
    if (z.snapshot_path) {
      const p = path.resolve(baseDir || '.', z.snapshot_path);
      z.rows = z.snapshot_format === 'json' ? loadJson(p) : loadJsonl(p);
      z.snapshot_loaded = true;
    } else z.rows = [];
    return z;
  });
}
function runFullUniverse({universe, registry, sourceManifest, baseDir='.', core=null, updatedAt=null}) {
  const sources = loadSources(sourceManifest, baseDir);
  const matrix = universe.map(taxon => executeTaxon({taxon, registry, sources}));
  const coreRuntime = core || require('../src/stimes/items/rep-ex-situ-v1.js');
  const provisional = matrix.map(x => coreRuntime.computeRepresentation({taxon:x.taxon, registry, bankChecks:x.bankChecks, accessions:x.accessions, frozenSnapshot:null, updatedAt}));
  const allTaxaMatrixComplete = matrix.every(matrixCompleteForTaxon);
  const freezeEligible = registry.active_universe_complete === true && allTaxaMatrixComplete;
  let snapshot = null, finalResults = provisional;
  if (freezeEligible) {
    const calibrationInputs = provisional.map(r => ({...r, state:'FINAL'}));
    snapshot = coreRuntime.freezeModelSnapshot({snapshotId:sourceManifest.target_snapshot_id, registry, taxonResults:calibrationInputs, createdAt:updatedAt});
    finalResults = matrix.map(x => coreRuntime.computeRepresentation({taxon:x.taxon, registry, bankChecks:x.bankChecks, accessions:x.accessions, frozenSnapshot:snapshot, updatedAt}));
  }
  return {
    run_id: sourceManifest.run_id,
    universe_count: universe.length,
    active_bank_count: (registry.banks || []).filter(b=>b.denominator_eligible===true && b.estado==='CONFIRMADO_ACTIVO' && b.trabaja_flora_silvestre===true).length,
    active_universe_complete: registry.active_universe_complete===true,
    all_taxa_matrix_complete: allTaxaMatrixComplete,
    model_scale_frozen: Boolean(snapshot),
    P99_A: snapshot ? snapshot.P99_A : null,
    P99_P: snapshot ? snapshot.P99_P : null,
    snapshot,
    matrix,
    results:finalResults
  };
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
  if (!args.universe || !args.registry || !args.sources || !args.out) throw new Error('USAGE: --universe universe.json --registry registry.json --sources manifest.json --out out.json');
  const universe = loadJson(args.universe), registry=loadJson(args.registry), sourceManifest=loadJson(args.sources);
  const result = runFullUniverse({universe,registry,sourceManifest,baseDir:path.dirname(args.sources),updatedAt:new Date().toISOString()});
  fs.writeFileSync(args.out, JSON.stringify(result,null,2));
  console.log(JSON.stringify({run_id:result.run_id,universe_count:result.universe_count,active_bank_count:result.active_bank_count,active_universe_complete:result.active_universe_complete,all_taxa_matrix_complete:result.all_taxa_matrix_complete,model_scale_frozen:result.model_scale_frozen,P99_A:result.P99_A,P99_P:result.P99_P}));
}

module.exports={fold,aliasesForTaxon,indexSnapshot,sourceMatchesTaxon,normalizeAccession,bankCheckForTaxon,executeTaxon,matrixCompleteForTaxon,loadSources,runFullUniverse};
