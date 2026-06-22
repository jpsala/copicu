use rusqlite::types::Value;
use serde::{Deserialize, Serialize};

use super::{
    escape_like, normalize_tag_label, now_unix_ms, HistoryItem, HistoryPage, HistoryPageCursor,
    HISTORY_PREVIEW_CHAR_LIMIT, MAX_HISTORY_PAGE_LIMIT, MILLIS_PER_DAY, MIN_HISTORY_PAGE_LIMIT,
};
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanV1 {
    pub schema_version: u8,
    #[serde(default)]
    pub text: Option<SearchPlanTextV1>,
    #[serde(default)]
    pub filters: Option<SearchPlanFiltersV1>,
    #[serde(default)]
    pub sort: Vec<SearchPlanSortV1>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanTextV1 {
    #[serde(default)]
    pub all: Vec<String>,
    #[serde(default)]
    pub any: Vec<String>,
    #[serde(default)]
    pub phrases: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanFiltersV1 {
    #[serde(default)]
    pub kind: Vec<SearchPlanKindV1>,
    #[serde(default)]
    pub not_kind: Vec<SearchPlanKindV1>,
    #[serde(default)]
    pub mime: Vec<String>,
    #[serde(default)]
    pub not_mime: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub not_tags: Vec<String>,
    #[serde(default)]
    pub has: Vec<SearchPlanHasV1>,
    #[serde(default)]
    pub missing: Vec<SearchPlanMissingV1>,
    #[serde(default)]
    pub marked: Option<bool>,
    #[serde(default)]
    pub date: Vec<SearchPlanDateFilterV1>,
    #[serde(default)]
    pub source_app: Vec<String>,
    #[serde(default)]
    pub not_source_app: Vec<String>,
    #[serde(default)]
    pub window_title: Vec<String>,
    #[serde(default)]
    pub not_window_title: Vec<String>,
    #[serde(default)]
    pub domain: Vec<String>,
    #[serde(default)]
    pub not_domain: Vec<String>,
    #[serde(default)]
    pub source_kind: Vec<String>,
    #[serde(default)]
    pub clipboard_format: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanKindV1 {
    Text,
    Image,
    Html,
    File,
    Unknown,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanHasV1 {
    Text,
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
    Image,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanMissingV1 {
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanDateFilterV1 {
    pub field: SearchPlanDateFieldV1,
    pub op: SearchPlanDateOpV1,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub end_value: Option<String>,
    #[serde(default)]
    pub relative: Option<SearchPlanRelativeDateV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanDateFieldV1 {
    Created,
    LastUsed,
    LastCopied,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanDateOpV1 {
    After,
    Before,
    On,
    Between,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanRelativeDateV1 {
    pub amount: i64,
    pub unit: SearchPlanRelativeUnitV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanRelativeUnitV1 {
    Minute,
    Hour,
    Day,
    Week,
    Month,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanSortV1 {
    pub field: SearchPlanSortFieldV1,
    pub direction: SearchPlanSortDirectionV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanSortFieldV1 {
    Created,
    LastUsed,
    LastCopied,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanSortDirectionV1 {
    Asc,
    Desc,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct ParsedHistoryQuery {
    pub(super) text_terms: Vec<String>,
    pub(super) excluded_text_terms: Vec<String>,
    pub(super) tags: Vec<String>,
    pub(super) excluded_tags: Vec<String>,
    pub(super) kinds: Vec<String>,
    pub(super) excluded_kinds: Vec<String>,
    pub(super) mimes: Vec<String>,
    pub(super) excluded_mimes: Vec<String>,
    pub(super) has_filters: Vec<HasFilter>,
    pub(super) missing_filters: Vec<HasFilter>,
    pub(super) marked_filters: Vec<bool>,
    pub(super) after_unix_ms: Option<i64>,
    pub(super) before_unix_ms: Option<i64>,
    pub(super) source_apps: Vec<String>,
    pub(super) excluded_source_apps: Vec<String>,
    pub(super) window_titles: Vec<String>,
    pub(super) excluded_window_titles: Vec<String>,
    pub(super) domains: Vec<String>,
    pub(super) excluded_domains: Vec<String>,
    pub(super) source_kinds: Vec<String>,
    pub(super) clipboard_formats: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HasFilter {
    Text,
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
    Image,
}

pub(super) fn parse_history_query(query: &str) -> ParsedHistoryQuery {
    let mut parsed = ParsedHistoryQuery::default();
    for token in tokenize_query(query) {
        let (negated, raw_token) = token
            .strip_prefix('-')
            .filter(|value| !value.is_empty())
            .map(|value| (true, value))
            .unwrap_or((false, token.as_str()));

        if let Some(tag) = raw_token.strip_prefix('#') {
            push_tag_filter(&mut parsed, tag, negated);
            continue;
        }

        let Some((key, value)) = raw_token.split_once(':') else {
            push_text_filter(&mut parsed, raw_token, negated);
            continue;
        };

        let key = key.to_ascii_lowercase();
        match key.as_str() {
            "tag" | "tags" => {
                for value in split_filter_values(value) {
                    push_tag_filter(&mut parsed, value, negated);
                }
            }
            "kind" | "type" => {
                for value in split_filter_values(value) {
                    push_kind_filter(&mut parsed, value, negated);
                }
            }
            "is" => {
                for value in split_filter_values(value) {
                    push_is_filter(&mut parsed, value, negated);
                }
            }
            "mime" => {
                for value in split_filter_values(value) {
                    push_mime_filter(&mut parsed, value, negated);
                }
            }
            "has" => {
                for value in split_filter_values(value) {
                    push_has_filter(&mut parsed, value, negated);
                }
            }
            "app" | "program" | "process" => {
                for value in split_filter_values(value) {
                    push_capture_value_filter(
                        &mut parsed.source_apps,
                        &mut parsed.excluded_source_apps,
                        value,
                        negated,
                    );
                }
            }
            "window" | "title" => {
                for value in split_filter_values(value) {
                    push_capture_value_filter(
                        &mut parsed.window_titles,
                        &mut parsed.excluded_window_titles,
                        value,
                        negated,
                    );
                }
            }
            "domain" | "site" => {
                for value in split_filter_values(value) {
                    push_capture_value_filter(
                        &mut parsed.domains,
                        &mut parsed.excluded_domains,
                        value,
                        negated,
                    );
                }
            }
            "source" => {
                if negated {
                    push_text_filter(&mut parsed, raw_token, negated);
                } else {
                    for value in split_filter_values(value) {
                        push_include_capture_value_filter(&mut parsed.source_kinds, value);
                    }
                }
            }
            "format" | "fmt" => {
                if negated {
                    push_text_filter(&mut parsed, raw_token, negated);
                } else {
                    for value in split_filter_values(value) {
                        push_include_capture_value_filter(&mut parsed.clipboard_formats, value);
                    }
                }
            }
            "after" | "since" => {
                if !negated {
                    parsed.after_unix_ms = parse_date_or_relative_ms(value, DateBound::Start);
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            "before" | "until" => {
                if !negated {
                    parsed.before_unix_ms = parse_date_or_relative_ms(value, DateBound::Start);
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            "on" => {
                if !negated {
                    if let Some(start) = parse_date_or_relative_ms(value, DateBound::Start) {
                        parsed.after_unix_ms = Some(start);
                        parsed.before_unix_ms = Some(start.saturating_add(MILLIS_PER_DAY));
                    }
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            _ => push_text_filter(&mut parsed, raw_token, negated),
        }
    }

    parsed
}

fn tokenize_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut escaped = false;

    for ch in query.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            '\\' if in_quote => escaped = true,
            '"' => in_quote = !in_quote,
            ch if ch.is_whitespace() && !in_quote => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn split_filter_values(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn push_text_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_text_terms.push(value.to_string());
    } else {
        parsed.text_terms.push(value.to_string());
    }
}

fn push_tag_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().trim_start_matches('#');
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_tags.push(value.to_string());
    } else {
        parsed.tags.push(value.to_string());
    }
}

fn push_kind_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_kinds.push(value);
    } else {
        parsed.kinds.push(value);
    }
}

fn push_is_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    match value.as_str() {
        "marked" | "checked" => {
            parsed.marked_filters.push(!negated);
        }
        "unmarked" | "unchecked" => {
            parsed.marked_filters.push(negated);
        }
        _ => push_text_filter(parsed, &format!("is:{value}"), negated),
    }
}

fn push_mime_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_mimes.push(value);
    } else {
        parsed.mimes.push(value);
    }
}

fn push_capture_value_filter(
    include: &mut Vec<String>,
    exclude: &mut Vec<String>,
    value: &str,
    negated: bool,
) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    if negated {
        exclude.push(value.to_string());
    } else {
        include.push(value.to_string());
    }
}

fn push_include_capture_value_filter(include: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if !value.is_empty() {
        include.push(value.to_string());
    }
}

fn push_has_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let Some(filter) = parse_has_filter(value) else {
        push_text_filter(parsed, &format!("has:{value}"), negated);
        return;
    };

    if negated {
        parsed.missing_filters.push(filter);
    } else {
        parsed.has_filters.push(filter);
    }
}

fn parse_has_filter(value: &str) -> Option<HasFilter> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(HasFilter::Text),
        "title" => Some(HasFilter::Title),
        "note" | "notes" => Some(HasFilter::Notes),
        "tag" | "tags" => Some(HasFilter::Tags),
        "metadata" | "meta" => Some(HasFilter::Metadata),
        "mime" => Some(HasFilter::Mime),
        "blob" | "file" => Some(HasFilter::Blob),
        "image" => Some(HasFilter::Image),
        _ => None,
    }
}

pub(super) struct CompiledHistorySearch {
    pub(super) where_sql: String,
    pub(super) params: Vec<Value>,
    pub(super) order_sql: String,
    pub(super) limit: Option<i64>,
}

pub(super) fn search_plan_from_query(query: &str) -> SearchPlanV1 {
    parsed_query_to_search_plan(parse_history_query(query))
}

fn parsed_query_to_search_plan(query: ParsedHistoryQuery) -> SearchPlanV1 {
    let mut text = SearchPlanTextV1::default();
    text.all = query.text_terms;
    text.exclude = query.excluded_text_terms;

    let mut filters = SearchPlanFiltersV1::default();
    filters.tags = query.tags;
    filters.not_tags = query.excluded_tags;
    filters.kind = query
        .kinds
        .iter()
        .filter_map(|kind| parse_search_plan_kind(kind))
        .collect();
    filters.not_kind = query
        .excluded_kinds
        .iter()
        .filter_map(|kind| parse_search_plan_kind(kind))
        .collect();
    filters.mime = query.mimes;
    filters.not_mime = query.excluded_mimes;
    filters.has = query.has_filters.iter().copied().map(Into::into).collect();
    filters.missing = query
        .missing_filters
        .iter()
        .filter_map(|filter| SearchPlanMissingV1::try_from(*filter).ok())
        .collect();
    if let Some(marked) = query.marked_filters.last() {
        filters.marked = Some(*marked);
    }
    filters.source_app = query.source_apps;
    filters.not_source_app = query.excluded_source_apps;
    filters.window_title = query.window_titles;
    filters.not_window_title = query.excluded_window_titles;
    filters.domain = query.domains;
    filters.not_domain = query.excluded_domains;
    filters.source_kind = query.source_kinds;
    filters.clipboard_format = query.clipboard_formats;
    if let Some(after_unix_ms) = query.after_unix_ms {
        filters.date.push(SearchPlanDateFilterV1 {
            field: SearchPlanDateFieldV1::Created,
            op: SearchPlanDateOpV1::After,
            value: Some(format_unix_ms_ymd(after_unix_ms)),
            end_value: None,
            relative: None,
        });
    }
    if let Some(before_unix_ms) = query.before_unix_ms {
        filters.date.push(SearchPlanDateFilterV1 {
            field: SearchPlanDateFieldV1::Created,
            op: SearchPlanDateOpV1::Before,
            value: Some(format_unix_ms_ymd(before_unix_ms)),
            end_value: None,
            relative: None,
        });
    }

    SearchPlanV1 {
        schema_version: 1,
        text: Some(text).filter(|text| {
            !text.all.is_empty()
                || !text.any.is_empty()
                || !text.phrases.is_empty()
                || !text.exclude.is_empty()
        }),
        filters: Some(filters).filter(|filters| !filters.is_empty()),
        sort: Vec::new(),
        limit: None,
    }
}

impl SearchPlanFiltersV1 {
    fn is_empty(&self) -> bool {
        self.kind.is_empty()
            && self.not_kind.is_empty()
            && self.mime.is_empty()
            && self.not_mime.is_empty()
            && self.tags.is_empty()
            && self.not_tags.is_empty()
            && self.has.is_empty()
            && self.missing.is_empty()
            && self.marked.is_none()
            && self.date.is_empty()
            && self.source_app.is_empty()
            && self.not_source_app.is_empty()
            && self.window_title.is_empty()
            && self.not_window_title.is_empty()
            && self.domain.is_empty()
            && self.not_domain.is_empty()
            && self.source_kind.is_empty()
            && self.clipboard_format.is_empty()
    }
}

pub(super) fn compile_search_plan(plan: &SearchPlanV1) -> Result<CompiledHistorySearch, String> {
    if plan.schema_version != 1 {
        return Err(format!(
            "unsupported search plan schema version: {}",
            plan.schema_version
        ));
    }

    let mut clauses = Vec::new();
    let mut params = Vec::new();

    if let Some(text) = &plan.text {
        for term in clean_values(&text.all) {
            push_text_like_clause(&mut clauses, &mut params, term, false);
        }
        if !text.any.is_empty() {
            let mut any_clauses = Vec::new();
            let mut any_params = Vec::new();
            for term in clean_values(&text.any) {
                push_text_like_clause(&mut any_clauses, &mut any_params, term, false);
            }
            if !any_clauses.is_empty() {
                clauses.push(format!("({})", any_clauses.join(" OR ")));
                params.extend(any_params);
            }
        }
        for phrase in clean_values(&text.phrases) {
            push_text_like_clause(&mut clauses, &mut params, phrase, false);
        }
        for term in clean_values(&text.exclude) {
            push_text_like_clause(&mut clauses, &mut params, term, true);
        }
    }

    if let Some(filters) = &plan.filters {
        for tag in clean_values(&filters.tags) {
            push_tag_clause(&mut clauses, &mut params, tag, false);
        }
        for tag in clean_values(&filters.not_tags) {
            push_tag_clause(&mut clauses, &mut params, tag, true);
        }
        for kind in &filters.kind {
            clauses.push("content_kind = ?".to_string());
            params.push(Value::Text(search_plan_kind_value(*kind).to_string()));
        }
        for kind in &filters.not_kind {
            clauses.push("content_kind != ?".to_string());
            params.push(Value::Text(search_plan_kind_value(*kind).to_string()));
        }
        for mime in clean_values(&filters.mime) {
            push_mime_clause(&mut clauses, &mut params, mime, false);
        }
        for mime in clean_values(&filters.not_mime) {
            push_mime_clause(&mut clauses, &mut params, mime, true);
        }
        for filter in &filters.has {
            clauses.push(has_filter_sql((*filter).into(), false));
        }
        for filter in &filters.missing {
            clauses.push(has_filter_sql((*filter).into(), true));
        }
        if let Some(marked) = filters.marked {
            clauses.push(if marked {
                "is_marked != 0".to_string()
            } else {
                "is_marked = 0".to_string()
            });
        }
        for date_filter in &filters.date {
            compile_date_filter(date_filter, &mut clauses, &mut params)?;
        }
        for app in clean_values(&filters.source_app) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["source_app_name", "source_app_path"],
                app,
                false,
            );
        }
        for app in clean_values(&filters.not_source_app) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["source_app_name", "source_app_path"],
                app,
                true,
            );
        }
        for title in clean_values(&filters.window_title) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["source_window_title"],
                title,
                false,
            );
        }
        for title in clean_values(&filters.not_window_title) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["source_window_title"],
                title,
                true,
            );
        }
        for domain in clean_values(&filters.domain) {
            push_capture_event_clause(&mut clauses, &mut params, &["domain"], domain, false);
        }
        for domain in clean_values(&filters.not_domain) {
            push_capture_event_clause(&mut clauses, &mut params, &["domain"], domain, true);
        }
        for source_kind in clean_values(&filters.source_kind) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["source_kind"],
                source_kind,
                false,
            );
        }
        for format in clean_values(&filters.clipboard_format) {
            push_capture_event_clause(
                &mut clauses,
                &mut params,
                &["clipboard_formats_text"],
                format,
                false,
            );
        }
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    Ok(CompiledHistorySearch {
        where_sql,
        params,
        order_sql: compile_order_sql(&plan.sort),
        limit: plan
            .limit
            .map(|limit| limit.clamp(MIN_HISTORY_PAGE_LIMIT, MAX_HISTORY_PAGE_LIMIT)),
    })
}

