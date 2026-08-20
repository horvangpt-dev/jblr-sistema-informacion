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

El runtime conserva actor-state, historial de sesiones, event-bus JSONL, canonical-state y paquetes de continuidad bajo `JBLR_RUNTIME_STATE_DIR`. La persistencia local sigue siendo la copia operativa del runtime; no sustituye el estado compartido canónico.

## Sincronización externa

Si `GOOGLE_SERVICE_ACCOUNT_JSON` está configurado, antes de cada ejecución sustantiva el runtime lee:

- `JBLR_SHARED_EVENT_BUS_v1` desde `JBLR_EVENT_BUS_SPREADSHEET_ID`;
- `JBLR_CURRENT_CANONICAL_STATE_v1` desde `JBLR_CANONICAL_STATE_SPREADSHEET_ID`.

Solo eventos `ACCEPTED` entran en el contexto operativo. El cursor avanza por la realidad observada del bus; si un cursor previamente persistido no existe, la ejecución falla con `EVENT_CURSOR_NOT_FOUND` en lugar de inferir ausencia.

La rotación puede copiar sus tres artefactos de continuidad a Drive cuando `JBLR_CONTINUITY_FOLDER_MAP` contiene una carpeta padre para el actor. La operación crea carpeta/archivos nuevos: nunca mueve ni reemplaza continuidad previa.

Los eventos de runtime pueden anexarse al Event Bus. Actores sin autoridad canónica global publican por defecto como `PROPOSED`; el runtime no autopromociona evidencia a hecho canónico.

## Concurrencia y rotación

Las ejecuciones de un mismo actor están serializadas dentro del proceso para impedir carreras de creación/rotación de sesión. Actores distintos pueden continuar en paralelo.

Al rotar por `HIGH`, la nueva sesión conserva `NEXT_ACTION` y `lastEventCursor`, pero reinicia `lastUsage`. Esto evita que el uso de tokens de la sesión cerrada provoque una nueva rotación inmediata antes de ejecutar la sucesora.

## OpenAI

La ejecución real requiere `OPENAI_API_KEY` en el almacén de secretos del despliegue. La clave nunca debe escribirse en GitHub, logs, continuidad ni respuestas. Sin clave el servicio se declara `DEGRADED_NO_OPENAI_KEY` y no simula ejecución real.

El adaptador usa OpenAI Agents SDK, una Session persistente propia, `OpenAIResponsesCompactionSession` y el uso real reportado por `result.state.usage`. Los umbrales de riesgo son valores absolutos configurables; no representan porcentajes inventados del contexto máximo.

## GitHub

`GitHubRuntimeAdapter` es deliberadamente `READ_ONLY`: puede verificar una rama cuando se proporciona `JBLR_GITHUB_READ_TOKEN`, pero cualquier intento de escritura lanza `GITHUB_RUNTIME_WRITE_PROHIBITED`. La publicación de código sigue fuera de la autonomía del runtime.

## Riesgo de contexto

SAFE: continúa.
ELEVATED: persistir estado/minimizar crecimiento; la compacción puede reducir historial.
HIGH: no iniciar trabajo sustantivo nuevo; generar continuidad y rotar a una nueva runtime session del mismo actor.

## API mínima

GET /health
GET /runtime/status
POST /actors/:actorId/run
POST /actors/:actorId/continuity

## QA

`npm run test:agent-runtime` cubre núcleo + integración: identidad persistente, rotación, reset de `lastUsage`, restauración `NEXT_ACTION`/cursor, sincronización canónica previa, filtrado `ACCEPTED`, serialización por actor y guardia GitHub read-only.

## Estado de integración

Esta rama sigue aislada y no modifica `main` ni Neon. La integración real requiere todavía secretos autorizados, credenciales de Google compartidas con los recursos JBLR, despliegue y QA remoto reproducible. No declarar `INTEGRATION_READY` hasta verificar esos puntos.
