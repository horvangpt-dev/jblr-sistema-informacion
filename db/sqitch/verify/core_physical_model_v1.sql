DO $$
DECLARE t integer; v integer;
BEGIN
 -- Verify only the immutable CORE_PHYSICAL_MODEL_v1 inventory.
 -- Sqitch change institutional_release_registry_v1 adds governance.schema_release
 -- after the baseline has been installed, so that infrastructure table must not
 -- be counted as part of the 85-table physical baseline.
 SELECT count(*) INTO t FROM information_schema.tables
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security')
   AND table_type='BASE TABLE'
   AND NOT (table_schema='governance' AND table_name='schema_release');
 SELECT count(*) INTO v FROM information_schema.views
 WHERE table_schema IN ('core','taxonomy','field','material','evidence','governance','analytics','security');
 IF t <> 85 THEN RAISE EXCEPTION 'baseline table count mismatch excluding governance.schema_release: %', t; END IF;
 IF v <> 8 THEN RAISE EXCEPTION 'baseline view count mismatch: %', v; END IF;
END $$;