pub(super) fn history_item_select_columns(include_content: bool) -> String {
    let text_expr = if include_content {
        "text".to_string()
    } else {
        format!("SUBSTR(text, 1, {HISTORY_PREVIEW_CHAR_LIMIT})")
    };
    let includes_content = if include_content { 1 } else { 0 };

    format!(
        "id, content_kind, {text_expr}, SUBSTR(text, 1, {HISTORY_PREVIEW_CHAR_LIMIT}), LENGTH(text), {includes_content},
         normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
         COALESCE(last_copied_at_unix_ms, created_at_unix_ms), COALESCE(copy_count, 1),
         mime_primary, blob_path, thumbnail_path, byte_size, width, height,
         title, notes, tags, is_marked, marked_at_unix_ms"
    )
}

pub(super) fn history_page_sql(where_sql: &str, order_sql: &str, include_content: bool) -> String {
    format!(
        "SELECT {}
         FROM clipboard_items
         {where_sql}
         ORDER BY {order_sql}
         LIMIT ?",
        history_item_select_columns(include_content)
    )
}

pub(super) fn history_where_clause(query: &ParsedHistoryQuery) -> (String, Vec<Value>) {
    let mut clauses = Vec::new();
    let mut params = Vec::new();

    for term in &query.text_terms {
        push_text_like_clause(&mut clauses, &mut params, term, false);
    }
    for term in &query.excluded_text_terms {
        push_text_like_clause(&mut clauses, &mut params, term, true);
    }
    for tag in &query.tags {
        push_tag_clause(&mut clauses, &mut params, tag, false);
    }
    for tag in &query.excluded_tags {
        push_tag_clause(&mut clauses, &mut params, tag, true);
    }
    for kind in &query.kinds {
        clauses.push("content_kind = ?".to_string());
        params.push(Value::Text(kind.clone()));
    }
    for kind in &query.excluded_kinds {
        clauses.push("content_kind != ?".to_string());
        params.push(Value::Text(kind.clone()));
    }
    for mime in &query.mimes {
        push_mime_clause(&mut clauses, &mut params, mime, false);
    }
    for mime in &query.excluded_mimes {
        push_mime_clause(&mut clauses, &mut params, mime, true);
    }
    for filter in &query.has_filters {
        clauses.push(has_filter_sql(*filter, false));
    }
    for filter in &query.missing_filters {
        clauses.push(has_filter_sql(*filter, true));
    }
    for marked in &query.marked_filters {
        if *marked {
            clauses.push("is_marked != 0".to_string());
        } else {
            clauses.push("is_marked = 0".to_string());
        }
    }
    if let Some(after_unix_ms) = query.after_unix_ms {
        clauses.push("created_at_unix_ms >= ?".to_string());
        params.push(Value::Integer(after_unix_ms));
    }
    if let Some(before_unix_ms) = query.before_unix_ms {
        clauses.push("created_at_unix_ms < ?".to_string());
        params.push(Value::Integer(before_unix_ms));
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    (where_sql, params)
}

fn clean_values(values: &[String]) -> impl Iterator<Item = &str> {
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
}

fn compile_order_sql(sort: &[SearchPlanSortV1]) -> String {
    if sort.is_empty() {
        return "COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC".to_string();
    }

    let mut parts = sort
        .iter()
        .take(3)
        .map(|sort| {
            format!(
                "{} {}",
                sort_field_sql(sort.field),
                sort_direction_sql(sort.direction)
            )
        })
        .collect::<Vec<_>>();
    parts.push("id DESC".to_string());
    parts.join(", ")
}

fn sort_field_sql(field: SearchPlanSortFieldV1) -> &'static str {
    match field {
        SearchPlanSortFieldV1::Created => "created_at_unix_ms",
        SearchPlanSortFieldV1::LastUsed => "last_used_at_unix_ms",
        SearchPlanSortFieldV1::LastCopied => "COALESCE(last_copied_at_unix_ms, created_at_unix_ms)",
    }
}

