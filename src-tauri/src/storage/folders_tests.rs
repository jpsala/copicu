use super::*;
use crate::storage::{AppliedSearchDescriptor, AppliedSearchMode, HistoryPageRequest, MIGRATIONS, MIGRATIONS_SLICE};
use rusqlite_migration::Migrations;
use std::sync::atomic::{AtomicU64, Ordering};

fn storage() -> AppStorage {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!("copicu-folder-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    AppStorage::open(&dir).unwrap()
}

#[test]
fn migration_preserves_legacy_clip_and_tag_in_root() {
    let storage = storage();
    let path = storage.db_path().to_path_buf();
    drop(storage);
    std::fs::remove_file(&path).unwrap();
    let mut conn = Connection::open(&path).unwrap();
    Migrations::from_slice(&MIGRATIONS_SLICE[..MIGRATIONS_SLICE.len() - 2]).to_latest(&mut conn).unwrap();
    conn.execute("INSERT INTO clipboard_items(content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms) VALUES ('text','legacy','legacy-folder-hash',1,1)", []).unwrap();
    let id = conn.last_insert_rowid();
    conn.execute("INSERT INTO tags(slug,label,created_at_unix_ms,updated_at_unix_ms) VALUES ('legacy/tag','Legacy/Tag',1,1)", []).unwrap();
    let tag = conn.last_insert_rowid();
    conn.execute("INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms,source) VALUES (?1,?2,1,'manual')", params![id, tag]).unwrap();
    MIGRATIONS.to_latest(&mut conn).unwrap();
    assert_eq!(conn.query_row("SELECT folder_id FROM clipboard_items WHERE id = ?1", [id], |row| row.get::<_, Option<i64>>(0)).unwrap(), None);
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM clipboard_item_tags WHERE item_id = ?1", [id], |row| row.get::<_, i64>(0)).unwrap(), 1);
}

#[test]
fn siblings_cycles_paths_and_session_destination() {
    let storage = storage();
    let parent = storage.create_folder(None, "Work").unwrap();
    assert!(storage.create_folder(None, "work").is_err());
    assert!(storage.create_folder(None, "bad/name").is_err());
    let child = storage.create_folder(Some(parent.id), "Projects").unwrap();
    assert_eq!(child.path, "Work/Projects");
    assert!(storage.move_folder(parent.id, Some(child.id)).is_err());
    assert!(storage.move_folder(parent.id, Some(parent.id)).is_err());
    storage.rename_folder(parent.id, "Office").unwrap();
    assert_eq!(storage.list_folders().unwrap().into_iter().find(|folder| folder.id == child.id).unwrap().path, "Office/Projects");
    let clone = storage.clone();
    assert!(!clone.get_capture_folder_destination_state().unwrap().armed);
    storage.set_capture_folder_destination(None, true).unwrap();
    assert_eq!(clone.get_capture_folder_destination_state().unwrap(), CaptureFolderDestinationState { folder_id: None, armed: true });
    storage.set_capture_folder_destination(Some(child.id), true).unwrap();
    assert_eq!(clone.get_capture_folder_destination().unwrap(), Some(child.id));
    storage.set_capture_folder_destination(None, false).unwrap();
    assert!(!clone.get_capture_folder_destination_state().unwrap().armed);
}

#[test]
fn folder_copy_preserves_original_and_edits_and_tags_are_independent() {
    let s = storage();
    let folder = s.create_folder(None, "Copies").unwrap();
    let source = s.create_text_item(crate::storage::CreateHistoryItemRequest {
        text: "synthetic original".into(), title: Some("Local title".into()), notes: Some("Local notes".into()),
        tags: vec!["original".into()], mime_primary: None, folder: None,
    }).unwrap().id;
    let result = s.copy_history_items_to_folder(vec![source], Some(folder.id), None).unwrap();
    assert_eq!((result.created,result.existing), (1,0));
    let copy = result.item_ids[0];
    assert_ne!(copy,source);
    assert_eq!(s.get_item(source).unwrap().folder_id,None);
    assert_eq!(s.get_item(copy).unwrap().folder_id,Some(folder.id));
    assert_eq!(s.get_item(copy).unwrap().title.as_deref(),Some("Local title"));
    assert_eq!(s.get_item(copy).unwrap().notes.as_deref(),Some("Local notes"));
    assert_eq!(s.get_item(copy).unwrap().copy_count,0);
    assert_eq!(s.get_item_tags(copy).unwrap(),vec!["original"]);
    s.set_item_tags(crate::storage::SetItemTagsRequest{item_id:copy,tags:vec!["changed".into()]}).unwrap();
    assert_eq!(s.get_item_tags(source).unwrap(),vec!["original"]);
    let again = s.copy_history_items_to_folder(vec![source],Some(folder.id),None).unwrap();
    assert_eq!((again.created,again.existing),(0,1));
    assert_eq!(s.get_item_tags(copy).unwrap(),vec!["changed"]);
    s.update_item_text(copy,"edited copy".into()).unwrap();
    assert_eq!(s.get_item(source).unwrap().text,"synthetic original");
    // Matching content in another folder does not prevent editing this copy.
    s.update_item_text(copy,"synthetic original".into()).unwrap();
    s.delete_item(source).unwrap();
    assert_eq!(s.get_item(copy).unwrap().text,"synthetic original");
}

#[test]
fn folder_move_collisions_and_failed_copy_are_atomic() {
    let s=storage();
    let folder=s.create_folder(None,"Destination").unwrap();
    let original=s.insert_text("same","same-hash").unwrap();
    let other=s.insert_text("other","other-hash").unwrap();
    let duplicate=s.copy_history_items_to_folder(vec![original],Some(folder.id),None).unwrap().item_ids[0];
    assert!(s.move_history_items_to_folder(vec![other,original],Some(folder.id)).unwrap_err().contains("No clips were moved"));
    assert_eq!(s.get_item(other).unwrap().folder_id,None);
    assert_eq!(s.get_item(original).unwrap().folder_id,None);
    assert!(s.delete_folder(folder.id,false,false).is_err());
    assert_eq!(s.get_item(duplicate).unwrap().folder_id,Some(folder.id));
    assert!(s.copy_history_items_to_folder(vec![original,999999],None,Some("/Must rollback")).is_err());
    assert!(!s.list_folders().unwrap().iter().any(|f| f.name=="Must rollback"));
    s.move_history_items_to_folder(vec![other],Some(folder.id)).unwrap();
    assert_eq!(s.get_item(other).unwrap().folder_id,Some(folder.id));
}

#[test]
fn folder_dedupe_migration_preserves_ids_metadata_and_database_constraints() {
    let mut conn=Connection::open_in_memory().unwrap();
    Migrations::from_slice(&MIGRATIONS_SLICE[..MIGRATIONS_SLICE.len()-1]).to_latest(&mut conn).unwrap();
    conn.execute("INSERT INTO folders(id,name) VALUES(7,'Original')",[]).unwrap();
    conn.execute("INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,folder_id,title,notes) VALUES(42,'text','synthetic','hash',1,2,7,'title','notes')",[]).unwrap();
    MIGRATIONS.to_latest(&mut conn).unwrap();
    let before:(i64,Option<String>,Option<String>,i64)=conn.query_row("SELECT id,title,notes,folder_id FROM clipboard_items WHERE id=42",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
    assert_eq!(before,(42,Some("title".into()),Some("notes".into()),7));
    let insert="INSERT INTO clipboard_items(content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,folder_id) VALUES('text','synthetic','hash',3,3,?1)";
    assert!(conn.execute(insert,[Some(7)]).is_err());
    conn.execute(insert,[None::<i64>]).unwrap();
    assert!(conn.execute(insert,[None::<i64>]).is_err());
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM clipboard_items",[],|r|r.get::<_,i64>(0)).unwrap(),2);
}

#[test]
fn four_deletion_modes_have_exact_counts_and_preserve_subtree_shape() {
    for delete_clips in [false, true] {
        for delete_descendants in [false, true] {
            let storage = storage();
            let parent = storage.create_folder(None, "Parent").unwrap();
            let child = storage.create_folder(Some(parent.id), "Child").unwrap();
            let grandchild = storage.create_folder(Some(child.id), "Grandchild").unwrap();
            storage.set_capture_folder_destination(Some(parent.id), true).unwrap();
            let direct = storage.insert_text("direct", "direct-folder-hash").unwrap();
            storage.set_capture_folder_destination(Some(child.id), true).unwrap();
            let nested = storage.insert_text("nested", "nested-folder-hash").unwrap();
            storage.set_capture_folder_destination(Some(grandchild.id), true).unwrap();
            let deep = storage.insert_text("deep", "deep-folder-hash").unwrap();
            let expected = FolderDeletePreview { direct_item_count: 1, descendant_folder_count: 2, subtree_item_count: 3 };
            assert_eq!(storage.folder_delete_preview(parent.id).unwrap(), expected);
            assert_eq!(storage.get_item(direct).unwrap().folder_id, Some(parent.id));
            assert_eq!(storage.delete_folder(parent.id, delete_clips, delete_descendants).unwrap(), expected);
            let folders = storage.list_folders().unwrap();
            assert_eq!(folders.len(), if delete_descendants { 0 } else { 2 });
            assert_eq!(storage.get_capture_folder_destination().unwrap(), if delete_descendants { None } else { Some(grandchild.id) });
            if delete_clips { assert!(storage.get_item(direct).is_err()); }
            else { assert_eq!(storage.get_item(direct).unwrap().folder_id, None); }
            for id in [nested, deep] {
                if delete_clips && delete_descendants { assert!(storage.get_item(id).is_err()); }
                else { assert_eq!(storage.get_item(id).unwrap().folder_id, if delete_descendants { None } else { Some(if id == nested { child.id } else { grandchild.id }) }); }
            }
            if !delete_descendants {
                assert_eq!(folders.iter().find(|folder| folder.id == child.id).unwrap().parent_id, None);
                assert_eq!(folders.iter().find(|folder| folder.id == grandchild.id).unwrap().parent_id, Some(child.id));
            }
        }
    }
}

#[test]
fn capture_dedupes_per_folder_and_scoped_pages_and_find_follow_folder_identity() {
    let storage = storage();
    let folder = storage.create_folder(None, "Work").unwrap();
    let child = storage.create_folder(Some(folder.id), "Client").unwrap();
    storage.set_capture_folder_destination(Some(child.id), true).unwrap();
    let first = storage.insert_text("alpha", "alpha-folder-hash").unwrap();
    let second = storage.insert_text("beta", "beta-folder-hash").unwrap();
    storage.set_capture_folder_destination(None, false).unwrap();
    let root_copy = storage.insert_text("alpha", "alpha-folder-hash").unwrap();
    assert_ne!(root_copy, first);
    assert_eq!(storage.insert_text("alpha", "alpha-folder-hash").unwrap(), root_copy);
    assert!(storage.consume_capture_folder_feedback().is_empty());
    assert_eq!(storage.get_item(first).unwrap().folder_id, Some(child.id));
    let root = storage.insert_text("root", "root-folder-hash").unwrap();
    assert_eq!(storage.root_item_count().unwrap(), 2);
    assert_eq!(storage.move_history_items_to_folder(vec![root, root], Some(folder.id)).unwrap(), 1);
    assert_eq!(storage.root_item_count().unwrap(), 1);
    let query = format!("folder-id:{}", child.id);
    let page = storage.list_page(HistoryPageRequest { query: query.clone(), cursor: None, limit: Some(1) }).unwrap();
    assert_eq!(page.total_count, Some(2));
    assert_eq!(page.items.len(), 1);
    let next = storage.list_page(HistoryPageRequest { query: query.clone(), cursor: page.next_cursor, limit: Some(1) }).unwrap();
    assert_eq!(next.items.len(), 1);
    assert_ne!(page.items[0].id, next.items[0].id);
    assert_eq!([page.items[0].id, next.items[0].id].into_iter().collect::<HashSet<_>>(), HashSet::from([first, second]));
    assert!(storage.list_page(HistoryPageRequest { query: format!("folder:\"{}\"", child.path), cursor: None, limit: Some(10) }).unwrap().items.iter().any(|item| item.id == first));
    assert_eq!(storage.list_page(HistoryPageRequest { query: "folder:/".into(), cursor: None, limit: None }).unwrap().total_count, Some(1));
    let descriptor = AppliedSearchDescriptor::for_query("", query, AppliedSearchMode::Structured).unwrap();
    assert_eq!(storage.read_find_items(&descriptor).unwrap().iter().map(|item| item.id).collect::<HashSet<_>>(), HashSet::from([first, second]));
}

#[test]
fn image_copies_share_blobs_until_the_last_copy_is_deleted() {
    let storage = storage();
    let folder = storage.create_folder(None, "Images").unwrap();
    let image = crate::image_capture::CapturedImage { width: 1, height: 1, png_bytes: vec![1, 2, 3], thumbnail_png_bytes: vec![4, 5], normalized_hash: "folder-image-hash".into() };
    storage.set_capture_folder_destination(Some(folder.id), true).unwrap();
    let id = storage.insert_image(&image).unwrap();
    let blob = storage.resolve_relative_blob_path(storage.get_item(id).unwrap().blob_path.as_deref().unwrap()).unwrap();
    storage.set_capture_folder_destination(None, false).unwrap();
    let root_copy = storage.insert_image(&image).unwrap();
    assert_ne!(root_copy, id);
    assert_eq!(storage.insert_image(&image).unwrap(), root_copy);
    assert!(storage.consume_capture_folder_feedback().is_empty());
    assert_eq!(storage.get_item(id).unwrap().folder_id, Some(folder.id));
    assert!(blob.exists());
    storage.delete_folder(folder.id, true, true).unwrap();
    assert!(storage.get_item(id).is_err());
    assert!(blob.exists());
    storage.delete_item(root_copy).unwrap();
    assert!(!blob.exists());
}

#[test]
fn manual_creation_makes_independent_copies_in_different_destinations() {
    let storage = storage();
    let folder = storage.create_folder(None, "Manual").unwrap();
    let request = || crate::storage::CreateHistoryItemRequest {
        folder: None,
        text: "manual clip".into(), title: None, notes: None, tags: vec!["Scenario/Tag".into()], mime_primary: None,
    };
    storage.set_capture_folder_destination(Some(folder.id), true).unwrap();
    let first = storage.create_text_item(request()).unwrap();
    assert!(first.created);
    storage.set_capture_folder_destination(None, false).unwrap();
    let duplicate = storage.create_text_item(request()).unwrap();
    assert_ne!(duplicate.id, first.id);
    assert!(duplicate.created);
    assert_eq!(storage.create_text_item(request()).unwrap().id, duplicate.id);
    assert_eq!(storage.get_item(first.id).unwrap().folder_id, Some(folder.id));
    assert!(storage.consume_capture_folder_feedback().is_empty());
}

#[test]
fn reception_activity_changes_default_order_without_changing_explicit_sort_fields() {
    let storage = storage();
    let first = storage.insert_text("synthetic earlier", "earlier").unwrap();
    let second = storage.insert_text("synthetic later", "later").unwrap();
    {
        let conn = storage.conn.lock().unwrap();
        conn.execute("UPDATE clipboard_items SET created_at_unix_ms=10,last_copied_at_unix_ms=10,last_received_at_unix_ms=30 WHERE id=?1", [first]).unwrap();
        conn.execute("UPDATE clipboard_items SET created_at_unix_ms=20,last_copied_at_unix_ms=20 WHERE id=?1", [second]).unwrap();
    }
    assert_eq!(storage.list_page(HistoryPageRequest { query: "".into(), cursor: None, limit: None }).unwrap().items[0].id, first);
    for field in ["created", "lastCopied"] {
        let request = serde_json::from_value(serde_json::json!({"query":"","plan":{"schemaVersion":1,"sort":[{"field":field,"direction":"desc"}]}})).unwrap();
        assert_eq!(storage.history_search(request).unwrap().items[0].id, second);
    }
}

#[test]
fn retention_protects_folder_then_prunes_root_after_move() {
    let storage = storage();
    let folder = storage.create_folder(None, "Keep").unwrap();
    storage.set_capture_folder_destination(Some(folder.id), true).unwrap();
    let protected = storage.insert_text("protected", "folder-protected-hash").unwrap();
    storage.set_capture_folder_destination(None, false).unwrap();
    let mut settings = storage.get_settings().unwrap();
    settings.history.retention_count = 100;
    storage.update_settings(settings).unwrap();
    for n in 0..101 { storage.insert_text(&format!("root-{n}"), &format!("root-hash-{n}")).unwrap(); }
    assert_eq!(storage.get_item(protected).unwrap().folder_id, Some(folder.id));
    storage.move_history_items_to_folder(vec![protected], None).unwrap();
    storage.insert_text("trigger", "folder-trigger-hash").unwrap();
    assert!(storage.get_item(protected).is_err());
}
