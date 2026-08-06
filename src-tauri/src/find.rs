use crate::storage::{AppStorage, AppliedSearchDescriptor};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

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
    pub start_utf16: u32,
    pub end_utf16: u32,
}

impl FindOccurrence {
    fn range(&self) -> FindRange {
        FindRange {
            ordinal: self.ordinal,
            start_utf16: self.start_utf16,
            end_utf16: self.end_utf16,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindRange {
    pub ordinal: u64,
    pub start_utf16: u32,
    pub end_utf16: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindFieldMatches {
    pub field: FindField,
    pub ranges: Vec<FindRange>,
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindStartResponse {
    pub session_id: String,
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindCloseResponse {
    pub closed: bool,
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
    active: Option<FindSession>,
    active_job: Option<FindJob>,
    invalidated_items: Vec<i64>,
}

struct FindJob {
    token: u64,
    session_id: String,
    cancelled: Arc<AtomicBool>,
}

#[allow(dead_code)]
struct FindSession {
    id: String,
    search_fingerprint: String,
    needle: String,
    generation: u64,
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
        let (token, session_id, cancelled) = self.begin_job();
        let store = self.clone();
        let descriptor = request.applied_descriptor;
        let generation = request.generation;
        let needle_for_worker = needle.clone();

        let result = tauri::async_runtime::spawn_blocking(move || {
            let source = storage.read_find_items(&descriptor)?;
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
            if state.active_job.as_ref().map(|job| job.token) != Some(token)
                || cancelled.load(Ordering::SeqCst)
            {
                return Err("find start superseded".to_string());
            }

            let first_target = occurrences.first().cloned();
            let total = occurrences.len() as u64;
            state.active = Some(FindSession {
                id: session_id.clone(),
                search_fingerprint: descriptor.fingerprint,
                needle: needle_for_worker,
                generation,
                occurrences,
                by_item,
            });
            state.active_job = None;
            state.invalidated_items.clear();

            Ok(FindStartResponse {
                session_id,
                generation,
                total,
                first_target,
            })
        })
        .await
        .map_err(|error| format!("find worker failed: {error}"))??;

        Ok(result)
    }

    pub fn navigate(&self, request: FindNavigateRequest) -> Result<FindNavigateResponse, String> {
        let state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session = state
            .active
            .as_ref()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session, &state.invalidated_items)?;

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
            .active
            .as_ref()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session, &state.invalidated_items)?;
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
        })
    }

    pub fn matches_for_items(
        &self,
        request: FindMatchesForItemsRequest,
    ) -> Result<FindMatchesForItemsResponse, String> {
        let state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let session = state
            .active
            .as_ref()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| "find session not found".to_string())?;
        ensure_session_is_valid(session, &state.invalidated_items)?;

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
            items.push(FindItemMatches {
                item_id,
                fields: fields
                    .into_iter()
                    .map(|(field, ranges)| FindFieldMatches { field, ranges })
                    .collect(),
            });
        }
        Ok(FindMatchesForItemsResponse { items })
    }

    pub fn close(&self, request: FindCloseRequest) -> Result<FindCloseResponse, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "find session state lock poisoned".to_string())?;
        let active_matches = state
            .active
            .as_ref()
            .map(|session| session.id == request.session_id)
            .unwrap_or(false);
        let job_matches = state
            .active_job
            .as_ref()
            .map(|job| job.session_id == request.session_id)
            .unwrap_or(false);
        if active_matches {
            state.active = None;
            state.invalidated_items.clear();
        }
        if job_matches {
            if let Some(job) = state.active_job.take() {
                job.cancelled.store(true, Ordering::SeqCst);
            }
        }
        Ok(FindCloseResponse { closed: true })
    }

    pub fn invalidate_item(&self, item_id: i64) {
        if let Ok(mut state) = self.inner.lock() {
            if state.active.is_some() && !state.invalidated_items.contains(&item_id) {
                state.invalidated_items.push(item_id);
            }
        }
    }

    fn begin_job(&self) -> (u64, String, Arc<AtomicBool>) {
        let mut state = self.inner.lock().expect("find session state lock poisoned");
        if let Some(previous) = state.active_job.take() {
            previous.cancelled.store(true, Ordering::SeqCst);
        }
        state.next_id = state.next_id.saturating_add(1);
        let token = state.next_id;
        let session_id = opaque_session_id(token);
        let cancelled = Arc::new(AtomicBool::new(false));
        state.active = None;
        state.invalidated_items.clear();
        state.active_job = Some(FindJob {
            token,
            session_id: session_id.clone(),
            cancelled: cancelled.clone(),
        });
        (token, session_id, cancelled)
    }
}