fn sort_direction_sql(direction: SearchPlanSortDirectionV1) -> &'static str {
    match direction {
        SearchPlanSortDirectionV1::Asc => "ASC",
        SearchPlanSortDirectionV1::Desc => "DESC",
    }
}

fn compile_date_filter(
    filter: &SearchPlanDateFilterV1,
    clauses: &mut Vec<String>,
    params: &mut Vec<Value>,
) -> Result<(), String> {
    let field = date_field_sql(filter.field);
    match filter.op {
        SearchPlanDateOpV1::After => {
            let value = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `after` requires value or relative".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(value));
        }
        SearchPlanDateOpV1::Before => {
            let value = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `before` requires value or relative".to_string())?;
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(value));
        }
        SearchPlanDateOpV1::On => {
            let start = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `on` requires value or relative".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(start));
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(start.saturating_add(MILLIS_PER_DAY)));
        }
        SearchPlanDateOpV1::Between => {
            let start = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `between` requires value or relative".to_string())?;
            let end = resolve_plan_end_date_ms(filter)?
                .ok_or_else(|| "date filter `between` requires endValue".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(start));
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(end));
        }
    }
    Ok(())
}

fn date_field_sql(field: SearchPlanDateFieldV1) -> &'static str {
    match field {
        SearchPlanDateFieldV1::Created => "created_at_unix_ms",
        SearchPlanDateFieldV1::LastUsed => "last_used_at_unix_ms",
        SearchPlanDateFieldV1::LastCopied => "COALESCE(last_copied_at_unix_ms, created_at_unix_ms)",
    }
}

