"""FastAPI application entrypoint.

Domain agents: add your router with `app.include_router(<domain>.router)`
in the marked block below. Each app/api/routes/<domain>.py module must
export a module-level `router = APIRouter(prefix="/api/v1/<resource>",
tags=[...])` — main.py never adds prefixes itself, the router owns its
full path.
"""
import asyncio
import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    agent,
    artifact,
    auth,
    backlog,
    chat,
    foundation,
    foundation_docs,
    governance,
    pipeline,
    product,
    project,
    systemstats,
    task,
    terminal,
    toolversions,
    vault,
)

app = FastAPI(title="ForgeHub (ForgeHub) API", version="0.1.0")

# CORS: allow all origins/methods/headers for local dev. Tighten before
# any non-local deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)

# ---------------------------------------------------------------------------
# DOMAIN ROUTERS -- added by wiring step
# ---------------------------------------------------------------------------
app.include_router(product.router)
app.include_router(project.router)
app.include_router(pipeline.router)
app.include_router(backlog.router)
app.include_router(task.router)
app.include_router(agent.router)
app.include_router(artifact.router)
app.include_router(governance.router)
app.include_router(foundation.router)
app.include_router(foundation_docs.router)
app.include_router(chat.router)
app.include_router(terminal.router)
app.include_router(toolversions.router)
app.include_router(systemstats.router)
app.include_router(vault.router)
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# How often the background poll re-checks tool versions when sync is
# enabled. Matches Antigravity's own auto-updater cadence (it already
# re-checks itself roughly every 15 min regardless of this loop).
TOOL_VERSION_POLL_INTERVAL_SECONDS = 900

_tool_version_poll_task: asyncio.Task | None = None


async def _tool_version_poll_loop() -> None:
    from app.db.base import AsyncSessionLocal

    while True:
        try:
            async with AsyncSessionLocal() as db:
                setting = await toolversions.get_or_create_sync_setting(db)
                if setting.enabled:
                    # POLL_TOOLS excludes antigravity -- its "check" is a
                    # real `agy update`, and it already self-updates on its
                    # own cadence independent of this loop.
                    await toolversions.refresh_all_tool_versions(db, tools=toolversions.POLL_TOOLS)
        except Exception:
            logger.exception("Tool version poll failed")
        await asyncio.sleep(TOOL_VERSION_POLL_INTERVAL_SECONDS)


@app.on_event("startup")
async def _start_tool_version_poll() -> None:
    global _tool_version_poll_task
    _tool_version_poll_task = asyncio.create_task(_tool_version_poll_loop())


@app.on_event("shutdown")
async def _stop_tool_version_poll() -> None:
    if _tool_version_poll_task is None:
        return
    _tool_version_poll_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await _tool_version_poll_task
