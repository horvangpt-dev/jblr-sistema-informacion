DO $$
DECLARE t integer; v integer;
BEGIN
 SELECT count(*) INTO t FROM information_schema.tables
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security') AND table_type='BASE TABLE';
 SELECT count(*) INTO v FROM information_schema.views
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security');
 IF t <> 85 THEN RAISE EXCEPTION 'baseline table count mismatch: %', t; END IF;
 IF v <> 8 THEN RAISE EXCEPTION 'baseline view count mismatch: %', v; END IF;
END $$;
