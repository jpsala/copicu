#!/usr/bin/env python3
"""Seed an isolated Copicu app-data directory with stable dogfood fixtures.

The app owns schema creation/migration. This script only inserts additive rows into an
already-created SQLite database so the interactive smoke battery has predictable items.
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
import time
from pathlib import Path

FIXTURES = [
    {
        "kind": "text",
        "title": "DOGFOOD plain text",
        "text": "DOGFOOD-PLAIN: quick brown clipboard text for search/navigation smoke.",
        "tags": "dogfood text",
        "marked": 0,
    },
    {
        "kind": "path",
        "title": "DOGFOOD Windows path",
        "text": "C:\\synthetic\\dogfood\\battery\\path-fixture.txt",
        "tags": "dogfood path work",
        "marked": 1,
    },
    {
        "kind": "url",
        "title": "DOGFOOD URL",
        "text": "https://example.test/dogfood/battery?case=url-fixture",
        "tags": "dogfood url",
        "marked": 0,
    },
    {
        "kind": "json",
        "title": "DOGFOOD JSON",
        "text": '{"dogfood":true,"case":"json-fixture","value":42}',
        "tags": "dogfood json",
        "marked": 0,
    },
    {
        "kind": "code",
        "title": "DOGFOOD code",
        "text": "function dogfoodBatterySmoke(input) { return input?.trim().toUpperCase(); }",
        "tags": "dogfood code",
        "marked": 0,
    },
    {
        "kind": "markdown",
        "title": "DOGFOOD markdown",
        "text": "# DOGFOOD Markdown\n\n- picker\n- search\n- preview\n\n`inline-code`",
        "tags": "dogfood markdown",
        "marked": 0,
    },
]


def normalized_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("app_data_dir", type=Path)
    args = parser.parse_args()

    db_path = args.app_data_dir / "copicu.sqlite3"
    if not db_path.exists():
        raise SystemExit(f"database does not exist yet: {db_path}")

    now = int(time.time() * 1000)
    conn = sqlite3.connect(db_path)
    try:
        for index, fixture in enumerate(FIXTURES):
            text = fixture["text"]
            created = now - (index * 1000)
            conn.execute(
                """
                INSERT OR IGNORE INTO clipboard_items (
                    content_kind, text, normalized_hash, created_at_unix_ms,
                    last_used_at_unix_ms, mime_primary, title, notes, tags,
                    last_copied_at_unix_ms, copy_count, is_marked, marked_at_unix_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fixture["kind"],
                    text,
                    normalized_hash(text),
                    created,
                    created,
                    "text/plain",
                    fixture["title"],
                    "Seeded by tests/manual/dogfood/seed_dogfood_history.py",
                    fixture["tags"],
                    created,
                    1,
                    fixture["marked"],
                    created if fixture["marked"] else None,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    print(f"seeded {len(FIXTURES)} dogfood fixtures into {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
