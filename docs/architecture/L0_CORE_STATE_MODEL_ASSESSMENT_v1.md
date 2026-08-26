# L0_CORE_STATE_MODEL_ASSESSMENT_v1

Date: 2026-08-26
Canonical step: L0.08
Status: EXISTS_AND_EQUIVALENT_PENDING_FINAL_CI

## Prior reality

Before Packet 02, equivalent semantics existed in historical execution code, especially actor 08 guards for UNKNOWN, NOT_FOUND, source-unavailable states, false-zero prevention, conflict handling, retries and explicit contract projections. However no explicit reusable L0 foundation state model existed in the 39-commit L0 delta.

Classification before change: `PARTIAL`.

## Packet 02 implementation

Added `src/jblr/core/state.py` as a minimal shared foundation model. It does not replace historical actor-specific state machines.

### SemanticState

- present
- unknown
- not_found
- source_failure
- conflict
- blocked
- partial
- not_applicable
- invalid_input
- unavailable

### ExecutionState

- not_started
- running
- blocked
- partial
- complete
- failed

### ValidationState

- not_validated
- valid
- invalid
- conflict

### Supporting structures

- `ProvenanceMetadata`
- `StructuredError`
- `CoreStateEnvelope`

`CoreStateEnvelope` keeps semantic, execution and validation dimensions separate. It performs no silent conversion from state to zero, absence, success or completion.

Numeric projections are permitted only when an explicit `numeric_projection_rule` is supplied. This preserves compatibility with the historical actor-08 concept of an explicit contract placeholder while preventing false-zero inference.

## Locked invariants

Unit tests explicitly assert:

- unknown != zero/absence;
- not_found != source_failure;
- conflict != failure;
- partial != complete;
- numeric projection requires an explicit rule.

## Relationship to historical code

`execution/08` remains preserved. Its richer execution/cache/retry guards are not rewritten into the L0 module. L0.08 provides the common envelope needed by future L1+ software boundaries; actor-specific execution detail remains where it already works.

## Assessment

`L0_08_CORE_STATE_MODEL = EXISTS_AND_EQUIVALENT`

Final PASS is conditioned only on same-HEAD CI for Packet 02, not on additional semantic design.
