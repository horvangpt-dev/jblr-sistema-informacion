#!/usr/bin/env node
'use strict';

const assert = require('assert');
const registry = require('../src/stimes/field-registry-v0.json');
const externalSchemas = require('./fixtures/stimes/external-schemas-v0.json');

const REQUIRED = registry.required_field_properties;
const AUTOMATION = new Set(registry.allowed_automation_types);
const CAPABILITIES = new Set(registry.allowed_capability_classes);
const EXPECTED_MITECO_BLOCK_01 = [
  'id_acces',
  'cod_banco',
  'idtaxon',
  'nom_cient',
  'cod_origen',
  'fecha_reco',
  'recolec',
  'prot_reco',
  'estado'
];

assert.strictEqual(registry.registry_id, 'STIMES_FIELD_REGISTRY_v0');
assert.strictEqual(registry.status, 'BLOCK_01_READY');
assert.strictEqual(registry.fields.length, 9, 'Block 01 must contain exactly 9 fields');
assert.strictEqual(registry.source_policy.miteco_headers.count, 101, 'MITECO output schema must retain 101 headers');
assert.strictEqual(registry.source_policy.repaired_master_status, 'NOT_FOUND', 'NOT_FOUND must remain explicit, never converted to absence');

assert.strictEqual(externalSchemas.miteco.status, 'RECOVERED');
assert.strictEqual(externalSchemas.miteco.field_count, 101);
assert.strictEqual(externalSchemas.miteco.headers.length, 101);
assert.strictEqual(new Set(externalSchemas.miteco.headers).size, 101, 'MITECO headers must be unique');
assert.deepStrictEqual(externalSchemas.miteco.headers.slice(0, 9), EXPECTED_MITECO_BLOCK_01, 'Recovered MITECO order changed');
assert.strictEqual(externalSchemas.missouri_index_seminum.field_count, 16);
assert.strictEqual(externalSchemas.missouri_index_seminum.headers.length, 16);
assert.strictEqual(externalSchemas.vista_rapida.status, 'PARTIALLY_RECOVERED');
assert.strictEqual(externalSchemas.vista_rapida.exact_full_header_order, 'NOT_YET_PROVEN');

const ids = new Set();
const canonical = new Set();
const miteco = [];

for (const field of registry.fields) {
  for (const key of REQUIRED) {
    assert.ok(Object.prototype.hasOwnProperty.call(field, key), `${field.FIELD_ID || '<missing FIELD_ID>'}: missing ${key}`);
  }
  assert.match(field.FIELD_ID, /^STIMES\.FIELD\.\d{4}$/);
  assert.ok(!ids.has(field.FIELD_ID), `duplicate FIELD_ID ${field.FIELD_ID}`);
  ids.add(field.FIELD_ID);
  assert.ok(!canonical.has(field.nombre_canonico), `duplicate canonical name ${field.nombre_canonico}`);
  canonical.add(field.nombre_canonico);
  assert.ok(AUTOMATION.has(field.nivel_automatizacion), `${field.FIELD_ID}: invalid automation type`);
  assert.strictEqual(field.provenance_required, true, `${field.FIELD_ID}: provenance must be mandatory`);
  assert.strictEqual(field.history_required, true, `${field.FIELD_ID}: history must be mandatory`);
  assert.ok(field.mapeo_jblr && CAPABILITIES.has(field.mapeo_jblr.capability_class), `${field.FIELD_ID}: invalid JBLR capability classification`);
  assert.strictEqual(field.mapeo_jblr.database_change_now, 'NONE', `${field.FIELD_ID}: block 01 must not perform database schema changes`);
  if (field.equivalente_MITECO) miteco.push(field.equivalente_MITECO);
}

assert.deepStrictEqual(miteco, EXPECTED_MITECO_BLOCK_01, 'MITECO block 01 order/name mismatch');

const byMiteco = Object.fromEntries(registry.fields.map(f => [f.equivalente_MITECO, f]));
assert.strictEqual(byMiteco.cod_banco.nivel_automatizacion, 'CONSTANTE_INSTITUCIONAL');
assert.strictEqual(byMiteco.idtaxon.requiere_revision_humana, true, 'Taxonomic lookup cannot silently validate');
assert.strictEqual(byMiteco.nom_cient.requiere_revision_humana, true, 'Accepted name cannot be silently asserted');
assert.notStrictEqual(byMiteco.id_acces.mapeo_jblr.target, 'core.resource.jblr_code', 'Banco 2 accession identifier must not be collapsed into technical JBLR code');
assert.strictEqual(byMiteco.estado.vocabulario_controlado.includes('BAJA'), true, 'MITECO BAJA state must remain representable without deletion');

const visibleBlock01 = registry.fields.filter(f => f.equivalente_vista_rapida).map(f => f.equivalente_MITECO);
assert.deepStrictEqual(visibleBlock01, externalSchemas.vista_rapida.block_01_visible_miteco_fields, 'Block 01 quick-view visibility changed');

console.log('STIMES_FIELD_REGISTRY_BLOCK_01_PASS');