fn resolve_plan_date_ms(
    filter: &SearchPlanDateFilterV1,
    day_start: bool,
) -> Result<Option<i64>, String> {
    if let Some(relative) = &filter.relative {
        return resolve_relative_date_ms(relative).map(Some);
    }
    filter
        .value
        .as_deref()
        .map(|value| parse_plan_date_ms(value, day_start))
        .transpose()
}

fn resolve_plan_end_date_ms(filter: &SearchPlanDateFilterV1) -> Result<Option<i64>, String> {
    filter
        .end_value
        .as_deref()
        .map(|value| parse_plan_date_ms(value, false))
        .transpose()
}

fn parse_plan_date_ms(value: &str, _day_start: bool) -> Result<i64, String> {
    parse_date_or_relative_ms(value, DateBound::Start)
        .or_else(|| parse_iso_datetime_unix_ms(value))
        .ok_or_else(|| format!("invalid search plan date: {value}"))
}

fn resolve_relative_date_ms(relative: &SearchPlanRelativeDateV1) -> Result<i64, String> {
    if !(1..=10_000).contains(&relative.amount) {
        return Err("relative date amount must be between 1 and 10000".to_string());
    }
    let unit_ms = match relative.unit {
        SearchPlanRelativeUnitV1::Minute => 60_000,
        SearchPlanRelativeUnitV1::Hour => 3_600_000,
        SearchPlanRelativeUnitV1::Day => MILLIS_PER_DAY,
        SearchPlanRelativeUnitV1::Week => MILLIS_PER_DAY * 7,
        SearchPlanRelativeUnitV1::Month => MILLIS_PER_DAY * 30,
    };
    Ok(now_unix_ms().saturating_sub(relative.amount.saturating_mul(unit_ms)))
}

