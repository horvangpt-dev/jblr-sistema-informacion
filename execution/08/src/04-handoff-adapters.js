'use strict';

const { executeAmenaza } = require('./amenaza-core.js');
const { selectProtection } = require('./proteccion-core.js');

function idOf(item) { return item && (item.release_row_id || item.taxon_id || item.taxon_identifier || null); }

function sourceInput(item, context, stimeId) {
  const byTaxon = context && context.config && context.config.STIME_INPUTS_BY_TAXON;
  const id = idOf(item);
  if (byTaxon && id && Object.prototype.hasOwnProperty.call(byTaxon, id)) return byTaxon[id];
  const provider = context && context.config && context.config.SOURCE_PROVIDER;
  if (typeof provider === 'function') return provider({ stime_id: stimeId, taxon: item, context });
  return null;
}
function sourceUnavailable(stimeId, item) {
  return {
    semantic_state: 'SOURCE_NOT_ACQUIRED',
    state: 'SOURCE_NOT_ACQUIRED',
    value: null,
    result_state: 'SOURCE_NOT_ACQUIRED',
    taxon_id: idOf(item),
    stime_id: stimeId,
    provenance: { source: null, reason: 'NO_STIME_INPUT_OR_SOURCE_PROVIDER_BOUND' },
    cacheable: false
  };
}
function blockedAdapter(meta) {
  return {
    ...meta,
    DEFAULT_INFERENCES: [],
    EXPLICIT_ALLOWED_DEFAULTS: [],
    CACHE_SOURCE_VERSION: null,
    async executeItem() {
      const e = new Error(meta.BLOCK_REASON || 'STIME blocked by current actor-04 handoff');
      e.code = 'STIME_BLOCKED_BY_04';
      e.retryable = false;
      throw e;
    }
  };
}

const amenaza = {
  STIME_ID: 'STIME_AMENAZA',
  STIME_VERSION: 'AMENAZA_STIMES_CONTRACT_v1_1+AMENAZA_STIMES_EXECUTION_POLICY_v1_1@1.1.1',
  EXECUTION_STATUS: 'READY_FOR_08',
  INPUT_CONTRACT: 'FINAL_09_TAXON_RECORD + AMENAZA_EVIDENCE_v2 + AMENAZA_SCORING_MODEL_v1_2',
  OUTPUT_CONTRACT: 'AMENAZA_08_OUTPUT_v1_FROM_04_HANDOFF',
  UNKNOWN_SEMANTICS: 'NULL_SEMANTIC_SCORE; TECHNICAL_ZERO_ONLY_WHEN_DOWNSTREAM_ARITHMETIC_EXPLICITLY_REQUIRES_NUMBER',
  SOURCE_REQUIREMENTS: ['RIOJA_RED_BOOK','EIDOS','SPAIN_RED_LISTS','EUROPE_CONTINENTAL_2011','EUROPE_NATIONAL_REDLISTS','IUCN_GLOBAL_WHEN_REFRESH_OR_AUTHENTICATED_ACQUISITION_REQUIRED'],
  QA_RULES: ['021_022','PRESERVE_NATIVE_SCORE','EFFECTIVE_SCOPE_ORDER','DISTINCT_LOGICAL_UNITS','TECHNICAL_ZERO_MARKER','NO_HISTORICAL_UNIVERSE_BINDING','PROVENANCE_REQUIRED'],
  DEPENDENCIES: [],
  DEFAULT_INFERENCES: [],
  EXPLICIT_ALLOWED_DEFAULTS: [],
  cacheKey(item) { return `STIME_AMENAZA|${idOf(item)}`; },
  async executeItem(item, context) {
    const input = await sourceInput(item, context, 'STIME_AMENAZA');
    if (!input) return sourceUnavailable('STIME_AMENAZA', item);
    return executeAmenaza({
      taxon: item,
      evidence_records: input.evidence_records || [],
      provider_score: input.provider_score == null ? null : input.provider_score,
      scope_states: input.scope_states || {},
      conflict_taxon: input.conflict_taxon === true,
      downstream_requires_number: input.downstream_requires_number === true,
      materialized_at: input.materialized_at || null
    });
  }
};

