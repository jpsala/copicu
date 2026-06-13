use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BuiltinTag {
    Path,
    Url,
    Json,
    Code,
    SecretRisk,
}

impl BuiltinTag {
    pub fn slug(self) -> &'static str {
        match self {
            Self::Path => "path",
            Self::Url => "url",
            Self::Json => "json",
            Self::Code => "code",
            Self::SecretRisk => "secret-risk",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Path => "Path",
            Self::Url => "URL",
            Self::Json => "JSON",
            Self::Code => "Code",
            Self::SecretRisk => "Secret Risk",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EnrichmentApplyMode {
    AutoApply,
    SuggestOnly,
}

impl Default for EnrichmentApplyMode {
    fn default() -> Self {
        Self::AutoApply
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectorSettings {
    #[serde(default = "default_true")]
    pub path: bool,
    #[serde(default = "default_true")]
    pub url: bool,
    #[serde(default = "default_true")]
    pub json: bool,
    #[serde(default = "default_true")]
    pub code: bool,
    #[serde(default = "default_true")]
    pub secret_risk: bool,
}

impl Default for DetectorSettings {
    fn default() -> Self {
        Self {
            path: true,
            url: true,
            json: true,
            code: true,
            secret_risk: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentSettings {
    pub enabled: bool,
    #[serde(default)]
    pub apply_mode: EnrichmentApplyMode,
    #[serde(default)]
    pub detectors: DetectorSettings,
}

impl Default for EnrichmentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            apply_mode: EnrichmentApplyMode::AutoApply,
            detectors: DetectorSettings::default(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BuiltinDetector {
    Path,
    Url,
    Json,
    Code,
    SecretRisk,
}

impl BuiltinDetector {
    pub fn label(self) -> &'static str {
        match self {
            Self::Path => "Path",
            Self::Url => "URL",
            Self::Json => "JSON",
            Self::Code => "Code",
            Self::SecretRisk => "Secret risk",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BuiltinEnrichmentMatch {
    pub detector: BuiltinDetector,
    pub tag: BuiltinTag,
    pub confidence: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinEnrichmentTagResult {
    pub detector: BuiltinDetector,
    pub detector_label: String,
    pub tag: String,
    pub confidence: f32,
    pub applied: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinEnrichmentResult {
    pub item_id: i64,
    pub content_kind: String,
    pub enabled: bool,
    pub apply_mode: EnrichmentApplyMode,
    pub auto_apply_enabled: bool,
    pub manual_apply_allowed: bool,
    pub eligible: bool,
    pub tags: Vec<BuiltinEnrichmentTagResult>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunForItemOptions {
    #[serde(default)]
    pub apply: Option<bool>,
}

pub fn detect_text_builtin_tags(
    text: &str,
    settings: &EnrichmentSettings,
) -> Vec<BuiltinEnrichmentMatch> {
    let normalized = text.trim();
    let mut matches = Vec::new();

    if settings.detectors.path && is_path_candidate(normalized) {
        matches.push(BuiltinEnrichmentMatch {
            detector: BuiltinDetector::Path,
            tag: BuiltinTag::Path,
            confidence: 1.0,
        });
    }
    if settings.detectors.url && is_url_candidate(normalized) {
        matches.push(BuiltinEnrichmentMatch {
            detector: BuiltinDetector::Url,
            tag: BuiltinTag::Url,
            confidence: 1.0,
        });
    }
    if settings.detectors.json && is_json_candidate(normalized) {
        matches.push(BuiltinEnrichmentMatch {
            detector: BuiltinDetector::Json,
            tag: BuiltinTag::Json,
            confidence: 1.0,
        });
    }
    if settings.detectors.code && is_code_candidate(normalized) {
        matches.push(BuiltinEnrichmentMatch {
            detector: BuiltinDetector::Code,
            tag: BuiltinTag::Code,
            confidence: 0.85,
        });
    }
    if settings.detectors.secret_risk && is_secret_risk_candidate(normalized) {
        matches.push(BuiltinEnrichmentMatch {
            detector: BuiltinDetector::SecretRisk,
            tag: BuiltinTag::SecretRisk,
            confidence: 0.95,
        });
    }

    matches
}

fn default_true() -> bool {
    true
}

fn is_path_candidate(value: &str) -> bool {
    if value.is_empty()
        || value.contains('\n')
        || value.contains('\r')
        || value.contains('\0')
        || value.len() > 4096
    {
        return false;
    }

    if value.contains("://") {
        return false;
    }

    is_windows_drive_path(value) || is_unc_path(value) || is_unix_absolute_path(value)
}

fn is_windows_drive_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 3 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return false;
    }

    is_path_separator(bytes[2])
}

fn is_unc_path(value: &str) -> bool {
    if !(value.starts_with("\\\\") || value.starts_with("//")) {
        return false;
    }

    let trimmed = value
        .trim_start_matches('\\')
        .trim_start_matches('\\')
        .trim_start_matches('/')
        .trim_start_matches('/');
    let mut parts = trimmed.split(['\\', '/']).filter(|part| !part.is_empty());
    parts.next().is_some() && parts.next().is_some()
}

fn is_unix_absolute_path(value: &str) -> bool {
    if !value.starts_with('/') || value.starts_with("//") {
        return false;
    }

    value.len() > 1
}

fn is_url_candidate(value: &str) -> bool {
    if value.is_empty()
        || value.chars().any(char::is_whitespace)
        || value.contains('\0')
        || value.len() > 4096
    {
        return false;
    }

    if is_windows_drive_path(value) {
        return false;
    }

    let Some(colon_index) = value.find(':') else {
        return false;
    };
    if colon_index < 2 {
        return false;
    }

    let scheme = &value[..colon_index];
    if !scheme
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.'))
    {
        return false;
    }

    let scheme_lower = scheme.to_ascii_lowercase();
    let remainder = &value[colon_index + 1..];
    match scheme_lower.as_str() {
        "http" | "https" | "ftp" | "file" => remainder.starts_with("//") && remainder.len() > 2,
        "mailto" => remainder.contains('@'),
        _ => false,
    }
}

fn is_json_candidate(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 * 1024 {
        return false;
    }

    if !matches!(value.as_bytes().first().copied(), Some(b'{') | Some(b'[')) {
        return false;
    }

    serde_json::from_str::<serde_json::Value>(value)
        .map(|parsed| {
            matches!(
                parsed,
                serde_json::Value::Object(_) | serde_json::Value::Array(_)
            )
        })
        .unwrap_or(false)
}

fn is_code_candidate(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 * 1024 || is_json_candidate(value) {
        return false;
    }

    let lower = value.to_ascii_lowercase();
    let multiline = value.contains('\n');
    let keyword_hits = [
        "function ",
        "const ",
        "let ",
        "var ",
        "class ",
        "interface ",
        "type ",
        "import ",
        "export ",
        "return ",
        "def ",
        "fn ",
        "impl ",
        "public ",
        "private ",
        "select ",
        "insert ",
        "update ",
        "delete ",
        "from ",
        "#include",
    ]
    .iter()
    .filter(|keyword| lower.contains(**keyword))
    .count();
    let syntax_hits = [
        "=>", "::", "</", "/>", "{", "}", "();", ");", "if (", "for (", "while (", "try {",
        "catch", "=== ", "!== ", " && ", " || ",
    ]
    .iter()
    .filter(|token| value.contains(**token))
    .count();

    if multiline {
        keyword_hits + syntax_hits >= 3
    } else {
        keyword_hits >= 2
            || (keyword_hits >= 1 && syntax_hits >= 1)
            || value.contains("=>")
            || lower.starts_with("select ") && lower.contains(" from ")
    }
}

fn is_secret_risk_candidate(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 * 1024 {
        return false;
    }

    if value.contains("-----BEGIN ") && value.contains(" PRIVATE KEY-----") {
        return true;
    }

    if value.contains("github_pat_")
        || value.contains("ghp_")
        || value.contains("gho_")
        || value.contains("ghu_")
        || value.contains("ghs_")
        || value.contains("ghr_")
        || value.contains("sk-")
    {
        return true;
    }

    if has_aws_access_key(value) || has_jwt_like_token(value) || has_secret_assignment(value) {
        return true;
    }

    false
}

fn has_aws_access_key(value: &str) -> bool {
    value
        .split(|character: char| character.is_whitespace() || matches!(character, '"' | '\'' | ','))
        .any(|part| {
            part.len() == 20
                && part.starts_with("AKIA")
                && part
                    .chars()
                    .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
        })
}

fn has_jwt_like_token(value: &str) -> bool {
    value
        .split_whitespace()
        .map(|part| {
            part.trim_matches(|character: char| {
                matches!(
                    character,
                    '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
                )
            })
        })
        .any(|part| {
            let mut segments = part.split('.');
            let Some(first) = segments.next() else {
                return false;
            };
            let Some(second) = segments.next() else {
                return false;
            };
            let Some(third) = segments.next() else {
                return false;
            };
            if segments.next().is_some() {
                return false;
            }
            first.len() >= 8
                && second.len() >= 8
                && third.len() >= 8
                && [first, second, third].into_iter().all(is_base64urlish)
        })
}

fn has_secret_assignment(value: &str) -> bool {
    value.lines().any(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return false;
        }
        let Some(separator_index) = trimmed.find('=') else {
            return false;
        };
        let key = trimmed[..separator_index].trim().to_ascii_lowercase();
        let value_part = trimmed[separator_index + 1..]
            .trim()
            .trim_matches(|character: char| character == '"' || character == '\'');
        let key_looks_secret = ["token", "secret", "password", "passwd", "api_key", "apikey"]
            .iter()
            .any(|needle| key.contains(needle));
        key_looks_secret
            && value_part.len() >= 12
            && value_part.chars().all(|character| {
                character.is_ascii_alphanumeric()
                    || matches!(character, '_' | '-' | '/' | '+' | '=')
            })
    })
}

fn is_base64urlish(value: &str) -> bool {
    value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn is_path_separator(byte: u8) -> bool {
    matches!(byte, b'\\' | b'/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_windows_paths() {
        assert_eq!(
            detect_text_builtin_tags(r"C:\dev\chat\copyq-tauri", &EnrichmentSettings::default())
                .iter()
                .map(|item| item.tag)
                .collect::<Vec<_>>(),
            vec![BuiltinTag::Path]
        );
        assert_eq!(
            detect_text_builtin_tags("D:/work/file.txt", &EnrichmentSettings::default())
                .iter()
                .map(|item| item.tag)
                .collect::<Vec<_>>(),
            vec![BuiltinTag::Path]
        );
    }

    #[test]
    fn detects_unix_and_unc_paths() {
        assert_eq!(
            detect_text_builtin_tags("/usr/local/bin", &EnrichmentSettings::default())
                .iter()
                .map(|item| item.tag)
                .collect::<Vec<_>>(),
            vec![BuiltinTag::Path]
        );
        assert_eq!(
            detect_text_builtin_tags(r"\\server\share\folder", &EnrichmentSettings::default())
                .iter()
                .map(|item| item.tag)
                .collect::<Vec<_>>(),
            vec![BuiltinTag::Path]
        );
    }

    #[test]
    fn detects_urls() {
        let tags = detect_text_builtin_tags(
            "https://example.com/path?q=1",
            &EnrichmentSettings::default(),
        );

        assert!(tags.iter().any(|tag| tag.tag == BuiltinTag::Url));
        assert!(!tags.iter().any(|tag| tag.tag == BuiltinTag::Path));
    }

    #[test]
    fn detects_json_payloads() {
        let tags = detect_text_builtin_tags(
            r#"{"kind":"note","items":[1,2,3]}"#,
            &EnrichmentSettings::default(),
        );

        assert!(tags.iter().any(|tag| tag.tag == BuiltinTag::Json));
    }

    #[test]
    fn detects_code_payloads() {
        let tags = detect_text_builtin_tags(
            "const result = items.map((item) => item.id);",
            &EnrichmentSettings::default(),
        );

        assert!(tags.iter().any(|tag| tag.tag == BuiltinTag::Code));
    }

    #[test]
    fn detects_secret_risk_payloads() {
        let tags = detect_text_builtin_tags(
            "GITHUB_TOKEN=github_pat_abcdefghijklmnopqrstuvwxyz1234567890",
            &EnrichmentSettings::default(),
        );

        assert!(tags.iter().any(|tag| tag.tag == BuiltinTag::SecretRisk));
    }

    #[test]
    fn respects_detector_toggles() {
        let mut settings = EnrichmentSettings::default();
        settings.detectors.url = false;

        assert!(detect_text_builtin_tags("https://example.com", &settings).is_empty());
    }

    #[test]
    fn rejects_non_paths() {
        assert!(detect_text_builtin_tags(
            "https://example.com/file.txt",
            &EnrichmentSettings {
                detectors: DetectorSettings {
                    path: true,
                    url: false,
                    json: false,
                    code: false,
                    secret_risk: false,
                },
                ..EnrichmentSettings::default()
            }
        )
        .is_empty());
        assert!(detect_text_builtin_tags(
            "just a note about /review",
            &EnrichmentSettings::default()
        )
        .iter()
        .all(|tag| tag.tag != BuiltinTag::Path));
        assert!(
            detect_text_builtin_tags("line one\nC:\\dev", &EnrichmentSettings::default())
                .iter()
                .all(|tag| tag.tag != BuiltinTag::Path)
        );
    }
}
