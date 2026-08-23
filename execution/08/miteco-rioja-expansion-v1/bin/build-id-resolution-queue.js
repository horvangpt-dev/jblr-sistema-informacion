#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
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

const input = arg('input');
const output = arg('output');
if (!input || !output) throw new Error('USAGE: --input MITECO_RIOJA_PARALLEL_CORPUS_v1.json --output queue.json');
const corpus = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
if (!corpus?.payload?.taxaByExactId || !Array.isArray(corpus.payload.taxaByExactId)) throw new Error('CORPUS_INVALID');
if (corpus.payload.independenceGuard?.existingRiojaCorpusInputUsed !== false) throw new Error('CORPUS_INDEPENDENCE_GUARD_FAILED');

const unresolved = corpus.payload.taxaByExactId.filter(t => !String(t.identityResolutionState).startsWith('OFFICIAL_ID_LOOKUP_'));
const units = unresolved.map(t => ({
  QUERY_UNIT_ID: `MITECO_RIOJA_IDENTITY_${t.idTaxon}_TAX_EIDOS`,
  TAXON_WORK_KEY: `MITECO_RIOJA_DISCOVERY_ID_${t.idTaxon}`,
  TAXON_WORK_KEY_STATE: 'PARALLEL_DISCOVERY_NONCANONICAL',
  ID_TAXON_QUERY: t.idTaxon,
  ID_TAXON_QUERY_STATE: 'SOURCE_ASSERTED_EIDOS_ID',
  ID_TAXON_ORIGIN_SOURCE: 'MITECO_IEPNB_EIDOS_DISTRIBUTION_CURRENT',
  FIELD_TARGET: 'TAX_EIDOS',
  SOURCE_TARGET: 'IEPNB_EIDOS_CURRENT_PORTAL',
  PROTOCOL_VERSION: 'ID_TAXON_BY_ID_TAXON_v1',
  SOURCE_ADAPTER_VERSION: 'PENDING_CURRENT_EIDOS_IDENTITY_ADAPTER',
  SOURCE_VERSION_EXPECTED: 'CURRENT',
  REQUESTED_AT: null,
  TERRITORIAL_EVIDENCE_STATE: t.territorialEvidenceState,
  DISTRIBUTION_UNITS: t.distributionUnits,
  CANONICAL_MEMBERSHIP_EFFECT: 'NONE',
  CROSS_WITH_JBLR_ALLOWED: false
}));

const payload = {
  version: 'MITECO_RIOJA_ID_RESOLUTION_QUEUE_v1',
  sourceCorpusVersion: corpus.payload.corpusVersion,
  sourceCorpusSha256: corpus.sha256,
  queueSemantics: 'EXACT_ID_ONLY; CACHE_FIRST; LIVE_EIDOS_ONLY_FOR_UNRESOLVED; NO_JBLR_CROSS',
  unitCount: units.length,
  units
};
const doc = {
  sha256: sha256Utf8(canonicalJson(payload)),
  hashCanonicalization: 'recursive_object_keys_sorted_no_whitespace',
  payload
};
fs.writeFileSync(path.resolve(output), JSON.stringify(doc, null, 2) + '\n');
console.log(JSON.stringify({ queueSha256: doc.sha256, unitCount: units.length, output: path.resolve(output) }, null, 2));