fn parse_search_plan_kind(value: &str) -> Option<SearchPlanKindV1> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(SearchPlanKindV1::Text),
        "image" => Some(SearchPlanKindV1::Image),
        "html" => Some(SearchPlanKindV1::Html),
        "file" | "file-list" => Some(SearchPlanKindV1::File),
        "unknown" => Some(SearchPlanKindV1::Unknown),
        _ => None,
    }
}

fn search_plan_kind_value(kind: SearchPlanKindV1) -> &'static str {
    match kind {
        SearchPlanKindV1::Text => "text",
        SearchPlanKindV1::Image => "image",
        SearchPlanKindV1::Html => "html",
        SearchPlanKindV1::File => "file",
        SearchPlanKindV1::Unknown => "unknown",
    }
}

impl From<HasFilter> for SearchPlanHasV1 {
    fn from(value: HasFilter) -> Self {
        match value {
            HasFilter::Text => Self::Text,
            HasFilter::Title => Self::Title,
            HasFilter::Notes => Self::Notes,
            HasFilter::Tags => Self::Tags,
            HasFilter::Metadata => Self::Metadata,
            HasFilter::Mime => Self::Mime,
            HasFilter::Blob => Self::Blob,
            HasFilter::Image => Self::Image,
        }
    }
}

impl From<SearchPlanHasV1> for HasFilter {
    fn from(value: SearchPlanHasV1) -> Self {
        match value {
            SearchPlanHasV1::Text => Self::Text,
            SearchPlanHasV1::Title => Self::Title,
            SearchPlanHasV1::Notes => Self::Notes,
            SearchPlanHasV1::Tags => Self::Tags,
            SearchPlanHasV1::Metadata => Self::Metadata,
            SearchPlanHasV1::Mime => Self::Mime,
            SearchPlanHasV1::Blob => Self::Blob,
            SearchPlanHasV1::Image => Self::Image,
        }
    }
}

