\set ON_ERROR_STOP on
DO $$
DECLARE t integer; v integer;
BEGIN
 -- Count only CORE_PHYSICAL_MODEL_v1 baseline tables. Infrastructure added
 -- later by Sqitch (governance.schema_release) must not change this invariant.
 SELECT count(*) INTO t
 FROM information_schema.tables
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security')
   AND table_type='BASE TABLE'
   AND NOT (table_schema='governance' AND table_name='schema_release');
 SELECT count(*) INTO v
 FROM information_schema.views
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security');
 IF t <> 85 THEN RAISE EXCEPTION 'expected 85 baseline tables excluding governance.schema_release, got %',t; END IF;
 IF v <> 8 THEN RAISE EXCEPTION 'expected 8 baseline views, got %',v; END IF;
END $$;
SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','pg_trgm') ORDER BY extname;
