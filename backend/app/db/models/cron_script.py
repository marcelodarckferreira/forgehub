"""CronScript model — registry of every Hermes ecosystem script.

Backs the Crons/Scripts catalog page. The filesystem is the source of truth
for script *content*; the DB is the source of truth for *metadata* (agent
ownership, category, description, active flag). A POST /api/v1/scripts/sync
upserts rows from the mounted script directories into this table.

Conventions: UUID PK (Python-side default), TimestampMixin.
"""
import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

SCRIPT_CATEGORIES = (
    "foundation",
    "ecosystem",
    "monitor",
    "pipeline",
    "kanboard",
    "database",
    "memory",
    "dashboard",
    "maintenance",
    "utility",
)

SCRIPT_LOCATIONS = ("main", "central", "profile")


class CronScript(Base, TimestampMixin):
    """One registered script in the Hermes ecosystem.

    `location` is one of 'main' (/hermes-scripts), 'central' (/hermes-cron),
    or 'profile' (a per-agent scripts/ dir). `name` is the bare filename
    (unique across the full catalog). `path` is the container-side absolute
    path used by the content-read endpoint.
    """

    __tablename__ = "cron_scripts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    location: Mapped[str] = mapped_column(String(50), nullable=False, default="main")
    agent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    executable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Runtime health fields — updated by sync
    exists_on_disk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_symlink: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    symlink_target: Mapped[str | None] = mapped_column(String(512), nullable=True)
