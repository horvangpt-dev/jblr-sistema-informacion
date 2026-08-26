# ADR-0001 · L0 Foundation Technology

Date: 2026-08-26
Status: ACCEPTED_FOR_L0
Authority: 00000 · DIRECCIÓN GENERAL JBLR

## Context

The preflight verified substantial existing Python, JavaScript/Node.js, R and SQL reality. Neon is currently PostgreSQL 18.6 with PostGIS. Sqitch deployment metadata already exists in the database.

## Decision

1. New JBLR backend/scientific foundation code will use Python.
2. Minimal HTTP API will use FastAPI and Pydantic.
3. Existing valid JavaScript/Node.js remains in place and may be wrapped behind stable contracts.
4. R remains available for specialized scientific/diagnostic workflows.
5. PostgreSQL on Neon remains the structured operational store; PostGIS remains the spatial layer.
6. Sqitch/versioned SQL is the migration authority to preserve and reconcile. Alembic will not be introduced as a parallel migration authority without new concrete evidence.
7. GitHub Actions remains CI automation.
8. Heavy/human assets remain in Google Drive and are addressed by stable file identity, not by fragile human paths.
9. L0 changes are additive and isolated until tested and accepted.

## Dependency policy for first API packet

The first Python foundation uses a known-working pinned stack verified locally on Python 3.13.5. L0 does not automatically select the newest release merely because it is newer. Dependency upgrades require tests and an explicit update commit.

## Consequences

- No mass rewrite of existing actors.
- No second database.
- No second migration authority.
- Python becomes the default language for newly consolidated backend/scientific interfaces, not an exclusive language mandate.
- Stable contracts become the migration seam between historical execution code and future product code.

## Rollback

The L0 branch can be discarded without changing the accepted cumulative successor branch. The Neon L0 DEV branch can be discarded independently. No production database mutation is required by this decision.
