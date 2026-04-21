"""Seed upward federation context arcs above ROOT_OID.

Reads api/config/ancestors.yml and inserts each entry as a federated node
if it does not already exist. Idempotent — safe to run multiple times.

Usage:
    docker compose exec api python -m scripts.seed_ancestors
"""

import asyncio
import os
import sys
from pathlib import Path

import yaml
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


async def seed() -> None:
    config_path = Path(__file__).parent.parent / "config" / "ancestors.yml"
    if not config_path.exists():
        print(f"Config not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    with config_path.open() as f:
        config = yaml.safe_load(f)

    ancestors = config.get("ancestors", [])
    if not ancestors:
        print("No ancestors defined in config — nothing to seed.")
        return

    database_url = os.environ["DATABASE_URL"]
    root_oid = os.environ["ROOT_OID"]
    admin_key = os.environ.get("ADMIN_API_KEY", "system")

    engine = create_async_engine(database_url)

    # Import after engine is created to avoid circular imports at module level
    from src.models.oid_node import NodeType, OidNode  # noqa: PLC0415

    async with AsyncSession(engine) as session:
        await session.execute(
            text("SELECT set_config('app.root_oid', :v, true)"), {"v": root_oid}
        )
        await session.execute(
            text("SELECT set_config('app.actor', :v, true)"), {"v": "seed_ancestors"}
        )

        inserted = 0
        skipped = 0

        for entry in ancestors:
            oid_path = entry["oid_path"]

            existing = (
                await session.execute(
                    select(OidNode).where(
                        text("oid_path = CAST(:p AS ltree)")
                    ).params(p=oid_path)
                )
            ).scalar_one_or_none()

            if existing is not None:
                print(f"  skip  {oid_path} (already exists)")
                skipped += 1
                continue

            federation_url = entry.get("federation_url") or None
            session.add(OidNode(
                oid_path=oid_path,
                node_type=NodeType.federated,
                status="active",
                description=entry.get("description", f"Ancestor arc {oid_path}"),
                visibility="public",
                federation_url=federation_url,
                federation_label=entry.get("federation_label") or None,
            ))
            print(f"  insert {oid_path}")
            inserted += 1

        await session.commit()

    await engine.dispose()
    print(f"\nDone — {inserted} inserted, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
