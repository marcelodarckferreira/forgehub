"""FastAPI application entrypoint.

Domain agents: add your router with `app.include_router(<domain>.router)`
in the marked block below. Each app/api/routes/<domain>.py module must
export a module-level `router = APIRouter(prefix="/api/v1/<resource>",
tags=[...])` — main.py never adds prefixes itself, the router owns its
full path.
"""
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
    task,
    terminal,
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
app.include_router(vault.router)
# ---------------------------------------------------------------------------
