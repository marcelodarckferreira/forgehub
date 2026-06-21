"""Chat domain routes.

Every message sent here is proxied to the chat bridge (host-bridge/app.py,
running on the host -- see its module docstring for why) which actually
drives the real `hermes chat -p <profile>` process for that agent. This
router only owns persistence (chat_sessions/chat_messages, for the
conversation history view) and the proxy call; it has no access to the
Hermes CLI itself.
"""
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.chat import (
    ChatMessageOut,
    ChatSendResult,
    ChatSessionCreate,
    ChatSessionOut,
    ChatSessionUpdate,
)
from app.core.config import settings
from app.db.base import get_db
from app.db.models.agent import Agent
from app.db.models.chat import ChatMessage, ChatSession

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

TITLE_PREVIEW_LENGTH = 60


async def _get_session_or_404(db: AsyncSession, session_id: uuid.UUID) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return session


async def _get_chattable_agent_or_404(db: AsyncSession, agent_id: uuid.UUID) -> Agent:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent.profile_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This agent has no Hermes profile and cannot be chatted with",
        )
    return agent


def _bridge_headers() -> dict[str, str]:
    return {"X-Bridge-Token": settings.CHAT_BRIDGE_TOKEN}


async def _call_bridge_text(profile: str, message: str, hermes_session_id: str | None) -> dict:
    async with httpx.AsyncClient(timeout=650.0) as client:
        resp = await client.post(
            f"{settings.CHAT_BRIDGE_URL}/v1/chat",
            json={"profile": profile, "message": message, "session_id": hermes_session_id},
            headers=_bridge_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Chat bridge error: {resp.text[:500]}",
        )
    return resp.json()


async def _call_bridge_image(
    profile: str, message: str, hermes_session_id: str | None, filename: str, content: bytes
) -> dict:
    async with httpx.AsyncClient(timeout=650.0) as client:
        resp = await client.post(
            f"{settings.CHAT_BRIDGE_URL}/v1/chat-with-image",
            data={
                "profile": profile,
                "message": message,
                **({"session_id": hermes_session_id} if hermes_session_id else {}),
            },
            files={"image": (filename, content)},
            headers=_bridge_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Chat bridge error: {resp.text[:500]}",
        )
    return resp.json()


# --------------------------------------------------------------------------
# ChatSession
# --------------------------------------------------------------------------


@router.post("/sessions", response_model=ChatSessionOut, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    payload: ChatSessionCreate, db: AsyncSession = Depends(get_db)
) -> ChatSession:
    await _get_chattable_agent_or_404(db, payload.agent_id)
    session = ChatSession(agent_id=payload.agent_id, title=payload.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_chat_sessions(
    agent_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)
) -> list[ChatSession]:
    stmt = select(ChatSession)
    if agent_id is not None:
        stmt = stmt.where(ChatSession.agent_id == agent_id)
    result = await db.execute(
        stmt.order_by(ChatSession.pinned.desc(), ChatSession.updated_at.desc())
    )
    return list(result.scalars().all())


@router.get("/sessions/{session_id}", response_model=ChatSessionOut)
async def get_chat_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> ChatSession:
    return await _get_session_or_404(db, session_id)


@router.patch("/sessions/{session_id}", response_model=ChatSessionOut)
async def update_chat_session(
    session_id: uuid.UUID, payload: ChatSessionUpdate, db: AsyncSession = Depends(get_db)
) -> ChatSession:
    session = await _get_session_or_404(db, session_id)
    if payload.title is not None:
        session.title = payload.title.strip()
    if payload.pinned is not None:
        session.pinned = payload.pinned
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    session = await _get_session_or_404(db, session_id)
    await db.delete(session)
    await db.commit()


# --------------------------------------------------------------------------
# ChatMessage
# --------------------------------------------------------------------------


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def list_chat_messages(
    session_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ChatMessage]:
    await _get_session_or_404(db, session_id)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return list(result.scalars().all())


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatSendResult,
    status_code=status.HTTP_201_CREATED,
)
async def send_chat_message(
    session_id: uuid.UUID,
    message: str = Form(default=""),
    file: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db),
) -> ChatSendResult:
    session = await _get_session_or_404(db, session_id)
    agent = await _get_chattable_agent_or_404(db, session.agent_id)

    if not message.strip() and file is None:
        raise HTTPException(status_code=400, detail="message or file is required")

    attachment_name = file.filename if file else None
    outgoing_message = message

    if file is not None:
        content = await file.read()
        is_image = (file.content_type or "").startswith("image/")
        if is_image:
            bridge_result = await _call_bridge_image(
                agent.profile_slug, message or "Veja a imagem em anexo.", session.hermes_session_id,
                file.filename or "image.png", content,
            )
        else:
            try:
                text_content = content.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400, detail="Attached file must be a text file or an image"
                ) from None
            # Plain prose framing, not a bracketed "[Arquivo anexado: ...]"
            # tag -- that reads like a system attachment token to the agent
            # and makes it try to fetch the file via a tool instead of just
            # reading the text pasted right here (confirmed during testing).
            outgoing_message = (
                f'Conteudo do arquivo "{file.filename}" colado abaixo:\n'
                f"---\n{text_content}\n---\n\n{message}".strip()
            )
            bridge_result = await _call_bridge_text(
                agent.profile_slug, outgoing_message, session.hermes_session_id
            )
    else:
        bridge_result = await _call_bridge_text(agent.profile_slug, message, session.hermes_session_id)

    user_message = ChatMessage(
        session_id=session.id, role="user", content=message, attachment_names=attachment_name
    )
    assistant_message = ChatMessage(
        session_id=session.id, role="assistant", content=bridge_result["reply"]
    )
    db.add(user_message)
    db.add(assistant_message)

    session.hermes_session_id = bridge_result.get("session_id") or session.hermes_session_id
    if session.title == "New chat" and message.strip():
        session.title = message.strip()[:TITLE_PREVIEW_LENGTH]

    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)
    await db.refresh(session)

    return ChatSendResult(
        user_message=user_message, assistant_message=assistant_message, session=session
    )


# --------------------------------------------------------------------------
# Voice transcription (proxied to the bridge's faster-whisper instance)
# --------------------------------------------------------------------------


@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)) -> dict:
    content = await audio.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.CHAT_BRIDGE_URL}/v1/transcribe",
            files={"audio": (audio.filename or "audio.webm", content, audio.content_type)},
            headers=_bridge_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Chat bridge error: {resp.text[:500]}",
        )
    return resp.json()
