\set ON_ERROR_STOP on
DO $$
DECLARE
  t integer;
  v integer;
  f integer;
  trg integer;
  sch integer;
  ext integer;
BEGIN
  SELECT count(*) INTO t
  FROM information_schema.tables
  WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security')
    AND table_type='BASE TABLE';

  SELECT count(*) INTO v
  FROM information_schema.views
  WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security');

  SELECT count(*) INTO f
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security');

  SELECT count(*) INTO trg
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid=tg.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT tg.tgisinternal
    AND n.nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security');

  SELECT count(*) INTO sch
  FROM pg_namespace
  WHERE nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security');

  SELECT count(*) INTO ext FROM pg_extension WHERE extname IN ('postgis','pg_trgm');

  IF t <> 85 THEN RAISE EXCEPTION 'expected 85 baseline tables, got %', t; END IF;
  IF v <> 8 THEN RAISE EXCEPTION 'expected 8 baseline views, got %', v; END IF;
  IF f <> 18 THEN RAISE EXCEPTION 'expected 18 JBLR functions, got %', f; END IF;
  IF trg <> 65 THEN RAISE EXCEPTION 'expected 65 user triggers, got %', trg; END IF;
  IF sch <> 8 THEN RAISE EXCEPTION 'expected 8 JBLR schemas, got %', sch; END IF;
  IF ext <> 2 THEN RAISE EXCEPTION 'expected postgis and pg_trgm, got % required extensions', ext; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='taxonomy' AND p.proname='r2_assert_term_domains') THEN RAISE EXCEPTION 'missing taxonomy.r2_assert_term_domains'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security' AND p.proname='r2_assert_field_group_projection') THEN RAISE EXCEPTION 'missing security.r2_assert_field_group_projection'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='material' AND p.proname='r2_lock_sample_genealogy') THEN RAISE EXCEPTION 'missing material.r2_lock_sample_genealogy'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='evidence' AND p.proname='r2_get_or_create_external_record') THEN RAISE EXCEPTION 'missing evidence.r2_get_or_create_external_record'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='governance' AND p.proname='r2_transition_validation_status') THEN RAISE EXCEPTION 'missing governance.r2_transition_validation_status'; END IF;

  RAISE NOTICE 'PASS inventory tables=% views=% functions=% triggers=% schemas=% required_extensions=%', t,v,f,trg,sch,ext;
END $$;
SELECT current_setting('server_version') AS server_version;
SELECT extname,extversion FROM pg_extension WHERE extname IN ('postgis','pg_trgm') ORDER BY extname;
SELECT nspname FROM pg_namespace WHERE nspname IN ('core','taxonomy','field','material','evidence','governance','analytics','security') ORDER BY nspname;
