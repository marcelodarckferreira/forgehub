"""Pydantic schemas for the Chat domain (chat_sessions, chat_messages)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChatSessionCreate(BaseModel):
    agent_id: uuid.UUID
    title: str = Field(default="New chat", max_length=150)


class ChatSessionUpdate(BaseModel):
    """Partial update -- only the provided fields are applied."""

    title: str | None = Field(default=None, min_length=1, max_length=150)
    pinned: bool | None = None


class ChatSessionOut(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    title: str
    pinned: bool
    hermes_session_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    attachment_names: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSendResult(BaseModel):
    """Returned by POST .../messages -- both turns of the exchange, since
    the frontend needs the assistant reply right away."""

    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    session: ChatSessionOut
