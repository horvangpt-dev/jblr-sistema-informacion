-- JBLR 01.6 — Neon operational role/ownership adaptation
-- STAGING only. Not CORE_PHYSICAL_MODEL_v1. No secrets.
-- Apply only after FIX1 + institutional_release_registry_v1 + migration_staging_v1.

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'jblr_db_owner','jblr_db_admin','jblr_db_migrator','jblr_db_app',
    'jblr_db_reader','jblr_db_analyst','jblr_db_backup','jblr_db_auditor'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN',r);
    END IF;
  END LOOP;
END$$;

GRANT USAGE ON SCHEMA core,taxonomy,field,material,evidence,governance,analytics
TO jblr_db_reader,jblr_db_backup,jblr_db_auditor,jblr_db_analyst,jblr_db_app;

GRANT SELECT ON ALL TABLES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics
TO jblr_db_reader,jblr_db_backup,jblr_db_auditor,jblr_db_analyst;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics
TO jblr_db_app;

REVOKE CREATE ON SCHEMA core,taxonomy,field,material,evidence,governance,analytics,security,migration_staging
FROM jblr_db_app,jblr_db_reader,jblr_db_analyst,jblr_db_backup,jblr_db_auditor;

GRANT USAGE ON SCHEMA migration_staging TO jblr_db_auditor,jblr_db_migrator;
GRANT SELECT ON ALL TABLES IN SCHEMA migration_staging TO jblr_db_auditor;

-- Provider-specific bridge: no automatic inheritance, explicit SET ROLE only.
GRANT jblr_db_owner TO neondb_owner WITH INHERIT FALSE, SET TRUE;

ALTER SCHEMA analytics OWNER TO jblr_db_owner;
ALTER SCHEMA core OWNER TO jblr_db_owner;
ALTER SCHEMA evidence OWNER TO jblr_db_owner;
ALTER SCHEMA field OWNER TO jblr_db_owner;
ALTER SCHEMA governance OWNER TO jblr_db_owner;
ALTER SCHEMA material OWNER TO jblr_db_owner;
ALTER SCHEMA migration_staging OWNER TO jblr_db_owner;
ALTER SCHEMA security OWNER TO jblr_db_owner;
ALTER SCHEMA taxonomy OWNER TO jblr_db_owner;

DO $$
DECLARE r record; cmd text;
BEGIN
 FOR r IN
   SELECT n.nspname, c.relname, c.relkind
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security','migration_staging')
     AND c.relkind IN ('r','p','v','m')
 LOOP
   cmd := CASE r.relkind
     WHEN 'r' THEN format('ALTER TABLE %I.%I OWNER TO jblr_db_owner', r.nspname,r.relname)
     WHEN 'p' THEN format('ALTER TABLE %I.%I OWNER TO jblr_db_owner', r.nspname,r.relname)
     WHEN 'v' THEN format('ALTER VIEW %I.%I OWNER TO jblr_db_owner', r.nspname,r.relname)
     WHEN 'm' THEN format('ALTER MATERIALIZED VIEW %I.%I OWNER TO jblr_db_owner', r.nspname,r.relname)
   END;
   EXECUTE cmd;
 END LOOP;
END $$;

-- Standalone sequence. Identity-owned sequences follow their table owner.
ALTER SEQUENCE core.jblr_code_sequence OWNER TO jblr_db_owner;

DO $$
DECLARE r record;
BEGIN
 FOR r IN
   SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security','migration_staging')
 LOOP
   EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO jblr_db_owner', r.nspname,r.proname,r.args);
 END LOOP;
END $$;

-- Migrator can explicitly assume logical owner; no automatic inheritance.
GRANT jblr_db_owner TO jblr_db_migrator WITH INHERIT FALSE, SET TRUE;

SET ROLE jblr_db_owner;
GRANT USAGE ON SEQUENCE core.jblr_code_sequence TO jblr_db_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics
GRANT SELECT ON TABLES TO jblr_db_reader,jblr_db_backup,jblr_db_auditor,jblr_db_analyst;

ALTER DEFAULT PRIVILEGES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO jblr_db_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA migration_staging
GRANT SELECT ON TABLES TO jblr_db_auditor;

ALTER DEFAULT PRIVILEGES IN SCHEMA core,taxonomy,field,material,evidence,governance,analytics
GRANT USAGE ON SEQUENCES TO jblr_db_app;
RESET ROLE;