impl TryFrom<HasFilter> for SearchPlanMissingV1 {
    type Error = ();

    fn try_from(value: HasFilter) -> Result<Self, Self::Error> {
        match value {
            HasFilter::Title => Ok(Self::Title),
            HasFilter::Notes => Ok(Self::Notes),
            HasFilter::Tags => Ok(Self::Tags),
            HasFilter::Metadata => Ok(Self::Metadata),
            HasFilter::Mime => Ok(Self::Mime),
            HasFilter::Blob => Ok(Self::Blob),
            HasFilter::Text | HasFilter::Image => Err(()),
        }
    }
}

impl From<SearchPlanMissingV1> for HasFilter {
    fn from(value: SearchPlanMissingV1) -> Self {
        match value {
            SearchPlanMissingV1::Title => Self::Title,
            SearchPlanMissingV1::Notes => Self::Notes,
            SearchPlanMissingV1::Tags => Self::Tags,
            SearchPlanMissingV1::Metadata => Self::Metadata,
            SearchPlanMissingV1::Mime => Self::Mime,
            SearchPlanMissingV1::Blob => Self::Blob,
        }
    }
}

fn push_text_like_clause(
    clauses: &mut Vec<String>,
    params: &mut Vec<Value>,
    term: &str,
    negated: bool,
) {
    let fields = [
        "COALESCE(text, '')",
        "COALESCE(title, '')",
        "COALESCE(notes, '')",
        "COALESCE(tags, '')",
        "COALESCE(mime_primary, '')",
        "content_kind",
        "COALESCE(context_search_text, '')",
    ];
    let joined = fields
        .iter()
        .map(|field| format!("{field} LIKE ? ESCAPE '\\'"))
        .collect::<Vec<_>>()
        .join(" OR ");
    let clause = if negated {
        format!("NOT ({joined})")
    } else {
        format!("({joined})")
    };
    let pattern = like_contains_pattern(term);

    clauses.push(clause);
    for _ in fields {
        params.push(Value::Text(pattern.clone()));
    }
}

