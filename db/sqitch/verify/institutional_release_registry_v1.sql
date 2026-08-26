BEGIN;
SELECT release_id, jblr_release, environment_code, baseline_sha256, release_status
FROM governance.schema_release
WHERE false;
ROLLBACK;
