"""Indexes, FTS, and audit_log append-only grant

Revision ID: 003
Revises: 002
Create Date: 2026-04-21
"""

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # oid_nodes indexes
    op.execute("CREATE INDEX oid_gist_idx   ON oid_nodes USING GIST  (oid_path)")
    op.execute("CREATE INDEX oid_btree_idx  ON oid_nodes USING BTREE (oid_path)")
    op.execute("CREATE INDEX oid_type_idx   ON oid_nodes (node_type)")
    op.execute("CREATE INDEX oid_status_idx ON oid_nodes (status)")
    op.execute("CREATE INDEX oid_vis_idx    ON oid_nodes (visibility)")
    op.execute(
        "CREATE INDEX oid_fts_idx ON oid_nodes "
        "USING GIN (to_tsvector('english', description))"
    )

    # audit_log indexes
    op.execute("CREATE INDEX audit_path_idx ON audit_log (oid_path)")
    op.execute("CREATE INDEX audit_ts_idx   ON audit_log (recorded_at DESC)")

    # Append-only enforcement for audit_log
    # The application role is set via DATABASE_URL credentials.
    # We revoke UPDATE/DELETE from PUBLIC as a belt-and-suspenders guard.
    op.execute("REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC")


def downgrade() -> None:
    op.execute("GRANT UPDATE, DELETE ON audit_log TO PUBLIC")
    op.execute("DROP INDEX IF EXISTS audit_ts_idx")
    op.execute("DROP INDEX IF EXISTS audit_path_idx")
    op.execute("DROP INDEX IF EXISTS oid_fts_idx")
    op.execute("DROP INDEX IF EXISTS oid_vis_idx")
    op.execute("DROP INDEX IF EXISTS oid_status_idx")
    op.execute("DROP INDEX IF EXISTS oid_type_idx")
    op.execute("DROP INDEX IF EXISTS oid_btree_idx")
    op.execute("DROP INDEX IF EXISTS oid_gist_idx")
