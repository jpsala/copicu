use rusqlite::{
    hooks::{AuthAction, AuthContext, Authorization},
    limits::Limit,
    types::ValueRef,
    Connection, OpenFlags,
};
use serde_json::{json, Map, Value};
use std::{
    path::Path,
    time::{Duration, Instant},
};

const MAX_ROWS: usize = 500;
const MAX_BYTES: usize = 512 * 1024;
const QUERY_TIMEOUT: Duration = Duration::from_secs(2);

fn open_readonly(path: &Path) -> Result<Connection, String> {
    let conn =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(query_error)?;
    conn.busy_timeout(QUERY_TIMEOUT).map_err(query_error)?;
    conn.set_limit(Limit::SQLITE_LIMIT_LENGTH, 8 * 1024 * 1024)
        .map_err(query_error)?;
    conn.set_limit(Limit::SQLITE_LIMIT_SQL_LENGTH, 128 * 1024)
        .map_err(query_error)?;
    conn.authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
        AuthAction::Select | AuthAction::Recursive => Authorization::Allow,
        AuthAction::Read { table_name, .. }
            if ctx.database_name.is_none_or(|name| name == "main")
                && !table_name.eq_ignore_ascii_case("app_settings") =>
        {
            Authorization::Allow
        }
        AuthAction::Function { function_name }
            if ![
                "load_extension",
                "readfile",
                "writefile",
                "edit",
                "eval",
                "fts3_tokenizer",
            ]
            .iter()
            .any(|name| function_name.eq_ignore_ascii_case(name)) =>
        {
            Authorization::Allow
        }
        _ => Authorization::Deny,
    }))
    .map_err(query_error)?;
    let deadline = Instant::now() + QUERY_TIMEOUT;
    conn.progress_handler(1_000, Some(move || Instant::now() >= deadline))
        .map_err(query_error)?;
    Ok(conn)
}

fn query_error(error: rusqlite::Error) -> String {
    if error.sqlite_error_code() == Some(rusqlite::ErrorCode::OperationInterrupted) {
        "database query timed out".to_string()
    } else {
        format!("read-only database query failed: {error}")
    }
}

pub fn schema(path: &Path) -> Result<Value, String> {
    let conn = open_readonly(path)?;
    let mut stmt = conn.prepare("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").map_err(query_error)?;
    let tables = stmt.query_map([], |row| Ok(json!({
        "name": row.get::<_, String>(0)?, "type": row.get::<_, String>(1)?, "sql": row.get::<_, Option<String>>(2)?
    }))).map_err(query_error)?.collect::<Result<Vec<_>, _>>().map_err(query_error)?;
    Ok(
        json!({"database":"application", "readOnly":true, "tables":tables,
        "protectedTables":["app_settings"], "limits":{"maxRows":MAX_ROWS,"maxBytes":MAX_BYTES,"timeoutMs":QUERY_TIMEOUT.as_millis()}}),
    )
}

pub fn query(path: &Path, sql: &str, limit: Option<usize>) -> Result<Value, String> {
    let conn = open_readonly(path)?;
    let row_limit = limit.unwrap_or(100).clamp(1, MAX_ROWS);
    let mut stmt = conn.prepare(sql).map_err(query_error)?;
    if !stmt.readonly() || stmt.column_count() == 0 {
        return Err("database query must be a read-only statement returning columns".to_string());
    }
    let names = stmt
        .column_names()
        .iter()
        .map(|name| (*name).to_string())
        .collect::<Vec<_>>();
    let mut unique = std::collections::HashSet::new();
    if names.iter().any(|name| !unique.insert(name)) {
        return Err(
            "use unique column aliases so joined query results are unambiguous".to_string(),
        );
    }
    let mut rows = stmt.query([]).map_err(query_error)?;
    let mut result = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    while let Some(row) = rows.next().map_err(query_error)? {
        if result.len() >= row_limit {
            truncated = true;
            break;
        }
        let mut object = Map::new();
        for (index, name) in names.iter().enumerate() {
            let raw = row.get_ref(index).map_err(query_error)?;
            if let ValueRef::Text(text) = raw {
                if text.len() > MAX_BYTES.saturating_sub(bytes) {
                    truncated = true;
                    break;
                }
            }
            let value = match raw {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(value) => json!(value),
                ValueRef::Real(value) => json!(value),
                ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
                ValueRef::Blob(value) => json!({"blobBytes":value.len(),"contentOmitted":true}),
            };
            object.insert(name.clone(), value);
        }
        if truncated {
            break;
        }
        let value = Value::Object(object);
        bytes = bytes.saturating_add(value.to_string().len());
        if bytes > MAX_BYTES {
            truncated = true;
            break;
        }
        result.push(value);
    }
    Ok(
        json!({"columns":names,"rows":result,"limit":row_limit,"maxBytes":MAX_BYTES,
        "truncated":truncated,"returnedRows":result.len(),"continuation":"Use a deterministic ORDER BY and LIMIT/OFFSET or an ID boundary for additional rows."}),
    )
}