const proteccion = {
  STIME_ID: 'STIME_PROTECCION',
  STIME_VERSION: 'ITEM_1.1.0+PROTECCION_STIMES_SELECTION_v1_1+PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2',
  EXECUTION_STATUS: 'READY_FOR_08',
  INPUT_CONTRACT: 'FINAL_09_TAXON_RECORD + PROTECCION_LEGAL_EVIDENCE_v2 + OFFICIAL_LEGAL_SOURCES + PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2',
  OUTPUT_CONTRACT: 'PROTECCION_08_OUTPUT_v1_FROM_04_HANDOFF',
  UNKNOWN_SEMANTICS: 'UNKNOWN/NO_COMPROBADO/SOURCE_NOT_ACQUIRED/TAXON_UNRESOLVED/CONFLICT_EXPLICIT; SIN_PROTECCION_LEGAL_ONLY_AFTER_COMPLETED_AUDITABLE_NEGATIVE_SEARCH',
  SOURCE_REQUIREMENTS: ['OFFICIAL_PRIMARY_NORMATIVE_TEXT','OFFICIAL_CONSOLIDATED_INSTITUTIONAL_SOURCE','EIDOS_IEPNB','AUTHORIZED_SUPPORTING_SOURCES_ONLY'],
  QA_RULES: ['TERRITORIAL_APPLICABILITY','CURRENTNESS','LEGAL_VALIDITY','LITERAL_CATEGORY_GUARDS','COMPLETED_NEGATIVE_GUARD','NO_FALSE_SIN_PROTECCION','021_022','PROVENANCE_REQUIRED','NO_HISTORICAL_UNIVERSE_BINDING'],
  DEPENDENCIES: [],
  DEFAULT_INFERENCES: [],
  EXPLICIT_ALLOWED_DEFAULTS: [],
  cacheKey(item) { return `STIME_PROTECCION|${idOf(item)}`; },
  async executeItem(item, context) {
    const input = await sourceInput(item, context, 'STIME_PROTECCION');
    if (!input) return sourceUnavailable('STIME_PROTECCION', item);
    return selectProtection({ taxon: item, evidence: input.evidence || [], search: input.search || {}, downstreamRequiresNumber: input.downstream_requires_number === true, updatedAt: input.updated_at || null });
  }
};

