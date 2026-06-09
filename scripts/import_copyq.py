#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path


COPYQ_EXE_DEFAULT = r"C:\tools\copyq\copyq.exe"
APP_DATA_DEFAULT = Path(os.environ["APPDATA"]) / "dev.jpsala.copicu"
DB_NAME = "copicu.sqlite3"

MIME_NOTES = "application/x-copyq-item-notes"
MIME_BASENAME = "application/x-copyq-itemsync-basename"
MIME_TEXT = "text/plain"
MIME_HTML = "text/html"
MIME_PNG = "image/png"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def run_copyq(copyq_exe: str, args: list[str], *, binary: bool = False) -> bytes | str:
    result = subprocess.run(
        [copyq_exe, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"copyq failed ({result.returncode}) for args {args!r}: {stderr}")
    return result.stdout if binary else result.stdout.decode("utf-8", errors="replace")


def copyq_tabs(copyq_exe: str) -> list[str]:
    output = run_copyq(copyq_exe, ["tab"])
    return [line.strip() for line in output.splitlines() if line.strip()]


def copyq_count(copyq_exe: str, tab: str) -> int:
    output = run_copyq(copyq_exe, ["tab", tab, "count"]).strip()
    return int(output) if output else 0


def copyq_formats(copyq_exe: str, tab: str, row: int) -> list[str]:
    output = run_copyq(copyq_exe, ["tab", tab, "read", "?", str(row)])
    return [line.strip() for line in output.splitlines() if line.strip()]


def copyq_read(copyq_exe: str, tab: str, row: int, mime: str, *, binary: bool = False) -> bytes | str:
    return run_copyq(copyq_exe, ["tab", tab, "read", mime, str(row)], binary=binary)


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = normalize_text(value)
    return value or None


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def text_hash(text: str) -> str:
    return sha256_hex(text.encode("utf-8"))


def source_hash(tab: str, row: int, kind: str, payload: bytes) -> str:
    h = hashlib.sha256()
    h.update(b"copyq-import-v1\0")
    h.update(tab.encode("utf-8"))
    h.update(b"\0")
    h.update(str(row).encode("ascii"))
    h.update(b"\0")
    h.update(kind.encode("ascii"))
    h.update(b"\0")
    h.update(payload)
    return h.hexdigest()


def safe_tag(tab: str) -> str | None:
    if tab == "&clipboard":
        return None
    return "#" + tab.strip().replace(" ", "-")


def parse_copyq_timestamp_ms(basename: str | None) -> int | None:
    if not basename:
        return None
    match = re.search(r"copyq_(\d{14})(\d{0,3})", basename)
    if not match:
        return None
    stamp, millis = match.groups()
    try:
        parsed = time.strptime(stamp, "%Y%m%d%H%M%S")
        return int(time.mktime(parsed) * 1000) + int((millis or "0").ljust(3, "0")[:3])
    except ValueError:
        return None


def png_dimensions(data: bytes) -> tuple[int | None, int | None]:
    if len(data) < 24 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        return None, None
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def blob_relative_path(kind_dir: str, hash_value: str) -> str:
    return f"{kind_dir}/{hash_value[:2]}/{hash_value}.png"


def ensure_retention(conn: sqlite3.Connection, minimum: int) -> bool:
    row = conn.execute("SELECT value_json FROM app_settings WHERE key = 'app'").fetchone()
    now_ms = int(time.time() * 1000)
    if row is None:
        settings = {
            "schemaVersion": 1,
            "general": {"globalShortcut": "Ctrl+Shift+,"},
            "picker": {"hideOnFocusLost": True, "enterAction": "copy"},
            "history": {"retentionCount": minimum},
            "appearance": {"theme": "system"},
        }
        conn.execute(
            "INSERT INTO app_settings (key, value_json, updated_at_unix_ms) VALUES ('app', ?, ?)",
            (json.dumps(settings, separators=(",", ":")), now_ms),
        )
        return True

    settings = json.loads(row[0])
    history = settings.setdefault("history", {})
    current = int(history.get("retentionCount", 1000))
    if minimum == 0:
        if current == 0:
            return False
        history["retentionCount"] = 0
        conn.execute(
            "UPDATE app_settings SET value_json = ?, updated_at_unix_ms = ? WHERE key = 'app'",
            (json.dumps(settings, separators=(",", ":")), now_ms),
        )
        return True

    if current == 0 or current >= minimum:
        return False

    history["retentionCount"] = minimum
    conn.execute(
        "UPDATE app_settings SET value_json = ?, updated_at_unix_ms = ? WHERE key = 'app'",
        (json.dumps(settings, separators=(",", ":")), now_ms),
    )
    return True


def existing_hashes(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT normalized_hash FROM clipboard_items")}


def insert_text_item(
    conn: sqlite3.Connection,
    text: str,
    normalized_hash: str,
    created_at_ms: int,
    mime_primary: str,
    notes: str | None,
    tags: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO clipboard_items (
            content_kind, text, normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
            mime_primary, notes, tags
        ) VALUES ('text', ?, ?, ?, ?, ?, ?, ?)
        """,
        (text, normalized_hash, created_at_ms, created_at_ms, mime_primary, notes, tags),
    )


def insert_image_item(
    conn: sqlite3.Connection,
    app_data_dir: Path,
    png_bytes: bytes,
    normalized_hash: str,
    created_at_ms: int,
    notes: str | None,
    tags: str | None,
) -> None:
    width, height = png_dimensions(png_bytes)
    relative = blob_relative_path("blobs/images", normalized_hash)
    target = app_data_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(png_bytes)
    text = f"[image] {width or '?'}x{height or '?'} PNG {len(png_bytes)} bytes"
    conn.execute(
        """
        INSERT INTO clipboard_items (
            content_kind, text, normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
            mime_primary, blob_path, byte_size, width, height, notes, tags
        ) VALUES ('image', ?, ?, ?, ?, 'image/png', ?, ?, ?, ?, ?, ?)
        """,
        (
            text,
            normalized_hash,
            created_at_ms,
            created_at_ms,
            relative.replace("/", "\\"),
            len(png_bytes),
            width,
            height,
            notes,
            tags,
        ),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import CopyQ tabs into Copicu SQLite storage.")
    parser.add_argument("--copyq-exe", default=COPYQ_EXE_DEFAULT)
    parser.add_argument("--app-data-dir", default=str(APP_DATA_DEFAULT))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-empty-tabs", action="store_true")
    parser.add_argument("--retention-minimum", type=int, default=0)
    parser.add_argument(
        "--tabs",
        nargs="+",
        help="Only import the listed CopyQ tabs. Example: --tabs pass save",
    )
    args = parser.parse_args()

    copyq_exe = args.copyq_exe
    app_data_dir = Path(args.app_data_dir)
    db_path = app_data_dir / DB_NAME
    if not Path(copyq_exe).exists():
        raise SystemExit(f"CopyQ executable not found: {copyq_exe}")
    if not db_path.exists():
        raise SystemExit(f"Copicu database not found: {db_path}")

    tabs = copyq_tabs(copyq_exe)
    if args.tabs:
        requested = set(args.tabs)
        missing = sorted(requested.difference(tabs))
        if missing:
            raise SystemExit(f"CopyQ tab(s) not found: {', '.join(missing)}")
        tabs = [tab for tab in tabs if tab in requested]
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA journal_mode = WAL")
    seen_hashes = existing_hashes(conn)
    fallback_base_ms = int(time.time() * 1000) - 1_000_000

    stats = {
        "tabs": 0,
        "seen": 0,
        "imported": 0,
        "duplicates": 0,
        "unsupported": 0,
        "errors": 0,
        "text": 0,
        "image": 0,
    }
    per_tab: list[tuple[str, int, int, int, int]] = []

    if not args.dry_run:
        ensure_retention(conn, args.retention_minimum)

    for tab in tabs:
        count = copyq_count(copyq_exe, tab)
        if count == 0 and not args.include_empty_tabs:
            continue
        stats["tabs"] += 1
        tab_imported = tab_duplicates = tab_unsupported = 0
        tag = safe_tag(tab)
        for row in range(count):
            stats["seen"] += 1
            try:
                formats = set(copyq_formats(copyq_exe, tab, row))
                notes = optional_text(copyq_read(copyq_exe, tab, row, MIME_NOTES)) if MIME_NOTES in formats else None
                basename = optional_text(copyq_read(copyq_exe, tab, row, MIME_BASENAME)) if MIME_BASENAME in formats else None
                created_at = parse_copyq_timestamp_ms(basename) or (fallback_base_ms - stats["seen"])

                if MIME_TEXT in formats:
                    text = normalize_text(copyq_read(copyq_exe, tab, row, MIME_TEXT))
                    if not text:
                        stats["unsupported"] += 1
                        tab_unsupported += 1
                        continue
                    mime_primary = MIME_HTML if MIME_HTML in formats else MIME_TEXT
                    normalized_hash = text_hash(text) if tab == "&clipboard" else source_hash(tab, row, "text", text.encode("utf-8"))
                    if normalized_hash in seen_hashes:
                        stats["duplicates"] += 1
                        tab_duplicates += 1
                        continue
                    if not args.dry_run:
                        insert_text_item(conn, text, normalized_hash, created_at, mime_primary, notes, tag)
                        seen_hashes.add(normalized_hash)
                    stats["imported"] += 1
                    stats["text"] += 1
                    tab_imported += 1
                elif MIME_HTML in formats:
                    html = normalize_text(copyq_read(copyq_exe, tab, row, MIME_HTML))
                    if not html:
                        stats["unsupported"] += 1
                        tab_unsupported += 1
                        continue
                    normalized_hash = source_hash(tab, row, "html", html.encode("utf-8"))
                    if normalized_hash in seen_hashes:
                        stats["duplicates"] += 1
                        tab_duplicates += 1
                        continue
                    if not args.dry_run:
                        insert_text_item(conn, html, normalized_hash, created_at, MIME_HTML, notes, tag)
                        seen_hashes.add(normalized_hash)
                    stats["imported"] += 1
                    stats["text"] += 1
                    tab_imported += 1
                elif MIME_PNG in formats:
                    png_bytes = copyq_read(copyq_exe, tab, row, MIME_PNG, binary=True)
                    if not isinstance(png_bytes, bytes) or not png_bytes.startswith(PNG_SIGNATURE):
                        stats["unsupported"] += 1
                        tab_unsupported += 1
                        continue
                    normalized_hash = source_hash(tab, row, "image", png_bytes)
                    if normalized_hash in seen_hashes:
                        stats["duplicates"] += 1
                        tab_duplicates += 1
                        continue
                    if not args.dry_run:
                        insert_image_item(conn, app_data_dir, png_bytes, normalized_hash, created_at, notes, tag)
                        seen_hashes.add(normalized_hash)
                    stats["imported"] += 1
                    stats["image"] += 1
                    tab_imported += 1
                else:
                    stats["unsupported"] += 1
                    tab_unsupported += 1
            except Exception:
                stats["errors"] += 1
                tab_unsupported += 1
        per_tab.append((tab, count, tab_imported, tab_duplicates, tab_unsupported))

    if args.dry_run:
        conn.rollback()
    else:
        conn.commit()
    conn.close()

    mode = "dry-run" if args.dry_run else "import"
    print(f"copyq {mode}: tabs={stats['tabs']} seen={stats['seen']} imported={stats['imported']} text={stats['text']} image={stats['image']} duplicates={stats['duplicates']} unsupported={stats['unsupported']} errors={stats['errors']}")
    for tab, count, imported, duplicates, unsupported in per_tab:
        print(f"tab={tab!r} count={count} imported={imported} duplicates={duplicates} unsupported_or_errors={unsupported}")
    return 1 if stats["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
