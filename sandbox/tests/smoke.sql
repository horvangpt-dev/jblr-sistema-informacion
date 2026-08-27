BEGIN;

CREATE TABLE sandbox_taxon_candidate (
    sandbox_id bigserial PRIMARY KEY,
    supplied_name text NOT NULL,
    candidate_name text,
    source text,
    confidence numeric(5,4),
    canonical_effect boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sandbox_taxon_candidate
    (supplied_name, candidate_name, source, confidence)
VALUES
    ('Vicia sativa subsp. nigra', 'Vicia sativa subsp. nigra', 'synthetic-smoke', 1.0000),
    ('Papaver hybridum', 'Papaver hybridum', 'synthetic-smoke', 1.0000);

DO $$
DECLARE
    n integer;
    bad integer;
BEGIN
    SELECT count(*) INTO n FROM sandbox_taxon_candidate;
    IF n <> 2 THEN
        RAISE EXCEPTION 'sandbox row-count assertion failed: %', n;
    END IF;

    SELECT count(*) INTO bad
    FROM sandbox_taxon_candidate
    WHERE canonical_effect IS DISTINCT FROM false;

    IF bad <> 0 THEN
        RAISE EXCEPTION 'canonical-effect guard failed: % rows', bad;
    END IF;
END
$$;

SELECT sandbox_id, supplied_name, candidate_name, source, confidence, canonical_effect
FROM sandbox_taxon_candidate
ORDER BY sandbox_id;

ROLLBACK;
