"""Write-guard trigger and updated_at trigger on oid_nodes

Revision ID: 002
Revises: 001
Create Date: 2026-04-21
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

# ROOT_OID is injected at migration time via a session variable set by the
# Alembic env.py before running migrations.  The trigger reads it from a
# PG configuration parameter: current_setting('app.root_oid').
_TRIGGER_FN = """
CREATE OR REPLACE FUNCTION oid_nodes_write_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    root_oid        LTREE;
    blocking_node   RECORD;
    private_anc     RECORD;
    desc_node       RECORD;
BEGIN
    -- ── Read app-level ROOT_OID set by the application at startup ─────────
    root_oid := current_setting('app.root_oid', true)::ltree;

    -- ── (1) Reject writes above ROOT_OID ──────────────────────────────────
    IF root_oid IS NOT NULL AND NOT (NEW.oid_path <@ root_oid OR NEW.oid_path = root_oid) THEN
        RAISE EXCEPTION 'Write rejected: path % is above ROOT_OID %', NEW.oid_path, root_oid
            USING ERRCODE = 'P0001';
    END IF;

    -- ── (2) Reject if any ancestor (including self) is federated ──────────
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.node_type = 'managed') THEN
        SELECT * INTO blocking_node
        FROM oid_nodes
        WHERE oid_path @> NEW.oid_path
          AND node_type = 'federated'
          AND oid_path != NEW.oid_path
        ORDER BY nlevel(oid_path) DESC
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'Write blocked: node % is federated. federation_url=%',
                blocking_node.oid_path, blocking_node.federation_url
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- ── (3) Reject public visibility when any ancestor is private ─────────
    IF NEW.visibility = 'public' THEN
        SELECT * INTO private_anc
        FROM oid_nodes
        WHERE oid_path @> NEW.oid_path
          AND oid_path != NEW.oid_path
          AND visibility = 'private'
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'Write rejected: cannot set public visibility — ancestor % is private',
                private_anc.oid_path
                USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- ── (4) Cascade private visibility to all managed descendants ─────────
    IF TG_OP = 'UPDATE'
       AND OLD.visibility = 'public'
       AND NEW.visibility = 'private'
    THEN
        UPDATE oid_nodes
        SET visibility = 'private', updated_at = now()
        WHERE oid_path <@ NEW.oid_path
          AND oid_path != NEW.oid_path
          AND node_type = 'managed';
    END IF;

    -- ── (5) Cascade disabled status to all managed descendants ────────────
    IF TG_OP = 'UPDATE'
       AND OLD.status != 'disabled'
       AND NEW.status = 'disabled'
    THEN
        FOR desc_node IN
            SELECT id, oid_path, status
            FROM oid_nodes
            WHERE oid_path <@ NEW.oid_path
              AND oid_path != NEW.oid_path
              AND node_type = 'managed'
              AND status != 'disabled'
        LOOP
            UPDATE oid_nodes
            SET status              = 'disabled',
                disabled_by_cascade = true,
                pre_cascade_status  = desc_node.status,
                updated_at          = now()
            WHERE id = desc_node.id;

            INSERT INTO audit_log (oid_path, action, actor, old_value, new_value)
            VALUES (
                desc_node.oid_path,
                'DISABLE',
                current_setting('app.actor', true),
                jsonb_build_object('status', desc_node.status::text),
                jsonb_build_object('status', 'disabled')
            );
        END LOOP;
    END IF;

    -- ── (6) Reverse cascade: disabled → active restores pre_cascade_status ─
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'disabled'
       AND NEW.status = 'active'
    THEN
        FOR desc_node IN
            SELECT id, oid_path, pre_cascade_status
            FROM oid_nodes
            WHERE oid_path <@ NEW.oid_path
              AND oid_path != NEW.oid_path
              AND node_type = 'managed'
              AND disabled_by_cascade = true
        LOOP
            UPDATE oid_nodes
            SET status              = COALESCE(desc_node.pre_cascade_status, 'active'),
                disabled_by_cascade = false,
                pre_cascade_status  = NULL,
                updated_at          = now()
            WHERE id = desc_node.id;

            INSERT INTO audit_log (oid_path, action, actor, old_value, new_value)
            VALUES (
                desc_node.oid_path,
                'UPDATE',
                current_setting('app.actor', true),
                jsonb_build_object('status', 'disabled'),
                jsonb_build_object('status', COALESCE(desc_node.pre_cascade_status, 'active')::text)
            );
        END LOOP;
    END IF;

    -- ── (7) Cascade federated node_type to all descendants on delegate ─────
    IF TG_OP = 'UPDATE'
       AND OLD.node_type = 'managed'
       AND NEW.node_type = 'federated'
    THEN
        FOR desc_node IN
            SELECT id, oid_path
            FROM oid_nodes
            WHERE oid_path <@ NEW.oid_path
              AND oid_path != NEW.oid_path
        LOOP
            UPDATE oid_nodes
            SET node_type        = 'federated',
                federation_url   = NEW.federation_url,
                federation_label = NEW.federation_label,
                updated_at       = now()
            WHERE id = desc_node.id;

            INSERT INTO audit_log (oid_path, action, actor, old_value, new_value)
            VALUES (
                desc_node.oid_path,
                'DELEGATE',
                current_setting('app.actor', true),
                jsonb_build_object('node_type', 'managed'),
                jsonb_build_object('node_type', 'federated',
                                   'federation_url', NEW.federation_url)
            );
        END LOOP;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
"""

_TRIGGER = """
CREATE TRIGGER oid_nodes_write_guard_trg
BEFORE INSERT OR UPDATE ON oid_nodes
FOR EACH ROW EXECUTE FUNCTION oid_nodes_write_guard();
"""


def upgrade() -> None:
    op.execute(_TRIGGER_FN)
    op.execute(_TRIGGER)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS oid_nodes_write_guard_trg ON oid_nodes")
    op.execute("DROP FUNCTION IF EXISTS oid_nodes_write_guard()")
