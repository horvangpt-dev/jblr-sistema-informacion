-- =====================================================================
-- JBLR · SISTEMA DE INFORMACIÓN BOTÁNICA
-- 01.1 · MODELO LÓGICO Y DDL POSTGRESQL/POSTGIS PRELIMINAR
-- PRELIMINAR — NO PRODUCCIÓN — NO EJECUTAR SIN REVISIÓN
--
-- Objetivo de compatibilidad:
--   PostgreSQL 18+ recomendado para piloto.
--   El diseño usa tipo uuid pero NO depende de DEFAULT uuidv7();
--   UUIDv7 debe generarse en aplicación o, en PostgreSQL 18+, puede
--   adoptarse uuidv7() tras revisión.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS taxonomy;
CREATE SCHEMA IF NOT EXISTS field;
CREATE SCHEMA IF NOT EXISTS material;
CREATE SCHEMA IF NOT EXISTS evidence;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS security;

-- =====================================================================
-- CORE
-- =====================================================================

CREATE TABLE core.resource_type (
    resource_type_code varchar(3) PRIMARY KEY,
    logical_name text NOT NULL UNIQUE,
    code_prefix varchar(3) UNIQUE,
    requires_jblr_code boolean NOT NULL DEFAULT false,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    CHECK (resource_type_code ~ '^[A-Z0-9]{3}$'),
    CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Z0-9]{3}$')
);

CREATE TABLE core.resource (
    resource_id uuid PRIMARY KEY,
    resource_type_code varchar(3) NOT NULL
        REFERENCES core.resource_type(resource_type_code) ON DELETE RESTRICT,
    jblr_code varchar(32) UNIQUE,
    validation_status text NOT NULL DEFAULT 'unreviewed'
        CHECK (validation_status IN ('unreviewed','pending_review','validated','disputed','rejected')),
    currency_status text NOT NULL DEFAULT 'current'
        CHECK (currency_status IN ('current','superseded','withdrawn')),
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    created_by_agent_id uuid,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp,
    row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
    CHECK (jblr_code IS NULL OR jblr_code ~ '^JBLR-[A-Z0-9]{3}-[0-9]{8}$')
);

CREATE INDEX idx_resource_type ON core.resource(resource_type_code);
CREATE INDEX idx_resource_validation ON core.resource(validation_status);
CREATE INDEX idx_resource_currency ON core.resource(currency_status);

CREATE TABLE core.agent (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    agent_kind text NOT NULL
        CHECK (agent_kind IN ('person','organization','software','team')),
    display_name text NOT NULL,
    legal_name text,
    external_identifiers jsonb,
    notes text
);

ALTER TABLE core.resource
    ADD CONSTRAINT fk_resource_created_by_agent
    FOREIGN KEY (created_by_agent_id)
    REFERENCES core.agent(resource_id) ON DELETE SET NULL;

CREATE INDEX idx_agent_display_name_trgm
    ON core.agent USING gin (display_name gin_trgm_ops);

