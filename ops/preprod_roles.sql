-- Pre-production functional role model. No passwords or secrets.
-- All roles are NOLOGIN here so privilege semantics can be tested with SET ROLE.
-- Login/service credential issuance is deliberately outside this file.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['jblr_db_owner','jblr_db_admin','jblr_db_migrator','jblr_db_app','jblr_db_reader','jblr_db_analyst','jblr_db_backup','jblr_db_auditor']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN',r); END IF;
  END LOOP;
END$$;

GRANT USAGE ON SCHEMA core,taxonomy,field,material,evidence,governance,analytics TO jblr_db_reader,jblr_db_backup,jblr_db_auditor,jblr_db_analyst,jblr_db_app;
GRANT SELECT ON ALL TABLES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics TO jblr_db_reader,jblr_db_backup,jblr_db_auditor,jblr_db_analyst;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics TO jblr_db_app;
REVOKE CREATE ON SCHEMA core,taxonomy,field,material,evidence,governance,analytics,security,migration_staging FROM jblr_db_app,jblr_db_reader,jblr_db_analyst,jblr_db_backup,jblr_db_auditor;
GRANT USAGE ON SCHEMA migration_staging TO jblr_db_auditor,jblr_db_migrator;
GRANT SELECT ON ALL TABLES IN SCHEMA migration_staging TO jblr_db_auditor;
