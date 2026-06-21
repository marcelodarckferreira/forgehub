"""ForgeHub chat bridge.

Runs on the HOST (not in Docker) because the real Hermes Foundation agents
(Athos, Atlas, ...) are host processes invoked via the `hermes` CLI -- the
forgehub-backend container has no access to that CLI or its venv. This
service is the only thing that shells out to `hermes chat`; the backend
container reaches it over the Docker bridge network
(http://host.docker.internal:<port>) and never touches the CLI directly.

Endpoints:
  POST /v1/chat          -- send a message to a profile, get the agent's reply
  POST /v1/transcribe    -- speech-to-text for an uploaded audio clip
  WS   /v1/terminal/ws   -- a real PTY (bash) on the host, proxied to the
                            browser through forgehub-backend's own WS relay

Auth: every HTTP request must carry `X-Bridge-Token` matching BRIDGE_TOKEN
below (shared secret with forgehub-backend's CHAT_BRIDGE_TOKEN); the
terminal WS takes the same token as a query param since browsers can't set
custom headers on a WebSocket handshake -- but the browser never connects
here directly, only forgehub-backend does (see api/routes/terminal.py),
so the token never reaches client JS. Without this check, any container on
the same Docker network could otherwise drive these agents or get a root
shell on the host.
"""

import asyncio
import fcntl
import json
import os
import pty
import re
import shlex
import signal
import struct
import subprocess
import tempfile
import termios
import threading
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

BRIDGE_TOKEN = os.environ["FORGEHUB_BRIDGE_TOKEN"]
HERMES_PYTHON = "/usr/local/lib/hermes-agent/venv/bin/python"
PROFILES_DIR = Path("/root/.hermes/profiles")

# A profile is chattable if it's a real Hermes profile directory -- matches
# whatever ForgeHub's Hermes sync populated as Agent.profile_slug (24
# profiles as of writing, not just the 8 with an active gateway service;
# `hermes chat -p <profile>` doesn't need the gateway running). The name
# pattern guards against path traversal (e.g. "../../etc") since it's
# concatenated into a filesystem path below.
PROFILE_NAME_RE = re.compile(r"^[a-z0-9_-]+$")

CHAT_TIMEOUT_SECONDS = 600
SESSION_ID_RE = re.compile(r"session_id:\s*(\S+)")


def _is_valid_profile(profile: str) -> bool:
    return bool(PROFILE_NAME_RE.match(profile)) and (PROFILES_DIR / profile).is_dir()

UPLOAD_DIR = Path(tempfile.gettempdir()) / "forgehub-chat-uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ForgeHub chat bridge")


def _check_token(x_bridge_token: str | None) -> None:
    if not x_bridge_token or x_bridge_token != BRIDGE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing bridge token")


class ChatRequest(BaseModel):
    profile: str
    message: str
    session_id: str | None = None
    image_path: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str | None = None


def _run_hermes_chat(req: ChatRequest) -> ChatResponse:
    if not _is_valid_profile(req.profile):
        raise HTTPException(status_code=400, detail=f"Unknown or disallowed profile: {req.profile}")

    args = [
        HERMES_PYTHON,
        "-m",
        "hermes_cli.main",
        "-p",
        req.profile,
        "chat",
        "-q",
        req.message,
        "-Q",
        "--source",
        "tool",
    ]
    if req.session_id:
        args += ["--resume", req.session_id]
    if req.image_path:
        args += ["--image", req.image_path]

    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=CHAT_TIMEOUT_SECONDS,
            cwd=str(Path.home()),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Agent did not respond in time") from None

    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"hermes chat exited {proc.returncode}: {proc.stderr.strip()[-2000:]}",
        )

    reply_lines = [
        line for line in proc.stdout.splitlines() if not line.startswith("Warning:")
    ]
    reply = "\n".join(reply_lines).strip()

    session_match = SESSION_ID_RE.search(proc.stderr)
    session_id = session_match.group(1) if session_match else req.session_id

    return ChatResponse(reply=reply, session_id=session_id)


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, x_bridge_token: str | None = Header(default=None)) -> ChatResponse:
    _check_token(x_bridge_token)
    return _run_hermes_chat(req)


@app.post("/v1/chat-with-image", response_model=ChatResponse)
async def chat_with_image(
    profile: str = Form(...),
    message: str = Form(...),
    session_id: str | None = Form(default=None),
    image: UploadFile = File(...),
    x_bridge_token: str | None = Header(default=None),
) -> ChatResponse:
    """Same as /v1/chat, but accepts the image as bytes (the backend
    container has no path the host can resolve) and writes it to a host
    tmp dir before invoking --image."""
    _check_token(x_bridge_token)

    suffix = Path(image.filename or "image").suffix or ".png"
    dest = UPLOAD_DIR / f"{os.urandom(8).hex()}{suffix}"
    dest.write_bytes(await image.read())

    try:
        return _run_hermes_chat(
            ChatRequest(profile=profile, message=message, session_id=session_id, image_path=str(dest))
        )
    finally:
        dest.unlink(missing_ok=True)


_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    return _whisper_model


@app.post("/v1/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    x_bridge_token: str | None = Header(default=None),
) -> dict:
    _check_token(x_bridge_token)

    suffix = Path(audio.filename or "audio").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        model = _get_whisper_model()
        segments, _info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {"text": text}
    finally:
        os.unlink(tmp_path)