fn push_tag_clause(clauses: &mut Vec<String>, params: &mut Vec<Value>, value: &str, negated: bool) {
    let (slug, _) = normalize_tag_label(value).unwrap_or_else(|_| {
        (
            value.trim().trim_start_matches('#').to_ascii_lowercase(),
            value.to_string(),
        )
    });
    let clause = "(
        EXISTS (
            SELECT 1
            FROM clipboard_item_tags
            JOIN tags normalized_tags ON normalized_tags.id = clipboard_item_tags.tag_id
            WHERE clipboard_item_tags.item_id = clipboard_items.id
                AND normalized_tags.slug LIKE ? ESCAPE '\\'
        )
        OR COALESCE(clipboard_items.tags, '') LIKE ? ESCAPE '\\'
    )";
    if negated {
        clauses.push(format!("NOT {clause}"));
    } else {
        clauses.push(clause.to_string());
    }
    params.push(Value::Text(like_contains_pattern(&slug)));
    params.push(Value::Text(like_contains_pattern(value)));
}

fn push_capture_event_clause(
    clauses: &mut Vec<String>,
    params: &mut Vec<Value>,
    fields: &[&str],
    value: &str,
    negated: bool,
) {
    let field_sql = fields
        .iter()
        .map(|field| format!("COALESCE({field}, '') LIKE ? ESCAPE '\\'"))
        .collect::<Vec<_>>()
        .join(" OR ");
    let exists = format!(
        "EXISTS (
            SELECT 1
            FROM clipboard_item_capture_events capture_events
            WHERE capture_events.item_id = clipboard_items.id
                AND ({field_sql})
         )"
    );
    clauses.push(if negated {
        format!("NOT {exists}")
    } else {
        exists
    });
    let pattern = like_contains_pattern(value);
    for _ in fields {
        params.push(Value::Text(pattern.clone()));
    }
}

fn push_mime_clause(clauses: &mut Vec<String>, params: &mut Vec<Value>, mime: &str, negated: bool) {
    let wildcard = mime.ends_with("/*");
    let pattern = if wildcard {
        format!("{}%", escape_like(mime.trim_end_matches('*')))
    } else {
        escape_like(mime)
    };
    let operator = if negated { "NOT LIKE" } else { "LIKE" };

    clauses.push(format!(
        "COALESCE(mime_primary, '') {operator} ? ESCAPE '\\'"
    ));
    params.push(Value::Text(pattern));
}

fn has_filter_sql(filter: HasFilter, missing: bool) -> String {
    let present = match filter {
        HasFilter::Text => "TRIM(text) != ''",
        HasFilter::Title => "title IS NOT NULL AND TRIM(title) != ''",
        HasFilter::Notes => "notes IS NOT NULL AND TRIM(notes) != ''",
        HasFilter::Tags => {
            "EXISTS (
                SELECT 1
                FROM clipboard_item_tags
                WHERE clipboard_item_tags.item_id = clipboard_items.id
             )
             OR (tags IS NOT NULL AND TRIM(tags) != '')"
        }
        HasFilter::Metadata => {
            "(title IS NOT NULL AND TRIM(title) != '')
             OR (notes IS NOT NULL AND TRIM(notes) != '')
             OR EXISTS (
                SELECT 1
                FROM clipboard_item_tags
                WHERE clipboard_item_tags.item_id = clipboard_items.id
             )
             OR (tags IS NOT NULL AND TRIM(tags) != '')"
        }
        HasFilter::Mime => "mime_primary IS NOT NULL AND TRIM(mime_primary) != ''",
        HasFilter::Blob => "blob_path IS NOT NULL AND TRIM(blob_path) != ''",
        HasFilter::Image => "content_kind = 'image'",
    };

    if missing {
        format!("NOT ({present})")
    } else {
        format!("({present})")
    }
}

