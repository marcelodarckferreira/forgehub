"""Foundation governance docs browser + editor — read/write.

Browses and edits the markdown rule/policy/governance documents under
/root/.hermes/foundation (mounted read-write at /foundation-root) -- the
same tree-walking approach as vault.py's read-only Obsidian viewer, plus a
PUT endpoint to save edits back to disk and a [[wikilink]] graph mirroring
Obsidian's own graph view.

This is the actual rule set the Hermes agents operate under (governance/,
policies/, docs/, agents/, map/, vault/, continuity/, ... subdirectories)
-- writes (including delete) here change what agents are governed by, so
the path-traversal guard is load-bearing: every operation must resolve to
an existing .md file inside FOUNDATION_ROOT. No file creation -- editing
and deleting existing files only.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.markdown_docs import DocGraph, DocNode, build_graph, build_tree, resolve_doc_path

router = APIRouter(prefix="/api/v1/foundation-docs", tags=["foundation-docs"])

FOUNDATION_ROOT = Path("/foundation-root")


class FoundationDocOut(BaseModel):
    path: str
    content: str


class FoundationDocUpdateIn(BaseModel):
    content: str


def _resolve_doc_path(relative_path: str) -> Path:
    target = resolve_doc_path(FOUNDATION_ROOT, relative_path)
    if target is None:
        raise HTTPException(status_code=400, detail="Invalid document path")
    if target.suffix.lower() != ".md":
        raise HTTPException(status_code=400, detail="Only markdown files can be read or edited")
    return target


@router.get("/tree", response_model=list[DocNode])
async def get_foundation_tree() -> list[DocNode]:
    if not FOUNDATION_ROOT.is_dir():
        raise HTTPException(status_code=404, detail="Foundation directory is not mounted")
    return build_tree(FOUNDATION_ROOT)


@router.get("/graph", response_model=DocGraph)
async def get_foundation_graph() -> DocGraph:
    if not FOUNDATION_ROOT.is_dir():
        raise HTTPException(status_code=404, detail="Foundation directory is not mounted")
    return build_graph(FOUNDATION_ROOT)


@router.get("/doc", response_model=FoundationDocOut)
async def get_foundation_doc(path: str = Query(...)) -> FoundationDocOut:
    target = _resolve_doc_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return FoundationDocOut(path=path, content=target.read_text(encoding="utf-8", errors="replace"))


@router.put("/doc", response_model=FoundationDocOut)
async def update_foundation_doc(
    payload: FoundationDocUpdateIn, path: str = Query(...)
) -> FoundationDocOut:
    target = _resolve_doc_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    target.write_text(payload.content, encoding="utf-8")
    return FoundationDocOut(path=path, content=payload.content)


@router.delete("/doc", status_code=204)
async def delete_foundation_doc(path: str = Query(...)) -> None:
    target = _resolve_doc_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    target.unlink()
