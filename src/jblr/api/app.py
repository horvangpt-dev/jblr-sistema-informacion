from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from jblr import __version__


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["jblr"] = "jblr"


class VersionResponse(BaseModel):
    service: Literal["jblr"] = "jblr"
    version: str
    git_sha: str


app = FastAPI(
    title="JBLR API",
    version=__version__,
    description="Minimal API contract for the JBLR software foundation layer.",
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/version", response_model=VersionResponse, tags=["system"])
def version() -> VersionResponse:
    return VersionResponse(
        version=__version__,
        git_sha=os.getenv("JBLR_GIT_SHA", "unknown"),
    )
