-- Deploy migration_staging_v1
BEGIN;
CREATE SCHEMA migration_staging;

CREATE TABLE migration_staging.source_file (
    source_file_id uuid PRIMARY KEY,
    source_system text NOT NULL,
    source_dataset text NOT NULL,
    source_file_name text NOT NULL,
    source_file_sha256 char(64) NOT NULL CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
    source_uri text,
    extractor_name text NOT NULL,
    extractor_version text NOT NULL,
    transformation_rule text NOT NULL,
    transformation_version text NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT current_timestamp,
    UNIQUE (source_system, source_dataset, source_file_sha256)
);

CREATE TABLE migration_staging.import_run (
    import_run_id uuid PRIMARY KEY,
    import_batch_id uuid REFERENCES governance.import_batch(resource_id) ON DELETE RESTRICT,
    source_file_id uuid NOT NULL REFERENCES migration_staging.source_file(source_file_id) ON DELETE RESTRICT,
    run_number integer NOT NULL CHECK (run_number >= 1),
    run_status text NOT NULL CHECK (run_status IN ('started','loaded','reconciled','failed','rolled_back')),
    started_at timestamptz NOT NULL DEFAULT current_timestamp,
    finished_at timestamptz,
    error_detail jsonb,
    notes text,
    UNIQUE(source_file_id, run_number),
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE migration_staging.raw_record (
    raw_record_id uuid PRIMARY KEY,
    import_run_id uuid NOT NULL REFERENCES migration_staging.import_run(import_run_id) ON DELETE RESTRICT,
    source_system text NOT NULL,
    source_dataset text NOT NULL,
    source_record_key text NOT NULL,
    source_record_fingerprint char(64) NOT NULL CHECK (source_record_fingerprint ~ '^[0-9a-f]{64}$'),
    sheet_or_table text,
    source_row_number bigint CHECK (source_row_number IS NULL OR source_row_number >= 1),
    raw_payload jsonb NOT NULL,
    extracted_at timestamptz NOT NULL DEFAULT current_timestamp,
    extractor_version text NOT NULL,
    validation_state text NOT NULL CHECK (validation_state IN ('raw','extracted','validation_failed','needs_review','validated','transformed','loaded','reconciled','rolled_back')),
    error_detail jsonb,
    UNIQUE(import_run_id, source_system, source_dataset, source_record_key, source_record_fingerprint)
);
CREATE INDEX idx_raw_record_identity ON migration_staging.raw_record(source_system, source_dataset, source_record_key, extracted_at DESC);

CREATE TABLE migration_staging.source_map (
    source_system text NOT NULL,
    source_dataset text NOT NULL,
    source_record_key text NOT NULL,
    current_fingerprint char(64) NOT NULL CHECK (current_fingerprint ~ '^[0-9a-f]{64}$'),
    target_resource_id uuid NOT NULL REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    target_resource_type varchar(3) NOT NULL REFERENCES core.resource_type(resource_type_code) ON DELETE RESTRICT,
    jblr_code varchar(32),
    first_import_run_id uuid NOT NULL REFERENCES migration_staging.import_run(import_run_id) ON DELETE RESTRICT,
    last_import_run_id uuid NOT NULL REFERENCES migration_staging.import_run(import_run_id) ON DELETE RESTRICT,
    first_loaded_at timestamptz NOT NULL DEFAULT current_timestamp,
    last_seen_at timestamptz NOT NULL DEFAULT current_timestamp,
    mapping_status text NOT NULL CHECK (mapping_status IN ('active','changed','needs_review','superseded','rejected')),
    PRIMARY KEY(source_system, source_dataset, source_record_key),
    UNIQUE(target_resource_id)
);

CREATE TABLE migration_staging.migration_event (
    migration_event_id uuid PRIMARY KEY,
    import_run_id uuid NOT NULL REFERENCES migration_staging.import_run(import_run_id) ON DELETE RESTRICT,
    source_system text,
    source_dataset text,
    source_record_key text,
    target_resource_id uuid REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    event_type text NOT NULL CHECK (event_type IN ('staged','inserted','unchanged','changed','snapshot_created','rejected','failed','rolled_back','reconciled')),
    old_fingerprint char(64) CHECK (old_fingerprint IS NULL OR old_fingerprint ~ '^[0-9a-f]{64}$'),
    new_fingerprint char(64) CHECK (new_fingerprint IS NULL OR new_fingerprint ~ '^[0-9a-f]{64}$'),
    occurred_at timestamptz NOT NULL DEFAULT current_timestamp,
    detail jsonb
);
CREATE INDEX idx_migration_event_run ON migration_staging.migration_event(import_run_id, occurred_at);
CREATE INDEX idx_migration_event_source ON migration_staging.migration_event(source_system, source_dataset, source_record_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION migration_staging.register_source_mapping(
    p_import_run_id uuid,
    p_source_system text,
    p_source_dataset text,
    p_source_record_key text,
    p_fingerprint char(64),
    p_target_resource_id uuid
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_old migration_staging.source_map%ROWTYPE;
    v_type varchar(3);
    v_code varchar(32);
    v_outcome text;
BEGIN
    SELECT * INTO v_old FROM migration_staging.source_map
     WHERE source_system=p_source_system AND source_dataset=p_source_dataset AND source_record_key=p_source_record_key
     FOR UPDATE;

    IF FOUND THEN
        IF v_old.target_resource_id <> p_target_resource_id THEN
            RAISE EXCEPTION 'source identity already maps to %, cannot remap silently to %', v_old.target_resource_id, p_target_resource_id;
        END IF;
        IF v_old.current_fingerprint = p_fingerprint THEN
            UPDATE migration_staging.source_map
               SET last_import_run_id=p_import_run_id, last_seen_at=current_timestamp, mapping_status='active'
             WHERE source_system=p_source_system AND source_dataset=p_source_dataset AND source_record_key=p_source_record_key;
            v_outcome := 'unchanged';
        ELSE
            UPDATE migration_staging.source_map
               SET current_fingerprint=p_fingerprint, last_import_run_id=p_import_run_id, last_seen_at=current_timestamp, mapping_status='changed'
             WHERE source_system=p_source_system AND source_dataset=p_source_dataset AND source_record_key=p_source_record_key;
            v_outcome := 'changed';
        END IF;
    ELSE
        SELECT resource_type_code, jblr_code INTO v_type, v_code FROM core.resource WHERE resource_id=p_target_resource_id;
        IF v_type IS NULL THEN RAISE EXCEPTION 'target Resource % does not exist', p_target_resource_id; END IF;
        INSERT INTO migration_staging.source_map(
            source_system,source_dataset,source_record_key,current_fingerprint,target_resource_id,target_resource_type,jblr_code,first_import_run_id,last_import_run_id,mapping_status
        ) VALUES (
            p_source_system,p_source_dataset,p_source_record_key,p_fingerprint,p_target_resource_id,v_type,v_code,p_import_run_id,p_import_run_id,'active'
        );
        v_outcome := 'inserted';
    END IF;

    INSERT INTO migration_staging.migration_event(
        migration_event_id,import_run_id,source_system,source_dataset,source_record_key,target_resource_id,event_type,old_fingerprint,new_fingerprint
    ) VALUES (
        uuidv7(),p_import_run_id,p_source_system,p_source_dataset,p_source_record_key,p_target_resource_id,v_outcome,
        CASE WHEN v_outcome='changed' THEN v_old.current_fingerprint ELSE NULL END,p_fingerprint
    );
    RETURN v_outcome;
END;
$$;
COMMIT;
