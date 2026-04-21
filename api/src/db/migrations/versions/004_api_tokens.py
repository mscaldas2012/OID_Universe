"""Add api_tokens table

Revision ID: 004
Revises: 003
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_tokens",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.Text, nullable=False, unique=True),
        sa.Column("label", sa.Text, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=False), nullable=True),
    )
    op.create_index("api_tokens_hash_idx", "api_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("api_tokens_hash_idx", table_name="api_tokens")
    op.drop_table("api_tokens")
