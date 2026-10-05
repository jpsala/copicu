use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use super::{AppStorage, CaptureFolderFeedback, ItemBlobPaths};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFolderDestinationState {
    pub folder_id: Option<i64>,
    pub armed: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderSummary {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub path: String,
    pub direct_item_count: i64,
    pub descendant_folder_count: i64,
    pub subtree_item_count: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderDeletePreview {
    pub direct_item_count: i64,
    pub descendant_folder_count: i64,
    pub subtree_item_count: i64,
}

fn db(error: rusqlite::Error) -> String { format!("folder storage failed: {error}") }

fn folder_exists(conn: &Connection, id: i64) -> Result<(), String> {
    if id <= 0 || !conn.query_row("SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)", [id], |row| row.get::<_, bool>(0)).map_err(db)? {
        return Err(format!("folder not found: {id}"));
    }
    Ok(())
}

pub(super) fn validate_parent(conn: &Connection, parent_id: Option<i64>) -> Result<(), String> {
    if let Some(id) = parent_id { folder_exists(conn, id)?; }
    Ok(())
}

// A move must never silently merge independent metadata from two copies.
pub(super) fn validate_item_moves(conn: &Connection, item_ids: &[i64], folder: Option<i64>) -> Result<(), String> {
    let mut hashes = HashSet::new();
    for id in item_ids.iter().copied().collect::<HashSet<_>>() {
        let hash: Option<String> = conn.query_row("SELECT normalized_hash FROM clipboard_items WHERE id=?1", [id], |r| r.get(0)).optional().map_err(db)?;
        let Some(hash) = hash else { continue; };
        let collision: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM clipboard_items WHERE normalized_hash=?1 AND folder_id IS ?2 AND id!=?3)", params![hash, folder, id], |r| r.get(0)).map_err(db)?;
        if collision || !hashes.insert(hash) {
            return Err("This folder already contains the same content. No clips were moved. Use Copy to folder to keep the originals and reuse the destination copy.".into());
        }
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderCopyResult {
    pub created: usize,
    pub existing: usize,
    pub item_ids: Vec<i64>,
}

pub(super) fn folder_name(name: &str) -> Result<&str, String> {
    if name.chars().any(char::is_control) {
        return Err("folder name must be a non-empty path segment without slash or control characters".into());
    }
    let name = name.trim();
    if name.is_empty() || name.contains('/') {
        return Err("folder name must be a non-empty path segment without slash or control characters".into());
    }
    Ok(name)
}

pub(super) fn summaries(conn: &Connection) -> Result<Vec<FolderSummary>, String> {
    let mut statement = conn.prepare("SELECT f.id, f.parent_id, f.name, COUNT(i.id) FROM folders f LEFT JOIN clipboard_items i ON i.folder_id = f.id GROUP BY f.id ORDER BY f.id").map_err(db)?;
    let rows = statement.query_map([], |row| Ok(FolderSummary {
        id: row.get(0)?, parent_id: row.get(1)?, name: row.get(2)?, path: String::new(),
        direct_item_count: row.get(3)?, descendant_folder_count: 0, subtree_item_count: 0,
    })).map_err(db)?;
    let mut folders = rows.collect::<Result<Vec<_>, _>>().map_err(db)?;
    let indices: HashMap<_, _> = folders.iter().enumerate().map(|(index, folder)| (folder.id, index)).collect();
    // A validated tree is acyclic, so parents precede children in this traversal.
    fn derive(index: usize, folders: &mut [FolderSummary], indices: &HashMap<i64, usize>, visiting: &mut HashSet<i64>) -> Result<(), String> {
        if !folders[index].path.is_empty() { return Ok(()); }
        let id = folders[index].id;
        if !visiting.insert(id) { return Err("folder ancestry cycle".into()); }
        let path = if let Some(parent_id) = folders[index].parent_id {
            let parent = *indices.get(&parent_id).ok_or("folder parent not found")?;
            derive(parent, folders, indices, visiting)?;
            format!("{}/{}", folders[parent].path, folders[index].name)
        } else { folders[index].name.clone() };
        folders[index].path = path;
        visiting.remove(&id);
        Ok(())
    }
    for index in 0..folders.len() { derive(index, &mut folders, &indices, &mut HashSet::new())?; }
    for index in 0..folders.len() {
        let count = folders[index].direct_item_count;
        folders[index].subtree_item_count += count;
        let mut parent = folders[index].parent_id;
        while let Some(id) = parent {
            let ancestor = *indices.get(&id).ok_or("folder parent not found")?;
            folders[ancestor].descendant_folder_count += 1;
            folders[ancestor].subtree_item_count += count;
            parent = folders[ancestor].parent_id;
        }
    }
    folders.sort_by(|left, right| left.path.cmp(&right.path).then(left.id.cmp(&right.id)));
    Ok(folders)
}

fn subtree_ids(conn: &Connection, id: i64) -> Result<Vec<i64>, String> {
    folder_exists(conn, id)?;
    let mut statement = conn.prepare("WITH RECURSIVE descendants(id) AS (SELECT id FROM folders WHERE id = ?1 UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id) SELECT id FROM descendants").map_err(db)?;
    let rows = statement.query_map([id], |row| row.get(0)).map_err(db)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db)
}

fn preview(conn: &Connection, id: i64) -> Result<FolderDeletePreview, String> {
    folder_exists(conn, id)?;
    conn.query_row("WITH RECURSIVE descendants(id) AS (SELECT id FROM folders WHERE id = ?1 UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id) SELECT (SELECT COUNT(*) FROM clipboard_items WHERE folder_id = ?1), (SELECT COUNT(*) - 1 FROM descendants), (SELECT COUNT(*) FROM clipboard_items WHERE folder_id IN (SELECT id FROM descendants))", [id], |row| Ok(FolderDeletePreview { direct_item_count: row.get(0)?, descendant_folder_count: row.get(1)?, subtree_item_count: row.get(2)? })).map_err(db)
}

pub(super) fn folder_dedupe_mismatch(conn: &Connection, item_id: Option<i64>, target_folder_id: Option<i64>) -> Result<Option<CaptureFolderFeedback>, String> {
    let Some(item_id) = item_id else { return Ok(None); };
    let existing_folder_id: Option<i64> = conn.query_row("SELECT folder_id FROM clipboard_items WHERE id = ?1", [item_id], |row| row.get(0)).map_err(db)?;
    Ok((existing_folder_id != target_folder_id).then_some(CaptureFolderFeedback { item_id, target_folder_id, existing_folder_id }))
}

impl AppStorage {
    pub fn list_folders(&self) -> Result<Vec<FolderSummary>, String> {
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        summaries(&conn)
    }
    pub fn root_item_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        conn.query_row("SELECT COUNT(*) FROM clipboard_items WHERE folder_id IS NULL", [], |row| row.get(0)).map_err(db)
    }

    pub fn create_folder(&self, parent_id: Option<i64>, name: &str) -> Result<FolderSummary, String> {
        let name = folder_name(name)?;
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        validate_parent(&conn, parent_id)?;
        conn.execute("INSERT INTO folders(parent_id, name) VALUES (?1, ?2)", params![parent_id, name]).map_err(db)?;
        let id = conn.last_insert_rowid();
        let folder = summaries(&conn)?.into_iter().find(|folder| folder.id == id).ok_or("new folder not found")?;
        self.bump_mutation_epoch();
        Ok(folder)
    }

    pub fn rename_folder(&self, id: i64, name: &str) -> Result<FolderSummary, String> {
        let name = folder_name(name)?;
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        folder_exists(&conn, id)?;
        conn.execute("UPDATE folders SET name = ?1 WHERE id = ?2", params![name, id]).map_err(db)?;
        let folder = summaries(&conn)?.into_iter().find(|folder| folder.id == id).ok_or("folder not found")?;
        self.bump_mutation_epoch();
        Ok(folder)
    }

    pub fn move_folder(&self, id: i64, parent_id: Option<i64>) -> Result<FolderSummary, String> {
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        validate_parent(&conn, parent_id)?;
        folder_exists(&conn, id)?;
        if let Some(parent) = parent_id {
            if subtree_ids(&conn, id)?.contains(&parent) { return Err("cannot move a folder inside its subtree".into()); }
        }
        conn.execute("UPDATE folders SET parent_id = ?1 WHERE id = ?2", params![parent_id, id]).map_err(db)?;
        let folder = summaries(&conn)?.into_iter().find(|folder| folder.id == id).ok_or("folder not found")?;
        self.bump_mutation_epoch();
        Ok(folder)
    }

    pub fn folder_delete_preview(&self, id: i64) -> Result<FolderDeletePreview, String> {
        let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        preview(&conn, id)
    }

    pub fn delete_folder(&self, id: i64, delete_clips: bool, delete_descendants: bool) -> Result<FolderDeletePreview, String> {
        let mut conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        let tx = conn.transaction().map_err(db)?;
        let affected = preview(&tx, id)?;
        let parent_id: Option<i64> = tx.query_row("SELECT parent_id FROM folders WHERE id = ?1", [id], |row| row.get(0)).map_err(db)?;
        let ids = if delete_descendants { subtree_ids(&tx, id)? } else { vec![id] };
        let disarm_destination = self.capture_folder_destination()?.is_some_and(|destination| ids.contains(&destination));
        let placeholders = vec!["?"; ids.len()].join(",");
        let mut blobs = Vec::new();
        if delete_clips {
            let mut statement = tx.prepare(&format!("SELECT blob_path, thumbnail_path FROM clipboard_items WHERE folder_id IN ({placeholders}) AND (blob_path IS NOT NULL OR thumbnail_path IS NOT NULL)")).map_err(db)?;
            blobs = statement.query_map(params_from_iter(&ids), |row| Ok(ItemBlobPaths { blob_path: row.get(0)?, thumbnail_path: row.get(1)? })).map_err(db)?.collect::<Result<Vec<_>, _>>().map_err(db)?;
            drop(statement);
            tx.execute(&format!("DELETE FROM clipboard_items WHERE folder_id IN ({placeholders})"), params_from_iter(&ids)).map_err(db)?;
        } else {
            let mut statement = tx.prepare(&format!("SELECT id FROM clipboard_items WHERE folder_id IN ({placeholders})")).map_err(db)?;
            let moved = statement.query_map(params_from_iter(&ids), |r| r.get(0)).map_err(db)?.collect::<Result<Vec<i64>, _>>().map_err(db)?;
            drop(statement);
            validate_item_moves(&tx, &moved, None)?;
            tx.execute(&format!("UPDATE clipboard_items SET folder_id = NULL WHERE folder_id IN ({placeholders})"), params_from_iter(&ids)).map_err(db)?;
        }
        if !delete_descendants {
            tx.execute("UPDATE folders SET parent_id = ?1 WHERE parent_id = ?2", params![parent_id, id]).map_err(db)?;
        }
        // Children are deleted before parents; no subtree is flattened by a cascade.
        for folder_id in ids.into_iter().rev() {
            tx.execute("DELETE FROM folders WHERE id = ?1", [folder_id]).map_err(db)?;
        }
        // Retained clips become eligible at the next ordinary retention pass.
        tx.commit().map_err(db)?;
        if disarm_destination { self.set_capture_folder_destination(None, false)?; }
        drop(conn);
        self.bump_mutation_epoch();
        self.remove_blob_paths(blobs);
        Ok(affected)
    }

    pub fn move_history_items_to_folder(&self, item_ids: Vec<i64>, folder_id: Option<i64>) -> Result<usize, String> {
        let mut conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        let tx = conn.transaction().map_err(db)?;
        validate_parent(&tx, folder_id)?;
        validate_item_moves(&tx, &item_ids, folder_id)?;
        let mut changed = 0;
        let mut moved_items = Vec::new();
        for id in item_ids.into_iter().collect::<HashSet<_>>() {
            let moved = tx.execute("UPDATE clipboard_items SET folder_id = ?1 WHERE id = ?2 AND folder_id IS NOT ?1", params![folder_id, id]).map_err(db)?;
            changed += moved;
            if moved > 0 { moved_items.push(id); }
        }
        tx.commit().map_err(db)?;
        drop(conn);
        for item_id in moved_items { self.notify_shared_folder_ingress(item_id, false); }
        if changed > 0 { self.bump_mutation_epoch(); }
        Ok(changed)
    }

    pub fn get_capture_folder_destination(&self) -> Result<Option<i64>, String> { self.capture_folder_destination() }

    pub fn copy_history_items_to_folder(&self, item_ids: Vec<i64>, folder_id: Option<i64>, folder_path: Option<&str>) -> Result<FolderCopyResult, String> {
        let item_ids = super::normalize_metadata_selection_ids(&item_ids)?;
        let mut conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
        let tx = conn.transaction().map_err(db)?;
        let folder = match folder_path {
            Some(path) => Some(super::resolve_folder_path_from_conn(&tx, path)?),
            None => { validate_parent(&tx, folder_id)?; folder_id },
        };
        let now = super::now_unix_ms();
        let mut result = FolderCopyResult { created: 0, existing: 0, item_ids: vec![] };
        let mut created_ids = vec![];
        let has_provenance: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='shared_remote_items')", [], |r| r.get(0)).map_err(db)?;
        for source in item_ids {
            super::ensure_item_exists(&tx, source)?;
            let existing: Option<i64> = tx.query_row("SELECT id FROM clipboard_items WHERE folder_id IS ?1 AND normalized_hash=(SELECT normalized_hash FROM clipboard_items WHERE id=?2)", params![folder, source], |r| r.get(0)).optional().map_err(db)?;
            let item = if let Some(item) = existing {
                result.existing += 1;
                item
            } else {
                tx.execute("INSERT INTO clipboard_items(content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms,copy_count,mime_primary,blob_path,thumbnail_path,byte_size,width,height,title,notes,tags,is_marked,marked_at_unix_ms,is_inbox,inbox_at_unix_ms,folder_id)
                    SELECT content_kind,text,normalized_hash,?1,?1,NULL,0,mime_primary,blob_path,thumbnail_path,byte_size,width,height,title,notes,tags,is_marked,marked_at_unix_ms,is_inbox,inbox_at_unix_ms,?2 FROM clipboard_items WHERE id=?3", params![now,folder,source]).map_err(db)?;
                let item = tx.last_insert_rowid();
                tx.execute("INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms,source,confidence) SELECT ?1,tag_id,?2,source,confidence FROM clipboard_item_tags WHERE item_id=?3", params![item,now,source]).map_err(db)?;
                tx.execute("INSERT INTO clipboard_item_tag_suppressions(item_id,value,normalized_value,created_at_unix_ms) SELECT ?1,value,normalized_value,?2 FROM clipboard_item_tag_suppressions WHERE item_id=?3", params![item,now,source]).map_err(db)?;
                if has_provenance {
                    tx.execute("INSERT OR IGNORE INTO shared_remote_items(item_id) SELECT ?1 WHERE EXISTS(SELECT 1 FROM shared_remote_items WHERE item_id=?2) OR EXISTS(SELECT 1 FROM shared_remote_provenance WHERE item_id=?2 OR hash=(SELECT normalized_hash FROM clipboard_items WHERE id=?2))", params![item,source]).map_err(db)?;
                }
                result.created += 1;
                created_ids.push(item);
                item
            };
            if !result.item_ids.contains(&item) { result.item_ids.push(item); }
        }
        let prune = if result.created > 0 { Some(super::prune_history_from_conn(&tx)?) } else { None };
        tx.commit().map_err(db)?;
        drop(conn);
        if result.created > 0 { self.bump_mutation_epoch(); }
        if let Some(prune) = prune { self.remove_blob_paths(prune.blob_paths); }
        for item in created_ids { self.notify_shared_folder_ingress(item, true); }
        Ok(result)
    }

    pub fn get_capture_folder_destination_state(&self) -> Result<CaptureFolderDestinationState, String> {
        let state = self.capture_folder_destination.lock().map_err(|_| "capture destination mutex poisoned")?;
        Ok(CaptureFolderDestinationState { folder_id: (*state).flatten(), armed: state.is_some() })
    }

    pub(super) fn capture_folder_destination(&self) -> Result<Option<i64>, String> {
        self.capture_folder_destination.lock().map(|destination| (*destination).flatten()).map_err(|_| "capture destination mutex poisoned".into())
    }

    pub fn set_capture_folder_destination(&self, folder_id: Option<i64>, armed: bool) -> Result<Option<i64>, String> {
        if armed {
            if let Some(id) = folder_id {
                let conn = self.conn.lock().map_err(|_| "sqlite connection mutex poisoned")?;
                folder_exists(&conn, id)?;
                *self.capture_folder_destination.lock().map_err(|_| "capture destination mutex poisoned")? = Some(Some(id));
                return Ok(Some(id));
            }
        }
        *self.capture_folder_destination.lock().map_err(|_| "capture destination mutex poisoned")? = armed.then_some(None);
        Ok(None)
    }
    pub(super) fn record_capture_folder_feedback(&self, feedback: Option<CaptureFolderFeedback>) {
        if let Some(feedback) = feedback {
            if let Ok(mut queue) = self.capture_folder_feedback.lock() {
                if queue.len() >= 32 { queue.remove(0); }
                queue.push(feedback);
            }
        }
    }

    pub fn latest_capture_folder_feedback(&self, item_id: i64) -> Option<CaptureFolderFeedback> {
        self.capture_folder_feedback.lock().ok()?.iter().rev().find(|feedback| feedback.item_id == item_id).cloned()
    }

    pub fn consume_capture_folder_feedback(&self) -> Vec<CaptureFolderFeedback> {
        self.capture_folder_feedback.lock().map(|mut queue| std::mem::take(&mut *queue)).unwrap_or_default()
    }
}

#[cfg(test)]
#[path = "folders_tests.rs"]
mod tests;
