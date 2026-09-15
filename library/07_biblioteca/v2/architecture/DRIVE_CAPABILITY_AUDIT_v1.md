# DRIVE_CAPABILITY_AUDIT_v1

Version: 1.0.0
Audit scope: persistence of the accepted 07.0–07.4 conclusions; no claim of operational implementation.

## Drive Labels

- `PROVIDER_SUPPORTS = YES`
- `CURRENT_CONNECTOR_CAN_READ = PARTIAL`
- `CURRENT_CONNECTOR_CAN_WRITE = NO`
- `CURRENT_JBLR_IMPLEMENTATION_STATUS = DESIGNED_NOT_IMPLEMENTED`

Rationale: the current Drive connector metadata read exposes an `includeLabels` parameter when label IDs are known, but no label-schema discovery/modify-label write action is exposed in the current connector surface used by 07.V2.

## Custom properties / appProperties

- `PROVIDER_SUPPORTS = YES`
- `CURRENT_CONNECTOR_CAN_READ = PARTIAL`
- `CURRENT_CONNECTOR_CAN_WRITE = NO`
- `CURRENT_JBLR_IMPLEMENTATION_STATUS = DESIGNED_NOT_IMPLEMENTED`

Rationale: Drive metadata reads can request provider file fields and Drive searches support raw query filters, but the current connector's file-update action does not expose property/appProperty write parameters.

## Architectural decision

Neither Labels nor custom properties are canonical metadata storage. Both are optional adapters over the JBLR inventory.

## Revalidation gate

Before functional implementation, connector capability must be rechecked. Provider capability alone must never be reported as operational JBLR capability.
