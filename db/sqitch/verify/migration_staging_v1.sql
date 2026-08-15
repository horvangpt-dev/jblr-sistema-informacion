BEGIN;
SELECT source_system, source_dataset, source_record_key, current_fingerprint, target_resource_id
FROM migration_staging.source_map WHERE false;
SELECT raw_record_id, raw_payload, validation_state FROM migration_staging.raw_record WHERE false;
SELECT migration_staging.register_source_mapping(NULL,NULL,NULL,NULL,NULL,NULL) WHERE false;
ROLLBACK;
