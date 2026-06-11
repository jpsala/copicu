use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

pub(super) const IMAGE_BLOB_DIR: &str = "blobs/images";
pub(super) const THUMBNAIL_BLOB_DIR: &str = "blobs/thumbnails";

pub(super) fn relative_blob_path(kind_dir: &str, hash: &str) -> PathBuf {
    Path::new(kind_dir).join(format!("{hash}.png"))
}

pub(super) fn path_to_db_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(super) fn write_blob(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create blob dir {}: {error}", parent.display()))?;
    }

    std::fs::write(path, bytes)
        .map_err(|error| format!("failed to write blob {}: {error}", path.display()))
}

pub(super) fn resolve_relative_blob_path(
    app_data_dir: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!("invalid blob path: {relative_path}"));
    }

    Ok(app_data_dir.join(relative))
}

pub(super) fn blob_path_is_referenced(
    conn: &Connection,
    relative_path: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1
            FROM clipboard_items
            WHERE blob_path = ?1 OR thumbnail_path = ?1
            LIMIT 1
        )",
        params![relative_path],
        |row| row.get::<_, i64>(0),
    )
    .map(|exists| exists != 0)
    .map_err(|error| format!("failed to check blob references: {error}"))
}
