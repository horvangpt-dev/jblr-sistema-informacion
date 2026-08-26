# L0_DRIVE_RUNTIME_VALIDATION_v1

Date: 2026-08-26
Status: PARTIAL

## Authorization classification

`AUTH_MODE = USER_OAUTH2_BEARER_TOKEN_RUNTIME_INJECTION_FOR_VALIDATION`

Packet 02 adds a minimal Drive v3 REST service compatible with the existing `GoogleDriveAssetAdapter`. The bearer token is accepted only from `JBLR_GOOGLE_DRIVE_ACCESS_TOKEN` at runtime; it is never returned, persisted, logged or included in provider error messages.

This is sufficient as an explicit live-validation mechanism. A durable refresh-token/service-account authorization strategy for institutional deployment remains a later configuration/security decision and is not silently inferred.

## Controlled asset

Controlled non-sensitive reference used for live provider-side verification:

- file_id: `1ueDylJoQK60icM7YTVHi_JhOYpAKR-58c8M3t21Cvso`
- title: `00000 · JBLR · NORTH STAR Y ARQUITECTURA MAESTRA`
- provider: Google Drive
- modified time observed: `2026-08-25T23:28:34.692Z`
- storage identity: `gdrive://1ueDylJoQK60icM7YTVHi_JhOYpAKR-58c8M3t21Cvso`

The connected Drive interface resolved this resource by stable ID and returned its content/metadata. As a native Google Doc, byte size and cryptographic file checksum were not supplied by the connector response.

`checksum = UNKNOWN_OR_UNAVAILABLE`

No zero value is substituted.

## Python adapter path

Existing adapter: `src/jblr/integrations/drive_assets.py`.

Packet 02 additions:

- `src/jblr/integrations/drive_runtime_auth.py` — runtime-only OAuth bearer REST service;
- `validate_drive_asset_runtime()` — stable `file_id → lookup → metadata → structured representation` probe;
- `tests/integration/test_drive_runtime.py` — live E2E gate that requires runtime token + controlled file ID.

The adapter has no binary download method. Its output contains structured metadata and `gdrive://<file_id>` identity only. It does not write binary content to PostgreSQL.

## Live E2E limitation

The OAuth token held by the connected ChatGPT Drive interface is not exposed to the Python execution runtime. It was not exported, copied or reconstructed. Consequently the provider-side live lookup is verified and the Python runtime path is implemented, but Python-to-Google-Drive E2E could not be executed in this session.

`DRIVE_RUNTIME_INTEGRATION = PARTIAL`

Open item: run `tests/integration/test_drive_runtime.py` in a networked runtime with ephemeral OAuth authorization and persist only sanitized metadata.
