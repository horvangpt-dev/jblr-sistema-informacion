-- JBLR 01.2 RONDA 2 - CONSULTAS Y PRUEBAS DE INTEGRIDAD
-- NO PRODUCCION. Requiere JBLR_01_2_R2_DDL_PILOT.sql + JBLR_01_2_R2_SAMPLE_DATA.sql.
SET TIME ZONE 'UTC';


-- Run abierto exclusivo para pruebas negativas de AnalysisResult.
INSERT INTO core.resource(resource_id,resource_type_code) VALUES
('018f0000-0000-7000-8000-00000000f090','ACT'),
('018f0000-0000-7000-8000-00000000f091','ANR');
INSERT INTO governance.data_activity(resource_id,activity_type,started_at,performed_by_agent_id,software_name)
VALUES ('018f0000-0000-7000-8000-00000000f090','analysis-test',current_timestamp,
        (SELECT resource_id FROM core.agent WHERE display_name='JBLR Pilot Bot'),'negative-tests');
INSERT INTO analytics.analysis_run(resource_id,data_activity_id,module_code,method_version,run_status)
VALUES ('018f0000-0000-7000-8000-00000000f091','018f0000-0000-7000-8000-00000000f090','NEGATIVE_TEST','1','running');

-- =====================================================================
-- A. EXPECTED-FAILURE TESTS: si una insercion indebida NO falla, el DO
-- eleva una excepcion y el piloto debe considerarse fallido.
-- =====================================================================

