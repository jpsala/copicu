use crate::storage::{AppStorage, AppliedSearchDescriptor};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};
use unicode_normalization::{char::canonical_combining_class, UnicodeNormalization};

/// The user-visible field that owns a Find occurrence.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "camelCase")]
pub enum FindField {
    #[serde(alias = "text")]
    Content,
    #[serde(alias = "alt")]
    ImageAlt,
    Title,
    #[serde(alias = "tags")]
    Tag,
    #[serde(alias = "note")]
    Notes,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindOccurrence {
    pub ordinal: u64,
    pub item_id: i64,
    pub field: FindField,
    #[serde(default)]
    pub segment: u32,
    pub start_utf16: u32,
    pub end_utf16: u32,
}

impl FindOccurrence {
    fn range(&self) -> FindRange {
        FindRange {
            ordinal: self.ordinal,
            segment: self.segment,
            start_utf16: self.start_utf16,
            end_utf16: self.end_utf16,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindRange {
    pub ordinal: u64,
    #[serde(default)]
    pub segment: u32,
    pub start_utf16: u32,
    pub end_utf16: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindFieldMatches {
    pub field: FindField,
    pub ranges: Vec<FindRange>,
    pub display_text: String,
    pub segments: Vec<FindDisplaySegment>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindDisplaySegment {
    pub segment: u32,
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub display_text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindItemMatches {
    pub item_id: i64,
    pub fields: Vec<FindFieldMatches>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindStartRequest {
    #[serde(alias = "descriptor")]
    pub applied_descriptor: AppliedSearchDescriptor,
    pub needle: String,
    #[serde(default)]
    pub generation: u64,
    #[serde(default = "default_find_owner", alias = "ownerId")]
    pub owner_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindStartResponse {
    pub session_id: String,
    pub owner_id: String,
    pub generation: u64,
    pub total: u64,
    pub first_target: Option<FindOccurrence>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FindNavigationDirection {
    Next,
    Previous,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindNavigateRequest {
    pub session_id: String,
    #[serde(default)]
    pub ordinal: Option<u64>,
    #[serde(default)]
    pub current_ordinal: Option<u64>,
    pub direction: FindNavigationDirection,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindNavigateResponse {
    pub total: u64,
    pub target: Option<FindOccurrence>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindMatchesForItemsRequest {
    pub session_id: String,
    pub item_ids: Vec<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindMatchesForItemsResponse {
    pub items: Vec<FindItemMatches>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindCloseRequest {
    pub session_id: String,
    #[serde(default, alias = "ownerId")]
    pub owner_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindCloseResponse {
    pub closed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindCancelOwnerRequest {
    #[serde(alias = "ownerId")]
    pub owner_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindCancelOwnerResponse {
    pub cancelled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindTargetRequest {
    pub session_id: String,
    pub ordinal: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindTargetResponse {
    pub total: u64,
    pub target: Option<FindOccurrence>,
    pub materialized: Option<FindTargetMaterialization>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindTargetMaterialization {
    pub item_id: i64,
    pub field: FindField,
    pub display_text: String,
    pub item: FindTargetItem,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindTargetItem {
    pub id: i64,
    pub content_kind: String,
    pub text: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
}

fn default_find_owner() -> String {
    "main".to_string()
}

#[derive(Clone)]
pub struct FindSessionStore {
    inner: Arc<Mutex<FindState>>,
}

impl Default for FindSessionStore {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(FindState::default())),
        }
    }
}

#[derive(Default)]
struct FindState {
    next_id: u64,
    jobs: HashMap<String, FindJob>,
    sessions: HashMap<String, FindSession>,
}

struct FindJob {
    token: u64,
    session_id: String,
    owner_id: String,
    generation: u64,
    expected_epoch: u64,
    cancelled: Arc<AtomicBool>,
}

#[allow(dead_code)]
struct FindSession {
    id: String,
    owner_id: String,
    search_fingerprint: String,
    descriptor: AppliedSearchDescriptor,
    needle: String,
    generation: u64,
    expected_epoch: u64,
    mutation_epoch: Arc<std::sync::atomic::AtomicU64>,
    manually_invalidated: bool,
    occurrences: Vec<FindOccurrence>,
    by_item: HashMap<i64, Vec<usize>>,
}

impl FindSessionStore {
    pub async fn start(
        &self,
        storage: AppStorage,
        request: FindStartRequest,
    ) -> Result<FindStartResponse, String> {
        request.applied_descriptor.validate()?;

        let needle = request.needle;
        let owner_id = if request.owner_id.trim().is_empty() {
            default_find_owner()
        } else {
            request.owner_id
        };
        let mutation_epoch = storage.mutation_epoch();
        let expected_epoch = mutation_epoch.load(Ordering::SeqCst);
        let (token, session_id, cancelled) =
            self.begin_job(&owner_id, request.generation, expected_epoch);
        let store = self.clone();
        let descriptor = request.applied_descriptor;
        let generation = request.generation;
        let needle_for_worker = needle.clone();
        let owner_for_worker = owner_id.clone();
        let session_id_for_worker = session_id.clone();

        let worker_result = match tauri::async_runtime::spawn_blocking(move || {
            let source = storage.read_find_items_cancelable(
                &descriptor,
                cancelled.clone(),
                mutation_epoch.clone(),
                expected_epoch,
            )?;
            if cancelled.load(Ordering::SeqCst) {
                return Err("find start superseded".to_string());
            }

            let (occurrences, by_item) =
                build_occurrence_index(&source, &needle_for_worker, &cancelled)?;
            if cancelled.load(Ordering::SeqCst) {
                return Err("find start superseded".to_string());
            }

            let mut state = store
                .inner
                .lock()
                .map_err(|_| "find session state lock poisoned".to_string())?;
            let owns_job = state
                .jobs
                .get(&owner_for_worker)
                .map(|job| {
                    job.token == token
                        && job.session_id == session_id_for_worker
                        && job.owner_id == owner_for_worker
                        && job.generation == generation
                        && job.expected_epoch == expected_epoch
                })
                .unwrap_or(false);
            if !owns_job
                || cancelled.load(Ordering::SeqCst)
                || mutation_epoch.load(Ordering::SeqCst) != expected_epoch
            {
                return Err("find start superseded".to_string());
            }

            let first_target = occurrences.first().cloned();
            let total = occurrences.len() as u64;
            state.jobs.remove(&owner_for_worker);
            state
                .sessions
                .retain(|_, session| session.owner_id != owner_for_worker);
            state.sessions.insert(
                session_id_for_worker.clone(),
                FindSession {
                    id: session_id_for_worker.clone(),
                    owner_id: owner_for_worker.clone(),
                    search_fingerprint: descriptor.fingerprint.clone(),
                    descriptor,
                    needle: needle_for_worker,
                    generation,
                    expected_epoch,
                    mutation_epoch,
                    manually_invalidated: false,
                    occurrences,
                    by_item,
                },
            );

            Ok(FindStartResponse {
                session_id: session_id_for_worker,
                owner_id: owner_for_worker,
                generation,
                total,
                first_target,
            })
        })
        .await
        {
            Ok(result) => result,
            Err(error) => {
                self.finish_job_if_current(&owner_id, token, &session_id);
                return Err(format!("find worker failed: {error}"));
            }
        };
        match worker_result {
            Ok(response) => Ok(response),
            Err(error) => {
                self.finish_job_if_current(&owner_id, token, &session_id);
                Err(error)
            }
        }
    }

    pub fn navigate(&self, request: FindNavigateRequest) -> Result<FindNavigateResponse, String> {
        let state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session = state
            .sessions
            .get(&request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session)?;

        let total = session.occurrences.len() as u64;
        let Some(current) = request.ordinal.or(request.current_ordinal) else {
            return Ok(FindNavigateResponse {
                total,
                target: session.occurrences.first().cloned(),
            });
        };
        if total == 0 {
            return Ok(FindNavigateResponse {
                total,
                target: None,
            });
        }
        if current == 0 || current > total {
            return Err("find ordinal is outside the active session".to_string());
        }
        let index = current as usize - 1;
        let next = match request.direction {
            FindNavigationDirection::Next => (index + 1) % session.occurrences.len(),
            FindNavigationDirection::Previous => {
                if index == 0 {
                    session.occurrences.len() - 1
                } else {
                    index - 1
                }
            }
        };
        Ok(FindNavigateResponse {
            total,
            target: session.occurrences.get(next).cloned(),
        })
    }

    pub fn target(&self, request: FindTargetRequest) -> Result<FindTargetResponse, String> {
        let state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session = state
            .sessions
            .get(&request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session)?;
        let target = if request.ordinal == 0 {
            None
        } else {
            session
                .occurrences
                .get(request.ordinal as usize - 1)
                .cloned()
        };
        Ok(FindTargetResponse {
            total: session.occurrences.len() as u64,
            target,
            materialized: None,
        })
    }

    pub fn target_materialized(
        &self,
        storage: &AppStorage,
        request: FindTargetRequest,
    ) -> Result<FindTargetResponse, String> {
        let response = self.target(request.clone())?;
        let Some(target) = response.target.clone() else {
            return Ok(response);
        };
        let (expected_epoch, mutation_epoch, needle) = {
            let state = self
                .inner
                .lock()
                .map_err(|_| "find session state lock poisoned".to_string())?;
            let session = state
                .sessions
                .get(&request.session_id)
                .ok_or_else(|| "find session not found".to_string())?;
            ensure_session_is_valid(session)?;
            (
                session.expected_epoch,
                session.mutation_epoch.clone(),
                canonical_casefold(&session.needle),
            )
        };
        let source = storage
            .read_find_item(target.item_id)?
            .ok_or_else(|| "find target item not found".to_string())?;
        if mutation_epoch.load(Ordering::SeqCst) != expected_epoch {
            return Err("sessionInvalidated".to_string());
        }
        let display_text = project_item(&source)
            .into_iter()
            .find(|field| {
                field.field == target.field
                    && match_projected_field(field, &needle).iter().any(|span| {
                        span.segment == target.segment
                            && span.start_utf16 == target.start_utf16
                            && span.end_utf16 == target.end_utf16
                    })
            })
            .map(|field| field.text)
            .ok_or_else(|| "find target display field not found".to_string())?;
        if mutation_epoch.load(Ordering::SeqCst) != expected_epoch {
            return Err("sessionInvalidated".to_string());
        }
        Ok(FindTargetResponse {
            materialized: Some(FindTargetMaterialization {
                item_id: target.item_id,
                field: target.field,
                display_text,
                item: FindTargetItem {
                    id: source.id,
                    content_kind: source.content_kind,
                    text: source.text,
                    title: source.title,
                    notes: source.notes,
                    tags: source.tags,
                },
            }),
            ..response
        })
    }

    #[allow(dead_code)]
    pub fn matches_for_items(
        &self,
        request: FindMatchesForItemsRequest,
    ) -> Result<FindMatchesForItemsResponse, String> {
        self.matches_for_items_with_storage(None, request)
    }

    pub fn matches_for_items_materialized(
        &self,
        storage: &AppStorage,
        request: FindMatchesForItemsRequest,
    ) -> Result<FindMatchesForItemsResponse, String> {
        self.matches_for_items_with_storage(Some(storage), request)
    }

    fn matches_for_items_with_storage(
        &self,
        storage: Option<&AppStorage>,
        request: FindMatchesForItemsRequest,
    ) -> Result<FindMatchesForItemsResponse, String> {
        let state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session = state
            .sessions
            .get(&request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session)?;

        let mut items = Vec::new();
        let mut seen_items = std::collections::HashSet::new();
        for item_id in request.item_ids {
            if !seen_items.insert(item_id) {
                continue;
            }
            let Some(indices) = session.by_item.get(&item_id) else {
                continue;
            };
            let mut fields = BTreeMap::<FindField, Vec<FindRange>>::new();
            for index in indices {
                if let Some(occurrence) = session.occurrences.get(*index) {
                    fields
                        .entry(occurrence.field)
                        .or_default()
                        .push(occurrence.range());
                }
            }
            let projections = if let Some(storage) = storage {
                let source = storage
                    .read_find_item(item_id)?
                    .ok_or_else(|| "sessionInvalidated".to_string())?;
                ensure_session_is_valid(session)?;
                Some(project_item(&source))
            } else {
                None
            };
            items.push(FindItemMatches {
                item_id,
                fields: fields
                    .into_iter()
                    .map(|(field, ranges)| {
                        let matching_fields = projections
                            .as_ref()
                            .into_iter()
                            .flat_map(|fields| fields.iter())
                            .filter(|projected| projected.field == field)
                            .collect::<Vec<_>>();
                        let display_text = if matching_fields.len() == 1 {
                            matching_fields[0].text.clone()
                        } else {
                            String::new()
                        };
                        let segments = matching_fields
                            .into_iter()
                            .flat_map(projection_segments)
                            .collect();
                        FindFieldMatches {
                            field,
                            ranges,
                            display_text,
                            segments,
                        }
                    })
                    .collect(),
            });
        }
        ensure_session_is_valid(session)?;
        Ok(FindMatchesForItemsResponse { items })
    }

    pub fn close(&self, request: FindCloseRequest) -> Result<FindCloseResponse, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session_owner = state
            .sessions
            .get(&request.session_id)
            .map(|session| session.owner_id.clone());
        let owner_matches = request
            .owner_id
            .as_deref()
            .map(|owner| session_owner.as_deref() == Some(owner))
            .unwrap_or(true);
        if owner_matches {
            state.sessions.remove(&request.session_id);
        }
        let matching_owner = state
            .jobs
            .iter()
            .find(|(_, job)| job.session_id == request.session_id)
            .map(|(owner, _)| owner.clone());
        if let Some(owner) = matching_owner {
            if request
                .owner_id
                .as_deref()
                .map(|value| value == owner)
                .unwrap_or(true)
            {
                if let Some(job) = state.jobs.remove(&owner) {
                    job.cancelled.store(true, Ordering::SeqCst);
                }
            }
        }
        Ok(FindCloseResponse { closed: true })
    }

    pub fn cancel_owner(&self, owner_id: &str) -> FindCancelOwnerResponse {
        let Ok(mut state) = self.inner.lock() else {
            return FindCancelOwnerResponse { cancelled: false };
        };
        let mut cancelled = false;
        if let Some(job) = state.jobs.remove(owner_id) {
            job.cancelled.store(true, Ordering::SeqCst);
            cancelled = true;
        }
        let before = state.sessions.len();
        state
            .sessions
            .retain(|_, session| session.owner_id != owner_id);
        cancelled |= state.sessions.len() != before;
        FindCancelOwnerResponse { cancelled }
    }

    #[allow(dead_code)]
    pub fn invalidate_item(&self, item_id: i64) {
        if let Ok(mut state) = self.inner.lock() {
            for session in state.sessions.values_mut() {
                if session
                    .occurrences
                    .iter()
                    .any(|occurrence| occurrence.item_id == item_id)
                {
                    session.manually_invalidated = true;
                }
            }
        }
    }

    fn begin_job(
        &self,
        owner_id: &str,
        generation: u64,
        expected_epoch: u64,
    ) -> (u64, String, Arc<AtomicBool>) {
        let mut state = self.inner.lock().expect("find session state lock poisoned");
        if let Some(previous) = state.jobs.remove(owner_id) {
            previous.cancelled.store(true, Ordering::SeqCst);
        }
        state
            .sessions
            .retain(|_, session| session.owner_id != owner_id);
        state.next_id = state.next_id.saturating_add(1);
        let token = state.next_id;
        let session_id = opaque_session_id(token);
        let cancelled = Arc::new(AtomicBool::new(false));
        state.jobs.insert(
            owner_id.to_string(),
            FindJob {
                token,
                session_id: session_id.clone(),
                owner_id: owner_id.to_string(),
                generation,
                expected_epoch,
                cancelled: cancelled.clone(),
            },
        );
        (token, session_id, cancelled)
    }

    fn finish_job_if_current(&self, owner_id: &str, token: u64, session_id: &str) {
        let Ok(mut state) = self.inner.lock() else {
            return;
        };
        let is_current = state
            .jobs
            .get(owner_id)
            .map(|job| job.token == token && job.session_id == session_id)
            .unwrap_or(false);
        if is_current {
            if let Some(job) = state.jobs.remove(owner_id) {
                job.cancelled.store(true, Ordering::SeqCst);
            }
        }
    }
}

fn ensure_session_is_valid(session: &FindSession) -> Result<(), String> {
    if session.manually_invalidated
        || session.mutation_epoch.load(Ordering::SeqCst) != session.expected_epoch
    {
        return Err("sessionInvalidated".to_string());
    }
    Ok(())
}

fn opaque_session_id(counter: u64) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let mixed = now ^ (counter as u128).wrapping_mul(0x9e3779b97f4a7c15);
    format!("find-{:016x}-{:016x}", counter, mixed as u64)
}

#[derive(Clone, Debug)]
struct ProjectedField {
    field: FindField,
    text: String,
    spans: Vec<OffsetSpan>,
    segment: u32,
    utf16_len: u32,
}

#[derive(Clone, Copy, Debug)]
struct OffsetSpan {
    start_utf16: u32,
    end_utf16: u32,
    segment: u32,
}

fn build_occurrence_index(
    source: &[crate::storage::FindSourceItem],
    needle: &str,
    cancelled: &AtomicBool,
) -> Result<(Vec<FindOccurrence>, HashMap<i64, Vec<usize>>), String> {
    let mut occurrences = Vec::new();
    let normalized_needle = canonical_casefold(needle);
    if normalized_needle.is_empty() {
        return Ok((occurrences, HashMap::new()));
    }

    for (item_index, item) in source.iter().enumerate() {
        if item_index % 64 == 0 && cancelled.load(Ordering::SeqCst) {
            return Err("find start superseded".to_string());
        }
        let fields = project_item(item);
        for projected in fields {
            let matches = match_projected_field(&projected, &normalized_needle);
            for span in matches {
                let ordinal = occurrences.len() as u64 + 1;
                occurrences.push(FindOccurrence {
                    ordinal,
                    item_id: item.id,
                    field: projected.field,
                    segment: span.segment,
                    start_utf16: span.start_utf16,
                    end_utf16: span.end_utf16,
                });
            }
        }
    }

    let mut by_item = HashMap::<i64, Vec<usize>>::new();
    for (index, occurrence) in occurrences.iter().enumerate() {
        by_item.entry(occurrence.item_id).or_default().push(index);
    }
    Ok((occurrences, by_item))
}

fn project_item(item: &crate::storage::FindSourceItem) -> Vec<ProjectedField> {
    let mut fields = Vec::new();
    if should_project_content(&item.content_kind, &item.text) {
        let (content, image_alts) = project_markdown(&item.text);
        if !content.text.is_empty() {
            fields.push(content);
        }
        for (segment, mut image_alt) in image_alts.into_iter().enumerate() {
            let segment = segment as u32;
            image_alt.segment = segment;
            for span in &mut image_alt.spans {
                span.segment = segment;
            }
            fields.push(image_alt);
        }
    } else if !item.text.is_empty() {
        // Image/file payload placeholders are technical metadata, not Find content.
        let _ = &item.text;
    }
    if let Some(title) = item.title.as_deref().filter(|value| !value.is_empty()) {
        fields.push(project_plain_field(FindField::Title, title));
    }
    if !item.tag_labels.is_empty() {
        let mut tags = String::new();
        for (index, label) in item.tag_labels.iter().enumerate() {
            if index > 0 {
                tags.push(' ');
            }
            tags.push('#');
            tags.push_str(label);
        }
        if !tags.is_empty() {
            fields.push(project_plain_field(FindField::Tag, &tags));
        }
    } else if let Some(tags) = item
        .tags
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        fields.push(project_plain_field(FindField::Tag, tags.trim()));
    }
    if let Some(notes) = item.notes.as_deref().filter(|value| !value.is_empty()) {
        let notes_field = project_notes(notes, item);
        if !notes_field.text.is_empty() {
            fields.push(notes_field);
        }
    }
    fields
}

fn should_project_content(content_kind: &str, text: &str) -> bool {
    let _ = text;
    matches!(content_kind, "text" | "html" | "unknown")
}

fn project_plain_field(field: FindField, value: &str) -> ProjectedField {
    let mut projected = ProjectedField {
        field,
        text: String::new(),
        spans: Vec::new(),
        segment: 0,
        utf16_len: 0,
    };
    for ch in value.chars() {
        append_projected_char(&mut projected, ch);
    }
    projected
}

fn project_markdown(source: &str) -> (ProjectedField, Vec<ProjectedField>) {
    let mut content = ProjectedField {
        field: FindField::Content,
        text: String::new(),
        spans: Vec::new(),
        segment: 0,
        utf16_len: 0,
    };
    let definitions = markdown_reference_definitions(source);
    let mut image_alts = Vec::new();
    let mut cursor = 0usize;
    let mut line_start = true;
    while cursor < source.len() {
        if line_start {
            if let Some(line_end) = markdown_reference_definition_end(source, cursor) {
                break_projection(&mut content);
                cursor = line_end;
                line_start = true;
                continue;
            }
        }
        if source[cursor..].starts_with("<!--") {
            if let Some(end) = source[cursor + 4..].find("-->") {
                break_projection(&mut content);
                cursor += 4 + end + 3;
                line_start = false;
                continue;
            }
            break_projection(&mut content);
            return (content, image_alts);
        }
        if let Some((alt_start, alt_end, end)) =
            parse_markdown_construct(source, cursor, true, &definitions)
        {
            image_alts.push(project_plain_range(
                FindField::ImageAlt,
                source,
                alt_start,
                alt_end,
            ));
            break_projection(&mut content);
            cursor = end;
            line_start = false;
            continue;
        }
        if let Some((label_start, label_end, end)) =
            parse_markdown_construct(source, cursor, false, &definitions)
        {
            append_visible_range(&mut content, source, label_start, label_end);
            break_projection(&mut content);
            cursor = end;
            line_start = false;
            continue;
        }
        if source[cursor..].starts_with("![") || source[cursor..].starts_with('[') {
            if let Some((label_end, hidden_end)) =
                malformed_markdown_construct_range(source, cursor)
            {
                // Preserve the visible label while suppressing an ambiguous or
                // unterminated destination. The rest of the source remains
                // searchable once the malformed construct has ended.
                append_raw_range(&mut content, source, cursor, label_end + 1);
                break_projection(&mut content);
                cursor = hidden_end.max(label_end + 1);
                line_start = false;
                continue;
            }
            let ch = source[cursor..]
                .chars()
                .next()
                .expect("cursor is a char boundary");
            append_projected_char(&mut content, ch);
            cursor += ch.len_utf8();
            line_start = false;
            continue;
        }
        if source[cursor..].starts_with("```") {
            break_projection(&mut content);
            let Some((body_start, body_end, end)) = fenced_body_range(source, cursor) else {
                return (content, image_alts);
            };
            append_raw_range(&mut content, source, body_start, body_end);
            break_projection(&mut content);
            cursor += 3 + end + 3;
            line_start = false;
            continue;
        }
        let ch = source[cursor..]
            .chars()
            .next()
            .expect("cursor is a char boundary");
        let next = cursor + ch.len_utf8();
        if ch == '<' {
            if let Some(end) = source[next..].find('>') {
                break_projection(&mut content);
                cursor = next + end + 1;
                line_start = false;
                continue;
            }
            if source[next..]
                .chars()
                .next()
                .is_some_and(is_probable_html_tag_start)
            {
                // An unfinished tag-like construct is ambiguous; fail closed
                // for the remainder rather than exposing possible markup data.
                break_projection(&mut content);
                return (content, image_alts);
            }
            // A bare less-than sign is visible text, not an HTML construct.
            // Keep scanning instead of truncating the remainder of the field.
            append_projected_char(&mut content, ch);
            cursor = next;
            line_start = false;
            continue;
        }
        if ch == '\\' {
            if let Some(escaped) = source[next..].chars().next() {
                append_projected_char(&mut content, escaped);
                cursor = next + escaped.len_utf8();
                line_start = false;
                continue;
            }
        }
        if matches!(ch, '*' | '~' | '`') {
            break_projection(&mut content);
            cursor = next;
            line_start = false;
            continue;
        }
        if line_start && matches!(ch, '#' | '>' | '-' | '+' | '*') {
            break_projection(&mut content);
            cursor = next;
            while cursor < source.len() {
                let Some(space) = source[cursor..].chars().next() else {
                    break;
                };
                if !space.is_whitespace() || space == '\n' {
                    break;
                }
                cursor += space.len_utf8();
            }
            line_start = false;
            continue;
        }
        if ch == '\r' && source[next..].starts_with('\n') {
            break_projection(&mut content);
            cursor = next;
            continue;
        }
        append_projected_char(&mut content, ch);
        cursor = next;
        line_start = ch == '\n';
    }
    (content, image_alts)
}

fn project_plain_range(field: FindField, source: &str, start: usize, end: usize) -> ProjectedField {
    let mut projected = ProjectedField {
        field,
        text: String::new(),
        spans: Vec::new(),
        segment: 0,
        utf16_len: 0,
    };
    append_visible_range(&mut projected, source, start, end);
    projected
}

fn projection_segments(projected: &ProjectedField) -> Vec<FindDisplaySegment> {
    if projected.text.is_empty() || projected.spans.is_empty() {
        return Vec::new();
    }
    let chars = projected.text.char_indices().collect::<Vec<_>>();
    let mut segments = Vec::new();
    let mut segment_start = 0usize;
    let mut segment = projected.spans[0].segment;
    for index in 1..=projected.spans.len() {
        let changed = index == projected.spans.len()
            || projected.spans[index].segment != segment;
        if !changed {
            continue;
        }
        let byte_start = chars[segment_start].0;
        let byte_end = if index < chars.len() {
            chars[index].0
        } else {
            projected.text.len()
        };
        segments.push(FindDisplaySegment {
            segment,
            start_utf16: projected.spans[segment_start].start_utf16,
            end_utf16: projected.spans[index - 1].end_utf16,
            display_text: projected.text[byte_start..byte_end].to_string(),
        });
        if index < projected.spans.len() {
            segment_start = index;
            segment = projected.spans[index].segment;
        }
    }
    segments
}

fn append_visible_range(destination: &mut ProjectedField, source: &str, start: usize, end: usize) {
    let mut cursor = start;
    while cursor < end {
        let ch = source[cursor..end]
            .chars()
            .next()
            .expect("range is a char boundary");
        let next = cursor + ch.len_utf8();
        if ch == '\\' {
            if let Some(escaped) = source[next..end].chars().next() {
                append_projected_char(destination, escaped);
                cursor = next + escaped.len_utf8();
                continue;
            }
        }
        if matches!(ch, '*' | '~' | '`') {
            break_projection(destination);
        } else {
            append_projected_char(destination, ch);
        }
        cursor = next;
    }
}

fn append_raw_range(destination: &mut ProjectedField, source: &str, start: usize, end: usize) {
    for ch in source[start..end].chars() {
        append_projected_char(destination, ch);
    }
}

fn is_probable_html_tag_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || matches!(ch, '/' | '!' | '?')
}

fn fenced_body_range(source: &str, cursor: usize) -> Option<(usize, usize, usize)> {
    let after_open = cursor + 3;
    let close_offset = source[after_open..].find("```")?;
    let close = after_open + close_offset;
    let body_start = source[after_open..close]
        .find('\n')
        .map(|newline| after_open + newline + 1)
        .unwrap_or(after_open);
    Some((body_start, close, close_offset))
}

fn malformed_markdown_construct_range(source: &str, cursor: usize) -> Option<(usize, usize)> {
    let label_start = if source[cursor..].starts_with("![") {
        cursor + 2
    } else {
        cursor + 1
    };
    let label_end = find_closing_bracket(source, label_start)?;
    let after_label = label_end + 1;
    if !(source[after_label..].starts_with('(') || source[after_label..].starts_with('[')) {
        return None;
    }

    // An incomplete destination/reference is hidden through the current line;
    // keeping later lines searchable avoids truncating unrelated visible text.
    let hidden_end = source[after_label..]
        .find('\n')
        .map(|offset| after_label + offset)
        .unwrap_or(source.len());
    Some((label_end, hidden_end))
}

fn find_markdown_destination_end(source: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut cursor = start;
    while cursor < source.len() {
        let ch = source[cursor..].chars().next()?;
        if ch == '\\' {
            cursor += ch.len_utf8();
            if let Some(escaped) = source[cursor..].chars().next() {
                cursor += escaped.len_utf8();
            }
            continue;
        }
        if ch == '(' {
            depth = depth.saturating_add(1);
        } else if ch == ')' {
            if depth == 0 {
                return Some(cursor);
            }
            depth -= 1;
        }
        cursor += ch.len_utf8();
    }
    None
}

fn append_projected_char(destination: &mut ProjectedField, ch: char) {
    let start_utf16 = destination.utf16_len;
    destination.text.push(ch);
    destination.spans.push(OffsetSpan {
        start_utf16,
        end_utf16: start_utf16 + ch.len_utf16() as u32,
        segment: destination.segment,
    });
    destination.utf16_len = start_utf16 + ch.len_utf16() as u32;
}

fn break_projection(destination: &mut ProjectedField) {
    if !destination.text.is_empty() {
        destination.segment = destination.segment.saturating_add(1);
    }
}

fn markdown_reference_definitions(source: &str) -> HashSet<String> {
    let mut definitions = HashSet::new();
    let mut line_start = 0usize;
    while line_start < source.len() {
        if let Some((label, _)) = markdown_definition_label(source, line_start) {
            definitions.insert(normalize_reference_label(label));
        }
        let Some(line_end) = source[line_start..].find('\n') else {
            break;
        };
        line_start += line_end + 1;
    }
    definitions
}

fn markdown_definition_label(source: &str, line_start: usize) -> Option<(&str, usize)> {
    let mut cursor = line_start;
    let mut indentation = 0usize;
    while cursor < source.len() && indentation < 4 {
        let ch = source[cursor..].chars().next()?;
        if !matches!(ch, ' ' | '\t') {
            break;
        }
        indentation += 1;
        cursor += ch.len_utf8();
    }
    if indentation > 3 || !source[cursor..].starts_with('[') {
        return None;
    }
    let close = find_closing_bracket(source, cursor + 1)?;
    let after = close + 1;
    if !source[after..].trim_start().starts_with(':') {
        return None;
    }
    Some((&source[cursor + 1..close], close))
}

fn markdown_reference_definition_end(source: &str, line_start: usize) -> Option<usize> {
    markdown_definition_label(source, line_start)?;
    source[line_start..]
        .find('\n')
        .map(|end| line_start + end + 1)
        .or(Some(source.len()))
}

fn parse_markdown_construct(
    source: &str,
    cursor: usize,
    image: bool,
    definitions: &HashSet<String>,
) -> Option<(usize, usize, usize)> {
    let label_start = if image {
        source[cursor..].strip_prefix("![")?;
        cursor + 2
    } else {
        source[cursor..].strip_prefix('[')?;
        cursor + 1
    };
    let label_end = find_closing_bracket(source, label_start)?;
    let after_label = label_end + 1;
    if source[after_label..].starts_with('(') {
        let destination_end = find_markdown_destination_end(source, after_label + 1)?;
        return Some((label_start, label_end, destination_end + 1));
    }
    if source[after_label..].starts_with('[') {
        let reference_end = find_closing_bracket(source, after_label + 1)?;
        let reference = &source[after_label + 1..reference_end];
        if reference.is_empty() || definitions.contains(&normalize_reference_label(reference)) {
            return Some((label_start, label_end, reference_end + 1));
        }
    }
    let label = &source[label_start..label_end];
    if definitions.contains(&normalize_reference_label(label)) {
        return Some((label_start, label_end, label_end + 1));
    }
    None
}

fn find_closing_bracket(source: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut cursor = start;
    while cursor < source.len() {
        let ch = source[cursor..].chars().next()?;
        if ch == '\\' {
            cursor += ch.len_utf8();
            if let Some(escaped) = source[cursor..].chars().next() {
                cursor += escaped.len_utf8();
            }
            continue;
        }
        if ch == '[' {
            depth = depth.saturating_add(1);
        } else if ch == ']' {
            if depth == 0 {
                return Some(cursor);
            }
            depth -= 1;
        }
        cursor += ch.len_utf8();
    }
    None
}

fn normalize_reference_label(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn project_notes(source: &str, item: &crate::storage::FindSourceItem) -> ProjectedField {
    let mut removable_tags = HashSet::new();
    for label in &item.tag_labels {
        removable_tags.insert(format!("#{label}"));
    }
    if let Some(tags) = item.tags.as_deref() {
        let mut cursor = 0usize;
        while cursor < tags.len() {
            let Some(ch) = tags[cursor..].chars().next() else {
                break;
            };
            if ch == '#' {
                let start = cursor;
                cursor += ch.len_utf8();
                while cursor < tags.len() {
                    let next = tags[cursor..].chars().next().expect("tag cursor");
                    if !(next.is_alphanumeric() || matches!(next, '_' | '-')) {
                        break;
                    }
                    cursor += next.len_utf8();
                }
                if cursor > start + 1 {
                    removable_tags.insert(tags[start..cursor].to_string());
                }
                continue;
            }
            cursor += ch.len_utf8();
        }
    }

    let mut visible = Vec::<(char, u32)>::new();
    let mut cursor = 0usize;
    let mut segment = 0u32;
    while cursor < source.len() {
        if source[cursor..].starts_with('#')
            && (cursor == 0
                || source[..cursor]
                    .chars()
                    .next_back()
                    .is_some_and(char::is_whitespace))
        {
            let start = cursor;
            cursor += '#'.len_utf8();
            while cursor < source.len() {
                let ch = source[cursor..].chars().next().expect("notes cursor");
                if !(ch.is_alphanumeric() || matches!(ch, '_' | '-')) {
                    break;
                }
                cursor += ch.len_utf8();
            }
            if cursor > start + 1 && removable_tags.contains(&source[start..cursor]) {
                segment = segment.saturating_add(1);
                continue;
            }
            for ch in source[start..cursor].chars() {
                visible.push((ch, segment));
            }
            continue;
        }
        let ch = source[cursor..].chars().next().expect("notes cursor");
        cursor += ch.len_utf8();
        if ch == '\r' {
            if source[cursor..].starts_with('\n') {
                continue;
            }
        }
        visible.push((ch, segment));
    }

    let mut normalized = Vec::<(char, u32)>::new();
    for (ch, source_segment) in visible {
        if ch == '\n' {
            while normalized
                .last()
                .is_some_and(|(previous, _)| matches!(previous, ' ' | '\t'))
            {
                normalized.pop();
                segment = segment.saturating_add(1);
            }
            let newline_count = normalized
                .iter()
                .rev()
                .take_while(|(value, _)| *value == '\n')
                .count();
            if newline_count >= 2 {
                segment = segment.saturating_add(1);
                continue;
            }
        }
        normalized.push((ch, source_segment));
    }
    while normalized.first().is_some_and(|(ch, _)| ch.is_whitespace()) {
        normalized.remove(0);
    }
    while normalized.last().is_some_and(|(ch, _)| ch.is_whitespace()) {
        normalized.pop();
    }

    let mut projected = ProjectedField {
        field: FindField::Notes,
        text: String::new(),
        spans: Vec::new(),
        segment: 0,
        utf16_len: 0,
    };
    for (ch, source_segment) in normalized {
        projected.segment = source_segment;
        append_projected_char(&mut projected, ch);
    }
    projected
}

fn canonical_casefold(value: &str) -> Vec<char> {
    value.nfc().flat_map(case_fold_char).collect()
}

fn match_projected_field(field: &ProjectedField, needle: &[char]) -> Vec<OffsetSpan> {
    let (lowered, spans) = lowercase_projected_field(field);
    if needle.is_empty() || lowered.len() < needle.len() {
        return Vec::new();
    }
    let mut matches = Vec::<OffsetSpan>::new();
    let mut cursor = 0usize;
    while cursor + needle.len() <= lowered.len() {
        if lowered[cursor..cursor + needle.len()] == *needle {
            let segment = spans[cursor].segment;
            if spans[cursor..cursor + needle.len()]
                .iter()
                .any(|span| span.segment != segment)
            {
                cursor += 1;
                continue;
            }
            let start = spans[cursor].start_utf16;
            let end = spans[cursor + needle.len() - 1].end_utf16;
            let range = OffsetSpan {
                start_utf16: start,
                end_utf16: end,
                segment,
            };
            // A folded expansion such as `ß -> ss` maps multiple search
            // characters to one display grapheme. Do not emit duplicate
            // occurrences for each folded code point when a one-character
            // needle lands inside that expansion.
            if !matches.last().is_some_and(|previous| {
                previous.start_utf16 == range.start_utf16
                    && previous.end_utf16 == range.end_utf16
                    && previous.segment == range.segment
            }) {
                matches.push(range);
            }
            cursor += needle.len();
        } else {
            cursor += 1;
        }
    }
    matches
}

fn lowercase_projected_field(field: &ProjectedField) -> (Vec<char>, Vec<OffsetSpan>) {
    let mut lowered = Vec::new();
    let mut spans = Vec::new();
    let chars = field.text.chars().collect::<Vec<_>>();
    let mut index = 0usize;
    while index < chars.len() {
        let cluster_start = index;
        index += 1;
        while index < chars.len() && canonical_combining_class(chars[index]) != 0 {
            index += 1;
        }
        let cluster = chars[cluster_start..index].iter().collect::<String>();
        let normalized = cluster.nfc().collect::<String>();
        let first_span = field
            .spans
            .get(cluster_start)
            .copied()
            .unwrap_or(OffsetSpan {
                start_utf16: 0,
                end_utf16: 0,
                segment: 0,
            });
        let last_span = field.spans.get(index - 1).copied().unwrap_or(first_span);
        let source_span = OffsetSpan {
            start_utf16: first_span.start_utf16,
            end_utf16: last_span.end_utf16,
            segment: first_span.segment,
        };
        for normalized_ch in normalized.chars() {
            for folded_ch in case_fold_char(normalized_ch) {
                lowered.push(folded_ch);
                spans.push(source_span);
            }
        }
    }
    (lowered, spans)
}

fn case_fold_char(ch: char) -> Vec<char> {
    match ch {
        // Full Unicode case folding includes compatibility-like singleton and
        // ligature expansions that Rust's lowercase iterator does not expose.
        '\u{03c2}' => vec!['\u{03c3}'],
        '\u{017f}' => vec!['s'],
        '\u{00b5}' => vec!['\u{03bc}'],
        '\u{00df}' | '\u{1e9e}' => vec!['s', 's'],
        '\u{0132}' | '\u{0133}' => vec!['i', 'j'],
        '\u{0149}' => vec!['\u{02bc}', 'n'],
        '\u{fb00}' => vec!['f', 'f'],
        '\u{fb01}' => vec!['f', 'i'],
        '\u{fb02}' => vec!['f', 'l'],
        '\u{fb03}' => vec!['f', 'f', 'i'],
        '\u{fb04}' => vec!['f', 'f', 'l'],
        '\u{fb05}' | '\u{fb06}' => vec!['s', 't'],
        _ => ch.to_lowercase().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{AppStorage, FindSourceItem};
    use std::time::Instant;

    fn item(id: i64, content_kind: &str, text: &str) -> FindSourceItem {
        FindSourceItem {
            id,
            content_kind: content_kind.to_string(),
            text: text.to_string(),
            title: None,
            notes: None,
            tags: None,
            tag_labels: Vec::new(),
        }
    }

    #[test]
    fn matching_is_case_insensitive_but_accent_sensitive() {
        let source = vec![item(1, "text", "Factura FACTURA café cafe")];
        let cancelled = AtomicBool::new(false);
        let (occurrences, _) = build_occurrence_index(&source, "factura", &cancelled).unwrap();
        assert_eq!(occurrences.len(), 2);
        assert_eq!(
            (occurrences[0].start_utf16, occurrences[0].end_utf16),
            (0, 7)
        );
        assert_eq!(
            (occurrences[1].start_utf16, occurrences[1].end_utf16),
            (8, 15)
        );

        let (accented, _) = build_occurrence_index(&source, "café", &cancelled).unwrap();
        assert_eq!(accented.len(), 1);
        let (unaccented, _) = build_occurrence_index(&source, "cafe", &cancelled).unwrap();
        assert_eq!(unaccented.len(), 1);
    }

    #[test]
    fn emoji_offsets_are_utf16_units() {
        let source = vec![item(1, "text", "😀 invoice")];
        let cancelled = AtomicBool::new(false);
        let (occurrences, _) = build_occurrence_index(&source, "invoice", &cancelled).unwrap();
        assert_eq!(occurrences[0].start_utf16, 3);
        assert_eq!(occurrences[0].end_utf16, 10);
    }

    #[test]
    fn markdown_projection_excludes_image_urls_and_markup() {
        let source = vec![item(
            1,
            "text",
            "**Invoice** ![receipt](https://example.test/receipt.png) [portal](https://example.test)",
        )];
        let cancelled = AtomicBool::new(false);
        let (occurrences, _) = build_occurrence_index(&source, "example.test", &cancelled).unwrap();
        assert!(occurrences.is_empty());

        let (alt, _) = build_occurrence_index(&source, "receipt", &cancelled).unwrap();
        assert_eq!(alt.len(), 1);
        assert_eq!(alt[0].field, FindField::ImageAlt);

        let (visible, _) = build_occurrence_index(&source, "invoice", &cancelled).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].field, FindField::Content);
        assert_eq!((visible[0].start_utf16, visible[0].end_utf16), (0, 7));
    }

    #[test]
    fn projection_includes_title_tags_and_notes_but_not_technical_fields() {
        let mut source_item = item(4, "image", "[image] 8x8 PNG 42 bytes");
        source_item.title = Some("Invoice title".to_string());
        source_item.tags = Some("work #billing".to_string());
        source_item.notes = Some("Keep invoice note".to_string());
        let source = vec![source_item];
        let cancelled = AtomicBool::new(false);
        let (occurrences, _) = build_occurrence_index(&source, "invoice", &cancelled).unwrap();
        assert_eq!(occurrences.len(), 2);
        assert!(occurrences
            .iter()
            .any(|match_| match_.field == FindField::Title));
        assert!(occurrences
            .iter()
            .any(|match_| match_.field == FindField::Notes));
        let (technical, _) = build_occurrence_index(&source, "png", &cancelled).unwrap();
        assert!(technical.is_empty());

        let mut tagged = item(5, "text", "body");
        tagged.tags = Some("😀 #billing".to_string());
        let (tag_matches, _) = build_occurrence_index(&[tagged], "billing", &cancelled).unwrap();
        assert_eq!(tag_matches.len(), 1);
        assert_eq!(tag_matches[0].field, FindField::Tag);
        assert_eq!(
            (tag_matches[0].start_utf16, tag_matches[0].end_utf16),
            (4, 11)
        );
    }

    #[test]
    fn markdown_references_are_private_at_eof_and_when_indented() {
        let source = vec![item(
            1,
            "text",
            "![receipt][img]\n   [img]: https://secret.example/account",
        )];
        let cancelled = AtomicBool::new(false);
        let (secret, _) = build_occurrence_index(&source, "secret.example", &cancelled).unwrap();
        assert!(secret.is_empty());
        let (alt, _) = build_occurrence_index(&source, "receipt", &cancelled).unwrap();
        assert_eq!(alt.len(), 1);
        assert_eq!(alt[0].field, FindField::ImageAlt);
    }

    #[test]
    fn display_ranges_do_not_cross_invisible_markdown_segments() {
        let source = vec![item(1, "text", "in[visible](https://secret.example)voice")];
        let cancelled = AtomicBool::new(false);
        let (crossing, _) = build_occurrence_index(&source, "invisiblevoice", &cancelled).unwrap();
        assert!(crossing.is_empty());
        let (label, _) = build_occurrence_index(&source, "visible", &cancelled).unwrap();
        assert_eq!(label.len(), 1);
        assert_eq!((label[0].start_utf16, label[0].end_utf16), (2, 9));
    }

    #[test]
    fn notes_ranges_follow_the_picker_metadata_display() {
        let mut source_item = item(2, "text", "body");
        source_item.tags = Some("#work".to_string());
        source_item.tag_labels = vec!["work".to_string()];
        source_item.notes = Some("#work\nInvoice\n\n\n".to_string());
        let cancelled = AtomicBool::new(false);
        let (invoice, _) =
            build_occurrence_index(&[source_item.clone()], "invoice", &cancelled).unwrap();
        let note = invoice
            .iter()
            .find(|occurrence| occurrence.field == FindField::Notes)
            .expect("invoice should be in the canonical notes display");
        assert_eq!((note.start_utf16, note.end_utf16), (0, 7));
        let (work, _) = build_occurrence_index(&[source_item], "work", &cancelled).unwrap();
        assert!(work
            .iter()
            .all(|occurrence| occurrence.field != FindField::Notes));
    }

    #[test]
    fn relation_tags_keep_multi_word_labels_and_unicode_offsets() {
        let mut source_item = item(3, "text", "body");
        source_item.tag_labels = vec!["Project Alpha".to_string()];
        let cancelled = AtomicBool::new(false);
        let (matches, _) =
            build_occurrence_index(&[source_item], "project alpha", &cancelled).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].field, FindField::Tag);
        assert_eq!((matches[0].start_utf16, matches[0].end_utf16), (1, 14));
    }

    #[test]
    fn canonical_casefold_is_nfc_accent_sensitive_and_handles_sigma_and_expansion() {
        let source = vec![item(4, "text", "Cafe\u{301} ΟΣ Straße ſ µ ﬁ ﬃ")];
        let cancelled = AtomicBool::new(false);
        let (accented, _) = build_occurrence_index(&source, "CAFÉ", &cancelled).unwrap();
        assert_eq!(accented.len(), 1);
        assert_eq!((accented[0].start_utf16, accented[0].end_utf16), (0, 5));
        let (sigma, _) = build_occurrence_index(&source, "ος", &cancelled).unwrap();
        assert_eq!(sigma.len(), 1);
        let (expanded, _) = build_occurrence_index(&source, "STRASSE", &cancelled).unwrap();
        assert_eq!(expanded.len(), 1);
        let (long_s, _) = build_occurrence_index(&source, "s", &cancelled).unwrap();
        assert!(long_s.len() >= 2);
        let (micro, _) = build_occurrence_index(&source, "μ", &cancelled).unwrap();
        assert_eq!(micro.len(), 1);
        let (ligature, _) = build_occurrence_index(&source, "fi", &cancelled).unwrap();
        assert!(ligature.len() >= 1);
        let (triple_ligature, _) = build_occurrence_index(&source, "ffi", &cancelled).unwrap();
        assert!(triple_ligature.len() >= 1);
        let (single_expansion, _) =
            build_occurrence_index(&[item(5, "text", "ß")], "s", &cancelled).unwrap();
        assert_eq!(single_expansion.len(), 1);
    }

    #[test]
    fn non_text_payloads_never_promote_markdown_like_technical_text() {
        let source = vec![item(
            5,
            "file",
            "![secret](https://secret.example/file) technical placeholder",
        )];
        let cancelled = AtomicBool::new(false);
        let (matches, _) = build_occurrence_index(&source, "secret", &cancelled).unwrap();
        assert!(matches.is_empty());
    }

    #[test]
    fn malformed_nested_markdown_and_open_comments_fail_closed() {
        let source = vec![item(
            6,
            "text",
            "Invoice ![outer [nested]](https://secret.example/a) <!-- open secret.example/b",
        )];
        let cancelled = AtomicBool::new(false);
        let (secret, _) = build_occurrence_index(&source, "secret.example", &cancelled).unwrap();
        assert!(secret.is_empty());
        let (nested_alt, _) = build_occurrence_index(&source, "outer [nested]", &cancelled).unwrap();
        assert_eq!(nested_alt.len(), 1);

        let fenced = vec![item(7, "text", "Invoice ```secret.example/no-close")];
        let (fenced_secret, _) = build_occurrence_index(&fenced, "secret.example", &cancelled)
            .unwrap();
        assert!(fenced_secret.is_empty());
    }

    #[test]
    fn fail_closed_markers_preserve_visible_literals_and_closed_fence_body() {
        let source = vec![item(
            9,
            "text",
            "before [draft] and less < than after ```rust\nInvoice body\n``` tail",
        )];
        let cancelled = AtomicBool::new(false);

        let draft = build_occurrence_index(&source, "draft", &cancelled).unwrap().0;
        assert_eq!(draft.len(), 1, "unresolved [draft] must remain visible");

        let after = build_occurrence_index(&source, "after", &cancelled).unwrap().0;
        assert_eq!(after.len(), 1, "a literal < must not truncate later text");

        let body = build_occurrence_index(&source, "invoice body", &cancelled)
            .unwrap()
            .0;
        assert_eq!(body.len(), 1, "closed fence body is visible content");
    }

    #[test]
    fn malformed_destination_remains_private_without_truncating_next_line() {
        let source = vec![item(
            10,
            "text",
            "[label](https://secret.example/unclosed\nvisible invoice",
        )];
        let cancelled = AtomicBool::new(false);
        let secret = build_occurrence_index(&source, "secret.example", &cancelled)
            .unwrap()
            .0;
        assert!(secret.is_empty());
        let visible = build_occurrence_index(&source, "visible invoice", &cancelled)
            .unwrap()
            .0;
        assert_eq!(visible.len(), 1);
    }

    #[test]
    fn unfinished_tag_like_markup_fails_closed_but_less_than_literal_stays_visible() {
        let cancelled = AtomicBool::new(false);
        let literal = vec![item(11, "text", "one < two three")];
        let three = build_occurrence_index(&literal, "three", &cancelled)
            .unwrap()
            .0;
        assert_eq!(three.len(), 1);

        let ambiguous = vec![item(12, "text", "one <script secret.example after")];
        let secret = build_occurrence_index(&ambiguous, "secret.example", &cancelled)
            .unwrap()
            .0;
        assert!(secret.is_empty());
    }

    #[test]
    fn repeated_image_alts_receive_stable_segment_identity() {
        let source = vec![item(
            8,
            "text",
            "![same](https://one.example) and ![same](https://two.example)",
        )];
        let cancelled = AtomicBool::new(false);
        let (matches, _) = build_occurrence_index(&source, "same", &cancelled).unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].field, FindField::ImageAlt);
        assert_eq!(matches[1].field, FindField::ImageAlt);
        assert_eq!(matches[0].segment, 0);
        assert_eq!(matches[1].segment, 1);
    }

    #[test]
    fn pending_jobs_are_cancelable_by_owner_without_touching_other_owners() {
        let store = FindSessionStore::default();
        let (_, owner_a_session, first_cancelled) = store.begin_job("owner-a", 1, 0);
        let (_, _, superseded_cancelled) = store.begin_job("owner-a", 2, 0);
        assert!(first_cancelled.load(Ordering::SeqCst));
        assert!(!superseded_cancelled.load(Ordering::SeqCst));
        let (_, owner_b_session, _) = store.begin_job("owner-b", 1, 0);
        assert!(store.cancel_owner("owner-a").cancelled);
        {
            let state = store.inner.lock().unwrap();
            assert!(!state.jobs.contains_key("owner-a"));
            assert!(state.jobs.contains_key("owner-b"));
        }
        assert!(
            store
                .close(FindCloseRequest {
                    session_id: owner_b_session,
                    owner_id: Some("owner-b".to_string()),
                })
                .unwrap()
                .closed
        );
        assert!(!store.cancel_owner("owner-b").cancelled);
        let (_, pending_close_session, pending_close_cancelled) =
            store.begin_job("owner-c", 1, 0);
        assert!(
            store
                .close(FindCloseRequest {
                    session_id: pending_close_session,
                    owner_id: Some("owner-c".to_string()),
                })
                .unwrap()
                .closed
        );
        assert!(pending_close_cancelled.load(Ordering::SeqCst));
        assert!(!owner_a_session.is_empty());
    }

    #[test]
    fn failed_pending_job_is_removed_only_if_it_is_still_current() {
        let store = FindSessionStore::default();
        let (token, session_id, cancelled) = store.begin_job("owner-a", 1, 0);
        store.finish_job_if_current("owner-a", token, &session_id);
        assert!(cancelled.load(Ordering::SeqCst));
        let state = store.inner.lock().expect("find state lock should work");
        assert!(!state.jobs.contains_key("owner-a"));
    }

    #[test]
    fn mutation_epoch_invalidates_sessions_even_when_item_had_no_match() {
        let store = FindSessionStore::default();
        let mutation_epoch = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let descriptor = AppliedSearchDescriptor::for_query(
            "",
            "",
            crate::storage::AppliedSearchMode::Structured,
        )
        .unwrap();
        {
            let mut state = store.inner.lock().unwrap();
            state.sessions.insert(
                "epoch-test".to_string(),
                FindSession {
                    id: "epoch-test".to_string(),
                    owner_id: "main".to_string(),
                    search_fingerprint: descriptor.fingerprint.clone(),
                    descriptor,
                    needle: "invoice".to_string(),
                    generation: 1,
                    expected_epoch: 0,
                    mutation_epoch: mutation_epoch.clone(),
                    manually_invalidated: false,
                    occurrences: Vec::new(),
                    by_item: HashMap::new(),
                },
            );
        }
        mutation_epoch.fetch_add(1, Ordering::SeqCst);
        let error = store
            .navigate(FindNavigateRequest {
                session_id: "epoch-test".to_string(),
                ordinal: None,
                current_ordinal: None,
                direction: FindNavigationDirection::Next,
            })
            .unwrap_err();
        assert_eq!(error, "sessionInvalidated");
    }

    #[test]
    fn matches_group_by_item_and_field_and_navigation_wraps() {
        let source = vec![item(1, "text", "one one")];
        let cancelled = AtomicBool::new(false);
        let (occurrences, by_item) = build_occurrence_index(&source, "one", &cancelled).unwrap();
        assert_eq!(occurrences.len(), 2);
        assert_eq!(by_item.get(&1).map(Vec::len), Some(2));
        let store = FindSessionStore::default();
        let mutation_epoch = Arc::new(std::sync::atomic::AtomicU64::new(0));
        {
            let mut state = store.inner.lock().unwrap();
            state.sessions.insert(
                "find-test".to_string(),
                FindSession {
                    id: "find-test".to_string(),
                    owner_id: "main".to_string(),
                    search_fingerprint: "fingerprint".to_string(),
                    descriptor: AppliedSearchDescriptor::for_query(
                        "",
                        "",
                        crate::storage::AppliedSearchMode::Structured,
                    )
                    .unwrap(),
                    needle: "one".to_string(),
                    generation: 1,
                    expected_epoch: 0,
                    mutation_epoch,
                    manually_invalidated: false,
                    occurrences,
                    by_item,
                },
            );
        }
        let next = store
            .navigate(FindNavigateRequest {
                session_id: "find-test".to_string(),
                ordinal: Some(2),
                current_ordinal: None,
                direction: FindNavigationDirection::Next,
            })
            .unwrap();
        assert_eq!(next.target.as_ref().map(|target| target.ordinal), Some(1));
        let grouped = store
            .matches_for_items(FindMatchesForItemsRequest {
                session_id: "find-test".to_string(),
                item_ids: vec![1, 1, 99],
            })
            .unwrap();
        assert_eq!(grouped.items.len(), 1);
        assert_eq!(grouped.items[0].fields[0].ranges.len(), 2);
    }

    #[test]
    fn invalidated_item_rejects_navigation_and_close_is_idempotent() {
        let store = FindSessionStore::default();
        let mutation_epoch = Arc::new(std::sync::atomic::AtomicU64::new(0));
        {
            let mut state = store.inner.lock().unwrap();
            state.sessions.insert(
                "find-test".to_string(),
                FindSession {
                    id: "find-test".to_string(),
                    owner_id: "main".to_string(),
                    search_fingerprint: "fingerprint".to_string(),
                    descriptor: AppliedSearchDescriptor::for_query(
                        "",
                        "",
                        crate::storage::AppliedSearchMode::Structured,
                    )
                    .unwrap(),
                    needle: "one".to_string(),
                    generation: 1,
                    expected_epoch: 0,
                    mutation_epoch,
                    manually_invalidated: false,
                    occurrences: vec![FindOccurrence {
                        ordinal: 1,
                        item_id: 1,
                        field: FindField::Content,
                        segment: 0,
                        start_utf16: 0,
                        end_utf16: 3,
                    }],
                    by_item: HashMap::from([(1, vec![0])]),
                },
            );
        }
        store.invalidate_item(1);
        let error = store
            .target(FindTargetRequest {
                session_id: "find-test".to_string(),
                ordinal: 1,
            })
            .unwrap_err();
        assert_eq!(error, "sessionInvalidated");
        assert!(
            store
                .close(FindCloseRequest {
                    session_id: "find-test".to_string(),
                    owner_id: None,
                })
                .unwrap()
                .closed
        );
        assert!(
            store
                .close(FindCloseRequest {
                    session_id: "find-test".to_string(),
                    owner_id: None,
                })
                .unwrap()
                .closed
        );
    }

    #[test]
    fn target_materialization_returns_the_canonical_display_field_and_item() {
        let app_data_dir = std::env::temp_dir().join(format!(
            "copicu-find-target-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        let item_id = storage
            .insert_text("**Invoice**", "find-target-materialization-hash")
            .expect("target item should insert");
        let source = storage
            .read_find_item(item_id)
            .expect("target item should be readable")
            .expect("target item should exist");
        let cancelled = AtomicBool::new(false);
        let (occurrences, by_item) =
            build_occurrence_index(&[source], "invoice", &cancelled).expect("index should build");
        let target = occurrences
            .first()
            .cloned()
            .expect("target occurrence should exist");
        let descriptor = AppliedSearchDescriptor::for_query(
            "",
            "",
            crate::storage::AppliedSearchMode::Structured,
        )
        .expect("descriptor should compile");
        let store = FindSessionStore::default();
        let mutation_epoch = storage.mutation_epoch();
        let expected_epoch = mutation_epoch.load(Ordering::SeqCst);
        {
            let mut state = store.inner.lock().expect("find state lock should work");
            state.sessions.insert(
                "target-session".to_string(),
                FindSession {
                    id: "target-session".to_string(),
                    owner_id: "main".to_string(),
                    search_fingerprint: descriptor.fingerprint.clone(),
                    descriptor,
                    needle: "invoice".to_string(),
                    generation: 1,
                    expected_epoch,
                    mutation_epoch,
                    manually_invalidated: false,
                    occurrences,
                    by_item,
                },
            );
        }

        let response = store
            .target_materialized(
                &storage,
                FindTargetRequest {
                    session_id: "target-session".to_string(),
                    ordinal: target.ordinal,
                },
            )
            .expect("target should materialize");
        let materialized = response
            .materialized
            .expect("target should include materialized item");
        assert_eq!(materialized.item_id, item_id);
        assert_eq!(materialized.display_text, "Invoice");
        assert_eq!(materialized.item.id, item_id);
        assert_eq!(materialized.item.text, "**Invoice**");
        storage
            .update_item(crate::storage::UpdateHistoryItemRequest {
                id: item_id,
                text: "**Changed**".to_string(),
                title: None,
                notes: None,
                tags: None,
                mime_primary: Some("text/plain".to_string()),
                marked: None,
            })
            .expect("target mutation should succeed");
        let invalidated = store
            .target_materialized(
                &storage,
                FindTargetRequest {
                    session_id: "target-session".to_string(),
                    ordinal: target.ordinal,
                },
            )
            .expect_err("live target mutation must invalidate the session");
        assert_eq!(invalidated, "sessionInvalidated");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn matches_contract_carries_canonical_display_segments_for_repeated_alts() {
        let app_data_dir = std::env::temp_dir().join(format!(
            "copicu-find-segment-contract-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        let item_id = storage
            .insert_text(
                "![same](https://one.example) and ![same](https://two.example)",
                "find-segment-contract-hash",
            )
            .expect("segment item should insert");
        let source = storage
            .read_find_item(item_id)
            .expect("segment item should be readable")
            .expect("segment item should exist");
        let cancelled = AtomicBool::new(false);
        let (occurrences, by_item) =
            build_occurrence_index(&[source], "same", &cancelled).expect("index should build");
        let descriptor = AppliedSearchDescriptor::for_query(
            "",
            "",
            crate::storage::AppliedSearchMode::Structured,
        )
        .expect("descriptor should compile");
        let store = FindSessionStore::default();
        let mutation_epoch = storage.mutation_epoch();
        {
            let mut state = store.inner.lock().expect("Find state lock should work");
            state.sessions.insert(
                "segment-contract-session".to_string(),
                FindSession {
                    id: "segment-contract-session".to_string(),
                    owner_id: "main".to_string(),
                    search_fingerprint: descriptor.fingerprint.clone(),
                    descriptor,
                    needle: "same".to_string(),
                    generation: 1,
                    expected_epoch: mutation_epoch.load(Ordering::SeqCst),
                    mutation_epoch,
                    manually_invalidated: false,
                    occurrences,
                    by_item,
                },
            );
        }
        let response = store
            .matches_for_items_materialized(
                &storage,
                FindMatchesForItemsRequest {
                    session_id: "segment-contract-session".to_string(),
                    item_ids: vec![item_id],
                },
            )
            .expect("segment matches should materialize");
        let image_matches = response.items[0]
            .fields
            .iter()
            .find(|field| field.field == FindField::ImageAlt)
            .expect("image alt matches should be grouped");
        assert_eq!(image_matches.ranges.len(), 2);
        assert_eq!(image_matches.segments.len(), 2);
        assert_eq!(image_matches.segments[0].segment, 0);
        assert_eq!(image_matches.segments[1].segment, 1);
        assert_eq!(image_matches.segments[0].display_text, "same");
        assert_eq!(image_matches.segments[1].display_text, "same");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn serialized_contracts_keep_ipc_names_stable() {
        let occurrence = FindOccurrence {
            ordinal: 2,
            item_id: 9,
            field: FindField::ImageAlt,
            segment: 0,
            start_utf16: 4,
            end_utf16: 10,
        };
        let encoded = serde_json::to_value(FindStartResponse {
            session_id: "find-test".to_string(),
            owner_id: "main".to_string(),
            generation: 3,
            total: 7,
            first_target: Some(occurrence.clone()),
        })
        .unwrap();
        assert_eq!(encoded["sessionId"], "find-test");
        assert_eq!(encoded["firstTarget"]["itemId"], 9);
        assert_eq!(encoded["firstTarget"]["startUtf16"], 4);
        assert_eq!(encoded["firstTarget"]["field"], "imageAlt");
    }

    #[test]
    fn real_50k_find_scan_and_projection_stay_within_memory_budget() {
        let app_data_dir = std::env::temp_dir().join(format!(
            "copicu-find-real-50k-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_find_benchmark_items(50_000)
            .expect("benchmark rows should insert");
        let descriptor = AppliedSearchDescriptor::for_query(
            "all",
            "",
            crate::storage::AppliedSearchMode::Structured,
        )
        .expect("descriptor should compile");
        let cancelled = AtomicBool::new(false);
        let started = Instant::now();
        let source = storage
            .read_find_items(&descriptor)
            .expect("real Find scan should load all rows");
        assert_eq!(source.len(), 50_000);
        let (occurrences, by_item) = build_occurrence_index(&source, "invoice", &cancelled)
            .expect("real Find projection should build");
        let source_text_bytes = source.iter().map(|item| item.text.len()).sum::<usize>();
        let source_struct_bytes = source.len() * std::mem::size_of::<FindSourceItem>();
        let range_bytes = occurrences.len() * std::mem::size_of::<FindOccurrence>();
        let by_item_bytes = by_item.len()
            * (std::mem::size_of::<i64>()
                + std::mem::size_of::<Vec<usize>>()
                + std::mem::size_of::<usize>());
        let estimated_peak_bytes = source_text_bytes
            + source_struct_bytes
            + range_bytes
            + by_item_bytes;
        eprintln!(
            "real_50k_find_scan_and_projection elapsed_ms={} occurrences={} items={} estimated_peak_bytes={} source_text_bytes={} source_struct_bytes={} range_bytes={} by_item_bytes={}",
            started.elapsed().as_millis(),
            occurrences.len(),
            by_item.len(),
            estimated_peak_bytes,
            source_text_bytes,
            source_struct_bytes,
            range_bytes,
            by_item_bytes,
        );
        assert!(estimated_peak_bytes < 64 * 1024 * 1024);
        assert_eq!(occurrences.len(), 50_000);
        assert_eq!(by_item.len(), 50_000);
        assert_eq!(occurrences[49_999].ordinal, 50_000);
        assert_eq!(occurrences[49_999].start_utf16, 0);
        assert_eq!(occurrences[49_999].end_utf16, 7);
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn cancellation_is_checked_between_item_batches() {
        let source = (1..=64)
            .map(|id| item(id, "text", "invoice body"))
            .collect::<Vec<_>>();
        let cancelled = AtomicBool::new(true);
        let error = build_occurrence_index(&source, "invoice", &cancelled).unwrap_err();
        assert_eq!(error, "find start superseded");
    }
}
