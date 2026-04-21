"""Initial schema: oid_nodes + audit_log

Revision ID: 001
Revises:
Create Date: 2026-04-21
"""

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS ltree")

    op.execute("CREATE TYPE node_type AS ENUM ('managed', 'federated')")
    op.execute("CREATE TYPE node_status AS ENUM ('active', 'deprecated', 'disabled')")

    op.execute("""
        CREATE TABLE oid_nodes (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            oid_path            LTREE       NOT NULL,
            node_type           node_type   NOT NULL,
            status              node_status NOT NULL DEFAULT 'active',
            description         TEXT        NOT NULL,
            visibility          TEXT        NOT NULL CHECK (visibility IN ('public', 'private')),
            refs                TEXT[],
            metadata            JSONB,
            federation_url      TEXT,
            federation_label    TEXT,
            delegation_contact  TEXT,
            disabled_by_cascade BOOLEAN     NOT NULL DEFAULT false,
            pre_cascade_status  node_status,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT oid_path_unique UNIQUE (oid_path),
            CONSTRAINT federation_fields_required CHECK (
                node_type = 'managed'
                OR (federation_url IS NOT NULL AND federation_label IS NOT NULL)
            )
        )
    """)

    op.execute("""
        CREATE TABLE audit_log (
            id          BIGSERIAL   PRIMARY KEY,
            oid_path    LTREE       NOT NULL,
            action      TEXT        NOT NULL,
            actor       TEXT        NOT NULL,
            old_value   JSONB,
            new_value   JSONB,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS oid_nodes")
    op.execute("DROP TYPE IF EXISTS node_status")
    op.execute("DROP TYPE IF EXISTS node_type")
