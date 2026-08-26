DO $$ BEGIN RAISE EXCEPTION 'CORE_PHYSICAL_MODEL_v1 is immutable; destructive Sqitch revert is prohibited'; END $$;
