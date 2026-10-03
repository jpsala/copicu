//! Account credentials and device wire are host-owned, accessible from Settings
//! only. Scripts, other windows and arbitrary command fields cannot enroll.
use crate::storage;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
#[serde(transparent)]
struct SecretCode(String);
impl Drop for SecretCode {
    fn drop(&mut self) {
        unsafe {
            self.0.as_bytes_mut().fill(0);
        }
    }
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum IdentityCommand {
    Status,
    Start {
        name: String,
    },
    Cancel,
    Reopen,
    Approve {
        operation_id: String,
        device_id: String,
        fingerprint: String,
        expected_revision: String,
    },
    Revoke {
        operation_id: String,
        device_id: String,
        fingerprint: String,
        expected_revision: String,
    },
    SetupRecovery {
        code: Option<SecretCode>,
    },
    Recover {
        code: SecretCode,
        operation_id: String,
    },
}
#[tauri::command]
pub(crate) async fn shared_clipboard_identity(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if window.label() != crate::SETTINGS_WINDOW_LABEL {
        return Err("Manage device sign-in in Settings".into());
    }
    let input: IdentityCommand =
        serde_json::from_value(input).map_err(|_| "Invalid device sign-in command")?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            use crate::shared_clipboard::identity;
            match input {
                IdentityCommand::Status => identity::status(&storage),
                IdentityCommand::Start { name } => identity::start(&storage, &identity::service_endpoint()?, &name),
                IdentityCommand::Cancel => identity::cancel(&storage),
                IdentityCommand::Reopen => identity::reopen(&storage),
                IdentityCommand::Approve { operation_id, device_id, fingerprint, expected_revision } => identity::device_action(&storage, serde_json::json!({"kind":"approve","operationId":operation_id,"deviceId":device_id,"fingerprint":fingerprint,"expectedRevision":expected_revision})),
                IdentityCommand::Revoke { operation_id, device_id, fingerprint, expected_revision } => identity::device_action(&storage, serde_json::json!({"kind":"revoke","operationId":operation_id,"deviceId":device_id,"fingerprint":fingerprint,"expectedRevision":expected_revision})),
                IdentityCommand::SetupRecovery { code } => identity::setup_recovery(&storage, code.as_ref().map(|c|c.0.as_str())),
                IdentityCommand::Recover { code, operation_id } => identity::recover(&storage, &code.0, &operation_id),
            }
        }
        #[cfg(not(feature = "shared-clipboard"))]
        { let _=(storage,input); Err("Sharing is unavailable in this build".into()) }
    }).await.map_err(|_| "Device sign-in worker failed")?
}
