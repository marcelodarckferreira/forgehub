"""add hermes foundation metadata to agents

Revision ID: 1e23115e683c
Revises: 1e58d7778bf7
Create Date: 2026-06-19 21:32:27.893311

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e23115e683c'
down_revision: Union[str, Sequence[str], None] = '1e58d7778bf7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('agents', sa.Column('profile_slug', sa.String(length=50), nullable=True), schema='company')
    op.add_column('agents', sa.Column('layer', sa.String(length=50), nullable=True), schema='company')
    op.add_column('agents', sa.Column('runtime_tier', sa.String(length=1), nullable=True), schema='company')
    op.add_column(
        'agents',
        sa.Column('telegram_required', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='company',
    )
    op.add_column(
        'agents',
        sa.Column('has_profile', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='company',
    )
    op.add_column('agents', sa.Column('mission', sa.Text(), nullable=True), schema='company')
    op.add_column('agents', sa.Column('source_path', sa.Text(), nullable=True), schema='company')
    op.create_unique_constraint('uq_agents_profile_slug', 'agents', ['profile_slug'], schema='company')
    op.create_check_constraint(
        'ck_agents_runtime_tier',
        'agents',
        "runtime_tier IS NULL OR runtime_tier IN ('A', 'B', 'C')",
        schema='company',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_agents_runtime_tier', 'agents', schema='company', type_='check')
    op.drop_constraint('uq_agents_profile_slug', 'agents', schema='company', type_='unique')
    op.drop_column('agents', 'source_path', schema='company')
    op.drop_column('agents', 'mission', schema='company')
    op.drop_column('agents', 'has_profile', schema='company')
    op.drop_column('agents', 'telegram_required', schema='company')
    op.drop_column('agents', 'runtime_tier', schema='company')
    op.drop_column('agents', 'layer', schema='company')
    op.drop_column('agents', 'profile_slug', schema='company')
