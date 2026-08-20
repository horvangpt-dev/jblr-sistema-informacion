# JBLR · Programa de continuidad de chats

## Objetivo

Crear paquetes de continuidad verificables para cualquier actor JBLR sin reconstruir el sistema, sin mover originales y sin inferir información ausente.

## Invariantes

- `TRASPASO = COPY · NEVER MOVE`
- `REALITY_FIRST = ACTIVE`
- `NO_SILENT_INFERENCE = ACTIVE`
- `NO_INFORMATION_LOSS = ACTIVE`
- `unknown != zero`
- `unknown != absence`
- `not_found != absence`
- el programa no obtiene por sí mismo el contenido de ChatGPT ni de Google Drive;
- el programa sólo empaqueta entradas explícitamente materializadas;
- si una entrada requerida falta, se detiene: no fabrica contenido;
- los originales deben seguir existiendo e idénticos después de crear el paquete.

## Orden canónico del paquete

Cada paquete se crea en:

`YYYY-MM-DD_<ACTOR>_continuidad_v<VERSION>/`

con el orden:

1. `01_COPIA_INTEGRAL_CONVERSACION_v<VERSION>.<ext>`
2. `02_ESTADO_COMPLETO_v<VERSION>.<ext>`
3. `03_PROMPT_REAPERTURA_v<VERSION>.<ext>`
4. `04_POINTERS_v<VERSION>.json`
5. `05_MANIFEST_v<VERSION>.json`
6. `06_MANIFEST_v<VERSION>.sha256`

Los tres primeros archivos son copias byte-a-byte de entradas explícitas. El programa no reescribe su contenido.

## Creación

```bash
python3 app/scripts/jblr-chat-continuity.py create \
  --actor 06 \
  --version 6 \
  --date 2026-08-20 \
  --conversation-copy /ruta/COPIA_INTEGRAL.md \
  --state /ruta/ESTADO_COMPLETO.md \
  --reopen-prompt /ruta/PROMPT_REAPERTURA.txt \
  --output-root /ruta/continuidad \
  --pointer CURRENT_CANONICAL_STATE_ID=<id> \
  --pointer SHARED_EVENT_BUS_ID=<id> \
  --pointer ACTOR_06_STATE_ID=<id> \
  --pointer LAST_SYNC_EVENT_ID=<event_id> \
  --pointer REPO=horvangpt-dev/jblr-sistema-informacion \
  --pointer BRANCH=<rama>
```

También se puede pasar un objeto JSON con `--pointers-json`.

## Verificación

```bash
python3 app/scripts/jblr-chat-continuity.py verify \
  /ruta/continuidad/2026-08-20_06_continuidad_v6
```

Un paquete válido devuelve `CONTINUITY_VERIFIED`.

La verificación comprueba:

- manifest único y versión de esquema conocida;
- política `COPY · NEVER MOVE`;
- `source_mutation_allowed = false`;
- `missing_information_policy = DO_NOT_INFER`;
- presencia de copia integral, estado, prompt y punteros;
- tamaño y SHA-256 de cada artefacto;
- SHA-256 del manifest mediante sidecar independiente.

## Regla de cierre de chat JBLR

Para cerrar un chat saturado o transferir su continuidad:

1. materializar la copia integral del chat;
2. materializar el estado completo, incluyendo hechos, decisiones, pendientes, bloqueos, hashes, ramas, eventos y punteros necesarios;
3. materializar el prompt de reapertura con orden explícito de restauración;
4. ejecutar `create`;
5. ejecutar `verify`;
6. copiar el paquete resultante al repositorio/carpeta de continuidad correspondiente;
7. conservar el chat y artefactos anteriores como evidencia histórica; nunca moverlos ni sobrescribirlos.

## Regla de reapertura

El prompt generado fuera del programa debe ordenar al nuevo chat, como mínimo:

1. leer el estado canónico vigente;
2. leer EVENT_BUS desde el último evento conocido;
3. restaurar el estado del actor;
4. restaurar el último paquete de continuidad;
5. verificar fuentes operativas actuales (GitHub/Drive/Neon u otras que correspondan al actor);
6. aplicar sólo decisiones con autoridad vigente;
7. continuar desde el último punto real, sin repetir trabajo cerrado.

El programa preserva ese prompt literalmente; no añade semántica por su cuenta.

## Alcance

Esta herramienta resuelve el empaquetado, integridad y verificación. La extracción/materialización del contenido de una conversación y la escritura posterior a Google Drive siguen siendo responsabilidades del ejecutor que tenga acceso a esas superficies.