CREATE TABLE core.agent_resource_role (
    agent_resource_role_id uuid PRIMARY KEY,
    agent_id uuid NOT NULL
        REFERENCES core.agent(resource_id) ON DELETE RESTRICT,
    resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    role_code text NOT NULL,
    valid_from timestamptz,
    valid_to timestamptz,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_agent_resource_role_resource ON core.agent_resource_role(resource_id);
CREATE INDEX idx_agent_resource_role_agent ON core.agent_resource_role(agent_id);

CREATE TABLE core.geographic_area (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    area_kind text NOT NULL,
    name text NOT NULL,
    parent_area_id uuid
        REFERENCES core.geographic_area(resource_id) ON DELETE RESTRICT,
    external_code text,
    external_code_system text,
    valid_from date,
    valid_to date,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_geographic_area_parent ON core.geographic_area(parent_area_id);
CREATE INDEX idx_geographic_area_name_trgm
    ON core.geographic_area USING gin (name gin_trgm_ops);

CREATE TABLE core.resource_set (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    set_kind text NOT NULL,
    label text NOT NULL,
    description text,
    valid_from timestamptz,
    valid_to timestamptz,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE core.resource_set_member (
    resource_set_id uuid NOT NULL
        REFERENCES core.resource_set(resource_id) ON DELETE RESTRICT,
    member_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    member_role text,
    ordinal integer CHECK (ordinal IS NULL OR ordinal >= 0),
    PRIMARY KEY (resource_set_id, member_resource_id)
);
CREATE INDEX idx_resource_set_member_member
    ON core.resource_set_member(member_resource_id);

-- =====================================================================
-- EVIDENCE: source registry and assets needed by other schemas
-- =====================================================================

CREATE TABLE evidence.external_source (
    external_source_id uuid PRIMARY KEY,
    source_code text NOT NULL UNIQUE,
    source_name text NOT NULL,
    source_type text NOT NULL,
    base_url text,
    default_license text,
    is_active boolean NOT NULL DEFAULT true,
    notes text
);

CREATE TABLE evidence.digital_asset (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    sha256 char(64) NOT NULL UNIQUE
        CHECK (sha256 ~ '^[0-9a-fA-F]{64}$'),
    size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    media_type text,
    storage_uri text NOT NULL,
    original_filename text,
    technical_metadata jsonb,
    notes text
);

-- =====================================================================
-- TAXONOMY
-- =====================================================================

CREATE TABLE taxonomy.term (
    term_key text PRIMARY KEY,
    term_domain text NOT NULL,
    term_code text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (term_domain, term_code)
);

CREATE INDEX idx_taxonomy_term_domain ON taxonomy.term(term_domain);

CREATE TABLE taxonomy.taxon_concept (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    rank_term_key text
        REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    parent_concept_id uuid
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    concept_label text,
    according_to_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    notes text,
    CHECK (parent_concept_id IS NULL OR parent_concept_id <> resource_id)
);
CREATE INDEX idx_taxon_concept_parent ON taxonomy.taxon_concept(parent_concept_id);
CREATE INDEX idx_taxon_concept_rank ON taxonomy.taxon_concept(rank_term_key);

CREATE TABLE taxonomy.taxonomic_name (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    rank_term_key text
        REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    scientific_name text NOT NULL,
    canonical_name text NOT NULL,
    authorship text,
    genus text,
    specific_epithet text,
    infraspecific_epithet text,
    hybrid_marker text,
    nomenclatural_code text,
    published_year integer CHECK (published_year IS NULL OR published_year BETWEEN 1500 AND 2500),
    original_spelling text,
    notes text
);
CREATE INDEX idx_taxonomic_name_canonical_lower
    ON taxonomy.taxonomic_name (lower(canonical_name));
CREATE INDEX idx_taxonomic_name_scientific_trgm
    ON taxonomy.taxonomic_name USING gin (scientific_name gin_trgm_ops);
CREATE INDEX idx_taxonomic_name_canonical_trgm
    ON taxonomy.taxonomic_name USING gin (canonical_name gin_trgm_ops);

CREATE TABLE taxonomy.name_usage (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    taxonomic_name_id uuid NOT NULL
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    treatment_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    usage_role text NOT NULL
        CHECK (usage_role IN ('accepted','synonym','previously_accepted','basionym','misapplied','historical_usage','unresolved')),
    verbatim_name text,
    valid_from date,
    valid_to date,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_name_usage_concept ON taxonomy.name_usage(taxon_concept_id);
CREATE INDEX idx_name_usage_name ON taxonomy.name_usage(taxonomic_name_id);
CREATE INDEX idx_name_usage_treatment ON taxonomy.name_usage(treatment_resource_id);

CREATE TABLE taxonomy.nomenclatural_relation (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    subject_name_id uuid NOT NULL
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    object_name_id uuid NOT NULL
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    relation_term_key text NOT NULL
        REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    valid_from date,
    valid_to date,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    notes text,
    CHECK (subject_name_id <> object_name_id),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_nomrel_subject ON taxonomy.nomenclatural_relation(subject_name_id);
CREATE INDEX idx_nomrel_object ON taxonomy.nomenclatural_relation(object_name_id);

CREATE TABLE taxonomy.taxon_concept_relation (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    subject_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    object_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    relation_type text NOT NULL
        CHECK (relation_type IN ('congruent_with','includes','included_in','overlaps','disjoint_from','uncertain_relationship')),
    treatment_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    valid_from date,
    valid_to date,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    notes text,
    CHECK (subject_concept_id <> object_concept_id),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_taxconrel_subject ON taxonomy.taxon_concept_relation(subject_concept_id);
CREATE INDEX idx_taxconrel_object ON taxonomy.taxon_concept_relation(object_concept_id);

CREATE TABLE taxonomy.taxon_change_event (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    change_type text NOT NULL
        CHECK (change_type IN ('split','lump','rank_change','accepted_name_change','recircumscription','other')),
    effective_date date,
    decided_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    rationale text,
    notes text
);

CREATE TABLE taxonomy.taxon_change_event_concept (
    taxon_change_event_id uuid NOT NULL
        REFERENCES taxonomy.taxon_change_event(resource_id) ON DELETE RESTRICT,
    taxon_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    event_role text NOT NULL
        CHECK (event_role IN ('input','output','affected')),
    PRIMARY KEY (taxon_change_event_id, taxon_concept_id, event_role)
);
CREATE INDEX idx_tax_change_concept ON taxonomy.taxon_change_event_concept(taxon_concept_id);

CREATE TABLE taxonomy.identification (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    taxon_concept_id uuid
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    taxonomic_name_id uuid
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    verbatim_identification text,
    identified_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    identified_at date,
    method_text text,
    method_reference_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    qualifier text,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    is_preferred boolean NOT NULL DEFAULT false,
    supersedes_identification_id uuid
        REFERENCES taxonomy.identification(resource_id) ON DELETE RESTRICT,
    notes text,
    CHECK (
        taxon_concept_id IS NOT NULL
        OR taxonomic_name_id IS NOT NULL
        OR verbatim_identification IS NOT NULL
    ),
    CHECK (supersedes_identification_id IS NULL OR supersedes_identification_id <> resource_id)
);
CREATE INDEX idx_identification_target ON taxonomy.identification(target_resource_id);
CREATE INDEX idx_identification_concept ON taxonomy.identification(taxon_concept_id);
CREATE UNIQUE INDEX uq_identification_preferred_target
    ON taxonomy.identification(target_resource_id)
    WHERE is_preferred = true;

CREATE TABLE taxonomy.backbone_snapshot (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    external_source_id uuid NOT NULL
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    version_label text,
    retrieved_at timestamptz NOT NULL,
    dataset_uri text,
    checksum text,
    digital_asset_id uuid
        REFERENCES evidence.digital_asset(resource_id) ON DELETE RESTRICT,
    notes text
);
CREATE INDEX idx_backbone_source ON taxonomy.backbone_snapshot(external_source_id);

CREATE TABLE taxonomy.external_taxon_reference (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_concept_id uuid
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    taxonomic_name_id uuid
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    external_source_id uuid NOT NULL
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    backbone_snapshot_id uuid
        REFERENCES taxonomy.backbone_snapshot(resource_id) ON DELETE RESTRICT,
    external_id text NOT NULL,
    external_url text,
    match_type text,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    notes text,
    CHECK (taxon_concept_id IS NOT NULL OR taxonomic_name_id IS NOT NULL)
);
CREATE INDEX idx_external_taxon_ref_concept ON taxonomy.external_taxon_reference(taxon_concept_id);
CREATE INDEX idx_external_taxon_ref_name ON taxonomy.external_taxon_reference(taxonomic_name_id);
CREATE INDEX idx_external_taxon_ref_source_id
    ON taxonomy.external_taxon_reference(external_source_id, external_id);

CREATE TABLE taxonomy.search_name_assertion (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    taxonomic_name_id uuid NOT NULL
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    search_context text NOT NULL
        CHECK (search_context IN ('bibliography','herbarium','occurrence','genetics','general_discovery')),
    safety_status text NOT NULL
        CHECK (safety_status IN ('automatic_safe','reviewed_safe','review_required','excluded')),
    valid_from date,
    valid_to date,
    reviewed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    rationale text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_search_name_concept_context
    ON taxonomy.search_name_assertion(taxon_concept_id, search_context);

CREATE TABLE taxonomy.taxonomic_adoption_decision (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    adopted_name_id uuid NOT NULL
        REFERENCES taxonomy.taxonomic_name(resource_id) ON DELETE RESTRICT,
    decided_at timestamptz NOT NULL,
    decided_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    primary_external_source_id uuid
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    primary_evidence_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    policy_basis text,
    is_policy_exception boolean NOT NULL DEFAULT false,
    valid_from date,
    valid_to date,
    is_current boolean NOT NULL DEFAULT true,
    rationale text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX uq_current_taxonomic_adoption
    ON taxonomy.taxonomic_adoption_decision(taxon_concept_id)
    WHERE is_current = true;
CREATE INDEX idx_taxonomic_adoption_name
    ON taxonomy.taxonomic_adoption_decision(adopted_name_id);

CREATE TABLE taxonomy.regional_taxon_assertion (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    geographic_area_id uuid NOT NULL
        REFERENCES core.geographic_area(resource_id) ON DELETE RESTRICT,

    presence_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    presence_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (presence_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    origin_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    origin_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (origin_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    establishment_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    establishment_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (establishment_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    context_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    context_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (context_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    temporality_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    temporality_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (temporality_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    catalog_inclusion_term_key text REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    catalog_inclusion_value_status text NOT NULL DEFAULT 'not_recorded'
        CHECK (catalog_inclusion_value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),

    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    valid_from date,
    valid_to date,
    notes text,

    CHECK ((presence_value_status = 'present') = (presence_term_key IS NOT NULL)),
    CHECK ((origin_value_status = 'present') = (origin_term_key IS NOT NULL)),
    CHECK ((establishment_value_status = 'present') = (establishment_term_key IS NOT NULL)),
    CHECK ((context_value_status = 'present') = (context_term_key IS NOT NULL)),
    CHECK ((temporality_value_status = 'present') = (temporality_term_key IS NOT NULL)),
    CHECK ((catalog_inclusion_value_status = 'present') = (catalog_inclusion_term_key IS NOT NULL)),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_regional_assertion_taxon_area
    ON taxonomy.regional_taxon_assertion(taxon_concept_id, geographic_area_id);

CREATE TABLE taxonomy.taxonomic_impact_assessment (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    taxon_change_event_id uuid NOT NULL
        REFERENCES taxonomy.taxon_change_event(resource_id) ON DELETE RESTRICT,
    affected_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    historical_assignability text
        CHECK (historical_assignability IN ('securely_assignable','partially_assignable','not_assignable','requires_redetermination')),
    impact_term_key text
        REFERENCES taxonomy.term(term_key) ON DELETE RESTRICT,
    assessed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    assessed_at timestamptz NOT NULL,
    rationale text
);
CREATE INDEX idx_taximpact_affected ON taxonomy.taxonomic_impact_assessment(affected_resource_id);

CREATE TABLE taxonomy.hybrid_parentage (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    hybrid_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    parent_concept_id uuid NOT NULL
        REFERENCES taxonomy.taxon_concept(resource_id) ON DELETE RESTRICT,
    parent_position smallint CHECK (parent_position IS NULL OR parent_position IN (1,2)),
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    notes text,
    CHECK (hybrid_concept_id <> parent_concept_id),
    UNIQUE (hybrid_concept_id, parent_concept_id)
);

-- =====================================================================
-- FIELD
-- =====================================================================

CREATE TABLE field.location (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    parent_location_id uuid
        REFERENCES field.location(resource_id) ON DELETE RESTRICT,
    geographic_area_id uuid
        REFERENCES core.geographic_area(resource_id) ON DELETE RESTRICT,
    location_name text,
    verbatim_locality text,
    location_kind text,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    notes text,
    CHECK (parent_location_id IS NULL OR parent_location_id <> resource_id)
);
CREATE INDEX idx_location_parent ON field.location(parent_location_id);
CREATE INDEX idx_location_area ON field.location(geographic_area_id);
CREATE INDEX idx_location_name_trgm
    ON field.location USING gin (location_name gin_trgm_ops);

CREATE TABLE field.location_geometry_version (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    location_id uuid NOT NULL
        REFERENCES field.location(resource_id) ON DELETE RESTRICT,
    version_no integer NOT NULL CHECK (version_no >= 1),
    geom geometry(Geometry,4326) NOT NULL,
    geometry_role text NOT NULL
        CHECK (geometry_role IN ('exact','interpreted','historical')),
    source_srid integer,
    verbatim_coordinates text,
    source_geometry_text text,
    uncertainty_m numeric CHECK (uncertainty_m IS NULL OR uncertainty_m >= 0),
    georeference_method text,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    valid_from timestamptz,
    valid_to timestamptz,
    is_preferred boolean NOT NULL DEFAULT false,
    notes text,
    UNIQUE (location_id, version_no),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CHECK (ST_GeometryType(geom) IN (
        'ST_Point','ST_LineString','ST_Polygon',
        'ST_MultiPoint','ST_MultiLineString','ST_MultiPolygon'
    ))
);
CREATE INDEX idx_location_geometry_location ON field.location_geometry_version(location_id);
CREATE INDEX idx_location_geometry_gist
    ON field.location_geometry_version USING gist (geom);
CREATE UNIQUE INDEX uq_location_preferred_geometry
    ON field.location_geometry_version(location_id)
    WHERE is_preferred = true;

CREATE TABLE field.population (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    population_label text,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    valid_from date,
    valid_to date,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE field.population_location (
    population_location_id uuid PRIMARY KEY,
    population_id uuid NOT NULL
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    location_id uuid NOT NULL
        REFERENCES field.location(resource_id) ON DELETE RESTRICT,
    relation_role text,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    valid_from date,
    valid_to date,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_population_location_population ON field.population_location(population_id);
CREATE INDEX idx_population_location_location ON field.population_location(location_id);

CREATE TABLE field.population_relation (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    subject_population_id uuid NOT NULL
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    object_population_id uuid NOT NULL
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    relation_type text NOT NULL,
    effective_date date,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    notes text,
    CHECK (subject_population_id <> object_population_id)
);
CREATE INDEX idx_population_relation_subject ON field.population_relation(subject_population_id);
CREATE INDEX idx_population_relation_object ON field.population_relation(object_population_id);

CREATE TABLE field.prospection (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    started_at timestamptz,
    ended_at timestamptz,
    purpose text,
    protocol_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    coordinator_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    notes text,
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE field.field_visit (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    prospection_id uuid NOT NULL
        REFERENCES field.prospection(resource_id) ON DELETE RESTRICT,
    sequence_no integer NOT NULL CHECK (sequence_no >= 1),
    location_id uuid NOT NULL
        REFERENCES field.location(resource_id) ON DELETE RESTRICT,
    started_at timestamptz,
    ended_at timestamptz,
    visit_purpose text,
    notes text,
    UNIQUE (prospection_id, sequence_no),
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_field_visit_location ON field.field_visit(location_id);

CREATE TABLE field.field_visit_population (
    field_visit_id uuid NOT NULL
        REFERENCES field.field_visit(resource_id) ON DELETE RESTRICT,
    population_id uuid NOT NULL
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    visit_role text,
    PRIMARY KEY (field_visit_id, population_id)
);
CREATE INDEX idx_field_visit_population_population
    ON field.field_visit_population(population_id);

CREATE TABLE field.individual (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    population_id uuid
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    individual_label text,
    first_seen_at timestamptz,
    last_seen_at timestamptz,
    notes text,
    CHECK (last_seen_at IS NULL OR first_seen_at IS NULL OR last_seen_at >= first_seen_at)
);
CREATE INDEX idx_individual_population ON field.individual(population_id);

CREATE TABLE field.observation (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    field_visit_id uuid
        REFERENCES field.field_visit(resource_id) ON DELETE RESTRICT,
    observed_at timestamptz,
    population_id uuid
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    individual_id uuid
        REFERENCES field.individual(resource_id) ON DELETE RESTRICT,
    location_id uuid
        REFERENCES field.location(resource_id) ON DELETE RESTRICT,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    verbatim_observation text,
    notes text
);
CREATE INDEX idx_observation_visit ON field.observation(field_visit_id);
CREATE INDEX idx_observation_population ON field.observation(population_id);
CREATE INDEX idx_observation_individual ON field.observation(individual_id);
CREATE INDEX idx_observation_date ON field.observation(observed_at);

CREATE TABLE field.census (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    field_visit_id uuid NOT NULL
        REFERENCES field.field_visit(resource_id) ON DELETE RESTRICT,
    population_id uuid NOT NULL
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    census_at timestamptz NOT NULL,
    method_text text,
    notes text
);
CREATE INDEX idx_census_population_date ON field.census(population_id, census_at DESC);
CREATE INDEX idx_census_visit ON field.census(field_visit_id);

CREATE TABLE field.census_measurement (
    census_measurement_id uuid PRIMARY KEY,
    census_id uuid NOT NULL
        REFERENCES field.census(resource_id) ON DELETE RESTRICT,
    metric_code text NOT NULL,
    life_stage_code text,
    value_status text NOT NULL
        CHECK (value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),
    numeric_value numeric,
    unit_code text,
    notes text,
    CHECK (
        (value_status = 'present' AND numeric_value IS NOT NULL)
        OR
        (value_status <> 'present' AND numeric_value IS NULL)
    )
);
CREATE INDEX idx_census_measurement_census ON field.census_measurement(census_id);

CREATE TABLE field.collection_event (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    field_visit_id uuid
        REFERENCES field.field_visit(resource_id) ON DELETE RESTRICT,
    population_id uuid
        REFERENCES field.population(resource_id) ON DELETE RESTRICT,
    collection_at timestamptz,
    method_text text,
    permit_reference text,
    notes text
);
CREATE INDEX idx_collection_visit ON field.collection_event(field_visit_id);
CREATE INDEX idx_collection_population ON field.collection_event(population_id);

CREATE TABLE field.collection_individual (
    collection_individual_id uuid PRIMARY KEY,
    collection_event_id uuid NOT NULL
        REFERENCES field.collection_event(resource_id) ON DELETE RESTRICT,
    individual_id uuid NOT NULL
        REFERENCES field.individual(resource_id) ON DELETE RESTRICT,
    role_code text NOT NULL,
    sequence_no integer CHECK (sequence_no IS NULL OR sequence_no >= 1),
    notes text,
    UNIQUE (collection_event_id, individual_id, role_code)
);
CREATE INDEX idx_collection_individual_individual
    ON field.collection_individual(individual_id);

-- =====================================================================
-- MATERIAL
-- =====================================================================

CREATE TABLE material.sample (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    sample_kind text NOT NULL,
    quantity_value numeric CHECK (quantity_value IS NULL OR quantity_value >= 0),
    quantity_unit text,
    material_state text,
    notes text
);

CREATE TABLE material.sample_origin (
    sample_origin_id uuid PRIMARY KEY,
    sample_id uuid NOT NULL
        REFERENCES material.sample(resource_id) ON DELETE RESTRICT,
    collection_event_id uuid
        REFERENCES field.collection_event(resource_id) ON DELETE RESTRICT,
    individual_id uuid
        REFERENCES field.individual(resource_id) ON DELETE RESTRICT,
    origin_role text,
    proportion numeric CHECK (proportion IS NULL OR (proportion >= 0 AND proportion <= 1)),
    notes text,
    CHECK (collection_event_id IS NOT NULL OR individual_id IS NOT NULL)
);
CREATE INDEX idx_sample_origin_sample ON material.sample_origin(sample_id);
CREATE INDEX idx_sample_origin_individual ON material.sample_origin(individual_id);
CREATE INDEX idx_sample_origin_collection ON material.sample_origin(collection_event_id);

CREATE TABLE material.processing_event (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    process_type text NOT NULL,
    started_at timestamptz,
    ended_at timestamptz,
    operator_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    protocol_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    notes text,
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE material.process_input (
    process_input_id uuid PRIMARY KEY,
    processing_event_id uuid NOT NULL
        REFERENCES material.processing_event(resource_id) ON DELETE RESTRICT,
    sample_id uuid NOT NULL
        REFERENCES material.sample(resource_id) ON DELETE RESTRICT,
    quantity_value numeric CHECK (quantity_value IS NULL OR quantity_value >= 0),
    quantity_unit text,
    ordinal integer CHECK (ordinal IS NULL OR ordinal >= 1),
    UNIQUE (processing_event_id, sample_id)
);
CREATE INDEX idx_process_input_sample ON material.process_input(sample_id);

CREATE TABLE material.process_output (
    process_output_id uuid PRIMARY KEY,
    processing_event_id uuid NOT NULL
        REFERENCES material.processing_event(resource_id) ON DELETE RESTRICT,
    sample_id uuid NOT NULL
        REFERENCES material.sample(resource_id) ON DELETE RESTRICT,
    quantity_value numeric CHECK (quantity_value IS NULL OR quantity_value >= 0),
    quantity_unit text,
    ordinal integer CHECK (ordinal IS NULL OR ordinal >= 1),
    UNIQUE (processing_event_id, sample_id)
);
CREATE INDEX idx_process_output_sample ON material.process_output(sample_id);

CREATE TABLE material.accession (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    accession_date date,
    accession_status text,
    curator_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    notes text
);
CREATE INDEX idx_accession_date ON material.accession(accession_date);

CREATE TABLE material.accession_material (
    accession_material_id uuid PRIMARY KEY,
    accession_id uuid NOT NULL
        REFERENCES material.accession(resource_id) ON DELETE RESTRICT,
    sample_id uuid NOT NULL
        REFERENCES material.sample(resource_id) ON DELETE RESTRICT,
    material_role text,
    quantity_value numeric CHECK (quantity_value IS NULL OR quantity_value >= 0),
    quantity_unit text,
    notes text,
    UNIQUE (accession_id, sample_id, material_role)
);
CREATE INDEX idx_accession_material_sample ON material.accession_material(sample_id);

-- =====================================================================
-- EVIDENCE: records, content, assertions
-- =====================================================================

CREATE TABLE evidence.bibliographic_reference (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    reference_type text,
    title text,
    authors_text text,
    publication_year integer CHECK (publication_year IS NULL OR publication_year BETWEEN 1500 AND 2500),
    doi text,
    isbn text,
    citation_text text,
    url text,
    external_source_id uuid
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    notes text
);
CREATE UNIQUE INDEX uq_bibliographic_doi_lower
    ON evidence.bibliographic_reference(lower(doi))
    WHERE doi IS NOT NULL;
CREATE INDEX idx_bibliographic_title_trgm
    ON evidence.bibliographic_reference USING gin (title gin_trgm_ops);

CREATE TABLE evidence.external_record (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    external_source_id uuid NOT NULL
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    external_id text NOT NULL,
    record_type text NOT NULL,
    canonical_url text,
    license_text text,
    first_seen_at timestamptz NOT NULL DEFAULT current_timestamp,
    last_seen_at timestamptz NOT NULL DEFAULT current_timestamp,
    notes text,
    UNIQUE (external_source_id, external_id)
);
CREATE INDEX idx_external_record_type ON evidence.external_record(record_type);
CREATE INDEX idx_external_record_source ON evidence.external_record(external_source_id);

CREATE TABLE evidence.external_record_snapshot (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    external_record_id uuid NOT NULL
        REFERENCES evidence.external_record(resource_id) ON DELETE RESTRICT,
    retrieved_at timestamptz NOT NULL,
    payload_hash char(64)
        CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-fA-F]{64}$'),
    raw_payload jsonb,
    raw_asset_id uuid
        REFERENCES evidence.digital_asset(resource_id) ON DELETE RESTRICT,
    normalized_payload jsonb,
    schema_version text,
    license_text text,
    capture_status text NOT NULL DEFAULT 'captured'
        CHECK (capture_status IN ('captured','partial','not_available','failed')),
    notes text,
    CHECK (raw_payload IS NULL OR raw_asset_id IS NULL)
);
CREATE INDEX idx_external_snapshot_record_date
    ON evidence.external_record_snapshot(external_record_id, retrieved_at DESC);
CREATE UNIQUE INDEX uq_external_snapshot_hash
    ON evidence.external_record_snapshot(external_record_id, payload_hash)
    WHERE payload_hash IS NOT NULL;

CREATE TABLE evidence.content_item (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    content_kind text NOT NULL
        CHECK (content_kind IN ('document','media')),
    title text,
    author_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    captured_at timestamptz,
    license_text text,
    description text,
    notes text
);
CREATE INDEX idx_content_kind ON evidence.content_item(content_kind);

CREATE TABLE evidence.content_representation (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    content_item_id uuid NOT NULL
        REFERENCES evidence.content_item(resource_id) ON DELETE RESTRICT,
    digital_asset_id uuid NOT NULL
        REFERENCES evidence.digital_asset(resource_id) ON DELETE RESTRICT,
    representation_role text NOT NULL
        CHECK (representation_role IN ('original','version','derivative','thumbnail','public_derivative')),
    version_no integer CHECK (version_no IS NULL OR version_no >= 1),
    derived_from_representation_id uuid
        REFERENCES evidence.content_representation(resource_id) ON DELETE RESTRICT,
    transformation_metadata jsonb,
    metadata_stripped boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    notes text,
    CHECK (derived_from_representation_id IS NULL OR derived_from_representation_id <> resource_id)
);
CREATE INDEX idx_content_representation_item ON evidence.content_representation(content_item_id);
CREATE INDEX idx_content_representation_asset ON evidence.content_representation(digital_asset_id);
CREATE UNIQUE INDEX uq_content_original
    ON evidence.content_representation(content_item_id)
    WHERE representation_role = 'original';

CREATE TABLE evidence.content_link (
    content_link_id uuid PRIMARY KEY,
    content_item_id uuid NOT NULL
        REFERENCES evidence.content_item(resource_id) ON DELETE RESTRICT,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    relation_role text NOT NULL,
    notes text,
    UNIQUE (content_item_id, target_resource_id, relation_role)
);
CREATE INDEX idx_content_link_target ON evidence.content_link(target_resource_id);

CREATE TABLE evidence.assertion (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    subject_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    predicate_code text,
    statement_text text NOT NULL,
    asserted_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    asserted_at timestamptz,
    resolution_status text NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_status IN ('resolved','partially_resolved','unresolved','ambiguous','not_applicable')),
    scope_note text,
    notes text
);
CREATE INDEX idx_assertion_subject ON evidence.assertion(subject_resource_id);

CREATE TABLE evidence.evidence_link (
    evidence_link_id uuid PRIMARY KEY,
    assertion_id uuid NOT NULL
        REFERENCES evidence.assertion(resource_id) ON DELETE RESTRICT,
    evidence_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    relation_role text NOT NULL
        CHECK (relation_role IN ('supports','contradicts','corroborates','derived_from')),
    confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    notes text,
    CHECK (assertion_id <> evidence_resource_id)
);
CREATE INDEX idx_evidence_link_assertion ON evidence.evidence_link(assertion_id);
CREATE INDEX idx_evidence_link_evidence ON evidence.evidence_link(evidence_resource_id);

-- =====================================================================
-- GOVERNANCE
-- =====================================================================

CREATE TABLE governance.data_activity (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    started_at timestamptz,
    ended_at timestamptz,
    performed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    software_name text,
    software_version text,
    code_commit text,
    parameters jsonb,
    process_outcome text,
    notes text,
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_data_activity_type_date
    ON governance.data_activity(activity_type, started_at DESC);

CREATE TABLE governance.validation_event (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    from_validation_status text
        CHECK (from_validation_status IS NULL OR from_validation_status IN ('unreviewed','pending_review','validated','disputed','rejected')),
    to_validation_status text NOT NULL
        CHECK (to_validation_status IN ('unreviewed','pending_review','validated','disputed','rejected')),
    reviewed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    occurred_at timestamptz NOT NULL DEFAULT current_timestamp,
    data_activity_id uuid
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT,
    reason text
);
CREATE INDEX idx_validation_event_target
    ON governance.validation_event(target_resource_id, occurred_at DESC);

CREATE TABLE governance.record_revision (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    revision_no integer NOT NULL CHECK (revision_no >= 1),
    changed_at timestamptz NOT NULL DEFAULT current_timestamp,
    changed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    data_activity_id uuid
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT,
    operation text NOT NULL,
    reason text,
    UNIQUE (target_resource_id, revision_no)
);
CREATE INDEX idx_record_revision_target
    ON governance.record_revision(target_resource_id, revision_no DESC);

CREATE TABLE governance.revision_change (
    revision_change_id uuid PRIMARY KEY,
    record_revision_id uuid NOT NULL
        REFERENCES governance.record_revision(resource_id) ON DELETE RESTRICT,
    field_path text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    change_kind text,
    sensitive_value boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_revision_change_revision
    ON governance.revision_change(record_revision_id);

CREATE TABLE governance.quality_assessment (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    assessed_at timestamptz NOT NULL DEFAULT current_timestamp,
    assessed_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    method_text text,
    score numeric,
    summary text,
    data_activity_id uuid
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT
);
CREATE INDEX idx_quality_assessment_target
    ON governance.quality_assessment(target_resource_id, assessed_at DESC);

CREATE TABLE governance.quality_flag (
    quality_flag_id uuid PRIMARY KEY,
    quality_assessment_id uuid NOT NULL
        REFERENCES governance.quality_assessment(resource_id) ON DELETE RESTRICT,
    flag_code text NOT NULL,
    severity text,
    detail text
);
CREATE INDEX idx_quality_flag_assessment
    ON governance.quality_flag(quality_assessment_id);

CREATE TABLE governance.import_batch (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    data_activity_id uuid NOT NULL UNIQUE
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT,
    external_source_id uuid
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    source_uri text,
    input_asset_id uuid
        REFERENCES evidence.digital_asset(resource_id) ON DELETE RESTRICT,
    query_text text,
    idempotency_key text UNIQUE,
    source_snapshot_label text,
    notes text
);

CREATE TABLE governance.import_batch_item (
    import_batch_item_id uuid PRIMARY KEY,
    import_batch_id uuid NOT NULL
        REFERENCES governance.import_batch(resource_id) ON DELETE RESTRICT,
    source_item_key text,
    source_hash text,
    external_snapshot_resource_id uuid
        REFERENCES evidence.external_record_snapshot(resource_id) ON DELETE RESTRICT,
    target_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    process_outcome text NOT NULL
        CHECK (process_outcome IN ('inserted','updated','unchanged','duplicate','quarantined','failed','skipped')),
    error_detail jsonb,
    occurred_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX idx_import_item_batch ON governance.import_batch_item(import_batch_id);
CREATE INDEX idx_import_item_target ON governance.import_batch_item(target_resource_id);
CREATE INDEX idx_import_item_source_key ON governance.import_batch_item(source_item_key);

CREATE TABLE evidence.provenance_link (
    provenance_link_id uuid PRIMARY KEY,
    subject_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    external_source_id uuid
        REFERENCES evidence.external_source(external_source_id) ON DELETE RESTRICT,
    data_activity_id uuid
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT,
    generation_mode text NOT NULL,
    relation_role text,
    notes text,
    CHECK (
        source_resource_id IS NOT NULL
        OR external_source_id IS NOT NULL
        OR data_activity_id IS NOT NULL
    )
);
CREATE INDEX idx_provenance_subject ON evidence.provenance_link(subject_resource_id);
CREATE INDEX idx_provenance_source_resource ON evidence.provenance_link(source_resource_id);

-- =====================================================================
-- ANALYTICS
-- =====================================================================

CREATE TABLE analytics.metric_definition (
    metric_definition_id uuid PRIMARY KEY,
    metric_code text NOT NULL UNIQUE,
    label text NOT NULL,
    value_type text NOT NULL
        CHECK (value_type IN ('numeric','text','boolean','json')),
    default_unit_code text,
    description text,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE analytics.metric_target_resource_type (
    metric_definition_id uuid NOT NULL
        REFERENCES analytics.metric_definition(metric_definition_id) ON DELETE CASCADE,
    resource_type_code varchar(3) NOT NULL
        REFERENCES core.resource_type(resource_type_code) ON DELETE RESTRICT,
    PRIMARY KEY (metric_definition_id, resource_type_code)
);

CREATE TABLE analytics.analysis_run (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    data_activity_id uuid NOT NULL UNIQUE
        REFERENCES governance.data_activity(resource_id) ON DELETE RESTRICT,
    module_code text NOT NULL,
    method_version text NOT NULL,
    parameters jsonb,
    input_manifest_hash text,
    run_status text NOT NULL
        CHECK (run_status IN ('running','closed','failed')),
    closed_at timestamptz,
    release_label text,
    released_at timestamptz,
    notes text,
    CHECK ((run_status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX idx_analysis_run_module
    ON analytics.analysis_run(module_code, released_at DESC);

CREATE TABLE analytics.analysis_input (
    analysis_input_id uuid PRIMARY KEY,
    analysis_run_id uuid NOT NULL
        REFERENCES analytics.analysis_run(resource_id) ON DELETE RESTRICT,
    input_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    input_role text NOT NULL,
    input_hash text,
    ordinal integer CHECK (ordinal IS NULL OR ordinal >= 1),
    UNIQUE (analysis_run_id, input_resource_id, input_role)
);
CREATE INDEX idx_analysis_input_resource
    ON analytics.analysis_input(input_resource_id);

CREATE TABLE analytics.analysis_result (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    analysis_run_id uuid NOT NULL
        REFERENCES analytics.analysis_run(resource_id) ON DELETE RESTRICT,
    metric_definition_id uuid NOT NULL
        REFERENCES analytics.metric_definition(metric_definition_id) ON DELETE RESTRICT,
    subject_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    value_status text NOT NULL
        CHECK (value_status IN ('present','unknown','not_applicable','not_recorded','not_queried','failed')),
    numeric_value numeric,
    text_value text,
    boolean_value boolean,
    json_value jsonb,
    unit_code text,
    computed_at timestamptz NOT NULL DEFAULT current_timestamp,
    notes text,
    UNIQUE (analysis_run_id, metric_definition_id, subject_resource_id),
    CHECK (
        (value_status = 'present'
            AND num_nonnulls(numeric_value,text_value,boolean_value,json_value) = 1)
        OR
        (value_status <> 'present'
            AND num_nonnulls(numeric_value,text_value,boolean_value,json_value) = 0)
    )
);
CREATE INDEX idx_analysis_result_subject
    ON analytics.analysis_result(subject_resource_id);
CREATE INDEX idx_analysis_result_metric
    ON analytics.analysis_result(metric_definition_id);
CREATE INDEX idx_analysis_result_run
    ON analytics.analysis_result(analysis_run_id);

-- =====================================================================
-- SECURITY / ACCESS / PRIVACY
-- =====================================================================

CREATE TABLE security.security_principal (
    principal_id uuid PRIMARY KEY,
    principal_type text NOT NULL
        CHECK (principal_type IN ('user','service')),
    agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    identity_provider text,
    external_subject text,
    service_name text,
    credential_reference text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    CHECK (
        (principal_type = 'user' AND service_name IS NULL)
        OR
        (principal_type = 'service' AND service_name IS NOT NULL)
    ),
    UNIQUE (identity_provider, external_subject)
);

CREATE VIEW security.user_account AS
SELECT * FROM security.security_principal WHERE principal_type = 'user';

CREATE VIEW security.service_account AS
SELECT * FROM security.security_principal WHERE principal_type = 'service';

CREATE TABLE security.role (
    role_id uuid PRIMARY KEY,
    role_code text NOT NULL UNIQUE,
    label text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE security.permission (
    permission_id uuid PRIMARY KEY,
    permission_code text NOT NULL UNIQUE,
    label text NOT NULL,
    description text
);

CREATE TABLE security.role_permission (
    role_id uuid NOT NULL
        REFERENCES security.role(role_id) ON DELETE CASCADE,
    permission_id uuid NOT NULL
        REFERENCES security.permission(permission_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE security.principal_role (
    principal_id uuid NOT NULL
        REFERENCES security.security_principal(principal_id) ON DELETE CASCADE,
    role_id uuid NOT NULL
        REFERENCES security.role(role_id) ON DELETE RESTRICT,
    valid_from timestamptz,
    valid_to timestamptz,
    granted_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    PRIMARY KEY (principal_id, role_id, valid_from),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE security.field_group (
    field_group_id uuid PRIMARY KEY,
    resource_type_code varchar(3) NOT NULL
        REFERENCES core.resource_type(resource_type_code) ON DELETE RESTRICT,
    group_code text NOT NULL,
    label text NOT NULL,
    description text,
    UNIQUE (resource_type_code, group_code)
);

CREATE TABLE security.field_group_member (
    field_group_member_id uuid PRIMARY KEY,
    field_group_id uuid NOT NULL
        REFERENCES security.field_group(field_group_id) ON DELETE CASCADE,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    column_name text NOT NULL,
    UNIQUE (field_group_id, schema_name, table_name, column_name)
);

CREATE TABLE security.access_grant (
    access_grant_id uuid PRIMARY KEY,
    principal_id uuid NOT NULL
        REFERENCES security.security_principal(principal_id) ON DELETE RESTRICT,
    permission_id uuid NOT NULL
        REFERENCES security.permission(permission_id) ON DELETE RESTRICT,
    scope_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    scope_resource_type_code varchar(3)
        REFERENCES core.resource_type(resource_type_code) ON DELETE RESTRICT,
    field_group_id uuid
        REFERENCES security.field_group(field_group_id) ON DELETE RESTRICT,
    purpose text NOT NULL,
    starts_at timestamptz NOT NULL DEFAULT current_timestamp,
    ends_at timestamptz,
    authority_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    reason text,
    is_active boolean NOT NULL DEFAULT true,
    CHECK (ends_at IS NULL OR ends_at >= starts_at),
    CHECK (
        scope_resource_id IS NOT NULL
        OR scope_resource_type_code IS NOT NULL
        OR field_group_id IS NOT NULL
    )
);
CREATE INDEX idx_access_grant_principal
    ON security.access_grant(principal_id, starts_at, ends_at);

CREATE TABLE security.sensitivity_assignment (
    sensitivity_assignment_id uuid PRIMARY KEY,
    resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    field_group_id uuid
        REFERENCES security.field_group(field_group_id) ON DELETE RESTRICT,
    sensitivity_dimension text NOT NULL
        CHECK (sensitivity_dimension IN ('scientific','spatial','personal','institutional')),
    sensitivity_level text NOT NULL
        CHECK (sensitivity_level IN ('S0','S1','S2','S3')),
    assigned_at timestamptz NOT NULL DEFAULT current_timestamp,
    assigned_by_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    valid_from timestamptz,
    valid_to timestamptz,
    is_current boolean NOT NULL DEFAULT true,
    reason text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_sensitivity_resource
    ON security.sensitivity_assignment(resource_id);
CREATE INDEX idx_sensitivity_level
    ON security.sensitivity_assignment(sensitivity_level);
CREATE UNIQUE INDEX uq_current_sensitivity_whole_resource
    ON security.sensitivity_assignment(resource_id, sensitivity_dimension)
    WHERE field_group_id IS NULL AND is_current = true;
CREATE UNIQUE INDEX uq_current_sensitivity_field_group
    ON security.sensitivity_assignment(resource_id, field_group_id, sensitivity_dimension)
    WHERE field_group_id IS NOT NULL AND is_current = true;

CREATE TABLE security.data_use_constraint (
    resource_id uuid PRIMARY KEY
        REFERENCES core.resource(resource_id) ON DELETE CASCADE,
    constraint_kind text NOT NULL,
    title text,
    source_resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    starts_at timestamptz,
    ends_at timestamptz,
    blocks_view boolean NOT NULL DEFAULT false,
    blocks_export boolean NOT NULL DEFAULT false,
    blocks_publish boolean NOT NULL DEFAULT false,
    license_uri text,
    authority_agent_id uuid
        REFERENCES core.agent(resource_id) ON DELETE SET NULL,
    conditions jsonb,
    notes text,
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE security.data_use_constraint_link (
    data_use_constraint_id uuid NOT NULL
        REFERENCES security.data_use_constraint(resource_id) ON DELETE RESTRICT,
    target_resource_id uuid NOT NULL
        REFERENCES core.resource(resource_id) ON DELETE RESTRICT,
    PRIMARY KEY (data_use_constraint_id, target_resource_id)
);
CREATE INDEX idx_constraint_link_target
    ON security.data_use_constraint_link(target_resource_id);

CREATE TABLE security.spatial_disclosure_policy (
    spatial_disclosure_policy_id uuid PRIMARY KEY,
    policy_code text NOT NULL UNIQUE,
    applicable_sensitivity_level text NOT NULL
        CHECK (applicable_sensitivity_level IN ('S0','S1','S2','S3')),
    field_group_id uuid
        REFERENCES security.field_group(field_group_id) ON DELETE RESTRICT,
    disclosure_mode text NOT NULL
        CHECK (disclosure_mode IN ('exact','generalized','grid','area_only','withheld')),
    parameter_meters numeric CHECK (parameter_meters IS NULL OR parameter_meters >= 0),
    geographic_area_kind text,
    is_active boolean NOT NULL DEFAULT true,
    rule_parameters jsonb,
    notes text
);

CREATE TABLE security.access_event (
    access_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT current_timestamp,
    principal_id uuid
        REFERENCES security.security_principal(principal_id) ON DELETE SET NULL,
    permission_id uuid
        REFERENCES security.permission(permission_id) ON DELETE SET NULL,
    resource_id uuid
        REFERENCES core.resource(resource_id) ON DELETE SET NULL,
    field_group_id uuid
        REFERENCES security.field_group(field_group_id) ON DELETE SET NULL,
    outcome text NOT NULL,
    purpose text,
    client_context jsonb
);
CREATE INDEX idx_access_event_principal_date
    ON security.access_event(principal_id, occurred_at DESC);
CREATE INDEX idx_access_event_resource_date
    ON security.access_event(resource_id, occurred_at DESC);

CREATE TABLE security.agent_contact (
    agent_contact_id uuid PRIMARY KEY,
    agent_id uuid NOT NULL
        REFERENCES core.agent(resource_id) ON DELETE RESTRICT,
    contact_type text NOT NULL,
    contact_value text NOT NULL,
    sensitivity_level text NOT NULL DEFAULT 'S2'
        CHECK (sensitivity_level IN ('S0','S1','S2','S3')),
    valid_from date,
    valid_to date,
    notes text,
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_agent_contact_agent ON security.agent_contact(agent_id);

-- =====================================================================
-- DERIVED VIEWS — READ-ONLY LOGICAL CONVENIENCE
-- =====================================================================

CREATE VIEW taxonomy.v_current_adopted_name AS
SELECT
    d.taxon_concept_id,
    d.adopted_name_id,
    n.scientific_name,
    n.canonical_name,
    n.authorship,
    d.resource_id AS adoption_decision_id,
    d.decided_at
FROM taxonomy.taxonomic_adoption_decision d
JOIN taxonomy.taxonomic_name n ON n.resource_id = d.adopted_name_id
WHERE d.is_current = true;

CREATE VIEW field.v_latest_census AS
SELECT DISTINCT ON (c.population_id)
    c.population_id,
    c.resource_id AS census_id,
    c.census_at,
    c.field_visit_id,
    c.method_text
FROM field.census c
JOIN core.resource r ON r.resource_id = c.resource_id
WHERE r.currency_status = 'current'
ORDER BY c.population_id, c.census_at DESC, c.resource_id;

CREATE VIEW evidence.v_document AS
SELECT ci.*
FROM evidence.content_item ci
WHERE ci.content_kind = 'document';

CREATE VIEW evidence.v_media AS
SELECT ci.*
FROM evidence.content_item ci
WHERE ci.content_kind = 'media';

-- =====================================================================
-- RESOURCE TYPES RECOMMENDED FOR PILOT
-- Codes with requires_jblr_code=true are proposed human-facing identifiers.
-- Relation/version/technical records remain addressable by UUID without
-- unnecessary human codes.
-- =====================================================================

INSERT INTO core.resource_type
(resource_type_code, logical_name, code_prefix, requires_jblr_code, description)
VALUES
('AGT','Agent','AGT',true,'Persona, organización, equipo o software'),
('GAR','GeographicArea',NULL,false,'Territorio o área geográfica conceptual'),
('RST','ResourceSet',NULL,false,'Conjunto/dataset/campaña lógica de recursos'),

('TXC','TaxonConcept','TXC',true,'Circunscripción taxonómica JBLR'),
('NAM','TaxonomicName','NAM',true,'Entidad nomenclatural'),
('NUS','NameUsage',NULL,false,'Uso contextualizado de un nombre'),
('NMR','NomenclaturalRelation',NULL,false,'Relación entre nombres'),
('TCR','TaxonConceptRelation',NULL,false,'Relación entre circunscripciones'),
('TCE','TaxonChangeEvent',NULL,false,'Evento de cambio taxonómico'),
('IDN','Identification','IDN',true,'Determinación taxonómica'),
('BBS','BackboneSnapshot',NULL,false,'Instantánea de backbone taxonómico'),
('ETR','ExternalTaxonReference',NULL,false,'Correspondencia taxonómica externa'),
('SNA','SearchNameAssertion',NULL,false,'Seguridad de nombre por contexto de búsqueda'),
('TAD','TaxonomicAdoptionDecision',NULL,false,'Decisión explícita de adopción JBLR'),
('RTA','RegionalTaxonAssertion',NULL,false,'Afirmación taxonómica regional multidimensional'),
('TIA','TaxonomicImpactAssessment',NULL,false,'Impacto de cambio taxonómico'),
('HYP','HybridParentage',NULL,false,'Parentalidad híbrida'),

('LOC','Location','LOC',true,'Localidad o lugar'),
('LGE','LocationGeometryVersion',NULL,false,'Versión geométrica de una localidad'),
('POP','Population','POP',true,'Población biológica gestionada'),
('PRL','PopulationRelation',NULL,false,'Relación histórica entre poblaciones'),
('PRS','Prospection','PRS',true,'Salida de campo'),
('VIS','FieldVisit','VIS',true,'Parada/visita dentro de una prospección'),
('IND','Individual','IND',true,'Individuo biológico persistente'),
('OBS','Observation','OBS',true,'Observación de campo'),
('CEN','Census','CEN',true,'Censo de población'),
('COL','CollectionEvent','COL',true,'Evento de recolección'),

('SMP','Sample','SMP',true,'Muestra/material físico'),
('PRC','ProcessingEvent','PRC',true,'Evento de procesado'),
('ACC','Accession','ACC',true,'Accesión de banco'),

('REF','BibliographicReference','REF',true,'Referencia bibliográfica'),
('EXT','ExternalRecord','EXT',true,'Registro lógico externo'),
('EXS','ExternalRecordSnapshot',NULL,false,'Instantánea de registro externo'),
('AST','DigitalAsset',NULL,false,'Activo digital direccionado por checksum'),
('DOC','Document','DOC',true,'Documento lógico'),
('MED','Media','MED',true,'Medio/fotografía/vídeo/audio lógico'),
('CRP','ContentRepresentation',NULL,false,'Versión o derivado de contenido'),
('ASN','Assertion','ASN',true,'Afirmación científica explícita'),

('ACT','DataActivity',NULL,false,'Actividad de datos o proceso'),
('VLE','ValidationEvent',NULL,false,'Evento de validación'),
('REV','RecordRevision',NULL,false,'Revisión significativa de registro'),
('QAS','QualityAssessment',NULL,false,'Evaluación de calidad'),
('IMP','ImportBatch','IMP',true,'Lote de importación'),

('ANR','AnalysisRun','ANR',true,'Ejecución reproducible de análisis'),
('RSL','AnalysisResult','RSL',true,'Resultado de análisis'),

('DUC','DataUseConstraint',NULL,false,'Restricción de uso del dato');

-- =====================================================================
-- IMPORTANTES REGLAS PROCEDIMENTALES NO FORZADAS AÚN POR SQL
-- =====================================================================
-- 1. resource.resource_id debe ser UUIDv7.
-- 2. jblr_code debe concordar con code_prefix y no se reutiliza.
-- 3. AnalysisRun cerrado es inmutable: se aplicará por trigger/política
--    de aplicación tras aprobar el piloto.
-- 4. Taxonomy.term debe validarse por term_domain según cada columna.
-- 5. La decisión JBLR de nombre aceptado se obtiene de
--    taxonomic_adoption_decision; no se infiere de una fuente externa.
-- 6. Una geometría de publicación es derivada por política; no reemplaza
--    location_geometry_version.
-- 7. Hard delete científico es excepcional. La política habitual es
--    currency_status superseded/withdrawn + revisión/auditoría.
-- 8. RLS/autenticación real no se habilitan en este DDL preliminar.
-- =====================================================================


-- =====================================================================
-- JBLR 01.2 - PILOT HARDENING LAYER
-- NO PRODUCCION
--
-- Esta seccion NO modifica el archivo 01.1 original. Recoge correcciones
-- fisicas minimas derivadas del piloto estatico. Debe recompilarse en un
-- PostgreSQL/PostGIS real antes de cualquier aprobacion fisica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- P01 [MAJOR] Codigos JBLR: generacion concurrente, prefijo/tipo e
-- inmutabilidad. Se usa una secuencia global para evitar MAX()+1.
-- El registro historico impide reutilizar un codigo incluso si una fila
-- Resource fuera eliminada posteriormente.
-- ---------------------------------------------------------------------
CREATE SEQUENCE core.jblr_code_sequence
    AS bigint
    MINVALUE 1
    MAXVALUE 99999999
    NO CYCLE;

CREATE TABLE core.jblr_code_registry (
    jblr_code varchar(32) PRIMARY KEY,
    first_resource_id uuid NOT NULL UNIQUE,
    issued_at timestamptz NOT NULL DEFAULT current_timestamp,
    CHECK (jblr_code ~ '^JBLR-[A-Z0-9]{3}-[0-9]{8}$')
);

CREATE OR REPLACE FUNCTION core.pilot_prepare_resource_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix varchar(3);
    v_requires boolean;
    v_candidate varchar(32);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.resource_type_code IS DISTINCT FROM OLD.resource_type_code THEN
            RAISE EXCEPTION 'resource_type_code is immutable for resource %', OLD.resource_id;
        END IF;
        IF OLD.jblr_code IS NOT NULL
           AND NEW.jblr_code IS DISTINCT FROM OLD.jblr_code THEN
            RAISE EXCEPTION 'jblr_code is immutable once issued for resource %', OLD.resource_id;
        END IF;
    END IF;

    SELECT rt.code_prefix, rt.requires_jblr_code
      INTO v_prefix, v_requires
      FROM core.resource_type rt
     WHERE rt.resource_type_code = NEW.resource_type_code;

    IF NOT FOUND THEN
        RETURN NEW; -- la FK existente emitira el error correspondiente
    END IF;

    IF v_requires AND v_prefix IS NULL THEN
        RAISE EXCEPTION 'resource type % requires JBLR code but has no code_prefix', NEW.resource_type_code;
    END IF;

    IF NEW.jblr_code IS NULL AND v_requires THEN
        v_candidate := format(
            'JBLR-%s-%s',
            v_prefix,
            lpad(nextval('core.jblr_code_sequence')::text, 8, '0')
        );
        NEW.jblr_code := v_candidate;
    END IF;

    IF NEW.jblr_code IS NOT NULL THEN
        IF NEW.jblr_code !~ '^JBLR-[A-Z0-9]{3}-[0-9]{8}$' THEN
            RAISE EXCEPTION 'invalid JBLR code format: %', NEW.jblr_code;
        END IF;
        IF v_prefix IS NULL OR split_part(NEW.jblr_code, '-', 2) <> v_prefix THEN
            RAISE EXCEPTION 'JBLR code % does not match resource type % prefix %',
                NEW.jblr_code, NEW.resource_type_code, v_prefix;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resource_identity_policy
BEFORE INSERT OR UPDATE OF resource_type_code, jblr_code
ON core.resource
FOR EACH ROW
EXECUTE FUNCTION core.pilot_prepare_resource_identity();

CREATE OR REPLACE FUNCTION core.pilot_reserve_jblr_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.jblr_code IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.jblr_code IS NOT DISTINCT FROM OLD.jblr_code THEN
        RETURN NEW;
    END IF;

    INSERT INTO core.jblr_code_registry(jblr_code, first_resource_id)
    VALUES (NEW.jblr_code, NEW.resource_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resource_reserve_jblr_code
AFTER INSERT OR UPDATE OF jblr_code
ON core.resource
FOR EACH ROW
EXECUTE FUNCTION core.pilot_reserve_jblr_code();

-- ---------------------------------------------------------------------
-- P02 [MAJOR] Coherencia entre core.resource.resource_type_code y la
-- tabla subtipo fisica. Evita, por ejemplo, una fila Population usando
-- un Resource declarado como Sample.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.pilot_assert_resource_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actual text;
BEGIN
    SELECT r.resource_type_code::text
      INTO v_actual
      FROM core.resource r
     WHERE r.resource_id = NEW.resource_id;

    IF v_actual IS NULL THEN
        RETURN NEW; -- la FK de subtipo resolvera ausencia del padre
    END IF;

    IF array_position(TG_ARGV, v_actual) IS NULL THEN
        RAISE EXCEPTION 'resource % has type %, but table %.% expects one of %',
            NEW.resource_id, v_actual, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rt_agent BEFORE INSERT OR UPDATE ON core.agent
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('AGT');
CREATE TRIGGER trg_rt_geographic_area BEFORE INSERT OR UPDATE ON core.geographic_area
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('GAR');
CREATE TRIGGER trg_rt_resource_set BEFORE INSERT OR UPDATE ON core.resource_set
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('RST');
CREATE TRIGGER trg_rt_digital_asset BEFORE INSERT OR UPDATE ON evidence.digital_asset
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('AST');

CREATE TRIGGER trg_rt_taxon_concept BEFORE INSERT OR UPDATE ON taxonomy.taxon_concept
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('TXC');
CREATE TRIGGER trg_rt_taxonomic_name BEFORE INSERT OR UPDATE ON taxonomy.taxonomic_name
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('NAM');
CREATE TRIGGER trg_rt_name_usage BEFORE INSERT OR UPDATE ON taxonomy.name_usage
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('NUS');
CREATE TRIGGER trg_rt_nomenclatural_relation BEFORE INSERT OR UPDATE ON taxonomy.nomenclatural_relation
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('NMR');
CREATE TRIGGER trg_rt_taxon_concept_relation BEFORE INSERT OR UPDATE ON taxonomy.taxon_concept_relation
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('TCR');
CREATE TRIGGER trg_rt_taxon_change_event BEFORE INSERT OR UPDATE ON taxonomy.taxon_change_event
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('TCE');
CREATE TRIGGER trg_rt_identification BEFORE INSERT OR UPDATE ON taxonomy.identification
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('IDN');
CREATE TRIGGER trg_rt_backbone_snapshot BEFORE INSERT OR UPDATE ON taxonomy.backbone_snapshot
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('BBS');
CREATE TRIGGER trg_rt_external_taxon_reference BEFORE INSERT OR UPDATE ON taxonomy.external_taxon_reference
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('ETR');
CREATE TRIGGER trg_rt_search_name_assertion BEFORE INSERT OR UPDATE ON taxonomy.search_name_assertion
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('SNA');
CREATE TRIGGER trg_rt_taxonomic_adoption_decision BEFORE INSERT OR UPDATE ON taxonomy.taxonomic_adoption_decision
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('TAD');
CREATE TRIGGER trg_rt_regional_taxon_assertion BEFORE INSERT OR UPDATE ON taxonomy.regional_taxon_assertion
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('RTA');
CREATE TRIGGER trg_rt_taxonomic_impact_assessment BEFORE INSERT OR UPDATE ON taxonomy.taxonomic_impact_assessment
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('TIA');
CREATE TRIGGER trg_rt_hybrid_parentage BEFORE INSERT OR UPDATE ON taxonomy.hybrid_parentage
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('HYP');

CREATE TRIGGER trg_rt_location BEFORE INSERT OR UPDATE ON field.location
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('LOC');
CREATE TRIGGER trg_rt_location_geometry_version BEFORE INSERT OR UPDATE ON field.location_geometry_version
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('LGE');
CREATE TRIGGER trg_rt_population BEFORE INSERT OR UPDATE ON field.population
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('POP');
CREATE TRIGGER trg_rt_population_relation BEFORE INSERT OR UPDATE ON field.population_relation
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('PRL');
CREATE TRIGGER trg_rt_prospection BEFORE INSERT OR UPDATE ON field.prospection
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('PRS');
CREATE TRIGGER trg_rt_field_visit BEFORE INSERT OR UPDATE ON field.field_visit
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('VIS');
CREATE TRIGGER trg_rt_individual BEFORE INSERT OR UPDATE ON field.individual
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('IND');
CREATE TRIGGER trg_rt_observation BEFORE INSERT OR UPDATE ON field.observation
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('OBS');
CREATE TRIGGER trg_rt_census BEFORE INSERT OR UPDATE ON field.census
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('CEN');
CREATE TRIGGER trg_rt_collection_event BEFORE INSERT OR UPDATE ON field.collection_event
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('COL');

CREATE TRIGGER trg_rt_sample BEFORE INSERT OR UPDATE ON material.sample
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('SMP');
CREATE TRIGGER trg_rt_processing_event BEFORE INSERT OR UPDATE ON material.processing_event
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('PRC');
CREATE TRIGGER trg_rt_accession BEFORE INSERT OR UPDATE ON material.accession
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('ACC');

CREATE TRIGGER trg_rt_bibliographic_reference BEFORE INSERT OR UPDATE ON evidence.bibliographic_reference
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('REF');
CREATE TRIGGER trg_rt_external_record BEFORE INSERT OR UPDATE ON evidence.external_record
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('EXT');
CREATE TRIGGER trg_rt_external_record_snapshot BEFORE INSERT OR UPDATE ON evidence.external_record_snapshot
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('EXS');
CREATE TRIGGER trg_rt_content_representation BEFORE INSERT OR UPDATE ON evidence.content_representation
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('CRP');
CREATE TRIGGER trg_rt_assertion BEFORE INSERT OR UPDATE ON evidence.assertion
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('ASN');

CREATE TRIGGER trg_rt_data_activity BEFORE INSERT OR UPDATE ON governance.data_activity
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('ACT');
CREATE TRIGGER trg_rt_validation_event BEFORE INSERT OR UPDATE ON governance.validation_event
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('VLE');
CREATE TRIGGER trg_rt_record_revision BEFORE INSERT OR UPDATE ON governance.record_revision
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('REV');
CREATE TRIGGER trg_rt_quality_assessment BEFORE INSERT OR UPDATE ON governance.quality_assessment
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('QAS');
CREATE TRIGGER trg_rt_import_batch BEFORE INSERT OR UPDATE ON governance.import_batch
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('IMP');

CREATE TRIGGER trg_rt_analysis_run BEFORE INSERT OR UPDATE ON analytics.analysis_run
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('ANR');
CREATE TRIGGER trg_rt_analysis_result BEFORE INSERT OR UPDATE ON analytics.analysis_result
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('RSL');

CREATE TRIGGER trg_rt_data_use_constraint BEFORE INSERT OR UPDATE ON security.data_use_constraint
FOR EACH ROW EXECUTE FUNCTION core.pilot_assert_resource_type('DUC');

CREATE OR REPLACE FUNCTION evidence.pilot_assert_content_item_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actual text;
    v_expected text;
BEGIN
    v_expected := CASE NEW.content_kind
        WHEN 'document' THEN 'DOC'
        WHEN 'media' THEN 'MED'
        ELSE NULL
    END;

    SELECT r.resource_type_code::text
      INTO v_actual
      FROM core.resource r
     WHERE r.resource_id = NEW.resource_id;

    IF v_actual IS NOT NULL AND v_actual <> v_expected THEN
        RAISE EXCEPTION 'content item % kind % requires resource type %, got %',
            NEW.resource_id, NEW.content_kind, v_expected, v_actual;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rt_content_item
BEFORE INSERT OR UPDATE ON evidence.content_item
FOR EACH ROW EXECUTE FUNCTION evidence.pilot_assert_content_item_type();

-- ---------------------------------------------------------------------
-- P03 [MAJOR] AnalysisResult: la FK a Resource es real, pero 01.1 no
-- fuerza que la metrica admita ese ResourceType ni que el valor usado
-- coincida con metric_definition.value_type.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.pilot_assert_analysis_result_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_value_type text;
    v_subject_type varchar(3);
BEGIN
    SELECT md.value_type
      INTO v_value_type
      FROM analytics.metric_definition md
     WHERE md.metric_definition_id = NEW.metric_definition_id;

    SELECT r.resource_type_code
      INTO v_subject_type
      FROM core.resource r
     WHERE r.resource_id = NEW.subject_resource_id;

    IF v_value_type IS NULL OR v_subject_type IS NULL THEN
        RETURN NEW; -- las FK existentes emitiran el error si corresponde
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM analytics.metric_target_resource_type mt
         WHERE mt.metric_definition_id = NEW.metric_definition_id
           AND mt.resource_type_code = v_subject_type
    ) THEN
        RAISE EXCEPTION 'metric % is not allowed for resource type %',
            NEW.metric_definition_id, v_subject_type;
    END IF;

    IF NEW.value_status = 'present' THEN
        IF (v_value_type = 'numeric' AND NEW.numeric_value IS NULL)
           OR (v_value_type = 'text' AND NEW.text_value IS NULL)
           OR (v_value_type = 'boolean' AND NEW.boolean_value IS NULL)
           OR (v_value_type = 'json' AND NEW.json_value IS NULL) THEN
            RAISE EXCEPTION 'metric % expects value_type %, but matching value column is NULL',
                NEW.metric_definition_id, v_value_type;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analysis_result_compatibility
BEFORE INSERT OR UPDATE OF metric_definition_id, subject_resource_id, value_status,
    numeric_value, text_value, boolean_value, json_value
ON analytics.analysis_result
FOR EACH ROW
EXECUTE FUNCTION analytics.pilot_assert_analysis_result_compatibility();

CREATE OR REPLACE FUNCTION analytics.pilot_protect_metric_value_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.value_type IS DISTINCT FROM OLD.value_type
       AND EXISTS (
           SELECT 1 FROM analytics.analysis_result ar
           WHERE ar.metric_definition_id = OLD.metric_definition_id
       ) THEN
        RAISE EXCEPTION 'cannot change value_type of metric % after results exist', OLD.metric_definition_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_metric_value_type_immutable_after_use
BEFORE UPDATE OF value_type ON analytics.metric_definition
FOR EACH ROW EXECUTE FUNCTION analytics.pilot_protect_metric_value_type();

-- ---------------------------------------------------------------------
-- P04 [MAJOR] Genealogia de muestras: un Sample derivado solo puede ser
-- salida de un ProcessingEvent y el grafo input -> output no puede ciclar.
-- El trigger detecta ciclos en el estado visible de la transaccion.
-- La serializacion de escrituras concurrentes del grafo sigue siendo un
-- requisito de servicio abierto antes de produccion.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uq_process_output_sample_once
    ON material.process_output(sample_id);

CREATE OR REPLACE FUNCTION material.pilot_assert_sample_genealogy_acyclic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE edges(parent_sample_id, child_sample_id) AS (
            SELECT pi.sample_id, po.sample_id
              FROM material.process_input pi
              JOIN material.process_output po
                ON po.processing_event_id = pi.processing_event_id
        ),
        reach(root_sample_id, current_sample_id) AS (
            SELECT e.parent_sample_id, e.child_sample_id
              FROM edges e
            UNION
            SELECT r.root_sample_id, e.child_sample_id
              FROM reach r
              JOIN edges e ON e.parent_sample_id = r.current_sample_id
        )
        SELECT 1
          FROM reach
         WHERE root_sample_id = current_sample_id
         LIMIT 1
    ) THEN
        RAISE EXCEPTION 'sample genealogy cycle detected';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sample_genealogy_input
AFTER INSERT OR UPDATE OF processing_event_id, sample_id
ON material.process_input
FOR EACH ROW EXECUTE FUNCTION material.pilot_assert_sample_genealogy_acyclic();

CREATE TRIGGER trg_sample_genealogy_output
AFTER INSERT OR UPDATE OF processing_event_id, sample_id
ON material.process_output
FOR EACH ROW EXECUTE FUNCTION material.pilot_assert_sample_genealogy_acyclic();

-- ---------------------------------------------------------------------
-- P05 [MAJOR] ContentRepresentation: version_no no era unico y una
-- derivacion podia apuntar a otra pieza logica o formar un ciclo.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uq_content_item_version_no
    ON evidence.content_representation(content_item_id, version_no)
    WHERE version_no IS NOT NULL;

CREATE OR REPLACE FUNCTION evidence.pilot_assert_content_derivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_item uuid;
BEGIN
    IF NEW.derived_from_representation_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT cr.content_item_id
      INTO v_parent_item
      FROM evidence.content_representation cr
     WHERE cr.resource_id = NEW.derived_from_representation_id;

    IF v_parent_item IS NOT NULL AND v_parent_item <> NEW.content_item_id THEN
        RAISE EXCEPTION 'derived representation must belong to the same content_item';
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors(resource_id, derived_from_representation_id) AS (
            SELECT cr.resource_id, cr.derived_from_representation_id
              FROM evidence.content_representation cr
             WHERE cr.resource_id = NEW.derived_from_representation_id
            UNION
            SELECT cr.resource_id, cr.derived_from_representation_id
              FROM evidence.content_representation cr
              JOIN ancestors a ON cr.resource_id = a.derived_from_representation_id
        )
        SELECT 1 FROM ancestors WHERE resource_id = NEW.resource_id
    ) THEN
        RAISE EXCEPTION 'content representation derivation cycle detected';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_content_derivation_integrity
BEFORE INSERT OR UPDATE OF content_item_id, derived_from_representation_id
ON evidence.content_representation
FOR EACH ROW EXECUTE FUNCTION evidence.pilot_assert_content_derivation();

-- ---------------------------------------------------------------------
-- P06 [MAJOR] FieldGroup/Sensitivity/AccessGrant: evitar referencias a
-- columnas inexistentes y combinaciones ResourceType incoherentes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.pilot_assert_field_group_member_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = NEW.schema_name
           AND c.relname = NEW.table_name
           AND c.relkind IN ('r','p')
           AND a.attname = NEW.column_name
           AND a.attnum > 0
           AND NOT a.attisdropped
    ) THEN
        RAISE EXCEPTION 'FieldGroupMember references nonexistent physical column %.%.%',
            NEW.schema_name, NEW.table_name, NEW.column_name;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_field_group_member_column_exists
BEFORE INSERT OR UPDATE OF schema_name, table_name, column_name
ON security.field_group_member
FOR EACH ROW EXECUTE FUNCTION security.pilot_assert_field_group_member_column();

CREATE OR REPLACE FUNCTION security.pilot_assert_sensitivity_field_group_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_resource_type varchar(3);
    v_group_type varchar(3);
BEGIN
    IF NEW.field_group_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT r.resource_type_code INTO v_resource_type
      FROM core.resource r WHERE r.resource_id = NEW.resource_id;
    SELECT fg.resource_type_code INTO v_group_type
      FROM security.field_group fg WHERE fg.field_group_id = NEW.field_group_id;

    IF v_resource_type IS NOT NULL AND v_group_type IS NOT NULL
       AND v_resource_type <> v_group_type THEN
        RAISE EXCEPTION 'field group type % does not match resource type %',
            v_group_type, v_resource_type;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sensitivity_field_group_type
BEFORE INSERT OR UPDATE OF resource_id, field_group_id
ON security.sensitivity_assignment
FOR EACH ROW EXECUTE FUNCTION security.pilot_assert_sensitivity_field_group_type();

CREATE OR REPLACE FUNCTION security.pilot_assert_access_grant_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_resource_type varchar(3);
    v_group_type varchar(3);
BEGIN
    IF NEW.scope_resource_id IS NOT NULL THEN
        SELECT r.resource_type_code INTO v_resource_type
          FROM core.resource r WHERE r.resource_id = NEW.scope_resource_id;
    END IF;
    IF NEW.field_group_id IS NOT NULL THEN
        SELECT fg.resource_type_code INTO v_group_type
          FROM security.field_group fg WHERE fg.field_group_id = NEW.field_group_id;
    END IF;

    IF v_resource_type IS NOT NULL
       AND NEW.scope_resource_type_code IS NOT NULL
       AND v_resource_type <> NEW.scope_resource_type_code THEN
        RAISE EXCEPTION 'AccessGrant resource scope type mismatch';
    END IF;

    IF v_group_type IS NOT NULL
       AND v_resource_type IS NOT NULL
       AND v_group_type <> v_resource_type THEN
        RAISE EXCEPTION 'AccessGrant field group does not belong to scoped resource type';
    END IF;

    IF v_group_type IS NOT NULL
       AND NEW.scope_resource_type_code IS NOT NULL
       AND v_group_type <> NEW.scope_resource_type_code THEN
        RAISE EXCEPTION 'AccessGrant field group/type scope mismatch';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_access_grant_scope_consistency
BEFORE INSERT OR UPDATE OF scope_resource_id, scope_resource_type_code, field_group_id
ON security.access_grant
FOR EACH ROW EXECUTE FUNCTION security.pilot_assert_access_grant_scope();

-- ---------------------------------------------------------------------
-- P07 [MINOR] La PK de principal_role ya hacia valid_from NOT NULL de
-- forma implicita. Se hace explicito y se proporciona un default usable.
-- ---------------------------------------------------------------------
ALTER TABLE security.principal_role
    ALTER COLUMN valid_from SET DEFAULT current_timestamp,
    ALTER COLUMN valid_from SET NOT NULL;

-- ---------------------------------------------------------------------
-- P08 [MINOR] SearchNameAssertion: una sola asercion abierta por
-- concepto + nombre + contexto. Evita dos reglas actuales contradictorias.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uq_search_name_open_ended
    ON taxonomy.search_name_assertion(taxon_concept_id, taxonomic_name_id, search_context)
    WHERE valid_to IS NULL;

-- =====================================================================
-- FIN DE CAPA 01.2 PILOT HARDENING
-- =====================================================================

-- ---------------------------------------------------------------------
-- P09 [MAJOR] AnalysisRun/AnalysisResult: cierre realmente inmutable.
-- Los resultados se escriben mientras el run esta running; el cierre es
-- la transicion final. Tras ella no se admiten cambios ni nuevos results.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.pilot_protect_closed_analysis_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.run_status = 'closed' THEN
        RAISE EXCEPTION 'closed AnalysisRun % is immutable', OLD.resource_id;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analysis_run_closed_immutable
BEFORE UPDATE OR DELETE ON analytics.analysis_run
FOR EACH ROW EXECUTE FUNCTION analytics.pilot_protect_closed_analysis_run();

CREATE OR REPLACE FUNCTION analytics.pilot_protect_results_of_closed_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_run_id uuid;
    v_status text;
BEGIN
    v_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.analysis_run_id ELSE NEW.analysis_run_id END;
    SELECT run_status INTO v_status FROM analytics.analysis_run WHERE resource_id = v_run_id;
    IF v_status = 'closed' THEN
        RAISE EXCEPTION 'results of closed AnalysisRun % are immutable', v_run_id;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analysis_result_closed_run_immutable
BEFORE INSERT OR UPDATE OR DELETE ON analytics.analysis_result
FOR EACH ROW EXECUTE FUNCTION analytics.pilot_protect_results_of_closed_run();


-- =====================================================================
-- JBLR 01.2 · RONDA 2 — PILOT HARDENING LAYER
-- NO PRODUCCION
-- Decisiones de 00 incorporadas el 2026-08-15.
-- =====================================================================

-- ---------------------------------------------------------------------
-- R2-A [MAJOR RESUELTO] taxonomy.term: enforcement de term_domain.
-- Se mantiene una sola tabla taxonomy.term. La función genérica recibe
-- pares (columna, dominio esperado) y valida físicamente cada FK semántica.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION taxonomy.r2_assert_term_domains()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    i integer;
    v_key text;
    v_expected text;
    v_actual text;
BEGIN
    IF array_length(TG_ARGV, 1) IS NULL OR mod(array_length(TG_ARGV, 1), 2) <> 0 THEN
        RAISE EXCEPTION 'r2_assert_term_domains requires (column,domain) pairs';
    END IF;

    i := 0;
    WHILE i < array_length(TG_ARGV, 1) LOOP
        v_key := to_jsonb(NEW) ->> TG_ARGV[i];
        v_expected := TG_ARGV[i + 1];
        IF v_key IS NOT NULL THEN
            SELECT t.term_domain INTO v_actual
              FROM taxonomy.term t
             WHERE t.term_key = v_key;
            IF v_actual IS NULL THEN
                RAISE EXCEPTION 'taxonomy term % does not exist', v_key;
            END IF;
            IF v_actual <> v_expected THEN
                RAISE EXCEPTION 'taxonomy term % belongs to domain %, expected % for %.%.%',
                    v_key, v_actual, v_expected, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[i];
            END IF;
        END IF;
        i := i + 2;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_r2_term_domain_taxon_concept
BEFORE INSERT OR UPDATE OF rank_term_key ON taxonomy.taxon_concept
FOR EACH ROW EXECUTE FUNCTION taxonomy.r2_assert_term_domains('rank_term_key','rank');

CREATE TRIGGER trg_r2_term_domain_taxonomic_name
BEFORE INSERT OR UPDATE OF rank_term_key ON taxonomy.taxonomic_name
FOR EACH ROW EXECUTE FUNCTION taxonomy.r2_assert_term_domains('rank_term_key','rank');

CREATE TRIGGER trg_r2_term_domain_nomenclatural_relation
BEFORE INSERT OR UPDATE OF relation_term_key ON taxonomy.nomenclatural_relation
FOR EACH ROW EXECUTE FUNCTION taxonomy.r2_assert_term_domains('relation_term_key','nomenclatural_relation');

CREATE TRIGGER trg_r2_term_domain_regional_taxon_assertion
BEFORE INSERT OR UPDATE OF presence_term_key, origin_term_key, establishment_term_key,
    context_term_key, temporality_term_key, catalog_inclusion_term_key
ON taxonomy.regional_taxon_assertion
FOR EACH ROW EXECUTE FUNCTION taxonomy.r2_assert_term_domains(
    'presence_term_key','presence',
    'origin_term_key','origin',
    'establishment_term_key','establishment',
    'context_term_key','context',
    'temporality_term_key','temporality',
    'catalog_inclusion_term_key','catalog_inclusion'
);

CREATE TRIGGER trg_r2_term_domain_taxonomic_impact
BEFORE INSERT OR UPDATE OF impact_term_key ON taxonomy.taxonomic_impact_assessment
FOR EACH ROW EXECUTE FUNCTION taxonomy.r2_assert_term_domains('impact_term_key','taxonomic_impact');

-- ---------------------------------------------------------------------
-- R2-B [MAJOR RESUELTO] FieldGroup relacional.
-- Un FieldGroup es lógico. field_group_member queda para columnas locales
-- o directas; field_group_projection enlaza a proyecciones implementadas
-- y versionables por código, sin almacenar SQL arbitrario ni duplicar datos.
-- En R2 se implementan exclusivamente las dos rutas aprobadas necesarias:
-- Population.geometry y Population.demography.
-- ---------------------------------------------------------------------
CREATE TABLE security.field_group_projection (
    field_group_projection_id uuid PRIMARY KEY,
    field_group_id uuid NOT NULL
        REFERENCES security.field_group(field_group_id) ON DELETE CASCADE,
    projection_code text NOT NULL
        CHECK (projection_code IN ('population_geometry','population_demography')),
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    UNIQUE (field_group_id, projection_code)
);

CREATE OR REPLACE FUNCTION security.r2_assert_field_group_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_group_type varchar(3);
BEGIN
    SELECT fg.resource_type_code INTO v_group_type
      FROM security.field_group fg
     WHERE fg.field_group_id = NEW.field_group_id;

    IF NEW.projection_code IN ('population_geometry','population_demography')
       AND v_group_type IS DISTINCT FROM 'POP' THEN
        RAISE EXCEPTION 'projection % requires a POP FieldGroup, found %',
            NEW.projection_code, v_group_type;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_r2_field_group_projection_type
BEFORE INSERT OR UPDATE OF field_group_id, projection_code
ON security.field_group_projection
FOR EACH ROW EXECUTE FUNCTION security.r2_assert_field_group_projection();

CREATE VIEW security.v_population_geometry_projection AS
SELECT
    p.resource_id AS population_resource_id,
    pl.location_id,
    lgv.resource_id AS geometry_version_resource_id,
    lgv.geom,
    lgv.geometry_role,
    lgv.uncertainty_m,
    lgv.source_srid,
    lgv.version_no,
    lgv.is_preferred
FROM field.population p
JOIN field.population_location pl ON pl.population_id = p.resource_id
JOIN field.location_geometry_version lgv ON lgv.location_id = pl.location_id
WHERE lgv.is_preferred = true;

CREATE VIEW security.v_population_demography_projection AS
SELECT
    p.resource_id AS population_resource_id,
    c.resource_id AS census_resource_id,
    c.census_at,
    cm.census_measurement_id,
    cm.metric_code,
    cm.life_stage_code,
    cm.value_status,
    cm.numeric_value,
    cm.unit_code
FROM field.population p
JOIN field.census c ON c.population_id = p.resource_id
LEFT JOIN field.census_measurement cm ON cm.census_id = c.resource_id;

-- ---------------------------------------------------------------------
-- R2-C [MAJOR RESUELTO EN DISEÑO] Concurrencia del DAG Sample.
-- Todas las mutaciones de process_input/process_output toman el mismo
-- advisory transaction lock antes de modificar el grafo. Es deliberadamente
-- conservador: serializa escrituras del DAG y hace fiable el chequeo acíclico
-- de R1 frente a aristas complementarias concurrentes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION material.r2_lock_sample_genealogy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Par reservado para JBLR 01.2 Sample genealogy. El lock vive hasta COMMIT/ROLLBACK.
    PERFORM pg_advisory_xact_lock(124585, 1202);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_r2_sample_graph_lock_input
BEFORE INSERT OR UPDATE OR DELETE ON material.process_input
FOR EACH STATEMENT EXECUTE FUNCTION material.r2_lock_sample_genealogy();

CREATE TRIGGER trg_r2_sample_graph_lock_output
BEFORE INSERT OR UPDATE OR DELETE ON material.process_output
FOR EACH STATEMENT EXECUTE FUNCTION material.r2_lock_sample_genealogy();

-- ---------------------------------------------------------------------
-- R2-D [MAJOR RESUELTO EN DISEÑO] ExternalRecord get-or-create atómico.
-- El UUID lo aporta la aplicación (UUIDv7 institucional); la función NO
-- depende de uuidv7(). Un advisory lock por clave lógica evita Resources
-- huérfanos y consumo de códigos por carreras sobre la misma identidad.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evidence.r2_get_or_create_external_record(
    p_new_resource_id uuid,
    p_external_source_id uuid,
    p_external_id text,
    p_record_type text,
    p_canonical_url text DEFAULT NULL,
    p_license_text text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS TABLE (external_record_resource_id uuid, created boolean)
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing uuid;
BEGIN
    IF p_new_resource_id IS NULL OR p_external_source_id IS NULL
       OR p_external_id IS NULL OR p_record_type IS NULL THEN
        RAISE EXCEPTION 'new resource UUID, source, external_id and record_type are required';
    END IF;

    -- Primer key namespace JBLR; segundo key hash de la identidad externa.
    -- Las colisiones de hash sólo sobre-serializan; no afectan integridad.
    PERFORM pg_advisory_xact_lock(
        124585,
        hashtext(p_external_source_id::text || E'\\x1f' || p_external_id)
    );

    SELECT er.resource_id INTO v_existing
      FROM evidence.external_record er
     WHERE er.external_source_id = p_external_source_id
       AND er.external_id = p_external_id;

    IF v_existing IS NOT NULL THEN
        RETURN QUERY SELECT v_existing, false;
        RETURN;
    END IF;

    INSERT INTO core.resource(resource_id, resource_type_code)
    VALUES (p_new_resource_id, 'EXT');

    INSERT INTO evidence.external_record(
        resource_id, external_source_id, external_id, record_type,
        canonical_url, license_text, notes
    ) VALUES (
        p_new_resource_id, p_external_source_id, p_external_id, p_record_type,
        p_canonical_url, p_license_text, p_notes
    );

    RETURN QUERY SELECT p_new_resource_id, true;
END;
$$;

-- ---------------------------------------------------------------------
-- R2-E [MAJOR RESUELTO EN DISEÑO] ValidationStatus + ValidationEvent.
-- Autoridad oficial: esta función. Bloquea la fila Resource, registra el
-- evento y actualiza el estado dentro de la misma transacción. El parámetro
-- expected_from permite detectar escrituras obsoletas concurrentes.
-- No se crean triggers bidireccionales.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.r2_transition_validation_status(
    p_event_resource_id uuid,
    p_target_resource_id uuid,
    p_to_validation_status text,
    p_reviewed_by_agent_id uuid DEFAULT NULL,
    p_data_activity_id uuid DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_expected_from_validation_status text DEFAULT NULL,
    p_occurred_at timestamptz DEFAULT current_timestamp
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_from text;
BEGIN
    IF p_to_validation_status NOT IN ('unreviewed','pending_review','validated','disputed','rejected') THEN
        RAISE EXCEPTION 'invalid validation status %', p_to_validation_status;
    END IF;

    SELECT r.validation_status INTO v_from
      FROM core.resource r
     WHERE r.resource_id = p_target_resource_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'target Resource % does not exist', p_target_resource_id;
    END IF;

    IF p_expected_from_validation_status IS NOT NULL
       AND v_from <> p_expected_from_validation_status THEN
        RAISE EXCEPTION 'stale validation transition: expected %, current %',
            p_expected_from_validation_status, v_from;
    END IF;

    IF v_from = p_to_validation_status THEN
        RAISE EXCEPTION 'validation transition must change status; current is %', v_from;
    END IF;

    INSERT INTO core.resource(resource_id, resource_type_code)
    VALUES (p_event_resource_id, 'VLE');

    INSERT INTO governance.validation_event(
        resource_id, target_resource_id, from_validation_status,
        to_validation_status, reviewed_by_agent_id, occurred_at,
        data_activity_id, reason
    ) VALUES (
        p_event_resource_id, p_target_resource_id, v_from,
        p_to_validation_status, p_reviewed_by_agent_id, p_occurred_at,
        p_data_activity_id, p_reason
    );

    UPDATE core.resource
       SET validation_status = p_to_validation_status,
           updated_at = current_timestamp,
           row_version = row_version + 1
     WHERE resource_id = p_target_resource_id;
END;
$$;

-- ---------------------------------------------------------------------
-- R2-F [IMPROVEMENT requerido antes de producción] Vocabulario controlado
-- de DataUseConstraint.constraint_kind. No separa DataUseConstraint.
-- ---------------------------------------------------------------------
CREATE TABLE security.data_use_constraint_kind (
    constraint_kind text PRIMARY KEY,
    label text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO security.data_use_constraint_kind(constraint_kind,label,description) VALUES
('license','Licencia','Condiciones de licencia o atribución'),
('no_redistribution','No redistribución','Redistribución restringida'),
('embargo','Embargo','Restricción temporal'),
('third_party_confidentiality','Confidencialidad de tercero','Limitación impuesta por tercero'),
('internal_only','Solo uso interno','Consulta interna permitida con publicación restringida');

ALTER TABLE security.data_use_constraint
    ADD CONSTRAINT fk_data_use_constraint_kind
    FOREIGN KEY (constraint_kind)
    REFERENCES security.data_use_constraint_kind(constraint_kind)
    ON DELETE RESTRICT;

-- =====================================================================
-- FIN JBLR 01.2 RONDA 2
-- =====================================================================
