"""Tests for the Task domain (project_tasks, task_dependencies,
task_required_skills, task_assignments, task_executions).

DB strategy: this suite runs against the real, shared `company_postgres`
database used by every domain agent's tests, so it must be careful never
to assume exclusive ownership of any table -- other domain agents may be
creating/using `company.agents`, `company.sub_agents`, `company.skills`,
and `company.planning_items` concurrently. Specifically:
- Table creation uses `checkfirst=True` (the default) and only ever
  *creates* tables, never drops them -- so this module is safe to import
  whether the real `agents`/`sub_agents`/`skills`/`planning_items` tables
  already exist (created by another domain agent) or not (in which case
  minimal stub tables with just an `id` column are created here,
  sufficient to satisfy this domain's string FKs; a later domain
  migration may legitimately add more columns to those same tables
  without conflict since we never redefine columns that already exist).
- Each test cleans up only the specific rows it created (by id), never a
  blanket `DELETE FROM <table>` / `DROP TABLE`, so concurrently-running
  tests from other domains are not affected.
"""
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.base import Base, engine
from app.db.models.task import (  # noqa: F401  (ensures tables register on Base.metadata)
    ProjectTask,
    TaskAssignment,
    TaskDependency,
    TaskExecution,
    TaskRequiredSkill,
)
from app.main import app
from app.api.routes import task as task_routes

# Make sure this domain's router is mounted even though the central wiring
# step (main.py) hasn't added it yet -- keeps this test self-contained.
app.include_router(task_routes.router)


# NOTE: this module previously declared local stub `Table()` objects for the
# other-domain FK targets (`planning_items`, `agents`, `sub_agents`,
# `skills`) to satisfy string-FK resolution before the unified Alembic
# migration existed. The real ORM models for those tables now exist (Backlog
# and Agent domains) and are migration-managed, so those stubs were removed
# -- a duplicate `Table(..., extend_existing=True)` registration for an
# already-mapped table corrupts SQLAlchemy's mapper configuration for any
# other test module that also touches that table in the same test session.
# This module's tests never persist a real agent_id/sub_agent_id (the one
# place they're used is a pre-DB Pydantic validation case), so no stub data
# is needed here at all.

_ALL_TEST_TABLES = [
    ProjectTask.__table__,
    TaskDependency.__table__,
    TaskRequiredSkill.__table__,
    TaskAssignment.__table__,
    TaskExecution.__table__,
]


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_schema():
    # checkfirst=True (default): only creates tables that don't exist yet.
    # Never drops anything -- this DB is shared with other domain agents'
    # concurrent test runs.
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn, tables=_ALL_TEST_TABLES, checkfirst=True
            )
        )
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def created_ids():
    """Tracks ids of rows created during a test, per table, so the test
    can delete exactly those rows on teardown instead of truncating
    shared tables."""
    ids: dict[str, list[uuid.UUID]] = {
        "task_executions": [],
        "task_assignments": [],
        "task_required_skills": [],
        "task_dependencies": [],
        "project_tasks": [],
    }
    yield ids
    async with engine.begin() as conn:
        for table in (
            "task_executions",
            "task_assignments",
            "task_required_skills",
            "task_dependencies",
            "project_tasks",
        ):
            row_ids = ids.get(table) or []
            if row_ids:
                await conn.execute(
                    text(f"DELETE FROM company.{table} WHERE id = ANY(:ids)"),
                    {"ids": row_ids},
                )


