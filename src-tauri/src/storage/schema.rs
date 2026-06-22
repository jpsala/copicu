use rusqlite_migration::{Migrations, M};

pub(super) const MIGRATIONS_SLICE: &[M<'_>] = &[
    M::up(
        r#"
    CREATE TABLE clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_kind TEXT NOT NULL,
        text TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        created_at_unix_ms INTEGER NOT NULL,
        last_used_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_clipboard_items_created_at
        ON clipboard_items(created_at_unix_ms DESC);

    CREATE INDEX idx_clipboard_items_normalized_hash
        ON clipboard_items(normalized_hash);
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN mime_primary TEXT;
    ALTER TABLE clipboard_items ADD COLUMN blob_path TEXT;
    ALTER TABLE clipboard_items ADD COLUMN thumbnail_path TEXT;
    ALTER TABLE clipboard_items ADD COLUMN byte_size INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN width INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN height INTEGER;
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN title TEXT;
    ALTER TABLE clipboard_items ADD COLUMN notes TEXT;
    ALTER TABLE clipboard_items ADD COLUMN tags TEXT;
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL
    );
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN last_copied_at_unix_ms INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 1;

    UPDATE clipboard_items
    SET last_copied_at_unix_ms = created_at_unix_ms
    WHERE last_copied_at_unix_ms IS NULL;

    CREATE INDEX idx_clipboard_items_last_copied_at
        ON clipboard_items(last_copied_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r#"
    UPDATE clipboard_items
    SET
        created_at_unix_ms = (
            SELECT MIN(d.created_at_unix_ms)
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        last_used_at_unix_ms = (
            SELECT MAX(d.last_used_at_unix_ms)
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        last_copied_at_unix_ms = (
            SELECT MAX(COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms))
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        copy_count = (
            SELECT SUM(COALESCE(d.copy_count, 1))
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        title = COALESCE(
            NULLIF(TRIM(title), ''),
            (
                SELECT d.title
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.title IS NOT NULL
                    AND TRIM(d.title) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        ),
        notes = COALESCE(
            NULLIF(TRIM(notes), ''),
            (
                SELECT d.notes
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.notes IS NOT NULL
                    AND TRIM(d.notes) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        ),
        tags = COALESCE(
            NULLIF(TRIM(tags), ''),
            (
                SELECT d.tags
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.tags IS NOT NULL
                    AND TRIM(d.tags) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        )
    WHERE id IN (
        SELECT keeper_id
        FROM (
            SELECT
                id AS keeper_id,
                ROW_NUMBER() OVER (
                    PARTITION BY normalized_hash
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                ) AS rn
            FROM clipboard_items
        )
        WHERE rn = 1
    );

    DELETE FROM clipboard_items
    WHERE id IN (
        SELECT duplicate_id
        FROM (
            SELECT
                id AS duplicate_id,
                ROW_NUMBER() OVER (
                    PARTITION BY normalized_hash
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                ) AS rn
            FROM clipboard_items
        )
        WHERE rn > 1
    );

    DROP INDEX IF EXISTS idx_clipboard_items_normalized_hash;
    CREATE UNIQUE INDEX idx_clipboard_items_normalized_hash
        ON clipboard_items(normalized_hash);
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE action_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at_unix_ms INTEGER NOT NULL,
        finished_at_unix_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        input_summary_json TEXT NOT NULL,
        error_class TEXT,
        error_message TEXT
    );

    CREATE INDEX idx_action_runs_started_at
        ON action_runs(started_at_unix_ms DESC);

    CREATE INDEX idx_action_runs_action_id
        ON action_runs(action_id, started_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE script_action_registry (
        file_path TEXT PRIMARY KEY,
        action_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        diagnostic_count INTEGER NOT NULL,
        refreshed_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_script_action_registry_action_id
        ON script_action_registry(action_id);

    CREATE TABLE script_action_diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        action_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        refreshed_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_script_action_diagnostics_file_path
        ON script_action_diagnostics(file_path);
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN is_marked INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE clipboard_items ADD COLUMN marked_at_unix_ms INTEGER;

    CREATE INDEX idx_clipboard_items_is_marked
        ON clipboard_items(is_marked, marked_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r##"
    CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        color TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER,
        created_at_unix_ms INTEGER NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL
    );

    CREATE TABLE clipboard_item_tags (
        item_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at_unix_ms INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        confidence REAL,
        PRIMARY KEY (item_id, tag_id),
        FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_clipboard_item_tags_tag_id
        ON clipboard_item_tags(tag_id, item_id);

    CREATE TABLE tag_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id INTEGER NOT NULL UNIQUE,
        hotkey TEXT,
        auto_apply_enabled INTEGER NOT NULL DEFAULT 0,
        created_at_unix_ms INTEGER NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_tag_configs_hotkey
        ON tag_configs(hotkey)
        WHERE hotkey IS NOT NULL AND TRIM(hotkey) != '';

    WITH RECURSIVE
        raw_items(item_id, rest, token) AS (
            SELECT
                id,
                TRIM(REPLACE(REPLACE(COALESCE(tags, ''), ',', ' '), '#', '')) || ' ',
                ''
            FROM clipboard_items
            WHERE tags IS NOT NULL AND TRIM(tags) != ''
            UNION ALL
            SELECT
                item_id,
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1)),
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1))
            FROM raw_items
            WHERE rest != ''
        ),
        normalized(item_id, slug, label) AS (
            SELECT DISTINCT
                item_id,
                LOWER(token),
                token
            FROM raw_items
            WHERE token != ''
        )
    INSERT OR IGNORE INTO tags (slug, label, created_at_unix_ms, updated_at_unix_ms)
    SELECT slug, label, 0, 0
    FROM normalized;

    WITH RECURSIVE
        raw_items(item_id, rest, token) AS (
            SELECT
                id,
                TRIM(REPLACE(REPLACE(COALESCE(tags, ''), ',', ' '), '#', '')) || ' ',
                ''
            FROM clipboard_items
            WHERE tags IS NOT NULL AND TRIM(tags) != ''
            UNION ALL
            SELECT
                item_id,
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1)),
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1))
            FROM raw_items
            WHERE rest != ''
        ),
        normalized(item_id, slug) AS (
            SELECT DISTINCT item_id, LOWER(token)
            FROM raw_items
            WHERE token != ''
        )
    INSERT OR IGNORE INTO clipboard_item_tags (item_id, tag_id, created_at_unix_ms, source, confidence)
    SELECT normalized.item_id, tags.id, 0, 'manual', NULL
    FROM normalized
    JOIN tags ON tags.slug = normalized.slug;
    "##,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN context_search_text TEXT;

    CREATE TABLE clipboard_item_capture_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        captured_at_unix_ms INTEGER NOT NULL,
        source_kind TEXT NOT NULL,
        source_app_name TEXT,
        source_app_path TEXT,
        source_process_id INTEGER,
        source_window_id INTEGER,
        source_window_title TEXT,
        content_kind TEXT NOT NULL,
        mime_primary TEXT,
        clipboard_platform TEXT,
        clipboard_sequence_number INTEGER,
        clipboard_format_count INTEGER,
        clipboard_formats_text TEXT,
        clipboard_formats_json TEXT,
        byte_size INTEGER,
        text_char_count INTEGER,
        line_count INTEGER,
        domain TEXT,
        event_json TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_clipboard_item_capture_events_item
        ON clipboard_item_capture_events(item_id, captured_at_unix_ms DESC);

    CREATE INDEX idx_clipboard_item_capture_events_app
        ON clipboard_item_capture_events(source_app_name, captured_at_unix_ms DESC);

    CREATE INDEX idx_clipboard_item_capture_events_domain
        ON clipboard_item_capture_events(domain, captured_at_unix_ms DESC);
    "#,
    ),
];
pub(super) const MIGRATIONS: Migrations<'_> = Migrations::from_slice(MIGRATIONS_SLICE);
