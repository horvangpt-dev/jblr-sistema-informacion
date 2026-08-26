-- Deploy institutional_release_registry_v1
BEGIN;
CREATE TABLE governance.schema_release (
    release_id uuid PRIMARY KEY,
    jblr_release text NOT NULL UNIQUE,
    environment_code text NOT NULL CHECK (environment_code IN ('DEV','TEST','STAGING','PROD')),
    conceptual_version text NOT NULL,
    logical_version text NOT NULL,
    physical_baseline_version text NOT NULL,
    baseline_sha256 char(64) NOT NULL CHECK (baseline_sha256 ~ '^[0-9a-f]{64}$'),
    sqitch_project text NOT NULL DEFAULT 'jblr-db',
    sqitch_plan_hash char(64) CHECK (sqitch_plan_hash IS NULL OR sqitch_plan_hash ~ '^[0-9a-f]{64}$'),
    git_commit_sha text,
    git_release_tag text,
    applied_at timestamptz NOT NULL DEFAULT current_timestamp,
    applied_by text NOT NULL,
    release_status text NOT NULL CHECK (release_status IN ('installed','verified','failed','superseded','reverted')),
    verification_result text,
    verification_manifest_sha256 char(64) CHECK (verification_manifest_sha256 IS NULL OR verification_manifest_sha256 ~ '^[0-9a-f]{64}$'),
    notes text
);
CREATE INDEX idx_schema_release_environment_date ON governance.schema_release(environment_code, applied_at DESC);
COMMIT;
