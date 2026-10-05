//! Metadata-only sync failures. Never include transport bodies, keys or payloads.
use super::{custody, transport};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncDiagnostic {
    pub code: String,
    pub stage: String,
    pub reason: String,
    pub occurred_at_unix_ms: Option<u64>,
    pub channel_id: Option<String>,
}

#[derive(Debug)]
pub(crate) struct SyncError {
    code: &'static str,
    stage: &'static str,
    reason: String,
}

impl SyncError {
    pub(crate) fn keys(stage: &'static str, cause: custody::Error) -> Self {
        // Custody errors are a closed enum with no path, credential or key bytes.
        Self {
            code: "protectedKeys",
            stage,
            reason: format!("Protected key storage failed ({cause:?})"),
        }
    }
    pub(crate) fn at(stage: &'static str, reason: String) -> Self {
        let code = match reason.as_str() {
            "Cannot open protected sharing keys"
            | "Cannot open protected channel key"
            | "Cannot open protected device identity"
            | "Cannot open protected relay credential" => "protectedKeys",
            "Invalid shared clipboard configuration"
            | "Invalid relay configuration"
            | "Shared clipboard is not configured"
            | "Channel is not enrolled" => "configuration",
            "Shared clipboard local storage operation failed" => "localStorage",
            _ => "syncFailed",
        };
        Self {
            code,
            stage,
            reason,
        }
    }

    pub(crate) fn transport(stage: &'static str, cause: transport::Error) -> Self {
        use transport::Error::*;
        let (code, reason) = match cause {
            Unavailable => (
                "serviceUnavailable",
                "The sharing service could not be reached",
            ),
            Denied => (
                "serviceDenied",
                "The sharing service did not authorize the request",
            ),
            Conflict => (
                "publicationRejected",
                "The request conflicts with the sharing service state",
            ),
            Rejected => (
                "publicationRejected",
                "The sharing service rejected the publication",
            ),
            TooLarge => (
                "publicationRejected",
                "The publication exceeds the sharing service size limit",
            ),
            Quota => ("serviceQuota", "The sharing service quota was reached"),
            Expired => ("requestExpired", "The sharing request expired"),
            InvalidResponse => (
                "invalidResponse",
                "The sharing service returned an invalid response",
            ),
            Unsupported => (
                "invalidResponse",
                "The sharing service does not support this request",
            ),
            InvalidEndpoint | InvalidInput => (
                "configuration",
                "The sharing request configuration is invalid",
            ),
        };
        Self {
            code,
            stage,
            reason: reason.into(),
        }
    }

    pub(crate) fn diagnostic(&self, at: Option<u64>, channel_id: Option<String>) -> SyncDiagnostic {
        SyncDiagnostic {
            code: self.code.into(),
            stage: self.stage.into(),
            reason: self.reason.clone(),
            occurred_at_unix_ms: at,
            channel_id,
        }
    }
}

impl From<String> for SyncError {
    fn from(reason: String) -> Self {
        Self::at("Local sharing state", reason)
    }
}
impl From<SyncError> for String {
    fn from(error: SyncError) -> Self {
        format!("{}: {}", error.stage, error.reason)
    }
}