def _task_payload(**overrides):
    payload = {
        "title": "Implement task domain backend",
        "description": "Build CRUD + business rules",
        "task_type": "feature",
        "priority": "high",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_create_get_list_task(client: AsyncClient, created_ids):
    resp = await client.post("/api/v1/tasks", json=_task_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    created_ids["project_tasks"].append(body["id"])
    assert body["title"] == "Implement task domain backend"
    assert body["status"] == "planned"
    assert body["task_type"] == "feature"

    task_id = body["id"]

    get_resp = await client.get(f"/api/v1/tasks/{task_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == task_id

    list_resp = await client.get("/api/v1/tasks")
    assert list_resp.status_code == 200
    ids = [t["id"] for t in list_resp.json()]
    assert task_id in ids


@pytest.mark.asyncio
async def test_get_nonexistent_task_returns_404(client: AsyncClient):
    resp = await client.get(f"/api/v1/tasks/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_invalid_task_type_returns_422(client: AsyncClient):
    resp = await client.post("/api/v1/tasks", json=_task_payload(task_type="not_a_real_type"))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_execution_requires_evidence_when_completed(client: AsyncClient, created_ids):
    """Business rule 6.4.3: every execution must have evidence -- creating
    an execution with status=completed and no evidence_ref must be
    rejected (422), and the rule must also be re-checked on PATCH."""
    resp = await client.post("/api/v1/tasks", json=_task_payload())
    assert resp.status_code == 201
    task_id = resp.json()["id"]
    created_ids["project_tasks"].append(task_id)

    bad_exec = await client.post(
        f"/api/v1/tasks/{task_id}/executions",
        json={"executor_type": "agent", "status": "completed"},
    )
    assert bad_exec.status_code == 422

    ok_exec = await client.post(
        f"/api/v1/tasks/{task_id}/executions",
        json={"executor_type": "agent", "status": "running"},
    )
    assert ok_exec.status_code == 201, ok_exec.text
    execution_id = ok_exec.json()["id"]
    assert ok_exec.json()["attempt_number"] == 1
    created_ids["task_executions"].append(execution_id)

    # Task should have moved from planned -> in_progress as a side effect.
    task_after = await client.get(f"/api/v1/tasks/{task_id}")
    assert task_after.json()["status"] == "in_progress"

    bad_patch = await client.patch(
        f"/api/v1/tasks/{task_id}/executions/{execution_id}",
        json={"status": "completed"},
    )
    assert bad_patch.status_code == 400

    good_patch = await client.patch(
        f"/api/v1/tasks/{task_id}/executions/{execution_id}",
        json={"status": "completed", "evidence_ref": "https://example.com/pr/123"},
    )
    assert good_patch.status_code == 200
    assert good_patch.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_task_cannot_complete_with_unfinished_dependency(client: AsyncClient, created_ids):
    """Mirrors SPEC 6.2.9 (blocked stages prevent dependents from
    advancing), applied at task granularity: a task depending on a
    not-done task cannot be marked done."""
    dep_resp = await client.post("/api/v1/tasks", json=_task_payload(title="Dependency task"))
    assert dep_resp.status_code == 201
    dep_id = dep_resp.json()["id"]
    created_ids["project_tasks"].append(dep_id)

    main_resp = await client.post("/api/v1/tasks", json=_task_payload(title="Main task"))
    assert main_resp.status_code == 201
    main_id = main_resp.json()["id"]
    created_ids["project_tasks"].append(main_id)

    dependency = await client.post(
        f"/api/v1/tasks/{main_id}/dependencies",
        json={"task_id": main_id, "depends_on_task_id": dep_id},
    )
    assert dependency.status_code == 201, dependency.text
    created_ids["task_dependencies"].append(dependency.json()["id"])

    blocked = await client.patch(f"/api/v1/tasks/{main_id}", json={"status": "done"})
    assert blocked.status_code == 409

    finish_dep = await client.patch(f"/api/v1/tasks/{dep_id}", json={"status": "done"})
    assert finish_dep.status_code == 200

    unblocked = await client.patch(f"/api/v1/tasks/{main_id}", json={"status": "done"})
    assert unblocked.status_code == 200
    assert unblocked.json()["status"] == "done"


@pytest.mark.asyncio
async def test_self_dependency_rejected(client: AsyncClient, created_ids):
    resp = await client.post("/api/v1/tasks", json=_task_payload(title="Solo task"))
    assert resp.status_code == 201
    task_id = resp.json()["id"]
    created_ids["project_tasks"].append(task_id)

    self_dep = await client.post(
        f"/api/v1/tasks/{task_id}/dependencies",
        json={"task_id": task_id, "depends_on_task_id": task_id},
    )
    assert self_dep.status_code == 422


@pytest.mark.asyncio
async def test_assignment_requires_exactly_one_target(client: AsyncClient, created_ids):
    resp = await client.post("/api/v1/tasks", json=_task_payload(title="Assignable task"))
    assert resp.status_code == 201
    task_id = resp.json()["id"]
    created_ids["project_tasks"].append(task_id)

    neither = await client.post(
        f"/api/v1/tasks/{task_id}/assignments", json={"task_id": task_id}
    )
    assert neither.status_code == 422

    both = await client.post(
        f"/api/v1/tasks/{task_id}/assignments",
        json={
            "task_id": task_id,
            "agent_id": str(uuid.uuid4()),
            "sub_agent_id": str(uuid.uuid4()),
        },
    )
    assert both.status_code == 422
