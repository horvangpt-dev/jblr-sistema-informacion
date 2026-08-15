\set ON_ERROR_STOP on
DO $$
DECLARE t integer; v integer;
BEGIN
 SELECT count(*) INTO t FROM information_schema.tables WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security') AND table_type='BASE TABLE';
 SELECT count(*) INTO v FROM information_schema.views WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security');
 IF t <> 85 THEN RAISE EXCEPTION 'expected 85 baseline tables, got %',t; END IF;
 IF v <> 8 THEN RAISE EXCEPTION 'expected 8 baseline views, got %',v; END IF;
END $$;
SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','pg_trgm') ORDER BY extname;