fn ensure_session_is_valid(session: &FindSession, invalidated_items: &[i64]) -> Result<(), String> {
    if invalidated_items.iter().any(|item_id| {
        session
            .occurrences
            .iter()
            .any(|occurrence| occurrence.item_id == *item_id)
    }) {
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
}

#[derive(Clone, Copy, Debug)]
struct OffsetSpan {
    start_utf16: u32,
    end_utf16: u32,
}

fn build_occurrence_index(
    source: &[crate::storage::FindSourceItem],
    needle: &str,
    cancelled: &AtomicBool,
) -> Result<(Vec<FindOccurrence>, HashMap<i64, Vec<usize>>), String> {
    let mut occurrences = Vec::new();
    let normalized_needle = lowercase_scalars(needle).0;
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
        fields.extend(image_alts);
    } else if !item.text.is_empty() {
        // Image/file payload placeholders are technical metadata, not Find content.
        let _ = &item.text;
    }
    if let Some(title) = item.title.as_deref().filter(|value| !value.is_empty()) {
        fields.push(project_plain_field(FindField::Title, title));
    }
    let tags_value = item.tags.as_deref().unwrap_or_default();
    for (_, start, end) in split_tag_fields(tags_value) {
        fields.push(project_tag_field(FindField::Tag, tags_value, start, end));
    }
    if let Some(notes) = item.notes.as_deref().filter(|value| !value.is_empty()) {
        let (notes_field, image_alts) = project_markdown(notes);
        if !notes_field.text.is_empty() {
            fields.push(ProjectedField {
                field: FindField::Notes,
                ..notes_field
            });
        }
        for mut alt in image_alts {
            alt.field = FindField::Notes;
            fields.push(alt);
        }
    }
    fields
}

fn should_project_content(content_kind: &str, text: &str) -> bool {
    matches!(content_kind, "text" | "html" | "unknown") || contains_markdown_image(text)
}

fn project_plain_field(field: FindField, value: &str) -> ProjectedField {
    let mut text = String::new();
    let mut spans = Vec::new();
    let mut utf16 = 0u32;
    for (byte_start, ch) in value.char_indices() {
        debug_assert_eq!(
            utf16,
            value[..byte_start].encode_utf16().count() as u32,
            "plain field UTF-16 offset should follow the source cursor"
        );
        let start_utf16 = utf16;
        let end_utf16 = start_utf16 + ch.len_utf16() as u32;
        text.push(ch);
        spans.push(OffsetSpan {
            start_utf16,
            end_utf16,
        });
        utf16 = end_utf16;
    }
    ProjectedField { field, text, spans }
}

fn project_tag_field(field: FindField, source: &str, start: usize, end: usize) -> ProjectedField {
    let offsets = utf16_offsets(source);
    let mut projected = ProjectedField {
        field,
        text: String::new(),
        spans: Vec::new(),
    };
    append_visible_range(&mut projected, source, start, end, &offsets);
    projected
}