@app.post("/v1/terminal/upload-image")
async def terminal_upload_image(
    image: UploadFile = File(...),
    x_bridge_token: str | None = Header(default=None),
) -> dict:
    """Save an image pasted into a terminal pane to a host tmp dir and hand
    back its absolute path. Unlike /v1/chat-with-image's upload, this file
    is not deleted afterwards -- we have no signal for when (or whether) the
    CLI agent running in the PTY actually reads it, only that the user is
    about to type/paste its path into their next prompt. It's still under
    the OS tmp dir, so it gets swept on reboot like any other tmp file."""
    _check_token(x_bridge_token)

    suffix = Path(image.filename or "image").suffix or ".png"
    dest = UPLOAD_DIR / f"{os.urandom(8).hex()}{suffix}"
    dest.write_bytes(await image.read())
    return {"path": str(dest)}


@app.get("/v1/health")
async def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Terminal -- a real PTY on the host, one per WebSocket connection.
#
# "Launcher" buttons (Claude CLI, Codex CLI, Antigravity's "agy" CLI, ...)
# don't exec the tool directly -- they spawn a normal login shell and type
# the command into it, same as a user would. That way "command not found"
# (e.g. a launcher that isn't on PATH yet) behaves exactly like a real
# terminal instead of needing special-cased error handling here.
# ---------------------------------------------------------------------------

LAUNCHER_COMMANDS = {"hermes", "claude", "codex", "agy"}


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def _write_without_echo(fd: int, data: bytes) -> None:
    """Write to the PTY master with the line discipline's ECHO bit cleared,
    so the injected cd/launcher line is processed (bash still reads and runs
    it) but never appears in the terminal output -- the click should look
    like the session started already-positioned, not like someone typed it.
    Bash's own readline resets terminal attributes once it starts reading
    the next real command, so ECHO is restored implicitly after that."""
    attrs = termios.tcgetattr(fd)
    original_lflag = attrs[3]
    attrs[3] = original_lflag & ~termios.ECHO
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    os.write(fd, data)
    attrs[3] = original_lflag
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


class DirEntry(BaseModel):
    name: str
    path: str


class BrowseDirsResponse(BaseModel):
    path: str
    parent: str | None
    entries: list[DirEntry]


@app.get("/v1/browse-dirs", response_model=BrowseDirsResponse)
async def browse_dirs(
    path: str | None = Query(default=None),
    x_bridge_token: str | None = Header(default=None),
) -> BrowseDirsResponse:
    """List subdirectories of a host path, for the chat UI's working
    -directory picker (used before launching a terminal/CLI launcher)."""
    _check_token(x_bridge_token)

    target = Path(path).expanduser() if path else Path.home()
    try:
        target = target.resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid path") from None
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Not a directory")

    try:
        children = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied") from None

    entries = []
    for entry in children:
        try:
            if entry.is_dir():
                entries.append(DirEntry(name=entry.name, path=str(entry)))
        except OSError:
            continue  # broken symlink or similar -- skip rather than 500

    parent = str(target.parent) if target.parent != target else None
    return BrowseDirsResponse(path=str(target), parent=parent, entries=entries)


@app.websocket("/v1/terminal/ws")
async def terminal_ws(
    websocket: WebSocket,
    token: str = Query(...),
    command: str | None = Query(default=None),
    cwd: str | None = Query(default=None),
) -> None:
    if token != BRIDGE_TOKEN:
        await websocket.close(code=4401)
        return
    await websocket.accept()

    home = str(Path.home())
    master_fd, slave_fd = pty.openpty()
    _set_winsize(master_fd, 24, 80)

    proc = subprocess.Popen(
        ["/bin/bash", "-l"],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=home,
        env={**os.environ, "TERM": "xterm-256color"},
        preexec_fn=os.setsid,
        close_fds=True,
    )
    os.close(slave_fd)  # the child has its own copy; the parent doesn't need this end
    fd = master_fd

    # Typed into the shell rather than passed as Popen(cwd=...) so an
    # invalid path behaves exactly like a real terminal ("cd: no such file
    # or directory") instead of failing the whole connection. Written with
    # echo off so the line itself doesn't show up above the prompt -- only
    # its output (errors, the launcher's own banner) does.
    if cwd:
        _write_without_echo(fd, f"cd {shlex.quote(cwd)}\n".encode())
    if command in LAUNCHER_COMMANDS:
        _write_without_echo(fd, f"{command}\n".encode())

    loop = asyncio.get_event_loop()
    output_queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    def reader_thread() -> None:
        while True:
            try:
                data = os.read(fd, 4096)
            except OSError:
                data = b""
            loop.call_soon_threadsafe(output_queue.put_nowait, data or None)
            if not data:
                return

    threading.Thread(target=reader_thread, daemon=True).start()

    async def pump_output() -> None:
        while True:
            chunk = await output_queue.get()
            if chunk is None:
                await websocket.close()
                return
            await websocket.send_text(chunk.decode(errors="replace"))

    output_task = asyncio.create_task(pump_output())

    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "input":
                os.write(fd, payload.get("data", "").encode())
            elif payload.get("type") == "resize":
                _set_winsize(fd, int(payload.get("rows", 24)), int(payload.get("cols", 80)))
    except WebSocketDisconnect:
        pass
    finally:
        output_task.cancel()
        try:
            # Interactive bash ignores SIGTERM (confirmed via /proc/<pid>/status
            # SigIgn during testing) -- SIGKILL is the only signal guaranteed to
            # land. setsid made the shell its own process group leader, so this
            # also kills anything it spawned (claude/codex/antigravity, ...).
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=5)
        except (subprocess.TimeoutExpired, ProcessLookupError):
            pass
        try:
            os.close(fd)
        except OSError:
            pass
