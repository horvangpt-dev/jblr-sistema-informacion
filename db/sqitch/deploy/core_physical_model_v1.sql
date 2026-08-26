-- Register immutable baseline in Sqitch after external hash verification and installation.
-- Deliberately no baseline DDL is repeated here.
DO $$
BEGIN
  IF to_regclass('core.resource') IS NULL OR to_regclass('taxonomy.taxon_concept') IS NULL THEN
    RAISE EXCEPTION 'CORE_PHYSICAL_MODEL_v1 baseline is not installed';
  END IF;
END $$;
