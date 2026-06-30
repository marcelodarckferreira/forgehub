"""Deploy domain – Docker installation registry + live container status.

Endpoints:
  GET  /api/v1/deploy/containers                      – live docker ps (host-bridge)
  POST /api/v1/deploy/containers/{name}/restart       – docker restart (host-bridge)
  GET  /api/v1/deploy/containers/{name}/logs          – docker logs --tail N (host-bridge)
  GET  /api/v1/deploy/installations                   – list registered installations
  POST /api/v1/deploy/installations                   – create
  GET  /api/v1/deploy/installations/{id}              – get one
  PUT  /api/v1/deploy/installations/{id}              – full update
  DELETE /api/v1/deploy/installations/{id}            – delete
"""
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.deploy import (
    DeployInstallationCreate,
    DeployInstallationOut,
    DeployInstallationOutEnriched,
    DeployInstallationUpdate,
    DockerContainerOut,
    DockerVolumeOut,
    DockerNetworkOut,
)
from app.core.config import settings
from app.db.base import get_db
from app.db.models.deploy import DeployInstallation
from app.db.models.product import Product

router = APIRouter(prefix="/api/v1/deploy", tags=["deploy"])

BRIDGE_HEADERS = {"X-Bridge-Token": settings.CHAT_BRIDGE_TOKEN}


async def _bridge(method: str, path: str, **kwargs) -> Any:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.request(
                method,
                f"{settings.CHAT_BRIDGE_URL}{path}",
                headers=BRIDGE_HEADERS,
                **kwargs,
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Host-bridge error: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Live Docker container endpoints (via host-bridge)
# ---------------------------------------------------------------------------

@router.get("/containers", response_model=list[DockerContainerOut])
async def list_containers():
    """Return all Docker containers (running and stopped) from the host."""
    data = await _bridge("POST", "/v1/docker/ps")
    containers = []
    for c in data.get("containers", []):
        raw_status = c.get("Status", "")
        health = None
        if "(healthy)" in raw_status:
            health = "healthy"
        elif "(unhealthy)" in raw_status:
            health = "unhealthy"
        elif "starting" in raw_status.lower():
            health = "starting"
        state = "running" if raw_status.startswith("Up") else "stopped"
        containers.append(DockerContainerOut(
            name=c.get("Names", ""),
            image=c.get("Image", ""),
            status=raw_status,
            ports=c.get("Ports", ""),
            state=state,
            health=health,
        ))
    return containers


@router.post("/containers/{container_name}/restart")
async def restart_container(container_name: str):
    """Restart a Docker container via the host-bridge."""
    result = await _bridge("POST", "/v1/docker/restart", json={"container_name": container_name})
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.get("stderr", "Restart failed"),
        )
    return {"ok": True, "container": container_name}


@router.get("/containers/{container_name}/logs")
async def get_container_logs(
    container_name: str,
    lines: int = Query(default=100, le=2000),
):
    """Return the last N log lines for a container."""
    result = await _bridge(
        "POST", "/v1/docker/logs",
        json={"container_name": container_name, "lines": lines},
    )
    return {"logs": result.get("logs", ""), "container": container_name}


@router.get("/containers/{container_name}/inspect")
async def inspect_container(container_name: str):
    """Return full docker inspect output for a container."""
    result = await _bridge("POST", "/v1/docker/inspect", json={"container_name": container_name})
    return result.get("inspect", {})


@router.get("/volumes", response_model=list[DockerVolumeOut])
async def list_volumes():
    """Return all Docker volumes with driver, mountpoint and container usage."""
    data = await _bridge("POST", "/v1/docker/volumes")
    return [DockerVolumeOut(**v) for v in data.get("volumes", [])]


@router.get("/networks", response_model=list[DockerNetworkOut])
async def list_networks():
    """Return all Docker networks with driver, subnets and attached containers."""
    data = await _bridge("POST", "/v1/docker/networks")
    return [DockerNetworkOut(**n) for n in data.get("networks", [])]


# ---------------------------------------------------------------------------
# Installation registry CRUD
# ---------------------------------------------------------------------------

