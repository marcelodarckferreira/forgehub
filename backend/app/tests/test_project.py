"""Tests for the Project domain (projects, project_plans, plan_baselines,
change_requests).

DB strategy: this backend foundation is built incrementally by several
domain agents against the same shared `company_postgres` database, and no
unified Alembic migration has landed yet at the time this module runs. To
exercise real async-session CRUD against the live database without
depending on migration ordering between domains, this module:

1. Ensures this domain's own four tables exist via
   `Base.metadata.create_all(checkfirst=True)` (the default), which is a
   no-op if a migration already created them.
2. Ensures a minimal `company.product_versions` stub table exists (the
   real FK target, owned by the Product domain) -- also checkfirst, so it
   never clobbers a real product_versions table created by that domain's
   own migration. Other domains (e.g. Backlog: planning_items,
   bug_reports, version_scope_items) may already have live FK constraints
   pointing at this table, so it is intentionally never dropped.
3. Inserts one stub product_version row tests can point projects at.
4. Runs all tests against the real AsyncSessionLocal / engine from
   app.db.base (per the foundation's `get_db` dependency).
5. Teardown only DELETEs the rows this module created (by id) -- it never
   DROPs any table, since other concurrently-developed domains may already
   have foreign keys referencing these tables.
"""
import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.api.routes import project as project_routes
from app.db.base import AsyncSessionLocal, Base, engine
from app.db.models.product import Product, ProductVersion
from app.db.models.project import ChangeRequest, PlanBaseline, Project, ProjectPlan
from app.main import app

# The wiring step (not yet run) is responsible for adding
# `app.include_router(project.router)` to app/main.py. Until then, include
# it here directly so these tests can exercise the real app + real router
# together without editing main.py ourselves. Guard against double
# registration in case a future wiring step runs before this test module
# is removed/updated.
_ALREADY_WIRED = any(
    getattr(route, "path", "").startswith("/api/v1/projects") for route in app.router.routes
)
if not _ALREADY_WIRED:
    app.include_router(project_routes.router)

# NOTE: this module previously declared a local stub `Table()` object for
# the `product_versions` FK target to satisfy string-FK resolution before
# the unified Alembic migration existed. The real ORM model for that table
# now exists (Product domain) and is migration-managed, so the stub was
# removed -- a duplicate `Table(..., extend_existing=True)` registration for
# an already-mapped table corrupts SQLAlchemy's mapper configuration for any
# other test module that also touches that table in the same test session.
# A real Product + ProductVersion row is created in `db_schema` below
# instead.

_OWN_TABLES = [
    Project.__table__,
    ProjectPlan.__table__,
    PlanBaseline.__table__,
    ChangeRequest.__table__,
]

_STUB_PRODUCT_VERSION_ID: uuid.UUID | None = None
_STUB_PRODUCT_ID: uuid.UUID | None = None

# Track every row this module inserts (table, id) so teardown can delete
# exactly those rows without ever issuing a DROP TABLE against tables that
# other concurrently-developed domains may already depend on.
_created_rows: list[tuple[str, uuid.UUID]] = []


@pytest_asyncio.fixture(scope="module")
async def db_schema():
    global _STUB_PRODUCT_VERSION_ID, _STUB_PRODUCT_ID

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=_OWN_TABLES)

    async with AsyncSessionLocal() as session:
        product = Product(name=f"Project Domain Test Product {uuid.uuid4()}")
        session.add(product)
        await session.flush()
        version = ProductVersion(product_id=product.id, version="0.1.0")
        session.add(version)
        await session.commit()
        _STUB_PRODUCT_ID = product.id
        _STUB_PRODUCT_VERSION_ID = version.id

    yield

    async with engine.begin() as conn:
        # Delete child rows before parents (FK-safe order), and the stub
        # product_version/product rows only after every project referencing
        # them is gone.
        for table_name in ("change_requests", "plan_baselines", "project_plans", "projects"):
            ids = [row_id for tbl, row_id in _created_rows if tbl == table_name]
            if ids:
                await conn.execute(
                    text(f"DELETE FROM company.{table_name} WHERE id = ANY(:ids)"),
                    {"ids": ids},
                )
        await conn.execute(
            text("DELETE FROM company.product_versions WHERE id = :id"),
            {"id": _STUB_PRODUCT_VERSION_ID},
        )
        await conn.execute(
            text("DELETE FROM company.products WHERE id = :id"),
            {"id": _STUB_PRODUCT_ID},
        )