fn project_markdown(source: &str) -> (ProjectedField, Vec<ProjectedField>) {
    let offsets = utf16_offsets(source);
    let mut content = ProjectedField {
        field: FindField::Content,
        text: String::new(),
        spans: Vec::new(),
    };
    let mut image_alts = Vec::new();
    let mut cursor = 0usize;
    let mut line_start = true;
    while cursor < source.len() {
        if line_start && source[cursor..].starts_with('[') {
            if let Some(line_end) = source[cursor..].find('\n') {
                let line = &source[cursor..cursor + line_end];
                if let Some(close_label) = line.find(']') {
                    if line[close_label + 1..].trim_start().starts_with(':') {
                        cursor += line_end;
                        line_start = true;
                        continue;
                    }
                }
            }
        }
        if source[cursor..].starts_with("<!--") {
            if let Some(end) = source[cursor + 4..].find("-->") {
                cursor += 4 + end + 3;
                line_start = false;
                continue;
            }
        }
        if source[cursor..].starts_with("![") {
            if let Some(close_alt) = source[cursor + 2..].find(']') {
                let alt_start = cursor + 2;
                let alt_end = alt_start + close_alt;
                let after_alt = alt_end + 1;
                if source
                    .get(after_alt..)
                    .is_some_and(|tail| tail.starts_with('('))
                {
                    if let Some(close_url) = find_markdown_destination_end(source, after_alt + 1) {
                        let alt = project_plain_range(
                            FindField::ImageAlt,
                            source,
                            alt_start,
                            alt_end,
                            &offsets,
                        );
                        image_alts.push(alt);
                        cursor = close_url + 1;
                        line_start = false;
                        continue;
                    }
                }
            }
        }
        if source[cursor..].starts_with('[') {
            if let Some(close_label) = source[cursor + 1..].find(']') {
                let label_start = cursor + 1;
                let label_end = label_start + close_label;
                let after_label = label_end + 1;
                if source
                    .get(after_label..)
                    .is_some_and(|tail| tail.starts_with('('))
                {
                    if let Some(close_url) = find_markdown_destination_end(source, after_label + 1)
                    {
                        append_visible_range(
                            &mut content,
                            source,
                            label_start,
                            label_end,
                            &offsets,
                        );
                        cursor = close_url + 1;
                        line_start = false;
                        continue;
                    }
                }
            }
        }
        if source[cursor..].starts_with("```") {
            cursor += 3;
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
                cursor = next + end + 1;
                line_start = false;
                continue;
            }
        }
        let skip_marker = matches!(ch, '*' | '~' | '`')
            || (line_start && matches!(ch, '#' | '>' | '-' | '+' | '*'));
        if skip_marker {
            cursor = next;
            line_start = false;
            continue;
        }
        if ch == '\n' {
            content.text.push(ch);
            content.spans.push(OffsetSpan {
                start_utf16: offsets[&cursor].0,
                end_utf16: offsets[&cursor].1,
            });
            cursor = next;
            line_start = true;
            continue;
        }
        content.text.push(ch);
        content.spans.push(OffsetSpan {
            start_utf16: offsets[&cursor].0,
            end_utf16: offsets[&cursor].1,
        });
        cursor = next;
        line_start = false;
    }
    (content, image_alts)
}

fn project_plain_range(
    field: FindField,
    source: &str,
    start: usize,
    end: usize,
    offsets: &HashMap<usize, (u32, u32)>,
) -> ProjectedField {
    let mut projected = ProjectedField {
        field,
        text: String::new(),
        spans: Vec::new(),
    };
    append_visible_range(&mut projected, source, start, end, offsets);
    projected
}

fn append_visible_range(
    destination: &mut ProjectedField,
    source: &str,
    start: usize,
    end: usize,
    offsets: &HashMap<usize, (u32, u32)>,
) {
    let mut cursor = start;
    while cursor < end {
        let ch = source[cursor..end]
            .chars()
            .next()
            .expect("range is a char boundary");
        let next = cursor + ch.len_utf8();
        if !matches!(ch, '*' | '~' | '`') {
            destination.text.push(ch);
            if let Some((start_utf16, end_utf16)) = offsets.get(&cursor) {
                destination.spans.push(OffsetSpan {
                    start_utf16: *start_utf16,
                    end_utf16: *end_utf16,
                });
            }
        }
        cursor = next;
    }
}

