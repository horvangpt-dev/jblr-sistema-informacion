from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class SemanticState(StrEnum):
    PRESENT = "present"
    UNKNOWN = "unknown"
    NOT_FOUND = "not_found"
    SOURCE_FAILURE = "source_failure"
    CONFLICT = "conflict"
    BLOCKED = "blocked"
    PARTIAL = "partial"
    NOT_APPLICABLE = "not_applicable"
    INVALID_INPUT = "invalid_input"
    UNAVAILABLE = "unavailable"


class ExecutionState(StrEnum):
    NOT_STARTED = "not_started"
    RUNNING = "running"
    BLOCKED = "blocked"
    PARTIAL = "partial"
    COMPLETE = "complete"
    FAILED = "failed"


class ValidationState(StrEnum):
    NOT_VALIDATED = "not_validated"
    VALID = "valid"
    INVALID = "invalid"
    CONFLICT = "conflict"


class ProvenanceMetadata(BaseModel):
    source_system: str
    source_record_id: str | None = None
    source_version: str | None = None
    evidence_pointer: str | None = None


class StructuredError(BaseModel):
    code: str
    message: str
    retryable: bool = False
    provider: str | None = None


class CoreStateEnvelope(BaseModel):
    """Minimal shared state envelope for JBLR software boundaries.

    Semantic, execution and validation state are independent dimensions. The
    model deliberately performs no coercion from UNKNOWN/NOT_FOUND/etc. to zero,
    absence, success or completion.
    """

    semantic_state: SemanticState
    execution_state: ExecutionState = ExecutionState.NOT_STARTED
    validation_state: ValidationState = ValidationState.NOT_VALIDATED
    payload: Any | None = None
    provenance: list[ProvenanceMetadata] = Field(default_factory=list)
    error: StructuredError | None = None
    numeric_projection: float | None = None
    numeric_projection_rule: str | None = None

    @model_validator(mode="after")
    def require_explicit_projection_rule(self) -> "CoreStateEnvelope":
        if self.numeric_projection is not None and not self.numeric_projection_rule:
            raise ValueError(
                "numeric_projection requires numeric_projection_rule; semantic state is never silently projected to a number"
            )
        return self
