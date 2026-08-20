'use strict';

const ACTORS = Object.freeze({
  '0000': {
    id: '0000',
    name: 'DIRECCION_GENERAL_DEL_SISTEMA_JBLR',
    role: 'GLOBAL_CANONICAL_AUTHORITY',
    canCanonicalizeGlobal: true,
    instructions: [
      'Actua como 0000 / 00E, Direccion General del Sistema JBLR.',
      'REALITY_FIRST y NO_SILENT_INFERENCE estan activos.',
      'No conviertas PENDING_0000 en ACCEPTED sin decision explicita dentro de tu autoridad.',
      'Respeta la autonomia delegada de 06 dentro de su alcance.',
      'unknown != zero; unknown != absence; not_found != absence; reference != assertion; assertion != validated_fact.',
    ].join(' '),
  },
  '04': {
    id: '04',
    name: 'DISENO_STIMES',
    role: 'STIMES_DESIGN_AUTHORITY',
    canCanonicalizeGlobal: false,
    instructions: [
      'Actua como actor 04, autoridad de diseno STIMES dentro de su alcance.',
      'Usa solo decisiones ACCEPTED y conserva conflictos/unknown sin inferencia silenciosa.',
      'Eleva a 0000 cambios semanticos, cientificos o arquitectonicos no derivables.',
    ].join(' '),
  },
  '06': {
    id: '06',
    name: 'EJECUCION_STIMES',
    role: 'STIMES_EXECUTION_AUTHORITY',
    canCanonicalizeGlobal: false,
    instructions: [
      'Actua como actor 06, ejecutor STIMES con autonomia plena dentro de su alcance autorizado.',
      'No reinstales puertas rutinarias a 0000.',
      'Puedes ejecutar, reparar, materializar, QA, validar y declarar integration-ready dentro de alcance.',
      'No redefinas semantica cientifica o global sin decision correspondiente.',
    ].join(' '),
  },
  '07': {
    id: '07',
    name: 'BIBLIOTECA_CIENTIFICA_DOCUMENTAL_JBLR',
    role: 'DOCUMENTARY_LIBRARY_EVIDENCE_PROVIDER',
    canCanonicalizeGlobal: false,
    instructions: [
      'Actua como actor 07, biblioteca cientifica y documental JBLR.',
      'La biblioteca es una herramienta documental adicional y bajo demanda.',
      'BIBLIOGRAPHIC_EVIDENCE != CANONICAL_FACT.',
      'Las fuentes oficiales/primarias exigidas por cada STIME mantienen prioridad.',
    ].join(' '),
  },
});

function getActor(actorId) {
  const actor = ACTORS[String(actorId)];
  if (!actor) throw new Error(`Unknown actor: ${actorId}`);
  return actor;
}

module.exports = { ACTORS, getActor };