fn find_markdown_destination_end(source: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut cursor = start;
    while cursor < source.len() {
        let ch = source[cursor..].chars().next()?;
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

fn contains_markdown_image(value: &str) -> bool {
    value.contains("![")
}

fn split_tag_fields(value: &str) -> Vec<(&str, usize, usize)> {
    let mut tags = Vec::new();
    let mut cursor = 0usize;
    while cursor < value.len() {
        while cursor < value.len() {
            let ch = value[cursor..]
                .chars()
                .next()
                .expect("cursor is a char boundary");
            if ch.is_whitespace() || ch == ',' {
                cursor += ch.len_utf8();
            } else {
                break;
            }
        }
        let start = cursor;
        while cursor < value.len() {
            let ch = value[cursor..]
                .chars()
                .next()
                .expect("cursor is a char boundary");
            if ch.is_whitespace() || ch == ',' {
                break;
            }
            cursor += ch.len_utf8();
        }
        let end = cursor;
        if start == end {
            continue;
        }
        let label_start = if value[start..].starts_with('#') {
            start + '#'.len_utf8()
        } else {
            start
        };
        if label_start < end {
            tags.push((&value[label_start..end], label_start, end));
        }
    }
    tags
}

fn utf16_offsets(source: &str) -> HashMap<usize, (u32, u32)> {
    let mut offsets = HashMap::new();
    let mut utf16 = 0u32;
    for (byte_start, ch) in source.char_indices() {
        let end_utf16 = utf16 + ch.len_utf16() as u32;
        offsets.insert(byte_start, (utf16, end_utf16));
        utf16 = end_utf16;
    }
    offsets
}

fn lowercase_scalars(value: &str) -> (Vec<char>, Vec<OffsetSpan>) {
    let offsets = utf16_offsets(value);
    let mut lowered = Vec::new();
    let mut spans = Vec::new();
    for (byte_start, ch) in value.char_indices() {
        let (start_utf16, end_utf16) = offsets[&byte_start];
        for lowered_ch in ch.to_lowercase() {
            lowered.push(lowered_ch);
            spans.push(OffsetSpan {
                start_utf16,
                end_utf16,
            });
        }
    }
    (lowered, spans)
}

fn match_projected_field(field: &ProjectedField, needle: &[char]) -> Vec<OffsetSpan> {
    let (lowered, spans) = lowercase_projected_field(field);
    if needle.is_empty() || lowered.len() < needle.len() {
        return Vec::new();
    }
    let mut matches = Vec::new();
    let mut cursor = 0usize;
    while cursor + needle.len() <= lowered.len() {
        if lowered[cursor..cursor + needle.len()] == *needle {
            let start = spans[cursor].start_utf16;
            let end = spans[cursor + needle.len() - 1].end_utf16;
            matches.push(OffsetSpan {
                start_utf16: start,
                end_utf16: end,
            });
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
    for (index, ch) in field.text.chars().enumerate() {
        let source_span = field.spans.get(index).copied().unwrap_or(OffsetSpan {
            start_utf16: 0,
            end_utf16: 0,
        });
        for lowered_ch in ch.to_lowercase() {
            lowered.push(lowered_ch);
            spans.push(source_span);
        }
    }
    (lowered, spans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::FindSourceItem;
    use std::time::Instant;

    fn item(id: i64, content_kind: &str, text: &str) -> FindSourceItem {
        FindSourceItem {
            id,
            content_kind: content_kind.to_string(),
            text: text.to_string(),
            title: None,
            notes: None,
            tags: None,
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
        assert_eq!((visible[0].start_utf16, visible[0].end_utf16), (2, 9));
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
    fn matches_group_by_item_and_field_and_navigation_wraps() {
        let source = vec![item(1, "text", "one one")];
        let cancelled = AtomicBool::new(false);
        let (occurrences, by_item) = build_occurrence_index(&source, "one", &cancelled).unwrap();
        assert_eq!(occurrences.len(), 2);
        assert_eq!(by_item.get(&1).map(Vec::len), Some(2));
        let store = FindSessionStore::default();
        {
            let mut state = store.inner.lock().unwrap();
            state.active = Some(FindSession {
                id: "find-test".to_string(),
                search_fingerprint: "fingerprint".to_string(),
                needle: "one".to_string(),
                generation: 1,
                occurrences,
                by_item,
            });
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
        {
            let mut state = store.inner.lock().unwrap();
            state.active = Some(FindSession {
                id: "find-test".to_string(),
                search_fingerprint: "fingerprint".to_string(),
                needle: "one".to_string(),
                generation: 1,
                occurrences: vec![FindOccurrence {
                    ordinal: 1,
                    item_id: 1,
                    field: FindField::Content,
                    start_utf16: 0,
                    end_utf16: 3,
                }],
                by_item: HashMap::from([(1, vec![0])]),
            });
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
                })
                .unwrap()
                .closed
        );
        assert!(
            store
                .close(FindCloseRequest {
                    session_id: "find-test".to_string(),
                })
                .unwrap()
                .closed
        );
    }

    #[test]
    fn serialized_contracts_keep_ipc_names_stable() {
        let occurrence = FindOccurrence {
            ordinal: 2,
            item_id: 9,
            field: FindField::ImageAlt,
            start_utf16: 4,
            end_utf16: 10,
        };
        let encoded = serde_json::to_value(FindStartResponse {
            session_id: "find-test".to_string(),
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
    fn synthetic_50k_find_index_stays_bounded_to_ranges() {
        let source = (1..=50_000)
            .map(|id| item(id, "text", "invoice body with a stable token"))
            .collect::<Vec<_>>();
        let cancelled = AtomicBool::new(false);
        let started = Instant::now();
        let (occurrences, by_item) =
            build_occurrence_index(&source, "invoice", &cancelled).unwrap();
        eprintln!(
            "synthetic_50k_find_index elapsed_ms={} occurrences={} items={}",
            started.elapsed().as_millis(),
            occurrences.len(),
            by_item.len()
        );
        assert_eq!(occurrences.len(), 50_000);
        assert_eq!(by_item.len(), 50_000);
        assert_eq!(occurrences[49_999].ordinal, 50_000);
        assert_eq!(occurrences[49_999].start_utf16, 0);
        assert_eq!(occurrences[49_999].end_utf16, 7);
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
