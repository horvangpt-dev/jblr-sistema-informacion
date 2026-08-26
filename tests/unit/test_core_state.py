from __future__ import annotations

import pytest
from pydantic import ValidationError

from jblr.core.state import (
    CoreStateEnvelope,
    ExecutionState,
    SemanticState,
    StructuredError,
    ValidationState,
)


def test_required_semantic_states_are_distinct() -> None:
    values = {
        SemanticState.UNKNOWN,
        SemanticState.NOT_FOUND,
        SemanticState.SOURCE_FAILURE,
        SemanticState.CONFLICT,
        SemanticState.BLOCKED,
        SemanticState.PARTIAL,
        SemanticState.NOT_APPLICABLE,
        SemanticState.INVALID_INPUT,
        SemanticState.UNAVAILABLE,
    }
    assert len(values) == 9


def test_unknown_is_not_zero_or_absence() -> None:
    state = CoreStateEnvelope(semantic_state=SemanticState.UNKNOWN)
    assert state.semantic_state == SemanticState.UNKNOWN
    assert state.payload is None
    assert state.numeric_projection is None


def test_not_found_is_not_source_failure() -> None:
    not_found = CoreStateEnvelope(semantic_state=SemanticState.NOT_FOUND)
    source_failure = CoreStateEnvelope(
        semantic_state=SemanticState.SOURCE_FAILURE,
        error=StructuredError(code="SOURCE_UNAVAILABLE", message="provider unavailable", retryable=True),
    )
    assert not_found.semantic_state != source_failure.semantic_state
    assert source_failure.error is not None
    assert source_failure.error.retryable is True


def test_partial_is_not_complete() -> None:
    state = CoreStateEnvelope(
        semantic_state=SemanticState.PARTIAL,
        execution_state=ExecutionState.PARTIAL,
    )
    assert state.execution_state != ExecutionState.COMPLETE


def test_conflict_is_not_failure() -> None:
    state = CoreStateEnvelope(
        semantic_state=SemanticState.CONFLICT,
        validation_state=ValidationState.CONFLICT,
    )
    assert state.execution_state != ExecutionState.FAILED


def test_numeric_projection_requires_explicit_rule() -> None:
    with pytest.raises(ValidationError):
        CoreStateEnvelope(
            semantic_state=SemanticState.UNKNOWN,
            numeric_projection=0,
        )

    explicit = CoreStateEnvelope(
        semantic_state=SemanticState.UNKNOWN,
        numeric_projection=0,
        numeric_projection_rule="EXPLICIT_CONTRACT_PLACEHOLDER",
    )
    assert explicit.semantic_state == SemanticState.UNKNOWN
    assert explicit.numeric_projection == 0