@router.get("/installations", response_model=list[DeployInstallationOutEnriched])
async def list_installations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeployInstallation).order_by(DeployInstallation.order_index, DeployInstallation.name)
    )
    installations = list(result.scalars().all())
    # Resolve product names in one batch
    product_ids = {i.product_id for i in installations if i.product_id}
    product_names: dict[uuid.UUID, str] = {}
    if product_ids:
        prod_result = await db.execute(
            select(Product).where(Product.id.in_(product_ids))
        )
        for p in prod_result.scalars().all():
            product_names[p.id] = p.name
    enriched = []
    for inst in installations:
        out = DeployInstallationOutEnriched.model_validate(inst)
        out.product_name = product_names.get(inst.product_id) if inst.product_id else None
        enriched.append(out)
    return enriched


@router.post("/installations", response_model=DeployInstallationOut, status_code=status.HTTP_201_CREATED)
async def create_installation(payload: DeployInstallationCreate, db: AsyncSession = Depends(get_db)):
    inst = DeployInstallation(**payload.model_dump())
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return inst


@router.get("/installations/{installation_id}", response_model=DeployInstallationOut)
async def get_installation(installation_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    inst = await db.get(DeployInstallation, installation_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installation not found")
    return inst


@router.put("/installations/{installation_id}", response_model=DeployInstallationOut)
async def update_installation(
    installation_id: uuid.UUID,
    payload: DeployInstallationUpdate,
    db: AsyncSession = Depends(get_db),
):
    inst = await db.get(DeployInstallation, installation_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installation not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(inst, field, value)
    await db.commit()
    await db.refresh(inst)
    return inst


@router.delete("/installations/{installation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_installation(installation_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    inst = await db.get(DeployInstallation, installation_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installation not found")
    await db.delete(inst)
    await db.commit()


# ---------------------------------------------------------------------------
# Sync: auto-register Docker containers not yet in the registry
# ---------------------------------------------------------------------------

@router.post("/sync")
async def sync_from_docker(db: AsyncSession = Depends(get_db)):
    """Compare live Docker containers with the registry.

    For every container returned by `docker ps -a` that has no matching
    DeployInstallation (matched on container_name), create a new installation
    with sensible defaults derived from the live docker output.

    Also updates the `ports` field on existing installations whose container
    is currently live and whose registered ports list is empty.

    Returns { created: int, updated: int, skipped: int, names_created: [...] }
    """
    # Fetch live containers (may raise 502 if host-bridge is down).
    data = await _bridge("POST", "/v1/docker/ps")
    live_containers: list[dict] = data.get("containers", [])

    # Build a map of container_name → existing installation.
    result = await db.execute(select(DeployInstallation))
    existing = {inst.container_name: inst for inst in result.scalars().all() if inst.container_name}

    created_names: list[str] = []
    updated_names: list[str] = []
    skipped = 0

    for c in live_containers:
        cname: str = c.get("Names", "").strip()
        if not cname:
            continue

        raw_ports: str = c.get("Ports", "") or ""
        # Parse "0.0.0.0:8000->8000/tcp, ..." into ["8000:8000", ...]
        port_list: list[str] = []
        for seg in raw_ports.split(","):
            seg = seg.strip()
            if "->" in seg:
                # "0.0.0.0:8000->8000/tcp" → "8000:8000"
                host_part = seg.split("->")[0]
                container_port = seg.split("->")[1].split("/")[0]
                host_port = host_part.split(":")[-1]
                mapping = f"{host_port}:{container_port}"
                if mapping not in port_list:
                    port_list.append(mapping)

        if cname in existing:
            inst = existing[cname]
            # Update ports if previously empty and now we have data.
            if port_list and not inst.ports:
                inst.ports = port_list
                updated_names.append(cname)
            else:
                skipped += 1
        else:
            # Auto-register with defaults.
            new_inst = DeployInstallation(
                name=cname,
                container_name=cname,
                restart_command=f"docker restart {cname}",
                ports=port_list or None,
            )
            db.add(new_inst)
            created_names.append(cname)

    if created_names or updated_names:
        await db.commit()

    return {
        "created": len(created_names),
        "updated": len(updated_names),
        "skipped": skipped,
        "names_created": created_names,
        "names_updated": updated_names,
    }