@pytest_asyncio.fixture
async def client(db_schema):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def test_create_get_list_project(client: AsyncClient):
    payload = {
        "name": "ForgeHub — Foundation MVP",
        "description": "Initial bootstrap project",
        "product_version_id": str(_STUB_PRODUCT_VERSION_ID),
        "owner": "marcelo",
        "status": "planned",
        "start_date": str(date.today()),
    }
    create_resp = await client.post("/api/v1/projects", json=payload)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["name"] == payload["name"]
    assert created["status"] == "planned"
    project_id = created["id"]
    _created_rows.append(("projects", uuid.UUID(project_id)))

    get_resp = await client.get(f"/api/v1/projects/{project_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == project_id

    list_resp = await client.get("/api/v1/projects")
    assert list_resp.status_code == 200
    assert any(p["id"] == project_id for p in list_resp.json())


async def test_get_project_not_found(client: AsyncClient):
    resp = await client.get(f"/api/v1/projects/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_baseline_requires_approved_plan(client: AsyncClient):
    """Business rule (SPEC 6.3.1): only an approved plan can be baselined.

    Creating a baseline from a freshly-created (draft) plan must be
    rejected with a 4xx, not silently succeed.
    """
    project_resp = await client.post(
        "/api/v1/projects",
        json={
            "name": "Rule Test Project",
            "product_version_id": str(_STUB_PRODUCT_VERSION_ID),
        },
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]
    _created_rows.append(("projects", uuid.UUID(project_id)))

    plan_resp = await client.post(
        f"/api/v1/projects/{project_id}/plans",
        json={"name": "Initial Plan", "scope_summary": "MVP scope"},
    )
    assert plan_resp.status_code == 201
    plan = plan_resp.json()
    assert plan["status"] == "draft"
    _created_rows.append(("project_plans", uuid.UUID(plan["id"])))

    baseline_resp = await client.post(
        f"/api/v1/projects/{project_id}/baselines",
        json={"name": "Baseline 1", "project_plan_id": plan["id"]},
    )
    assert baseline_resp.status_code == 422
    assert "approved" in baseline_resp.json()["detail"].lower()


async def test_baseline_flow_and_post_baseline_edit_blocked(client: AsyncClient):
    """Full happy path: approve -> baseline -> direct edit now rejected ->
    change request with no impact flags rejected -> change request with an
    impact flag accepted."""
    project_resp = await client.post(
        "/api/v1/projects",
        json={
            "name": "Baseline Flow Project",
            "product_version_id": str(_STUB_PRODUCT_VERSION_ID),
        },
    )
    project_id = project_resp.json()["id"]
    _created_rows.append(("projects", uuid.UUID(project_id)))

    plan_resp = await client.post(
        f"/api/v1/projects/{project_id}/plans",
        json={"name": "Plan A", "scope_summary": "Scope A"},
    )
    plan_id = plan_resp.json()["id"]
    _created_rows.append(("project_plans", uuid.UUID(plan_id)))

    approve_resp = await client.post(f"/api/v1/projects/plans/{plan_id}/approve")
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"

    baseline_resp = await client.post(
        f"/api/v1/projects/{project_id}/baselines",
        json={"name": "Baseline A", "project_plan_id": plan_id},
    )
    assert baseline_resp.status_code == 201, baseline_resp.text
    assert baseline_resp.json()["scope_snapshot"] == "Scope A"
    _created_rows.append(("plan_baselines", uuid.UUID(baseline_resp.json()["id"])))

    plan_after = await client.get(f"/api/v1/projects/plans/{plan_id}")
    assert plan_after.json()["status"] == "baselined"

    # Direct mutation of scope after baseline must be rejected.
    edit_resp = await client.patch(
        f"/api/v1/projects/plans/{plan_id}", json={"scope_summary": "Sneaky change"}
    )
    assert edit_resp.status_code == 422
    assert "change" in edit_resp.json()["detail"].lower()

    # A change request with no impact flags is meaningless and rejected.
    empty_cr_resp = await client.post(
        f"/api/v1/projects/{project_id}/change-requests",
        json={"title": "No-op CR"},
    )
    assert empty_cr_resp.status_code == 422

    # A change request with a real impact flag is accepted.
    cr_resp = await client.post(
        f"/api/v1/projects/{project_id}/change-requests",
        json={
            "title": "Add reporting feature",
            "justification": "Stakeholder request",
            "adds_features": True,
            "affects_schedule": True,
            "schedule_delta_days": 5,
        },
    )
    assert cr_resp.status_code == 201, cr_resp.text
    cr = cr_resp.json()
    assert cr["status"] == "pending"
    _created_rows.append(("change_requests", uuid.UUID(cr["id"])))

    update_resp = await client.patch(
        f"/api/v1/projects/change-requests/{cr['id']}", json={"status": "approved"}
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "approved"
    assert update_resp.json()["decided_at"] is not None
