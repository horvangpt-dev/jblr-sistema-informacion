\set ON_ERROR_STOP on

-- 01.4R infrastructure-only ownership assignment.
-- This does not alter CORE_PHYSICAL_MODEL_v1; it assigns ownership after deployment.
ALTER SCHEMA core OWNER TO jblr_db_owner;
ALTER SCHEMA taxonomy OWNER TO jblr_db_owner;
ALTER SCHEMA field OWNER TO jblr_db_owner;
ALTER SCHEMA material OWNER TO jblr_db_owner;
ALTER SCHEMA evidence OWNER TO jblr_db_owner;
ALTER SCHEMA governance OWNER TO jblr_db_owner;
ALTER SCHEMA analytics OWNER TO jblr_db_owner;
ALTER SCHEMA security OWNER TO jblr_db_owner;
ALTER SCHEMA migration_staging OWNER TO jblr_db_owner;

DO $$
DECLARE r record;
DECLARE cmd text;
BEGIN
  -- Relations first. Exclude sequences: a sequence owned by a table column
  -- cannot have ownership changed independently; it follows the parent table.
  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security','migration_staging')
      AND c.relkind IN ('r','p','v','m','f')
    ORDER BY n.nspname, c.relname
  LOOP
    cmd := CASE r.relkind
      WHEN 'v' THEN format('ALTER VIEW %I.%I OWNER TO jblr_db_owner', r.nspname, r.relname)
      WHEN 'm' THEN format('ALTER MATERIALIZED VIEW %I.%I OWNER TO jblr_db_owner', r.nspname, r.relname)
      WHEN 'f' THEN format('ALTER FOREIGN TABLE %I.%I OWNER TO jblr_db_owner', r.nspname, r.relname)
      ELSE format('ALTER TABLE %I.%I OWNER TO jblr_db_owner', r.nspname, r.relname)
    END;
    EXECUTE cmd;
  END LOOP;

  -- Reassign only standalone sequences. Owned/identity sequences already
  -- follow the ownership of their parent table and must not be altered alone.
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security','migration_staging')
      AND c.relkind='S'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_class parent ON parent.oid=d.refobjid
        WHERE d.classid='pg_class'::regclass
          AND d.objid=c.oid
          AND d.refclassid='pg_class'::regclass
          AND d.deptype IN ('a','i')
          AND parent.relkind IN ('r','p')
      )
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO jblr_db_owner', r.nspname, r.relname);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, p.oid, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security','migration_staging')
  LOOP
    IF r.prokind='p' THEN
      EXECUTE format('ALTER PROCEDURE %I.%I(%s) OWNER TO jblr_db_owner', r.nspname, r.proname, pg_get_function_identity_arguments(r.oid));
    ELSE
      EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO jblr_db_owner', r.nspname, r.proname, pg_get_function_identity_arguments(r.oid));
    END IF;
  END LOOP;
END $$;
