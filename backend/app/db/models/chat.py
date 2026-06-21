"""Chat domain models: chat_sessions, chat_messages.

A ChatSession pairs a ForgeHub Agent (which must have a profile_slug --
see app/db/models/agent.py) with a Hermes CLI session (hermes_session_id,
used for `hermes chat --resume <id>` so multi-turn context is preserved on
the real agent process, not just in this table). ChatMessage stores every
turn for the conversation history view; role distinguishes who sent it.

Conventions: same as every other domain (see app/db/models/agent.py
docstring) -- UUID PK with Python-side default, TimestampMixin for
created_at/updated_at, string-form FK to a sibling domain's table.
"""
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

CHAT_MESSAGE_ROLES = ("user", "assistant")


class ChatSession(Base, TimestampMixin):
    """One conversation thread between a user and a single agent profile."""

    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.agents.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False, default="New chat")
    # Pinned chats sort to the top of the sidebar list, ahead of recency.
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Hermes CLI session id (e.g. "20260620_203829_9edb50"), captured from
    # the chat bridge's first reply and reused via --resume on every
    # subsequent turn. Null until the first message gets a reply.
    hermes_session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class ChatMessage(Base, TimestampMixin):
    """A single turn in a ChatSession."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(f"role IN {CHAT_MESSAGE_ROLES}", name="ck_chat_messages_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.chat_sessions.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Original filename(s) attached by the user, comma-separated, for
    # display only -- the file's content/image bytes are never persisted
    # here, only forwarded to the chat bridge for that one turn.
    attachment_names: Mapped[str | None] = mapped_column(String(500), nullable=True)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