fn like_contains_pattern(value: &str) -> String {
    format!("%{}%", escape_like(value))
}

pub(super) fn finish_history_page(
    items: &mut Vec<HistoryItem>,
    limit: i64,
    total_count: Option<i64>,
    filtered_count: Option<i64>,
    interpreted_query: Option<String>,
    explanation: Option<String>,
    warnings: Vec<String>,
) -> Result<HistoryPage, String> {
    let next_cursor = if items.len() as i64 > limit {
        items.truncate(limit as usize);
        items.last().map(|item| HistoryPageCursor {
            after_sort_unix_ms: item.last_copied_at_unix_ms,
            after_id: item.id,
        })
    } else {
        None
    };

    Ok(HistoryPage {
        items: std::mem::take(items),
        next_cursor,
        total_count,
        filtered_count,
        interpreted_query,
        explanation,
        warnings,
    })
}

pub(super) fn explain_history_query(query: &str) -> String {
    if query.trim().is_empty() {
        "All history, ordered by most recently copied or captured.".to_string()
    } else {
        format!("Structured local history search for `{}`.", query.trim())
    }
}

#[derive(Clone, Copy)]
enum DateBound {
    Start,
}

fn parse_date_or_relative_ms(value: &str, _bound: DateBound) -> Option<i64> {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return None;
    }

    let now_ms = now_unix_ms();
    match value.as_str() {
        "today" => return Some(day_start_unix_ms(now_ms)),
        "yesterday" => return Some(day_start_unix_ms(now_ms).saturating_sub(MILLIS_PER_DAY)),
        _ => {}
    }

    if let Some(days) = value
        .strip_suffix('d')
        .and_then(|days| days.parse::<i64>().ok())
    {
        return Some(now_ms.saturating_sub(days.saturating_mul(MILLIS_PER_DAY)));
    }

    parse_ymd_start_unix_ms(&value)
}

fn parse_iso_datetime_unix_ms(value: &str) -> Option<i64> {
    let value = value.trim();
    let (date, time) = value.split_once('T')?;
    let date_ms = parse_ymd_start_unix_ms(date)?;
    let time = time.trim_end_matches('Z');
    let time = time
        .split_once(['+', '-'])
        .map(|(time, _)| time)
        .unwrap_or(time);
    let mut parts = time.split(':');
    let hour = parts.next()?.parse::<i64>().ok()?;
    let minute = parts.next().unwrap_or("0").parse::<i64>().ok()?;
    let second_part = parts.next().unwrap_or("0");
    let second = second_part
        .split_once('.')
        .map(|(second, _)| second)
        .unwrap_or(second_part)
        .parse::<i64>()
        .ok()?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) || !(0..=59).contains(&second) {
        return None;
    }
    Some(date_ms + hour * 3_600_000 + minute * 60_000 + second * 1_000)
}

fn format_unix_ms_ymd(unix_ms: i64) -> String {
    let days = unix_ms.div_euclid(MILLIS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn day_start_unix_ms(unix_ms: i64) -> i64 {
    unix_ms.div_euclid(MILLIS_PER_DAY) * MILLIS_PER_DAY
}

fn parse_ymd_start_unix_ms(value: &str) -> Option<i64> {
    let mut parts = value.split('-');
    let year = parts.next()?.parse::<i64>().ok()?;
    let month = parts.next()?.parse::<i64>().ok()?;
    let day = parts.next()?.parse::<i64>().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    Some(days_from_civil(year, month, day)? * MILLIS_PER_DAY)
}

pub(super) fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    let month_lengths = [
        31,
        28 + i64::from(is_leap_year(year)),
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let month_index = usize::try_from(month - 1).ok()?;
    if day < 1 || day > month_lengths[month_index] {
        return None;
    }

    let adjusted_year = year - i64::from(month <= 2);
    let era = adjusted_year.div_euclid(400);
    let year_of_era = adjusted_year - era * 400;
    let adjusted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * adjusted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    Some(era * 146_097 + day_of_era - 719_468)
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month, day)
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
