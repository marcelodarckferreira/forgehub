"""Project domain routes.

Mounted at /api/v1/projects (this router owns its full prefix per the
foundation convention — main.py does not add any prefix).

Endpoints:
- Project:        full CRUD at /api/v1/projects[/{project_id}]
- ProjectPlan:    nested full CRUD at /api/v1/projects/{project_id}/plans[...]
                  plus POST .../plans/{plan_id}/approve
- PlanBaseline:   create+list at /api/v1/projects/{project_id}/baselines,
                  get at /api/v1/projects/baselines/{baseline_id}
- ChangeRequest:  create+list at /api/v1/projects/{project_id}/change-requests,
                  get+update at /api/v1/projects/change-requests/{cr_id}

Business rules encoded here (SPEC.md section 6.3 Planning Rules):
1. "Approved planning becomes baseline" -> a ProjectPlan must be in status
   "approved" before a PlanBaseline can be created from it; baselining
   flips the plan's status to "baselined".
2. "Post-baseline changes require a Change Request" -> once a ProjectPlan
   has at least one PlanBaseline, further direct edits to that plan's
   scope/cost/schedule fields are rejected (422) — the caller must instead
   register a ChangeRequest against the project.
3. ChangeRequest tracks scope/time/cost/feature/bug/agent/skill/
   architecture/security impact flags (modeled in the schema/model layer;
   enforced here only by requiring at least one impact flag to be set,
   otherwise the CR is meaningless noise).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.project import (
    ChangeRequestCreate,
    ChangeRequestOut,
    ChangeRequestUpdate,
    PlanBaselineCreate,
    PlanBaselineOut,
    ProjectCreate,
    ProjectOut,
    ProjectPlanCreate,
    ProjectPlanOut,
    ProjectPlanUpdate,
    ProjectUpdate,
)
from app.db.base import get_db
from app.db.models.project import ChangeRequest, PlanBaseline, Project, ProjectPlan

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


async def _get_project_or_404(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def _get_plan_or_404(db: AsyncSession, plan_id: uuid.UUID) -> ProjectPlan:
    plan = await db.get(ProjectPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project plan not found")
    return plan


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------
@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)) -> Project:
    project = Project(**payload.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)) -> list[Project]:
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Project:
    return await _get_project_or_404(db, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)
) -> Project:
    project = await _get_project_or_404(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    project = await _get_project_or_404(db, project_id)
    await db.delete(project)
    await db.commit()


# ---------------------------------------------------------------------------
# ProjectPlan CRUD (nested under a project)
# ---------------------------------------------------------------------------
@router.post(
    "/{project_id}/plans", response_model=ProjectPlanOut, status_code=status.HTTP_201_CREATED
)
async def create_project_plan(
    project_id: uuid.UUID, payload: ProjectPlanCreate, db: AsyncSession = Depends(get_db)
) -> ProjectPlan:
    await _get_project_or_404(db, project_id)
    plan = ProjectPlan(project_id=project_id, **payload.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/{project_id}/plans", response_model=list[ProjectPlanOut])
async def list_project_plans(
    project_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ProjectPlan]:
    await _get_project_or_404(db, project_id)
    result = await db.execute(
        select(ProjectPlan)
        .where(ProjectPlan.project_id == project_id)
        .order_by(ProjectPlan.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/plans/{plan_id}", response_model=ProjectPlanOut)
async def get_project_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> ProjectPlan:
    return await _get_plan_or_404(db, plan_id)


@router.patch("/plans/{plan_id}", response_model=ProjectPlanOut)
async def update_project_plan(
    plan_id: uuid.UUID, payload: ProjectPlanUpdate, db: AsyncSession = Depends(get_db)
) -> ProjectPlan:
    plan = await _get_plan_or_404(db, plan_id)

    # Business rule 6.3.2: post-baseline changes require a Change Request.
    # Reject direct mutation of scope/schedule/cost fields once a baseline
    # exists for this plan. Status-only transitions (e.g. draft -> approved)
    # are still allowed since they don't rewrite frozen scope.
    mutating_fields = payload.model_dump(exclude_unset=True, exclude={"status"})
    if mutating_fields:
        existing_baseline = await db.execute(
            select(PlanBaseline).where(PlanBaseline.project_plan_id == plan_id).limit(1)
        )
        if existing_baseline.scalars().first() is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "This plan has already been baselined; register a "
                    "ChangeRequest instead of editing it directly."
                ),
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/plans/{plan_id}/approve", response_model=ProjectPlanOut)
async def approve_project_plan(
    plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ProjectPlan:
    """Mark a plan as approved -- the precondition for baselining it
    (SPEC.md 6.3.1: "Approved planning becomes baseline")."""
    plan = await _get_plan_or_404(db, plan_id)
    plan.status = "approved"
    plan.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    plan = await _get_plan_or_404(db, plan_id)
    await db.delete(plan)
    await db.commit()


# ---------------------------------------------------------------------------
# PlanBaseline (create + list; baselines are immutable once created)
# ---------------------------------------------------------------------------
@router.post(
    "/{project_id}/baselines",
    response_model=PlanBaselineOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_plan_baseline(
    project_id: uuid.UUID, payload: PlanBaselineCreate, db: AsyncSession = Depends(get_db)
) -> PlanBaseline:
    await _get_project_or_404(db, project_id)
    plan = await _get_plan_or_404(db, payload.project_plan_id)

    if plan.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_plan_id does not belong to this project",
        )

    # Business rule 6.3.1: "Approved planning becomes baseline" -- a plan
    # must be approved before it can be frozen into a baseline.
    if plan.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only an approved plan can be baselined (current status: "
            f"'{plan.status}')",
        )

    baseline = PlanBaseline(
        project_plan_id=plan.id,
        name=payload.name,
        scope_snapshot=plan.scope_summary,
        cost_snapshot=plan.estimated_cost,
        end_date_snapshot=plan.estimated_end_date,
        frozen_at=datetime.now(timezone.utc),
    )
    plan.status = "baselined"
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)
    return baseline


@router.get("/{project_id}/baselines", response_model=list[PlanBaselineOut])
async def list_plan_baselines(
    project_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[PlanBaseline]:
    await _get_project_or_404(db, project_id)
    result = await db.execute(
        select(PlanBaseline)
        .join(ProjectPlan, PlanBaseline.project_plan_id == ProjectPlan.id)
        .where(ProjectPlan.project_id == project_id)
        .order_by(PlanBaseline.frozen_at.desc())
    )
    return list(result.scalars().all())


@router.get("/baselines/{baseline_id}", response_model=PlanBaselineOut)
async def get_plan_baseline(
    baseline_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> PlanBaseline:
    baseline = await db.get(PlanBaseline, baseline_id)
    if baseline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan baseline not found")
    return baseline


# ---------------------------------------------------------------------------
# ChangeRequest CRUD
# ---------------------------------------------------------------------------
@router.post(
    "/{project_id}/change-requests",
    response_model=ChangeRequestOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_change_request(
    project_id: uuid.UUID, payload: ChangeRequestCreate, db: AsyncSession = Depends(get_db)
) -> ChangeRequest:
    await _get_project_or_404(db, project_id)

    if payload.plan_baseline_id is not None:
        baseline = await db.get(PlanBaseline, payload.plan_baseline_id)
        if baseline is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="plan_baseline_id does not reference an existing baseline",
            )

    # Business rule 6.3.3: a Change Request must actually track some kind of
    # impact (scope/time/cost/feature/bug/agent/skill/architecture/security).
    # A CR with every flag false carries no governance signal.
    impact_flags = (
        payload.affects_scope,
        payload.affects_schedule,
        payload.affects_cost,
        payload.adds_features,
        payload.removes_features,
        payload.introduces_critical_bug_fix,
        payload.changes_agents,
        payload.changes_skills,
        payload.changes_architecture,
        payload.changes_security,
    )
    if not any(impact_flags):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "A ChangeRequest must declare at least one impact flag "
                "(scope, schedule, cost, features, bug fix, agents, "
                "skills, architecture, or security)."
            ),
        )

    change_request = ChangeRequest(project_id=project_id, **payload.model_dump())
    db.add(change_request)
    await db.commit()
    await db.refresh(change_request)
    return change_request


@router.get("/{project_id}/change-requests", response_model=list[ChangeRequestOut])
async def list_change_requests(
    project_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ChangeRequest]:
    await _get_project_or_404(db, project_id)
    result = await db.execute(
        select(ChangeRequest)
        .where(ChangeRequest.project_id == project_id)
        .order_by(ChangeRequest.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/change-requests/{cr_id}", response_model=ChangeRequestOut)
async def get_change_request(
    cr_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ChangeRequest:
    cr = await db.get(ChangeRequest, cr_id)
    if cr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    return cr


@router.patch("/change-requests/{cr_id}", response_model=ChangeRequestOut)
async def update_change_request(
    cr_id: uuid.UUID, payload: ChangeRequestUpdate, db: AsyncSession = Depends(get_db)
) -> ChangeRequest:
    cr = await db.get(ChangeRequest, cr_id)
    if cr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data:
        valid_statuses = {"pending", "approved", "rejected", "applied"}
        if update_data["status"] not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of {sorted(valid_statuses)}",
            )
        cr.status = update_data["status"]
        if update_data["status"] in {"approved", "rejected"}:
            cr.decided_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(cr)
    return cr
