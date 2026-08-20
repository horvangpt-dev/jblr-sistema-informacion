# JBLR Autonomous Actor Runtime v1

Estado: EXPERIMENTAL / NO INTEGRATION READY.

Objetivo: ejecutar actores JBLR persistentes sobre sesiones reemplazables, con continuidad automática y sin depender de ventanas de chat nativas.

## Actores iniciales

- 0000 / 00E: autoridad canónica global.
- 04: diseño STIMES.
- 06: ejecución STIMES con autonomía dentro de alcance.
- 07: biblioteca científica/documental; evidencia bibliográfica no se autopromociona a hecho canónico.

## Invariante central

ACTOR_IDENTITY = PERSISTENT
RUNTIME_SESSION = REPLACEABLE
TRASPASO = COPY NEVER MOVE

Cerrar una sesión no crea un actor nuevo. El runtime genera un paquete de continuidad, cierra la sesión, abre la sucesora y restaura NEXT_ACTION, cursor del Event Bus y estado del actor.

## Persistencia local v1

La primera versión usa archivos locales bajo JBLR_RUNTIME_STATE_DIR. Mantiene actor-state, historial de sesiones, event-bus JSONL, canonical-state y paquetes de continuidad. Los adapters a Google Drive / JBLR_SHARED_EVENT_BUS_v1 / JBLR_CURRENT_CANONICAL_STATE_v1 / GitHub se incorporarán después de validar el núcleo.

## OpenAI

La ejecución real requiere OPENAI_API_KEY en el almacén de secretos del despliegue. La clave nunca debe escribirse en GitHub, logs, continuidad ni respuestas. Sin clave el servicio se declara DEGRADED_NO_OPENAI_KEY y no simula ejecución real.

El adaptador usa OpenAI Agents SDK, una Session persistente propia, OpenAIResponsesCompactionSession y el uso real reportado por result.state.usage. Los umbrales de riesgo son valores absolutos configurables; no representan porcentajes inventados del contexto máximo.

## Riesgo de contexto

SAFE: continúa.
ELEVATED: persistir estado/minimizar crecimiento; la compacción puede reducir historial.
HIGH: no iniciar trabajo sustantivo nuevo; generar continuidad y rotar a una nueva runtime session del mismo actor.

## API mínima

GET /health
GET /runtime/status
POST /actors/:actorId/run
POST /actors/:actorId/continuity

## Estado de integración

No modifica main, Neon, el Event Bus compartido ni el estado canónico real. Esta rama implementa y prueba el runtime aislado. La conexión a fuentes canónicas externas debe ser explícita y verificable antes de declarar producción.
