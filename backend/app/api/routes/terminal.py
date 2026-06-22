"""Terminal proxy route.

Relays a browser WebSocket to a real PTY (bash) on the host, via the chat
bridge's /v1/terminal/ws (see host-bridge/app.py). This container has no
shell of its own to offer -- the actual bash process lives on the host,
same reasoning as the chat domain's bridge proxy in api/routes/chat.py.

This is a transparent byte pipe in both directions: the browser's input/
resize JSON messages and the bridge's raw terminal output text are never
parsed here, just forwarded. The bridge token lives only on this side --
the browser never sees it.
"""
import asyncio
from urllib.parse import quote

import httpx
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from websockets import connect as ws_connect
from websockets.exceptions import ConnectionClosed

from app.core.config import settings

router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])


@router.get("/browse-dirs")
async def browse_dirs(path: str | None = Query(default=None)) -> dict:
    """Proxy to the bridge's host directory listing -- backs the chat
    UI's working-directory picker (see host-bridge/app.py's /v1/browse-dirs)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.CHAT_BRIDGE_URL}/v1/browse-dirs",
            params={"path": path} if path else {},
            headers={"X-Bridge-Token": settings.CHAT_BRIDGE_TOKEN},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Chat bridge error: {resp.text[:500]}"
        )
    return resp.json()


@router.post("/sessions/{session_id}/kill")
async def kill_session(session_id: str) -> dict:
    """Proxy to the bridge's session kill -- ends a terminal tab's tmux
    session for good (vs. a WebSocket disconnect, which only detaches it).
    Called when the user explicitly closes a terminal tab."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.CHAT_BRIDGE_URL}/v1/terminal/sessions/{session_id}/kill",
            headers={"X-Bridge-Token": settings.CHAT_BRIDGE_TOKEN},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Chat bridge error: {resp.text[:500]}"
        )
    return resp.json()


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)) -> dict:
    """Proxy an image pasted into a terminal pane to the bridge, which
    writes it to a host tmp dir and hands back its path -- the path is then
    typed into the terminal so CLI agents (claude/codex/agy) that read
    images by file reference can pick it up, since the PTY has no way to
    carry the browser's clipboard image bytes itself."""
    content = await file.read()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.CHAT_BRIDGE_URL}/v1/terminal/upload-image",
            files={"image": (file.filename or "image.png", content, file.content_type)},
            headers={"X-Bridge-Token": settings.CHAT_BRIDGE_TOKEN},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Chat bridge error: {resp.text[:500]}"
        )
    return resp.json()


@router.websocket("/ws")
async def terminal_ws(
    websocket: WebSocket,
    session: str = Query(...),
    command: str | None = Query(default=None),
    cwd: str | None = Query(default=None),
) -> None:
    await websocket.accept()

    bridge_ws_url = settings.CHAT_BRIDGE_URL.replace("http://", "ws://").replace("https://", "wss://")
    bridge_ws_url += f"/v1/terminal/ws?token={settings.CHAT_BRIDGE_TOKEN}&session={quote(session)}"
    if command:
        bridge_ws_url += f"&command={quote(command)}"
    if cwd:
        bridge_ws_url += f"&cwd={quote(cwd)}"

    async with ws_connect(bridge_ws_url) as bridge_ws:

        async def pump_to_bridge() -> None:
            try:
                while True:
                    message = await websocket.receive_text()
                    await bridge_ws.send(message)
            except (WebSocketDisconnect, ConnectionClosed):
                pass

        async def pump_from_bridge() -> None:
            try:
                async for message in bridge_ws:
                    await websocket.send_text(message)
            except ConnectionClosed:
                pass

        _done, pending = await asyncio.wait(
            [asyncio.create_task(pump_to_bridge()), asyncio.create_task(pump_from_bridge())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