const interes = {
  STIME_ID: 'STIME_INTERES_CIENTIFICO',
  STIME_VERSION: 'INTERES_CIENTIFICO_CANONICAL_v0_1+MATERIALIZED_00_01_CONTRACT',
  EXECUTION_STATUS: 'READY_FOR_08',
  EXECUTION_PHASE: 'N20_STRATIFIED_RAW_EVIDENCE_ONLY',
  INPUT_CONTRACT: 'FINAL_09_TAXON_SNAPSHOT + DIMENSION_A_B_C_RAW_EVIDENCE',
  OUTPUT_CONTRACT: 'INTERES_CIENTIFICO_N20_RAW_EVIDENCE_v1',
  UNKNOWN_SEMANTICS: 'UNKNOWN_REMAINS_UNKNOWN; EMPTY_SEARCH_NOT_KNOWLEDGE_ABSENCE; MAJOR_GAP_REQUIRES_SEARCH_SUFFICIENT; NO_NUMERIC_PLACEHOLDER',
  SOURCE_REQUIREMENTS: ['OPENALEX','PRIMARY_AUTHORIZED_BIBLIOGRAPHIC_SOURCES','PHYLOGENY_IF_THREAT_SEPARABLE','TAXONOMIC_TREATMENTS','REGIONAL_BIOGEOGRAPHIC_SOURCES','ANTHOS_GBIF_POWO_AS_APPLICABLE','TRY_OR_PRIMARY_TRAIT_LITERATURE_IF_ELIGIBLE','NCBI_AS_APPLICABLE','RIOJA_SPECIFIC_EVIDENCE'],
  QA_RULES: ['N20_EXACT_OR_EXPLICIT_BLOCKED_SUBSTITUTION','STRATIFICATION_REPRODUCIBLE','021_022','NO_CONTEXTUAL_HIT_AS_EXACT','NO_IDENTITY_TOKEN_LOSS','QUERY_AND_EVIDENCE_PROVENANCE','DEDUP_DOCUMENTED','UNKNOWN_NOT_FOUND_UNRESOLVED_CONFLICT_PRESERVED','MAJOR_GAP_ONLY_SEARCH_SUFFICIENT','THREAT_EXCLUDED','SCORING_OFF','WEIGHTS_PENDING'],
  DEPENDENCIES: [],
  DEFAULT_INFERENCES: [],
  EXPLICIT_ALLOWED_DEFAULTS: [],
  cacheKey(item) { return `STIME_INTERES_CIENTIFICO|${idOf(item)}`; },
  async executeItem(item, context) {
    const input = await sourceInput(item, context, 'STIME_INTERES_CIENTIFICO');
    if (!input) return sourceUnavailable('STIME_INTERES_CIENTIFICO', item);
    if (input.INTERES_CIENTIFICO_100 != null || input.scoring === true || input.weights != null) {
      const e = new Error('INTERES_CIENTIFICO phase 1 forbids scoring/weights'); e.code = 'INTERES_SCORING_FORBIDDEN_PHASE_1'; e.retryable = false; throw e;
    }
    const searchSufficient = input.SEARCH_SUFFICIENT === true;
    if (input.knowledge_state === 'MAJOR_GAP' && !searchSufficient) {
      const e = new Error('MAJOR_GAP requires SEARCH_SUFFICIENT'); e.code = 'INTERES_MAJOR_GAP_UNSUPPORTED'; e.retryable = false; throw e;
    }
    return {
      semantic_state: input.execution_state || (input.source_not_acquired === true ? 'SOURCE_NOT_ACQUIRED' : 'RAW_EVIDENCE_CAPTURED'),
      execution_phase: 'N20_STRATIFIED_RAW_EVIDENCE_ONLY',
      scoring: 'OFF',
      weights: 'CALIBRATION_PENDING',
      taxon_id: idOf(item),
      TAXON_QUERY_SNAPSHOT: input.TAXON_QUERY_SNAPSHOT || null,
      dimension_A: input.dimension_A || null,
      dimension_B: input.dimension_B || null,
      dimension_C: input.dimension_C || null,
      QUERY_NAMES_USED: input.QUERY_NAMES_USED || [],
      SOURCES: input.SOURCES || [],
      RAW_RESULT_COUNTS: input.RAW_RESULT_COUNTS || {},
      VALIDATED_RESULT_COUNTS: input.VALIDATED_RESULT_COUNTS || {},
      DEDUPLICATED_RESULT_COUNTS: input.DEDUPLICATED_RESULT_COUNTS || {},
      FILTERS: input.FILTERS || [],
      EVIDENCE_POINTERS: input.EVIDENCE_POINTERS || [],
      EVIDENCE_COVERAGE: input.EVIDENCE_COVERAGE || null,
      CONFIDENCE_STATE: input.CONFIDENCE_STATE || 'UNKNOWN',
      UNRESOLVED_FIELDS: input.UNRESOLVED_FIELDS || [],
      SEARCH_SUFFICIENT: searchSufficient,
      knowledge_state: input.knowledge_state || 'UNKNOWN',
      provenance: input.provenance || { sources: input.SOURCES || [], evidence_pointers: input.EVIDENCE_POINTERS || [] },
      cacheable: input.cacheable === true
    };
  }
};

const repExSitu = blockedAdapter({
  STIME_ID: 'STIME_REPRESENTACION_EX_SITU',
  STIME_VERSION: 'REP_EX_SITU_MODEL_v1+ITEM_1.0.0',
  EXECUTION_STATUS: 'BLOCKED_BY_REAL_DATA_P99_AND_VERSION_CONTRACT',
  INPUT_CONTRACT: 'FINAL_09_RELEASE + VERIFIED_BANK_REGISTRY + TAXON_BANK_EVIDENCE + VALID_P99_SNAPSHOT',
  OUTPUT_CONTRACT: 'REP_EX_SITU_OUTPUT_BLOCKED_PENDING_REAL_DATA_P99_AND_VERSION_CONTRACT',
  UNKNOWN_SEMANTICS: 'NO_INVENTED_ORIGIN_COUNTRY_OR_WILD_ORIGIN; FINAL_SCORE_FORBIDDEN_UNTIL_GATES_CLEAR',
  SOURCE_REQUIREMENTS: ['VERIFIED_CURRENT_BANK_REGISTRY','AUDITABLE_BANK_SPECIFIC_SEARCHES','ACCESSION_IDENTITY_AND_CURRENT_CONSERVATION_EVIDENCE','LOCALITY_POPULATION_EVIDENCE'],
  QA_RULES: ['P99_FREEZE_GUARD','NO_INVENTED_IDENTIFIERS','NO_INVENTED_GEOGRAPHY','NO_HISTORICAL_UNIVERSE','WILD_ORIGIN_ONLY_FROM_EXPLICIT_EVIDENCE_OR_PROVEN_WILD_ONLY_SOURCE_SCOPE_WITH_PROVENANCE'],
  DEPENDENCIES: [],
  BLOCK_REASON: 'REP_EX_SITU remains blocked after 0000 resolved wild-origin semantics: real-data coverage, final P99 validation and version-contract gates remain open.'
});

