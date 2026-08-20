'use strict';

function syntheticAdapter(options = {}) {
  const attempts = new Map();
  return {
    STIME_ID: 'STIME_SYNTHETIC_ECHO',
    STIME_VERSION: 'test-v1',
    INPUT_CONTRACT: 'SYNTHETIC_TEST_INPUT_v1',
    OUTPUT_CONTRACT: 'SYNTHETIC_TEST_OUTPUT_v1',
    UNKNOWN_SEMANTICS: 'PRESERVE_EXPLICIT_STATE_NO_ZERO_PROJECTION',
    SOURCE_REQUIREMENTS: ['SYNTHETIC_SOURCE_ONLY'],
    QA_RULES: ['PRESERVE_STATES', 'CACHE_PROVENANCE_REQUIRED', 'NO_FALSE_ZERO'],
    DEPENDENCIES: [],
    SYNTHETIC_ONLY: true,
    DEFAULT_INFERENCES: [],
    EXPLICIT_ALLOWED_DEFAULTS: [],
    CACHE_SOURCE_VERSION: options.cacheSourceVersion || 'synthetic-source-v1',
    CACHE_MAX_AGE_MS: options.cacheMaxAgeMs == null ? 60_000 : options.cacheMaxAgeMs,
    cacheKey(item) { return `STIME_SYNTHETIC_ECHO|${item.taxon_id}`; },
    async executeItem(item) {
      const prior = attempts.get(item.taxon_id) || 0;
      attempts.set(item.taxon_id, prior + 1);
      if (item.test_behavior === 'RETRY_ONCE' && prior === 0) {
        const e = new Error('synthetic transient failure');
        e.code = 'SYNTHETIC_TRANSIENT';
        e.retryable = true;
        throw e;
      }
      if (item.test_behavior === 'SOURCE_UNAVAILABLE') {
        return { semantic_state: 'SOURCE_NOT_ACQUIRED', source_state: 'SOURCE_UNAVAILABLE', value: null, cacheable: false, provenance: { source: 'SYNTHETIC_SOURCE', record: item.taxon_id } };
      }
      if (item.test_behavior === 'UNKNOWN') {
        return { semantic_state: 'UNKNOWN', value: null, cacheable: false, provenance: { source: 'SYNTHETIC_SOURCE', record: item.taxon_id } };
      }
      if (item.test_behavior === 'NOT_FOUND') {
        return { semantic_state: 'NOT_FOUND', value: null, cacheable: false, provenance: { source: 'SYNTHETIC_SOURCE', record: item.taxon_id } };
      }
      return { semantic_state: 'EVALUATED', value: item.synthetic_value, cacheable: true, provenance: { source: 'SYNTHETIC_SOURCE', record: item.taxon_id } };
    }
  };
}

module.exports = { syntheticAdapter };
