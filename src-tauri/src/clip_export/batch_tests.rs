use super::*;
use std::io::Read;
fn fixture() -> (PathBuf, PathBuf, AppStorage) {
    let root = std::env::temp_dir().join(format!(
        "copicu-batch-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&root).unwrap();
    let output = root.join("output");
    fs::create_dir(&output).unwrap();
    let storage = AppStorage::open(&root.join("profile")).unwrap();
    (root, output, storage)
}
#[test]
fn compressed_zip_has_exact_bytes_safe_names_and_no_clip_mutations() {
    let (root, output, storage) = fixture();
    let text = "synthetic repeated text café\n".repeat(2000);
    let id = storage.insert_text(&text, "zip-text").unwrap();
    let image = crate::image_capture::synthetic_image(2, 2);
    let image_id = storage.insert_image(&image).unwrap();
    let before = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
    let state = ExportState::default();
    let token = state
        .begin(
            &storage,
            output.to_str().unwrap(),
            vec![id, image_id],
            true,
            false,
        )
        .unwrap();
    assert_eq!(state.next(&storage, &token).unwrap().status, "prepared");
    assert_eq!(state.next(&storage, &token).unwrap().status, "prepared");
    assert!(storage.last_export_folder().unwrap().is_none());
    assert!(!fs::read_dir(&output).unwrap().any(|e| e
        .unwrap()
        .path()
        .extension()
        .is_some_and(|ext| ext == "zip")));
    let finished = state.finish(&storage, &token, true).unwrap();
    assert!(finished.published);
    let archive_path = output.join(finished.archive.unwrap());
    assert!(fs::metadata(&archive_path).unwrap().len() < text.len() as u64);
    let mut zip = zip::ZipArchive::new(File::open(archive_path).unwrap()).unwrap();
    assert_eq!(zip.len(), 2);
    for (index, expected) in [text.as_bytes(), image.png_bytes.as_slice()]
        .into_iter()
        .enumerate()
    {
        let mut entry = zip.by_index(index).unwrap();
        assert!(entry.name().starts_with(&format!("{:04}-", index + 1)));
        assert!(!entry.name().contains(['/', '\\']));
        assert_eq!(entry.compression(), CompressionMethod::Deflated);
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, expected);
    }
    drop(zip);
    assert!(storage.last_export_folder().unwrap().is_some());
    assert_eq!(
        before,
        serde_json::to_value(storage.get_item(id).unwrap()).unwrap()
    );
    assert_eq!(fs::read_dir(&output).unwrap().count(), 1);
    drop(state);
    drop(storage);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn cancellation_and_broken_zip_publish_nothing_and_clean_own_temp() {
    let (root, output, storage) = fixture();
    let id = storage.insert_text("synthetic", "cancel-text").unwrap();
    for poison in [false, true] {
        let state = ExportState::default();
        let token = state
            .begin(&storage, output.to_str().unwrap(), vec![id], true, false)
            .unwrap();
        assert_eq!(state.next(&storage, &token).unwrap().status, "prepared");
        if poison {
            state.0.lock().unwrap().as_mut().unwrap().poisoned = true;
            assert!(state.finish(&storage, &token, true).is_err());
        } else {
            assert!(!state.finish(&storage, &token, false).unwrap().published);
        }
        assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
        assert!(storage.last_export_folder().unwrap().is_none());
    }
    drop(storage);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn missing_items_are_individual_and_empty_packages_are_not_published() {
    let (root, output, storage) = fixture();
    let state = ExportState::default();
    assert!(state
        .begin(&storage, output.to_str().unwrap(), vec![], true, false)
        .is_err());
    let token = state
        .begin(
            &storage,
            output.to_str().unwrap(),
            vec![999999],
            true,
            false,
        )
        .unwrap();
    assert_eq!(state.next(&storage, &token).unwrap().status, "failed");
    assert!(!state.finish(&storage, &token, true).unwrap().published);
    assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
    let id = storage
        .insert_text("selected synthetic", "selected-synthetic")
        .unwrap();
    assert!(state
        .begin(
            &storage,
            output.to_str().unwrap(),
            vec![id, id],
            false,
            false
        )
        .is_err());
    let token = state
        .begin(
            &storage,
            output.to_str().unwrap(),
            vec![id, 999999],
            true,
            false,
        )
        .unwrap();
    assert_eq!(state.next(&storage, &token).unwrap().status, "prepared");
    assert_eq!(state.next(&storage, &token).unwrap().status, "failed");
    let finished = state.finish(&storage, &token, true).unwrap();
    assert!(finished.published);
    drop(state);
    drop(storage);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn atomic_publish_never_replaces_case_insensitive_existing_name() {
    let (root, output, storage) = fixture();
    fs::write(output.join("BATCH.ZIP"), b"original").unwrap();
    let temporary = output.join("own.tmp");
    fs::write(&temporary, b"new synthetic ZIP bytes").unwrap();
    assert_eq!(
        publish_unique(&temporary, &output, "batch").unwrap(),
        "batch (1).zip"
    );
    assert!(!temporary.exists());
    assert_eq!(fs::read(output.join("BATCH.ZIP")).unwrap(), b"original");
    let source = output.join("source.tmp");
    fs::write(&source, b"keep source").unwrap();
    let error = move_no_replace(&source, &output.join("BATCH.ZIP")).unwrap_err();
    assert!(
        error.kind() == io::ErrorKind::AlreadyExists
            || matches!(error.raw_os_error(), Some(80 | 183))
    );
    assert_eq!(fs::read(&source).unwrap(), b"keep source");
    drop(storage);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn new_invocation_cleans_only_previous_owned_temp_and_invalidates_its_token() {
    let (root, output, storage) = fixture();
    let id = storage.insert_text("synthetic", "reload-text").unwrap();
    let state = ExportState::default();
    let first = state
        .begin(&storage, output.to_str().unwrap(), vec![id], true, false)
        .unwrap();
    let second = state
        .begin(&storage, output.to_str().unwrap(), vec![id], false, false)
        .unwrap();
    assert!(state.next(&storage, &first).is_err());
    assert_eq!(state.next(&storage, &second).unwrap().status, "saved");
    assert!(state.finish(&storage, &second, false).unwrap().published);
    assert_eq!(fs::read_dir(&output).unwrap().count(), 1);
    drop(state);
    drop(storage);
    fs::remove_dir_all(root).unwrap();
}
