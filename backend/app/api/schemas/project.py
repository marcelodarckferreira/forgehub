"""Pydantic Create/Update/Read schemas for the Project domain.

Covers: Project (primary entity, full CRUD), ProjectPlan (nested under
Project, full CRUD), PlanBaseline (create/list + read), ChangeRequest
(create/list + read + status update).
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    product_version_id: uuid.UUID
    owner: str | None = None
    status: str = "planned"
    start_date: date | None = None
    target_end_date: date | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    owner: str | None = None
    status: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# ProjectPlan
# ---------------------------------------------------------------------------
class ProjectPlanBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scope_summary: str | None = None
    estimated_start_date: date | None = None
    estimated_end_date: date | None = None
    estimated_cost: Decimal | None = None


class ProjectPlanCreate(ProjectPlanBase):
    pass


class ProjectPlanUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    scope_summary: str | None = None
    estimated_start_date: date | None = None
    estimated_end_date: date | None = None
    estimated_cost: Decimal | None = None
    status: str | None = None


class ProjectPlanOut(ProjectPlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProjectPlanApprove(BaseModel):
    """Body for POST /api/v1/projects/plans/{plan_id}/approve (no fields needed today,
    kept as an explicit model so the endpoint contract is stable if approval
    metadata — e.g. approver — is added later)."""

    pass


# ---------------------------------------------------------------------------
# PlanBaseline
# ---------------------------------------------------------------------------
class PlanBaselineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class PlanBaselineCreate(PlanBaselineBase):
    project_plan_id: uuid.UUID


class PlanBaselineOut(PlanBaselineBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_plan_id: uuid.UUID
    scope_snapshot: str | None = None
    cost_snapshot: Decimal | None = None
    end_date_snapshot: date | None = None
    frozen_at: datetime
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# ChangeRequest
# ---------------------------------------------------------------------------
class ChangeRequestBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    justification: str | None = None
    affects_scope: bool = False
    affects_schedule: bool = False
    affects_cost: bool = False
    adds_features: bool = False
    removes_features: bool = False
    introduces_critical_bug_fix: bool = False
    changes_agents: bool = False
    changes_skills: bool = False
    changes_architecture: bool = False
    changes_security: bool = False
    schedule_delta_days: int | None = None
    cost_delta: Decimal | None = None
    requested_by: str | None = None


class ChangeRequestCreate(ChangeRequestBase):
    plan_baseline_id: uuid.UUID | None = None


class ChangeRequestUpdate(BaseModel):
    status: str | None = None


class ChangeRequestOut(ChangeRequestBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    plan_baseline_id: uuid.UUID | None = None
    status: str
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
