"""Async SQLAlchemy engine/session setup and declarative base.

PK convention (binding for every domain model built on top of this
foundation): all primary keys are UUIDs, generated client-side.

    import uuid
    from sqlalchemy import Column
    from sqlalchemy.dialects.postgresql import UUID

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

(or the equivalent Mapped[uuid.UUID] / mapped_column form). Never use
autoincrement integer PKs or server-side gen_random_uuid() defaults —
the default must be Python-side uuid.uuid4 so IDs are available before
flush/commit.
"""
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

# Single shared engine for the app's lifetime.
engine = create_async_engine(settings.DATABASE_URL, future=True, pool_pre_ping=True)

# Use this factory to obtain AsyncSession instances. `expire_on_commit=False`
# so ORM instances stay usable after commit (needed for FastAPI responses).
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for every ORM model in this project.

    All application tables live in the `company` schema (already exists
    in the `forgehub` database — see docs/DB_README.md). Every domain
    model class must inherit from this Base so it shares this metadata
    and schema.
    """

    metadata = MetaData(schema=settings.POSTGRES_SCHEMA)


class TimestampMixin:
    """Mixin adding created_at/updated_at columns with server-side defaults.

    Mix this into domain models alongside Base, e.g.:

        class Product(Base, TimestampMixin):
            __tablename__ = "products"
            ...
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an AsyncSession.

    Usage in a route:

        from fastapi import Depends
        from app.db.base import get_db

        @router.get("/widgets")
        async def list_widgets(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        yield session