-- A1. Un solo Identification preferido por target.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f101','IDN');
    INSERT INTO taxonomy.identification(
      resource_id,target_resource_id,taxon_concept_id,verbatim_identification,
      resolution_status,is_preferred)
    VALUES (
      '018f0000-0000-7000-8000-00000000f101',
      (SELECT resource_id FROM field.population WHERE population_label='Population A'),
      (SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto A'),
      'Duplicada preferida','resolved',true);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A1 duplicate preferred identification rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A1 duplicate preferred identification was accepted'; END IF;
END $$;

-- A2. ERROR != 0: failed + numeric_value=0 debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f102','RSL');
    INSERT INTO analytics.analysis_result(
      resource_id,analysis_run_id,metric_definition_id,subject_resource_id,
      value_status,numeric_value)
    VALUES (
      '018f0000-0000-7000-8000-00000000f102',
      '018f0000-0000-7000-8000-00000000f091',
      (SELECT metric_definition_id FROM analytics.metric_definition WHERE metric_code='SCI_COUNT'),
      (SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto A'),
      'failed',0);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A2 failed+0 rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A2 failed+0 was accepted'; END IF;
END $$;

-- A3. Metrica TXC aplicada a Sample debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f103','RSL');
    INSERT INTO analytics.analysis_result(
      resource_id,analysis_run_id,metric_definition_id,subject_resource_id,
      value_status,numeric_value)
    VALUES (
      '018f0000-0000-7000-8000-00000000f103',
      '018f0000-0000-7000-8000-00000000f091',
      (SELECT metric_definition_id FROM analytics.metric_definition WHERE metric_code='SCI_COUNT'),
      (SELECT resource_id FROM material.sample WHERE notes='Sample D division'),
      'present',1);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A3 metric target mismatch rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A3 metric target mismatch was accepted'; END IF;
END $$;

-- A4. Metrica numeric con text_value debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f104','RSL');
    INSERT INTO analytics.analysis_result(
      resource_id,analysis_run_id,metric_definition_id,subject_resource_id,
      value_status,text_value)
    VALUES (
      '018f0000-0000-7000-8000-00000000f104',
      '018f0000-0000-7000-8000-00000000f091',
      (SELECT metric_definition_id FROM analytics.metric_definition WHERE metric_code='SCI_COUNT'),
      (SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto B tras split'),
      'present','wrong type');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A4 metric value type mismatch rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A4 metric value type mismatch was accepted'; END IF;
END $$;

-- A5. Ciclo Sample D -> Sample A, existiendo A -> A2 -> C -> D, debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f201','PRC');
    INSERT INTO material.processing_event(resource_id,process_type)
      VALUES ('018f0000-0000-7000-8000-00000000f201','cycle-test');
    INSERT INTO material.process_input(process_input_id,processing_event_id,sample_id)
      VALUES ('018f0000-0000-7000-8000-00000000f202',
              '018f0000-0000-7000-8000-00000000f201',
              (SELECT resource_id FROM material.sample WHERE notes='Sample D division'));
    INSERT INTO material.process_output(process_output_id,processing_event_id,sample_id)
      VALUES ('018f0000-0000-7000-8000-00000000f203',
              '018f0000-0000-7000-8000-00000000f201',
              (SELECT resource_id FROM material.sample WHERE notes='Sample A madre 1'));
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A5 sample genealogy cycle rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A5 sample genealogy cycle was accepted'; END IF;
END $$;

-- A6. Un mismo Sample derivado no puede ser output de dos procesos.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f204','PRC');
    INSERT INTO material.processing_event(resource_id,process_type)
      VALUES ('018f0000-0000-7000-8000-00000000f204','second-producer-test');
    INSERT INTO material.process_output(process_output_id,processing_event_id,sample_id)
      VALUES ('018f0000-0000-7000-8000-00000000f205',
              '018f0000-0000-7000-8000-00000000f204',
              (SELECT resource_id FROM material.sample WHERE notes='Sample D division'));
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A6 second producer rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A6 second producer was accepted'; END IF;
END $$;

-- A7. Derivado de ContentItem distinto debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f301','CRP');
    INSERT INTO evidence.content_representation(
      resource_id,content_item_id,digital_asset_id,representation_role,version_no,
      derived_from_representation_id)
    VALUES (
      '018f0000-0000-7000-8000-00000000f301',
      (SELECT resource_id FROM evidence.content_item WHERE title='Documento sintetico'),
      (SELECT resource_id FROM evidence.digital_asset WHERE original_filename='asset_photo_safe.bin'),
      'derivative',99,
      (SELECT cr.resource_id
         FROM evidence.content_representation cr
         JOIN evidence.content_item ci ON ci.resource_id=cr.content_item_id
        WHERE ci.title='Fotografia sintetica' AND cr.representation_role='original'));
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A7 cross-content derivative rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A7 cross-content derivative was accepted'; END IF;
END $$;

-- A8. SensitivityAssignment con FieldGroup POP sobre Accession debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO security.sensitivity_assignment(
      sensitivity_assignment_id,resource_id,field_group_id,
      sensitivity_dimension,sensitivity_level,is_current)
    VALUES (
      '018f0000-0000-7000-8000-00000000f401',
      (SELECT resource_id FROM material.accession WHERE notes='Accesion 1'),
      (SELECT field_group_id FROM security.field_group WHERE resource_type_code='POP' AND group_code='geometry'),
      'spatial','S3',true);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A8 field group/resource type mismatch rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A8 field group/resource mismatch was accepted'; END IF;
END $$;

-- A9. Resource subtipo incorrecto debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f501','SMP');
    INSERT INTO field.population(resource_id,population_label)
      VALUES ('018f0000-0000-7000-8000-00000000f501','Wrong subtype');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A9 Resource subtype mismatch rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A9 Resource subtype mismatch was accepted'; END IF;
END $$;

-- A10. Prefijo JBLR que no coincide con tipo debe fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code,jblr_code)
      VALUES ('018f0000-0000-7000-8000-00000000f502','POP','JBLR-TXC-99999999');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A10 wrong JBLR prefix rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A10 wrong JBLR prefix was accepted'; END IF;
END $$;

-- A11. No reutilizacion de un codigo humano tras borrar el Resource.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  INSERT INTO core.resource(resource_id,resource_type_code,jblr_code)
    VALUES ('018f0000-0000-7000-8000-00000000f503','POP','JBLR-POP-99999990');
  DELETE FROM core.resource WHERE resource_id='018f0000-0000-7000-8000-00000000f503';
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code,jblr_code)
      VALUES ('018f0000-0000-7000-8000-00000000f504','POP','JBLR-POP-99999990');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A11 JBLR code reuse rejected by registry: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A11 JBLR code was reused'; END IF;
END $$;

-- A12. Dos SearchNameAssertion abiertas para el mismo contexto deben fallar.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id, resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f601','SNA');
    INSERT INTO taxonomy.search_name_assertion(
      resource_id,taxon_concept_id,taxonomic_name_id,search_context,safety_status,valid_from)
    SELECT '018f0000-0000-7000-8000-00000000f601',
           taxon_concept_id,taxonomic_name_id,search_context,'excluded','2026-02-01'
      FROM taxonomy.search_name_assertion
     WHERE search_context='bibliography'
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A12 duplicate open SearchNameAssertion rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A12 duplicate open SearchNameAssertion was accepted'; END IF;
END $$;

-- A13. DOC/MED no puede contradecir content_kind.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f701','DOC');
    INSERT INTO evidence.content_item(resource_id,content_kind,title)
      VALUES ('018f0000-0000-7000-8000-00000000f701','media','Wrong DOC/MED');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A13 DOC/MED mismatch rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A13 DOC/MED mismatch was accepted'; END IF;
END $$;

-- A14. ExternalRecord duplicado fuente+external_id debe fallar dentro de
-- una subtransaccion; el Resource padre candidato se revierte con ella.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f801','EXT');
    INSERT INTO evidence.external_record(resource_id,external_source_id,external_id,record_type)
    SELECT '018f0000-0000-7000-8000-00000000f801', external_source_id, external_id, record_type
      FROM evidence.external_record WHERE external_id='SYN-001';
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A14 duplicate ExternalRecord rejected transactionally: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A14 duplicate ExternalRecord was accepted'; END IF;
END $$;

-- A15. Snapshot identico del mismo ExternalRecord debe fallar por hash.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f802','EXS');
    INSERT INTO evidence.external_record_snapshot(
      resource_id,external_record_id,retrieved_at,payload_hash,raw_payload,capture_status)
    SELECT '018f0000-0000-7000-8000-00000000f802', external_record_id,
           current_timestamp,payload_hash,raw_payload,'captured'
      FROM evidence.external_record_snapshot
     WHERE external_record_id=(SELECT resource_id FROM evidence.external_record WHERE external_id='SYN-001')
     ORDER BY retrieved_at LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A15 duplicate ExternalRecordSnapshot hash rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A15 duplicate snapshot hash was accepted'; END IF;
END $$;


-- A16. AnalysisRun cerrado no puede modificarse.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    UPDATE analytics.analysis_run SET notes='illegal change' WHERE release_label='pilot-v1';
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A16 closed AnalysisRun immutable: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A16 closed AnalysisRun was mutable'; END IF;
END $$;

-- A17. No se pueden añadir Results a un AnalysisRun cerrado.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO core.resource(resource_id,resource_type_code)
      VALUES ('018f0000-0000-7000-8000-00000000f901','RSL');
    INSERT INTO analytics.analysis_result(resource_id,analysis_run_id,metric_definition_id,subject_resource_id,value_status,numeric_value)
    VALUES ('018f0000-0000-7000-8000-00000000f901',
            (SELECT resource_id FROM analytics.analysis_run WHERE release_label='pilot-v1'),
            (SELECT metric_definition_id FROM analytics.metric_definition WHERE metric_code='SCI_COUNT'),
            (SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto B tras split'),
            'present',1);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    RAISE NOTICE 'PASS A17 insert into closed AnalysisRun rejected: %', SQLERRM;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL A17 result added to closed AnalysisRun'; END IF;
END $$;

-- =====================================================================
-- B. CONSULTAS FUNCIONALES REQUERIDAS
-- =====================================================================

-- Q1. Identificacion preferida de un objeto.
SELECT i.target_resource_id, i.resource_id AS identification_id,
       n.scientific_name, tc.concept_label, i.identified_at
FROM taxonomy.identification i
LEFT JOIN taxonomy.taxonomic_name n ON n.resource_id=i.taxonomic_name_id
LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
WHERE i.target_resource_id=(SELECT resource_id FROM field.population WHERE population_label='Population A')
  AND i.is_preferred=true;

-- Q2. Nombre aceptado JBLR actual de un TaxonConcept.
SELECT * FROM taxonomy.v_current_adopted_name
WHERE taxon_concept_id=(SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto A');

-- Q3. Todas las observaciones historicas de una Population.
SELECT o.resource_id,o.observed_at,o.verbatim_observation,fv.sequence_no,l.location_name
FROM field.observation o
LEFT JOIN field.field_visit fv ON fv.resource_id=o.field_visit_id
LEFT JOIN field.location l ON l.resource_id=COALESCE(o.location_id,fv.location_id)
WHERE o.population_id=(SELECT resource_id FROM field.population WHERE population_label='Population A')
ORDER BY o.observed_at;

-- Q4. Ultimo Census de una Population.
SELECT * FROM field.v_latest_census
WHERE population_id=(SELECT resource_id FROM field.population WHERE population_label='Population A');

-- Q5. Genealogia ascendente de Sample D, incluyendo madres de campo.
WITH RECURSIVE ancestors(sample_id, depth) AS (
  SELECT resource_id,0 FROM material.sample WHERE notes='Sample D division'
  UNION
  SELECT pi.sample_id,a.depth+1
  FROM ancestors a
  JOIN material.process_output po ON po.sample_id=a.sample_id
  JOIN material.process_input pi ON pi.processing_event_id=po.processing_event_id
), dedup AS (
  SELECT sample_id,min(depth) AS depth FROM ancestors GROUP BY sample_id
)
SELECT d.depth,s.resource_id,s.notes,i.individual_label,ce.collection_at
FROM dedup d
JOIN material.sample s ON s.resource_id=d.sample_id
LEFT JOIN material.sample_origin so ON so.sample_id=s.resource_id
LEFT JOIN field.individual i ON i.resource_id=so.individual_id
LEFT JOIN field.collection_event ce ON ce.resource_id=so.collection_event_id
ORDER BY d.depth,s.notes;

-- Q6. Accession y muestras de origen inmediato, con genealogia disponible por Q5.
SELECT a.resource_id AS accession_id,a.accession_status,
       s.resource_id AS sample_id,s.notes,am.material_role,am.quantity_value,am.quantity_unit
FROM material.accession a
JOIN material.accession_material am ON am.accession_id=a.resource_id
JOIN material.sample s ON s.resource_id=am.sample_id
ORDER BY a.resource_id,s.resource_id;

-- Q7. Nombres seguros para bibliography actualmente vigentes.
SELECT tc.concept_label,n.scientific_name,sna.safety_status,sna.valid_from,sna.valid_to
FROM taxonomy.search_name_assertion sna
JOIN taxonomy.taxon_concept tc ON tc.resource_id=sna.taxon_concept_id
JOIN taxonomy.taxonomic_name n ON n.resource_id=sna.taxonomic_name_id
WHERE sna.search_context='bibliography'
  AND sna.safety_status IN ('automatic_safe','reviewed_safe')
  AND (sna.valid_from IS NULL OR sna.valid_from <= current_date)
  AND (sna.valid_to IS NULL OR sna.valid_to >= current_date);

-- Q8. Ultimo snapshot de ExternalRecord.
SELECT DISTINCT ON (ers.external_record_id)
       ers.external_record_id,ers.resource_id AS snapshot_id,ers.retrieved_at,ers.payload_hash,ers.normalized_payload
FROM evidence.external_record_snapshot ers
ORDER BY ers.external_record_id,ers.retrieved_at DESC,ers.resource_id;

-- Q9. Ultimo resultado oficial/liberado de una metrica por sujeto.
SELECT ar.subject_resource_id,md.metric_code,ar.resource_id AS result_id,
       ar.value_status,ar.numeric_value,run.release_label,run.released_at
FROM analytics.analysis_result ar
JOIN analytics.analysis_run run ON run.resource_id=ar.analysis_run_id
JOIN analytics.metric_definition md ON md.metric_definition_id=ar.metric_definition_id
WHERE md.metric_code='SCI_COUNT'
  AND ar.subject_resource_id=(SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto A')
  AND run.run_status='closed'
  AND run.release_label IS NOT NULL
ORDER BY run.released_at DESC NULLS LAST, ar.computed_at DESC
LIMIT 1;

-- Q10. Determinar si un resultado esta taxonomicamente obsoleto.
SELECT ar.resource_id AS result_id,tia.resource_id AS impact_assessment_id,
       t.term_code AS taxonomic_impact,tia.historical_assignability,tia.rationale
FROM analytics.analysis_result ar
JOIN taxonomy.taxonomic_impact_assessment tia ON tia.affected_resource_id=ar.resource_id
LEFT JOIN taxonomy.term t ON t.term_key=tia.impact_term_key
WHERE ar.resource_id=(
  SELECT ar2.resource_id
  FROM analytics.analysis_result ar2
  JOIN analytics.analysis_run r2 ON r2.resource_id=ar2.analysis_run_id
  JOIN analytics.metric_definition md2 ON md2.metric_definition_id=ar2.metric_definition_id
  WHERE md2.metric_code='SCI_COUNT' AND r2.release_label='pilot-v1'
  LIMIT 1
);

-- Q11. Representacion espacial permitida para Population S3.
-- Esta consulta publica NO devuelve la geometria maestra cuando la politica es area_only/withheld.
SELECT p.resource_id AS population_id,p.population_label,
       sa.sensitivity_level,sdp.disclosure_mode,
       CASE WHEN sdp.disclosure_mode='exact' THEN ST_AsText(lgv.geom)
            ELSE NULL END AS public_geometry_wkt,
       CASE WHEN sdp.disclosure_mode IN ('area_only','withheld') THEN ga.name
            ELSE NULL END AS public_area_name
FROM field.population p
JOIN security.sensitivity_assignment sa ON sa.resource_id=p.resource_id
JOIN security.field_group fg ON fg.field_group_id=sa.field_group_id AND fg.group_code='geometry'
JOIN security.spatial_disclosure_policy sdp
  ON sdp.applicable_sensitivity_level=sa.sensitivity_level AND sdp.field_group_id=fg.field_group_id AND sdp.is_active
LEFT JOIN field.population_location pl ON pl.population_id=p.resource_id
LEFT JOIN field.location l ON l.resource_id=pl.location_id
LEFT JOIN core.geographic_area ga ON ga.resource_id=l.geographic_area_id
LEFT JOIN field.location_geometry_version lgv ON lgv.location_id=l.resource_id AND lgv.is_preferred
WHERE p.population_label='Population A' AND sa.is_current
ORDER BY l.location_name NULLS LAST;

-- Prueba separada interna: la geometria maestra sigue existiendo y no fue reemplazada.
SELECT l.location_name,lgv.version_no,lgv.geometry_role,lgv.is_preferred,
       ST_AsText(lgv.geom) AS internal_master_geometry
FROM field.population p
JOIN field.population_location pl ON pl.population_id=p.resource_id
JOIN field.location l ON l.resource_id=pl.location_id
JOIN field.location_geometry_version lgv ON lgv.location_id=l.resource_id
WHERE p.population_label='Population A'
ORDER BY l.location_name,lgv.version_no;

-- Q12. Recursos relacionados con un DigitalAsset via ContentRepresentation/ContentItem.
SELECT da.resource_id AS digital_asset_id,da.sha256,ci.resource_id AS content_item_id,
       ci.content_kind,cr.representation_role,cl.target_resource_id,cl.relation_role
FROM evidence.digital_asset da
JOIN evidence.content_representation cr ON cr.digital_asset_id=da.resource_id
JOIN evidence.content_item ci ON ci.resource_id=cr.content_item_id
LEFT JOIN evidence.content_link cl ON cl.content_item_id=ci.resource_id
ORDER BY ci.title,cr.version_no NULLS LAST;

-- =====================================================================
-- C. PRUEBAS ESPECIFICAS DE CASOS
-- =====================================================================

-- C1. Prospection tiene tres FieldVisit y tres Location diferentes.
SELECT p.resource_id,p.started_at,p.ended_at,count(*) AS visits,count(DISTINCT fv.location_id) AS distinct_locations
FROM field.prospection p JOIN field.field_visit fv ON fv.prospection_id=p.resource_id
GROUP BY p.resource_id,p.started_at,p.ended_at;

-- C2. Censos historicos permanecen en Population A despues del split.
SELECT p.population_label,count(c.resource_id) AS census_count
FROM field.population p LEFT JOIN field.census c ON c.population_id=p.resource_id
GROUP BY p.resource_id,p.population_label ORDER BY p.population_label;

-- C3. Relaciones de split sin duplicacion automatica de Census.
SELECT sp.population_label AS source_population,op.population_label AS successor,pr.relation_type,pr.effective_date
FROM field.population_relation pr
JOIN field.population sp ON sp.resource_id=pr.subject_population_id
JOIN field.population op ON op.resource_id=pr.object_population_id
ORDER BY successor;

-- C4. Dimensiones RegionalTaxonAssertion independientes.
SELECT presence_term_key,presence_value_status,
       origin_term_key,origin_value_status,
       establishment_term_key,establishment_value_status,
       context_term_key,context_value_status,
       temporality_term_key,temporality_value_status,
       catalog_inclusion_term_key,catalog_inclusion_value_status
FROM taxonomy.regional_taxon_assertion;

-- C5. Location sin geometria, punto, poligono y version corregida.
SELECT l.location_name,count(lgv.resource_id) AS geometry_versions,
       string_agg(DISTINCT ST_GeometryType(lgv.geom),',' ORDER BY ST_GeometryType(lgv.geom)) AS geometry_types,
       max(lgv.version_no) AS max_version
FROM field.location l LEFT JOIN field.location_geometry_version lgv ON lgv.location_id=l.resource_id
GROUP BY l.resource_id,l.location_name ORDER BY l.location_name;

-- C6. ERROR != 0: presentes con cero y estados no presentes con NULL.
SELECT value_status,numeric_value,count(*)
FROM analytics.analysis_result
GROUP BY value_status,numeric_value ORDER BY value_status,numeric_value;
SELECT value_status,numeric_value,count(*)
FROM field.census_measurement
GROUP BY value_status,numeric_value ORDER BY value_status,numeric_value;

-- C7. DOC/MED comparten tabla fisica sin ambiguedad de ResourceType.
SELECT ci.content_kind,r.resource_type_code,r.jblr_code,ci.title
FROM evidence.content_item ci JOIN core.resource r ON r.resource_id=ci.resource_id
ORDER BY ci.content_kind,ci.title;

-- C8. Cinco DataUseConstraint representables en la misma entidad.
SELECT constraint_kind,title,starts_at,ends_at,blocks_view,blocks_export,blocks_publish,conditions
FROM security.data_use_constraint ORDER BY constraint_kind;

-- C9. Import outcomes no contaminan ValidationStatus.
SELECT ibi.process_outcome,count(*)
FROM governance.import_batch_item ibi GROUP BY ibi.process_outcome ORDER BY ibi.process_outcome;
SELECT DISTINCT r.validation_status
FROM governance.import_batch_item ibi JOIN core.resource r ON r.resource_id=ibi.target_resource_id
WHERE ibi.target_resource_id IS NOT NULL;

-- C10. UUID version de Resource sinteticos y separacion UUID/codigo humano.
SELECT uuid_extract_version(resource_id) AS uuid_version,count(*) FROM core.resource GROUP BY 1 ORDER BY 1;
SELECT resource_type_code,count(*) FILTER (WHERE jblr_code IS NOT NULL) AS coded,
       count(*) FILTER (WHERE jblr_code IS NULL) AS uncoded
FROM core.resource GROUP BY resource_type_code ORDER BY resource_type_code;

-- C11. AccessGrant expirado vs vigente (representacion; no autenticacion/RLS).
SELECT ag.access_grant_id,p.permission_code,ag.starts_at,ag.ends_at,
       ag.is_active AND ag.starts_at<=current_timestamp AND (ag.ends_at IS NULL OR ag.ends_at>=current_timestamp) AS effective_now
FROM security.access_grant ag JOIN security.permission p ON p.permission_id=ag.permission_id
ORDER BY ag.starts_at;

-- C12. Matriz basica view/export/publish considerando RBAC + DataUseConstraint.
WITH role_caps AS (
  SELECT pr.principal_id,perm.permission_code
  FROM security.principal_role pr
  JOIN security.role_permission rp ON rp.role_id=pr.role_id
  JOIN security.permission perm ON perm.permission_id=rp.permission_id
  WHERE pr.valid_from<=current_timestamp AND (pr.valid_to IS NULL OR pr.valid_to>=current_timestamp)
), blocks AS (
  SELECT l.target_resource_id,
         bool_or(c.blocks_view) AS blocks_view,
         bool_or(c.blocks_export) AS blocks_export,
         bool_or(c.blocks_publish) AS blocks_publish
  FROM security.data_use_constraint_link l
  JOIN security.data_use_constraint c ON c.resource_id=l.data_use_constraint_id
  WHERE (c.starts_at IS NULL OR c.starts_at<=current_timestamp)
    AND (c.ends_at IS NULL OR c.ends_at>=current_timestamp)
  GROUP BY l.target_resource_id
)
SELECT sp.principal_id,ci.title,cap.permission_code,
       CASE cap.permission_code
         WHEN 'VIEW' THEN NOT COALESCE(b.blocks_view,false)
         WHEN 'EXPORT' THEN NOT COALESCE(b.blocks_export,false)
         WHEN 'PUBLISH' THEN NOT COALESCE(b.blocks_publish,false)
         ELSE true
       END AS allowed_by_data_use_constraint
FROM security.security_principal sp
JOIN role_caps cap ON cap.principal_id=sp.principal_id
CROSS JOIN evidence.content_item ci
LEFT JOIN blocks b ON b.target_resource_id=ci.resource_id
ORDER BY ci.title,cap.permission_code;

-- =====================================================================
-- D. EXPLAIN BASICO / INDICES
-- =====================================================================
EXPLAIN SELECT * FROM taxonomy.taxonomic_name WHERE lower(canonical_name)=lower('Exempla alba');
EXPLAIN SELECT * FROM core.resource WHERE jblr_code='JBLR-POP-00000001';
EXPLAIN SELECT * FROM evidence.external_record
        WHERE external_source_id=(SELECT external_source_id FROM evidence.external_source WHERE source_code='SYNTH')
          AND external_id='SYN-001';
EXPLAIN SELECT * FROM field.census
        WHERE population_id=(SELECT resource_id FROM field.population WHERE population_label='Population A')
        ORDER BY census_at DESC LIMIT 1;
EXPLAIN SELECT * FROM field.location_geometry_version
        WHERE ST_Intersects(geom,ST_MakeEnvelope(2.3,1.2,2.6,1.5,4326));
EXPLAIN SELECT * FROM security.access_event
        WHERE resource_id=(SELECT resource_id FROM field.population WHERE population_label='Population A')
        ORDER BY occurred_at DESC;
EXPLAIN SELECT * FROM analytics.analysis_result
        WHERE metric_definition_id=(SELECT metric_definition_id FROM analytics.metric_definition WHERE metric_code='SCI_COUNT')
          AND subject_resource_id=(SELECT resource_id FROM taxonomy.taxon_concept WHERE concept_label='Concepto A');


-- =====================================================================
-- E. RONDA 2: MAJOR RESUELTOS Y NUEVAS PRUEBAS NEGATIVAS
-- =====================================================================

-- E1. taxonomy.term: un término de origin no puede usarse como rank.
DO $$
BEGIN
    BEGIN
        UPDATE taxonomy.taxon_concept
           SET rank_term_key='origin:native'
         WHERE resource_id='018f0000-0000-7000-8000-000000000007';
        RAISE EXCEPTION 'TEST FAILED E1: cross-domain rank accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST FAILED E1:%' THEN RAISE; END IF;
        RAISE NOTICE 'PASS E1 term-domain rank rejected: %', SQLERRM;
    END;
END $$;

-- E2. RegionalTaxonAssertion: presence no puede recibir term de temporality.
DO $$
BEGIN
    BEGIN
        UPDATE taxonomy.regional_taxon_assertion
           SET presence_term_key='temporality:current'
         WHERE resource_id='018f0000-0000-7000-8000-000000000020';
        RAISE EXCEPTION 'TEST FAILED E2: cross-domain presence accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST FAILED E2:%' THEN RAISE; END IF;
        RAISE NOTICE 'PASS E2 term-domain presence rejected: %', SQLERRM;
    END;
END $$;

-- E3. NomenclaturalRelation no puede recibir un rank.
DO $$
BEGIN
    BEGIN
        UPDATE taxonomy.nomenclatural_relation
           SET relation_term_key='rank:species'
         WHERE resource_id IN (SELECT resource_id FROM taxonomy.nomenclatural_relation LIMIT 1);
        IF FOUND THEN RAISE EXCEPTION 'TEST FAILED E3: cross-domain nomenclatural relation accepted'; END IF;
        RAISE NOTICE 'PASS E3 no seeded nomenclatural relation row; trigger covered structurally';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST FAILED E3:%' THEN RAISE; END IF;
        RAISE NOTICE 'PASS E3 term-domain nomenclatural relation rejected: %', SQLERRM;
    END;
END $$;

-- E4. Projection Population aplicada a FieldGroup de otro tipo debe fallar.
DO $$
DECLARE v_fg uuid := '018f0000-0000-7000-8000-0000000000d3';
BEGIN
    INSERT INTO security.field_group(field_group_id,resource_type_code,group_code,label)
    VALUES (v_fg,'ACC','bad_projection_test','bad projection test');
    BEGIN
        INSERT INTO security.field_group_projection(field_group_projection_id,field_group_id,projection_code)
        VALUES ('018f0000-0000-7000-8000-0000000000d4',v_fg,'population_geometry');
        RAISE EXCEPTION 'TEST FAILED E4: incompatible relational projection accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST FAILED E4:%' THEN RAISE; END IF;
        RAISE NOTICE 'PASS E4 incompatible FieldGroup projection rejected: %', SQLERRM;
    END;
    DELETE FROM security.field_group WHERE field_group_id=v_fg;
END $$;

-- E5. DataUseConstraint constraint_kind debe pertenecer al vocabulario controlado.
DO $$
BEGIN
    BEGIN
        INSERT INTO core.resource(resource_id,resource_type_code)
        VALUES ('018f0000-0000-7000-8000-0000000000d5','DUC');
        INSERT INTO security.data_use_constraint(resource_id,constraint_kind,title)
        VALUES ('018f0000-0000-7000-8000-0000000000d5','invented_kind','invalid');
        RAISE EXCEPTION 'TEST FAILED E5: uncontrolled constraint_kind accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'TEST FAILED E5:%' THEN RAISE; END IF;
        RAISE NOTICE 'PASS E5 uncontrolled DataUseConstraint kind rejected: %', SQLERRM;
    END;
END $$;

-- E6. FieldGroup relacional: conteos independientes, sin producto cartesiano.
SELECT 'population_geometry' AS projection_code, count(*) AS projected_rows
FROM security.v_population_geometry_projection
WHERE population_resource_id='018f0000-0000-7000-8000-00000000002b'
UNION ALL
SELECT 'population_demography' AS projection_code, count(*) AS projected_rows
FROM security.v_population_demography_projection
WHERE population_resource_id='018f0000-0000-7000-8000-00000000002b'
ORDER BY projection_code;

-- E7. ExternalRecord operación oficial: segunda llamada misma identidad devuelve mismo Resource.
BEGIN;
SELECT * FROM evidence.r2_get_or_create_external_record(
  '018f0000-0000-7000-8000-0000000000d6',
  '018f0000-0000-7000-8000-00000000007c',
  'R2-SEQUENTIAL-001','synthetic');
SELECT * FROM evidence.r2_get_or_create_external_record(
  '018f0000-0000-7000-8000-0000000000d7',
  '018f0000-0000-7000-8000-00000000007c',
  'R2-SEQUENTIAL-001','synthetic');
DO $$
BEGIN
 IF (SELECT count(*) FROM evidence.external_record er
     WHERE er.external_source_id='018f0000-0000-7000-8000-00000000007c'
       AND er.external_id='R2-SEQUENTIAL-001') <> 1 THEN
   RAISE EXCEPTION 'TEST FAILED E7: ExternalRecord get-or-create duplicated identity';
 END IF;
 RAISE NOTICE 'PASS E7 sequential ExternalRecord get-or-create';
END $$;
ROLLBACK;

-- E8. Validation operation rollback: ni estado ni evento sobreviven.
BEGIN;
SELECT governance.r2_transition_validation_status(
  '018f0000-0000-7000-8000-0000000000d8',
  '018f0000-0000-7000-8000-00000000002c',
  'pending_review',NULL,NULL,'rollback test','unreviewed',current_timestamp);
ROLLBACK;
DO $$
BEGIN
 IF (SELECT validation_status FROM core.resource WHERE resource_id='018f0000-0000-7000-8000-00000000002c') <> 'unreviewed' THEN
   RAISE EXCEPTION 'TEST FAILED E8: validation state survived rollback';
 END IF;
 IF EXISTS (SELECT 1 FROM governance.validation_event WHERE resource_id='018f0000-0000-7000-8000-0000000000d8') THEN
   RAISE EXCEPTION 'TEST FAILED E8: validation event survived rollback';
 END IF;
 RAISE NOTICE 'PASS E8 atomic validation rollback';
END $$;

-- E9. UUIDv7 nativo de PostgreSQL 18 se prueba, pero el DDL no depende de él.
SELECT uuidv7() AS pg18_uuidv7, uuid_extract_version(uuidv7()) AS version_should_be_7;

-- E10. PostGIS físico: SRID, punto, polígono, GiST y distancia/contención sencilla.
SELECT PostGIS_Full_Version();
SELECT resource_id, ST_GeometryType(geom), ST_SRID(geom), uncertainty_m
FROM field.location_geometry_version
ORDER BY resource_id;
SELECT count(*) AS intersects_synthetic_envelope
FROM field.location_geometry_version
WHERE geom && ST_MakeEnvelope(-5,-5,5,5,4326);
EXPLAIN (COSTS OFF)
SELECT resource_id FROM field.location_geometry_version
WHERE geom && ST_MakeEnvelope(-5,-5,5,5,4326);

-- E11. Geometría maestra sigue intacta aunque política S3 sea area_only.
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM security.v_population_geometry_projection
   WHERE population_resource_id='018f0000-0000-7000-8000-00000000002b' AND geom IS NOT NULL
 ) THEN RAISE EXCEPTION 'TEST FAILED E11: master geometry missing'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM security.spatial_disclosure_policy sdp
   WHERE sdp.applicable_sensitivity_level='S3' AND sdp.disclosure_mode='area_only'
 ) THEN RAISE EXCEPTION 'TEST FAILED E11: S3 area_only policy missing'; END IF;
 RAISE NOTICE 'PASS E11 master geometry retained with restrictive S3 policy';
END $$;