#[cfg(test)]
mod tests {
    use super::{query, schema};
    use rusqlite::Connection;
    use std::{
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };
    static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let sequence = NEXT_FIXTURE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "copicu-assistant-db-{}-{}-{sequence}.sqlite3",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("CREATE TABLE clipboard_items(id INTEGER PRIMARY KEY, text TEXT); INSERT INTO clipboard_items VALUES (1,'original'),(2,'second'); CREATE TABLE app_settings(key TEXT, value_json TEXT); INSERT INTO app_settings VALUES ('app', 'synthetic-secret');").unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[test]
    fn reads_ctes_joins_functions_and_keyword_literals() {
        let fixture = Fixture::new();
        let result = query(&fixture.0, "WITH x AS (SELECT id, lower(text) AS value FROM clipboard_items) SELECT x.value, replace('delete', 'delete', 'kept') AS literal FROM x JOIN clipboard_items AS i ON i.id=x.id WHERE x.value LIKE 'orig%'; -- trailing comment", None).unwrap();
        assert_eq!(
            result["rows"],
            serde_json::json!([{"value":"original","literal":"kept"}])
        );
        let metadata = schema(&fixture.0).unwrap();
        assert!(metadata["tables"]
            .as_array()
            .unwrap()
            .iter()
            .any(|table| table["name"] == "clipboard_items"));
        assert!(!metadata.to_string().contains("synthetic-secret"));
    }

    #[test]
    fn denies_mutation_external_access_and_credentials_without_modifying_data() {
        let fixture = Fixture::new();
        for sql in [
            "UPDATE clipboard_items SET text='changed' RETURNING id",
            "DELETE FROM clipboard_items RETURNING id",
            "ATTACH DATABASE ':memory:' AS other",
            "PRAGMA user_version=12",
            "PRAGMA table_info(app_settings)",
            "SELECT value_json FROM APP_SETTINGS",
            "SELECT * FROM pragma_table_info('app_settings')",
            "SELECT load_extension('missing')",
            "SELECT writefile('no-write', 'data')",
            "SELECT 1; DELETE FROM clipboard_items",
        ] {
            assert!(
                query(&fixture.0, sql, None).is_err(),
                "unexpectedly allowed {sql}"
            );
        }
        let conn = Connection::open(&fixture.0).unwrap();
        assert_eq!(
            conn.query_row("SELECT text FROM clipboard_items WHERE id=1", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "original"
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM clipboard_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn reports_truncation_and_supports_explicit_continuation() {
        let fixture = Fixture::new();
        let first = query(
            &fixture.0,
            "SELECT id,text FROM clipboard_items ORDER BY id",
            Some(1),
        )
        .unwrap();
        assert_eq!(first["truncated"], true);
        assert_eq!(first["rows"][0]["id"], 1);
        let next = query(
            &fixture.0,
            "SELECT id,text FROM clipboard_items WHERE id>1 ORDER BY id",
            Some(1),
        )
        .unwrap();
        assert_eq!(next["truncated"], false);
        assert_eq!(next["rows"][0]["id"], 2);
        let large = query(&fixture.0, "SELECT printf('%0600000d',1) AS large", None).unwrap();
        assert_eq!(large["truncated"], true);
        assert_eq!(large["returnedRows"], 0);
    }

    #[test]
    fn interrupts_unbounded_computation_and_rejects_ambiguous_columns() {
        let fixture = Fixture::new();
        let error = query(&fixture.0, "WITH RECURSIVE forever(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM forever) SELECT sum(value) FROM forever", None).unwrap_err();
        assert!(error.contains("timed out"), "{error}");
        assert!(query(
            &fixture.0,
            "SELECT a.id, b.id FROM clipboard_items a JOIN clipboard_items b",
            None
        )
        .unwrap_err()
        .contains("unique column aliases"));
    }
}
