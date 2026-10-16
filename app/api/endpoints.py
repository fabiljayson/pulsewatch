"""HTTP routes: endpoint CRUD, on-demand checks, history, and reports."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app import repository
from app.api.deps import get_checker, get_database, get_settings
from app.config import Settings
from app.database import Database
from app.schemas import (
    CheckResultRead,
    EndpointCreate,
    EndpointList,
    EndpointRead,
    EndpointUpdate,
    HistoryPage,
    ReportRead,
)
from app.services.checker import CheckService
from app.services.reports import build_report
from app.services.url_validation import BlockedDestinationError, UrlValidationError

router = APIRouter()

SettingsDep = Annotated[Settings, Depends(get_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]
CheckerDep = Annotated[CheckService, Depends(get_checker)]
HTTP_422 = status.HTTP_422_UNPROCESSABLE_CONTENT
EndpointId = Annotated[int, Path(ge=1, description="Endpoint identifier.")]


def _get_endpoint_or_404(db: Database, endpoint_id: int):
    endpoint = repository.get_endpoint(db, endpoint_id)
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )
    return endpoint


@router.post(
    "/api/v1/endpoints",
    response_model=EndpointRead,
    status_code=status.HTTP_201_CREATED,
    tags=["endpoints"],
    summary="Register a monitored endpoint",
    responses={
        422: {
            "description": "Validation failed (name, URL syntax, or blocked destination)."
        }
    },
)
def create_endpoint(payload: EndpointCreate, db: DatabaseDep) -> EndpointRead:
    """Register a new endpoint after static SSRF validation of its URL."""
    endpoint = repository.create_endpoint(
        db, name=payload.name, url=payload.url, is_active=payload.is_active
    )
    return EndpointRead.model_validate(endpoint)


@router.get(
    "/api/v1/endpoints",
    response_model=EndpointList,
    tags=["endpoints"],
    summary="List monitored endpoints",
)
def list_endpoints(
    db: DatabaseDep,
    settings: SettingsDep,
    limit: Annotated[
        int | None,
        Query(ge=1, description="Page size; defaults to 100, capped by configuration."),
    ] = None,
    offset: Annotated[int, Query(ge=0, description="Rows to skip.")] = 0,
) -> EndpointList:
    """Return a bounded, paginated list of registered endpoints."""
    effective_limit = limit if limit is not None else settings.endpoints_list_default_limit
    if effective_limit > settings.endpoints_list_max_limit:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"limit must be at most {settings.endpoints_list_max_limit}",
        )
    items, total = repository.list_endpoints(db, limit=effective_limit, offset=offset)
    return EndpointList(
        total=total,
        limit=effective_limit,
        offset=offset,
        items=[EndpointRead.model_validate(item) for item in items],
    )


@router.get(
    "/api/v1/endpoints/{endpoint_id}",
    response_model=EndpointRead,
    tags=["endpoints"],
    summary="Retrieve one endpoint",
    responses={404: {"description": "Unknown endpoint id."}},
)
def get_endpoint(endpoint_id: EndpointId, db: DatabaseDep) -> EndpointRead:
    """Fetch a single registered endpoint by id."""
    return EndpointRead.model_validate(_get_endpoint_or_404(db, endpoint_id))


@router.patch(
    "/api/v1/endpoints/{endpoint_id}",
    response_model=EndpointRead,
    tags=["endpoints"],
    summary="Update an endpoint's name or active flag",
    responses={404: {"description": "Unknown endpoint id."}},
)
def update_endpoint(
    endpoint_id: EndpointId, payload: EndpointUpdate, db: DatabaseDep
) -> EndpointRead:
    """Apply a partial update; at least one field must be provided."""
    if payload.name is None and payload.is_active is None:
        raise HTTPException(
            status_code=HTTP_422,
            detail="At least one of 'name' or 'is_active' must be provided",
        )
    updated = repository.update_endpoint(
        db, endpoint_id, name=payload.name, is_active=payload.is_active
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found"
        )
    return EndpointRead.model_validate(updated)


@router.delete(
    "/api/v1/endpoints/{endpoint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["endpoints"],
    summary="Delete an endpoint and its history",
    responses={404: {"description": "Unknown endpoint id."}},
)
def delete_endpoint(endpoint_id: EndpointId, db: DatabaseDep) -> None:
    """Delete an endpoint; its check history is cascade-deleted."""
    if not repository.delete_endpoint(db, endpoint_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found"
        )


@router.post(
    "/api/v1/endpoints/{endpoint_id}/check",
    response_model=CheckResultRead,
    tags=["checks"],
    summary="Execute a health check now",
    responses={
        404: {"description": "Unknown endpoint id."},
        409: {"description": "Endpoint is inactive."},
    },
)
async def run_check(
    endpoint_id: EndpointId, db: DatabaseDep, checker: CheckerDep
) -> CheckResultRead:
    """Run one outbound check immediately and persist the result."""
    endpoint = _get_endpoint_or_404(db, endpoint_id)
    if not endpoint.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Endpoint is inactive; activate it before running checks",
        )
    try:
        result = await checker.run_check(endpoint)
    except BlockedDestinationError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except UrlValidationError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CheckResultRead.model_validate(result)


@router.get(
    "/api/v1/endpoints/{endpoint_id}/history",
    response_model=HistoryPage,
    tags=["history"],
    summary="Recent checks, newest first",
    responses={404: {"description": "Unknown endpoint id."}},
)
def endpoint_history(
    endpoint_id: EndpointId,
    db: DatabaseDep,
    settings: SettingsDep,
    limit: Annotated[
        int | None,
        Query(ge=1, description="Page size; defaults to 20, capped by configuration."),
    ] = None,
    offset: Annotated[int, Query(ge=0, description="Rows to skip.")] = 0,
) -> HistoryPage:
    """Return stored checks for an endpoint in descending timestamp order."""
    _get_endpoint_or_404(db, endpoint_id)
    effective_limit = limit if limit is not None else settings.history_default_limit
    if effective_limit > settings.history_max_limit:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"limit must be at most {settings.history_max_limit}",
        )
    items = repository.list_checks(db, endpoint_id, limit=effective_limit, offset=offset)
    total = repository.count_checks(db, endpoint_id)
    return HistoryPage(
        endpoint_id=endpoint_id,
        total=total,
        limit=effective_limit,
        offset=offset,
        items=[CheckResultRead.model_validate(item) for item in items],
    )


@router.get(
    "/api/v1/endpoints/{endpoint_id}/report",
    response_model=ReportRead,
    tags=["reports"],
    summary="Reliability report over a time window",
    responses={404: {"description": "Unknown endpoint id."}},
)
def endpoint_report(
    endpoint_id: EndpointId,
    db: DatabaseDep,
    settings: SettingsDep,
    hours: Annotated[
        int | None,
        Query(
            ge=1,
            le=8760,
            description="Window size in hours (1-8760); defaults to 24.",
        ),
    ] = None,
) -> ReportRead:
    """Compute availability, latency, and counts over an explicit window."""
    _get_endpoint_or_404(db, endpoint_id)
    effective_hours = hours if hours is not None else settings.report_default_hours
    return build_report(db, endpoint_id, hours=effective_hours)