const urgencia = blockedAdapter({
  STIME_ID: 'COMPOSITE_STIME_URGENCIA_RECOLECCION',
  STIME_VERSION: 'URGENCIA_METHOD_DESIGN_v1',
  EXECUTION_STATUS: 'BLOCKED_BY_UPSTREAM_STIME',
  INPUT_CONTRACT: 'SAME_RELEASE_AMENAZA+PROTECCION+DEFICIT_EX_SITU + N_REF_CALIBRATION',
  OUTPUT_CONTRACT: 'URGENCIA_OUTPUT_BLOCKED_PENDING_UPSTREAM_AND_CALIBRATION',
  UNKNOWN_SEMANTICS: 'PRESERVE_UPSTREAM_BLOCKING_STATES_AND_TECHNICAL_PLACEHOLDERS; NO_NEW_PLACEHOLDER_SEMANTICS',
  SOURCE_REQUIREMENTS: ['NONE_DIRECT_UPSTREAM_ONLY'],
  QA_RULES: ['SAME_RELEASE_ACROSS_DEPENDENCIES','WEIGHTS_40_20_40','EX_SITU_ALLOCATION_20_5_15','COMPONENT_SUM_AUDIT','N_REF_PROVENANCE','NO_UPSTREAM_REINTERPRETATION'],
  DEPENDENCIES: [{id:'STIME_AMENAZA',required_state:'DOWNSTREAM_READY'},{id:'STIME_PROTECCION',required_state:'DOWNSTREAM_READY'},{id:'STIME_REPRESENTACION_EX_SITU',required_state:'DOWNSTREAM_READY'},{id:'URGENCIA_N_REF',required_state:'CALIBRATED'}],
  BLOCK_REASON: 'URGENCIA blocked by REP_EX_SITU downstream readiness and N_REF calibration.'
});

const prioridad = blockedAdapter({
  STIME_ID: 'COMPOSITE_STIME_PRIORIDAD_TAXON',
  STIME_VERSION: 'NOT_DEFINED',
  EXECUTION_STATUS: 'DESIGN_INCOMPLETE',
  INPUT_CONTRACT: 'CONCEPTUAL_ONLY_URGENCIA+INTERES',
  OUTPUT_CONTRACT: 'NOT_DEFINED',
  UNKNOWN_SEMANTICS: 'NOT_DEFINED',
  SOURCE_REQUIREMENTS: [],
  QA_RULES: ['NO_FORMULA_OR_WEIGHTS_OR_RANKING_INVENTION'],
  DEPENDENCIES: [{id:'COMPOSITE_STIME_URGENCIA_RECOLECCION',required_state:'PRODUCTION_READY'},{id:'STIME_INTERES_CIENTIFICO',required_state:'PRODUCTION_READY'}],
  BLOCK_REASON: 'PRIORIDAD_TAXON design incomplete: formula, weights, thresholds and output semantics are not defined.'
});

function registry() {
  const adapters = [amenaza, proteccion, interes, repExSitu, urgencia, prioridad];
  return Object.fromEntries(adapters.map(a => [a.STIME_ID, { [a.STIME_VERSION]: a }]));
}
function classification() {
  return [amenaza, proteccion, interes, repExSitu, urgencia, prioridad].map(a => ({ STIME_ID:a.STIME_ID, STIME_VERSION:a.STIME_VERSION, EXECUTION_STATUS:a.EXECUTION_STATUS }));
}

module.exports = { amenaza, proteccion, interes, repExSitu, urgencia, prioridad, registry, classification };
