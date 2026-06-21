"""Artifact domain routes (SPEC 4.7, 5.6, 6.2.6-6.2.8).

Business rules encoded here:
- An Artifact's versions are sequential per-artifact (version_number
  1, 2, 3, ...) and server-assigned -- clients never choose the number.
- An Artifact cannot be approved (SPEC 6.2.8: "mandatory artifacts
  require approval and approval is missing" blocks stage completion)
  unless it has at least one ArtifactVersion in FINAL status. This is
  the artifact-domain half of the stage-gate rule; the pipeline domain
  enforces the stage-level aggregate separately.
- Approving an Artifact marks its latest FINAL version's siblings as
  superseded is NOT done implicitly; instead approval simply flips
  Artifact.status. Rejecting an artifact that is already approved is
  not allowed (approval is a terminal-ish state; create a new version
  + re-submit instead of un-approving).
- Creating a new ArtifactVersion while the parent Artifact is APPROVED
  moves the Artifact back to SUBMITTED (a new revision implicitly
  reopens governance review) -- mirrors "approved versions must not
  change without a new version" spirit from the adjacent Skill rules
  (SPEC 6.5.8) applied here to artifacts.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas.artifact import (
    ArtifactApprovalDecision,
    ArtifactCreate,
    ArtifactOut,
    ArtifactUpdate,
    ArtifactVersionCreate,
    ArtifactVersionOut,
    ArtifactVersionUpdate,
    ArtifactWithVersionsOut,
)
from app.db.base import get_db
from app.db.models.artifact import (
    Artifact,
    ArtifactStatus,
    ArtifactVersion,
    ArtifactVersionStatus,
)

router = APIRouter(prefix="/api/v1/artifacts", tags=["artifacts"])


async def _get_artifact_or_404(db: AsyncSession, artifact_id: uuid.UUID) -> Artifact:
    result = await db.execute(
        select(Artifact)
        .where(Artifact.id == artifact_id)
        .options(selectinload(Artifact.versions))
    )
    artifact = result.scalar_one_or_none()
    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found"
        )
    return artifact


@router.post("", response_model=ArtifactWithVersionsOut, status_code=status.HTTP_201_CREATED)
async def create_artifact(
    payload: ArtifactCreate, db: AsyncSession = Depends(get_db)
) -> Artifact:
    artifact = Artifact(
        name=payload.name,
        artifact_type=payload.artifact_type,
        description=payload.description,
        pipeline_stage_id=payload.pipeline_stage_id,
        task_execution_id=payload.task_execution_id,
        requires_approval=payload.requires_approval,
    )

    if payload.initial_version is not None:
        artifact.versions.append(
            ArtifactVersion(
                version_number=1,
                location_uri=payload.initial_version.location_uri,
                checksum=payload.initial_version.checksum,
                notes=payload.initial_version.notes,
                status=payload.initial_version.status,
                produced_by_task_execution_id=payload.initial_version.produced_by_task_execution_id,
            )
        )

    db.add(artifact)
    await db.commit()
    await db.refresh(artifact, attribute_names=["versions"])
    return artifact


@router.get("", response_model=list[ArtifactOut])
async def list_artifacts(
    artifact_status: ArtifactStatus | None = None,
    pipeline_stage_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Artifact]:
    query = select(Artifact)
    if artifact_status is not None:
        query = query.where(Artifact.status == artifact_status)
    if pipeline_stage_id is not None:
        query = query.where(Artifact.pipeline_stage_id == pipeline_stage_id)
    query = query.order_by(Artifact.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{artifact_id}", response_model=ArtifactWithVersionsOut)
async def get_artifact(
    artifact_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Artifact:
    return await _get_artifact_or_404(db, artifact_id)


@router.patch("/{artifact_id}", response_model=ArtifactWithVersionsOut)
async def update_artifact(
    artifact_id: uuid.UUID,
    payload: ArtifactUpdate,
    db: AsyncSession = Depends(get_db),
) -> Artifact:
    artifact = await _get_artifact_or_404(db, artifact_id)

    if payload.status is not None and payload.status != artifact.status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Artifact status cannot be changed via PATCH; use the "
                "/approve or /reject actions."
            ),
        )

    update_data = payload.model_dump(exclude_unset=True, exclude={"status"})
    for field, value in update_data.items():
        setattr(artifact, field, value)

    await db.commit()
    # Re-fetch (rather than db.refresh with a restricted attribute_names)
    # so every column (e.g. updated_at) and the eagerly-loaded `versions`
    # relationship are consistently populated before response
    # serialization -- db.refresh(obj, attribute_names=[...]) expires the
    # whole instance first and only reloads the named attributes, leaving
    # everything else expired and triggering a lazy load (MissingGreenlet)
    # once the session/greenlet context has exited during serialization.
    return await _get_artifact_or_404(db, artifact_id)


@router.delete("/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artifact(
    artifact_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> None:
    artifact = await _get_artifact_or_404(db, artifact_id)
    await db.delete(artifact)
    await db.commit()


@router.post(
    "/{artifact_id}/approve",
    response_model=ArtifactWithVersionsOut,
)
async def decide_artifact_approval(
    artifact_id: uuid.UUID,
    decision: ArtifactApprovalDecision,
    db: AsyncSession = Depends(get_db),
) -> Artifact:
    """Approve or reject an artifact (SPEC 6.2.8 gate rule).

    Approval requires at least one ArtifactVersion in FINAL status --
    an artifact with no finalized content cannot be considered
    satisfied for a gate that requires approval.
    """
    artifact = await _get_artifact_or_404(db, artifact_id)

    if artifact.status == ArtifactStatus.APPROVED and decision.approve is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An already-approved artifact cannot be rejected; supersede it with a new version instead.",
        )

    if decision.approve:
        has_final_version = any(
            v.status == ArtifactVersionStatus.FINAL for v in artifact.versions
        )
        if not has_final_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot approve an artifact with no FINAL version. "
                    "Mark a version as FINAL before approving."
                ),
            )
        artifact.status = ArtifactStatus.APPROVED
    else:
        artifact.status = ArtifactStatus.REJECTED

    await db.commit()
    # See update_artifact for why this re-fetches instead of db.refresh
    # with a restricted attribute_names.
    return await _get_artifact_or_404(db, artifact_id)


# ---------------------------------------------------------------------------
# ArtifactVersion sub-resource
# ---------------------------------------------------------------------------
@router.post(
    "/{artifact_id}/versions",
    response_model=ArtifactVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_artifact_version(
    artifact_id: uuid.UUID,
    payload: ArtifactVersionCreate,
    db: AsyncSession = Depends(get_db),
) -> ArtifactVersion:
    artifact = await _get_artifact_or_404(db, artifact_id)

    next_version_number = (
        max((v.version_number for v in artifact.versions), default=0) + 1
    )
    version = ArtifactVersion(
        artifact_id=artifact.id,
        version_number=next_version_number,
        location_uri=payload.location_uri,
        checksum=payload.checksum,
        notes=payload.notes,
        status=payload.status,
        produced_by_task_execution_id=payload.produced_by_task_execution_id,
    )
    db.add(version)

    # A new revision on an already-approved artifact reopens governance
    # review -- it must be re-approved against the new content.
    if artifact.status == ArtifactStatus.APPROVED:
        artifact.status = ArtifactStatus.SUBMITTED

    await db.commit()
    await db.refresh(version)
    return version


@router.get("/{artifact_id}/versions", response_model=list[ArtifactVersionOut])
async def list_artifact_versions(
    artifact_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ArtifactVersion]:
    await _get_artifact_or_404(db, artifact_id)
    result = await db.execute(
        select(ArtifactVersion)
        .where(ArtifactVersion.artifact_id == artifact_id)
        .order_by(ArtifactVersion.version_number)
    )
    return list(result.scalars().all())


@router.get(
    "/{artifact_id}/versions/{version_id}", response_model=ArtifactVersionOut
)
async def get_artifact_version(
    artifact_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ArtifactVersion:
    result = await db.execute(
        select(ArtifactVersion).where(
            ArtifactVersion.id == version_id,
            ArtifactVersion.artifact_id == artifact_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artifact version not found"
        )
    return version


@router.patch(
    "/{artifact_id}/versions/{version_id}", response_model=ArtifactVersionOut
)
async def update_artifact_version(
    artifact_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: ArtifactVersionUpdate,
    db: AsyncSession = Depends(get_db),
) -> ArtifactVersion:
    version = await get_artifact_version(artifact_id, version_id, db)

    if version.status == ArtifactVersionStatus.SUPERSEDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A superseded artifact version cannot be modified.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(version, field, value)

    await db.commit()
    await db.refresh(version)
    return version


@router.delete(
    "/{artifact_id}/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_artifact_version(
    artifact_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    version = await get_artifact_version(artifact_id, version_id, db)
    await db.delete(version)
    await db.commit()
