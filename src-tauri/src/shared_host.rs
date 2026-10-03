//! Tauri adapter: renderer permissions, lifecycle and native effect barriers.
use crate::storage;
#[cfg(feature = "shared-clipboard")]
use crate::{clipboard, window_focus};
use tauri::State;
#[cfg(feature = "shared-clipboard")]
use tauri::{Emitter, Manager};

fn trusted(window: &tauri::WebviewWindow, settings_only: bool) -> Result<(), String> {
    if window.label() == crate::SETTINGS_WINDOW_LABEL
        || (!settings_only && window.label() == crate::MAIN_WINDOW_LABEL)
    {
        Ok(())
    } else {
        Err("Sharing is available only in the picker and Settings".into())
    }
}

#[tauri::command]
pub(crate) fn shared_clipboard_set_hotkeys(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    send_active_shortcut: Option<String>,
    send_clipboard_shortcut: Option<String>,
) -> Result<serde_json::Value, String> {
    trusted(&window, true)?;
    #[cfg(feature = "shared-clipboard")]
    {
        let normalize = |value: Option<String>| -> Result<Option<String>, String> {
            value
                .map(|label| crate::normalize_optional_single_shortcut(&label, "Sharing"))
                .transpose()
                .map(|value| value.filter(|label| !label.is_empty()))
        };
        let active = normalize(send_active_shortcut)?;
        let clipboard = normalize(send_clipboard_shortcut)?;
        if active.is_some() && active == clipboard {
            return Err(
                "Choose different shortcuts for the active clip and Windows clipboard".into(),
            );
        }
        let current = crate::shared_clipboard::runtime::configured_hotkeys(&storage)?;
        let actions = crate::actions::list_actions(&storage)?;
        let settings = storage.get_settings()?;
        let views = storage.list_saved_history_views()?;
        for label in [&active, &clipboard].into_iter().flatten() {
            if [
                settings.general.global_shortcut.as_str(),
                settings.general.inbox_shortcut.as_str(),
                settings.general.paste_next_shortcut.as_str(),
                settings.picker.pin_toggle_shortcut.as_str(),
                settings.picker.settings_shortcut.as_str(),
                settings.picker.external_editor_shortcut.as_str(),
                crate::COMMAND_PALETTE_SHORTCUT_LABEL,
                crate::METADATA_SHORTCUT_LABEL,
                crate::ASSISTANT_SHORTCUT_LABEL,
                crate::ACTIVE_PREVIOUS_SHORTCUT_LABEL,
                crate::ACTIVE_NEXT_SHORTCUT_LABEL,
            ]
            .contains(&label.as_str())
            {
                return Err(format!(
                    "Shortcut conflicts with a Copicu shortcut: {label}"
                ));
            }
            if views
                .iter()
                .any(|view| view.hotkey.as_deref() == Some(label))
                || actions.iter().any(|action| {
                    !matches!(
                        action.id.as_str(),
                        "builtin.sharedSendActive" | "builtin.sharedSendClipboard"
                    ) && crate::actions::normalize_shortcut_string(action.shortcut.as_deref())
                        .as_ref()
                        == Some(label)
                })
            {
                return Err(format!(
                    "Shortcut already belongs to another action or saved view: {label}"
                ));
            }
            let shortcut =
                crate::shortcut_from_label(label).ok_or("Unsupported Sharing shortcut")?;
            if current.iter().any(|(_, old)| old == label) {
                continue;
            }
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if app.global_shortcut().is_registered(shortcut) {
                return Err(format!("Shortcut is already registered: {label}"));
            }
            app.global_shortcut()
                .register(shortcut)
                .map_err(|_| "Windows rejected this shortcut")?;
            app.global_shortcut()
                .unregister(shortcut)
                .map_err(|_| "Cannot release the shortcut probe")?;
        }
        let status = crate::shared_clipboard::runtime::set_hotkeys(&storage, active, clipboard)?;
        crate::refresh_global_shortcuts_from_storage(&app, &storage)?;
        serde_json::to_value(status).map_err(|_| "Cannot read sharing status".into())
    }
    #[cfg(not(feature = "shared-clipboard"))]
    {
        let _ = (app, storage, send_active_shortcut, send_clipboard_shortcut);
        Err("Sharing is unavailable in this build".into())
    }
}

#[tauri::command]
pub(crate) fn shared_clipboard_status(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
) -> Result<serde_json::Value, String> {
    trusted(&window, false)?;
    #[cfg(feature = "shared-clipboard")]
    {
        serde_json::to_value(crate::shared_clipboard::runtime::snapshot(&storage)?)
            .map_err(|_| "Cannot read sharing status".into())
    }
    #[cfg(not(feature = "shared-clipboard"))]
    {
        let _ = storage;
        Ok(
            serde_json::json!({"available":false,"configured":false,"paused":true,"channels":[],"outbox":[],"receipts":[]}),
        )
    }
}

#[tauri::command]
pub(crate) async fn shared_clipboard_preview_enrollment(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    bundle_path: String,
) -> Result<serde_json::Value, String> {
    trusted(&window, true)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            serde_json::to_value(crate::shared_clipboard::runtime::enrollment_preview(
                &storage,
                &bundle_path,
            )?)
            .map_err(|_| "Cannot review enrollment".into())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, bundle_path);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Enrollment worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_configure(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    bundle_path: String,
    confirmed_fingerprint: String,
) -> Result<serde_json::Value, String> {
    trusted(&window, true)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            let _barrier = crate::shared_native::EFFECT_BARRIER
                .lock()
                .map_err(|_| "Sharing effect barrier failed")?;
            let status = crate::shared_clipboard::runtime::configure(
                &storage,
                crate::shared_clipboard::config::ConfigureInput {
                    bundle_path,
                    confirmed_fingerprint,
                },
            )?;
            serde_json::to_value(status).map_err(|_| "Cannot read sharing status".into())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, bundle_path, confirmed_fingerprint);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Enrollment worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_update_channel(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    policy: serde_json::Value,
) -> Result<serde_json::Value, String> {
    trusted(&window, true)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            let policy: crate::shared_clipboard::config::ChannelPolicy =
                serde_json::from_value(policy).map_err(|_| "Invalid channel policy")?;
            if policy.receive_action_enabled {
                crate::actions::validate_shared_reception_binding(
                    &storage,
                    policy
                        .receive_action_id
                        .as_deref()
                        .ok_or("Choose a reception action")?,
                    &policy.id,
                )?;
                if policy.receive_action_writes_clipboard
                    && !crate::actions::shared_reception_action_writes_clipboard(
                        &storage,
                        policy
                            .receive_action_id
                            .as_deref()
                            .ok_or("Choose a reception action")?,
                    )?
                {
                    return Err("The reception action must declare clipboard write access".into());
                }
            }
            let _barrier = crate::shared_native::EFFECT_BARRIER
                .lock()
                .map_err(|_| "Sharing effect barrier failed")?;
            serde_json::to_value(crate::shared_clipboard::runtime::update_channel(
                &storage, policy,
            )?)
            .map_err(|_| "Cannot read sharing status".into())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, policy);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing policy worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_set_paused(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    paused: bool,
) -> Result<serde_json::Value, String> {
    trusted(&window, false)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || set_paused(&storage, paused))
        .await
        .map_err(|_| "Sharing pause worker failed")?
}

pub(crate) fn set_paused(
    storage: &storage::AppStorage,
    paused: bool,
) -> Result<serde_json::Value, String> {
    #[cfg(feature = "shared-clipboard")]
    {
        set_device_flow_paused(storage, Some(paused), Some(paused))
    }
    #[cfg(not(feature = "shared-clipboard"))]
    {
        let _ = (storage, paused);
        Err("Sharing is unavailable in this build".into())
    }
}

pub(crate) fn set_device_flow_paused(
    storage: &storage::AppStorage,
    send: Option<bool>,
    receive: Option<bool>,
) -> Result<serde_json::Value, String> {
    #[cfg(feature = "shared-clipboard")]
    {
        let heads =
            crate::shared_clipboard::runtime::prepare_receive_resume(storage, None, receive)?;
        let _barrier = crate::shared_native::EFFECT_BARRIER
            .lock()
            .map_err(|_| "Sharing effect barrier failed")?;
        serde_json::to_value(
            crate::shared_clipboard::runtime::set_flow_paused_with_heads(
                storage, None, send, receive, heads,
            )?,
        )
        .map_err(|_| "Cannot read sharing status".into())
    }
    #[cfg(not(feature = "shared-clipboard"))]
    {
        let _ = (storage, send, receive);
        Err("Sharing is unavailable in this build".into())
    }
}

#[tauri::command]
pub(crate) async fn shared_clipboard_receipt_text(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    subscription_id: String,
    publication_id: String,
) -> Result<String, String> {
    trusted(&window, false)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            crate::shared_clipboard::runtime::receipt_text(
                &storage,
                &subscription_id,
                &publication_id,
            )
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, subscription_id, publication_id);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Reception worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_copy_receipt(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    subscription_id: String,
    publication_id: String,
) -> Result<(), String> {
    trusted(&window, false)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            use crate::{shared_clipboard::runtime, shared_native};
            let expected = shared_native::sequence().ok_or("Clipboard unavailable")?;
            let content = runtime::receipt_content(&storage, &subscription_id, &publication_id)?;
            let _barrier = shared_native::EFFECT_BARRIER
                .lock()
                .map_err(|_| "Sharing effect barrier failed")?;
            let attempt =
                runtime::claim_manual_clipboard(&storage, &subscription_id, &publication_id)?;
            let outcome = shared_native::write_content(&content, expected);
            let stored = if outcome == "applied" {
                "applied"
            } else if outcome == "uncertain" {
                "uncertain"
            } else {
                "failed"
            };
            runtime::finish_clipboard(&storage, &subscription_id, &attempt, stored)?;
            if outcome == "applied" {
                Ok(())
            } else {
                Err(format!("Could not copy reception: {outcome}"))
            }
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, subscription_id, publication_id);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Reception copy worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_receipt_preview(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    subscription_id: String,
    publication_id: String,
) -> Result<serde_json::Value, String> {
    trusted(&window, false)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        { crate::shared_clipboard::runtime::receipt_content(&storage, &subscription_id, &publication_id)?.preview() }
        #[cfg(not(feature = "shared-clipboard"))]
        { let _ = (storage, subscription_id, publication_id); Err("Sharing is unavailable in this build".into()) }
    }).await.map_err(|_| "Reception preview worker failed")?
}

/// The reception runner supplies only its immutable host context. This uses
/// the same durable Windows sink and native barrier as the built-in writer.
#[cfg(feature = "shared-clipboard")]
pub(crate) fn write_reception_action_clipboard(
    storage: &storage::AppStorage,
    action_id: &str,
    reception: &crate::actions::SharedReceptionContext,
    text: &str,
) -> Result<(), String> {
    use crate::{shared_clipboard::runtime, shared_native};
    if text.len() > 1024 * 1024 || text.contains('\0') {
        return Err("Reception clipboard output exceeds the supported text boundary".into());
    }
    let _barrier = shared_native::EFFECT_BARRIER
        .lock()
        .map_err(|_| "Reception clipboard barrier is unavailable")?;
    let attempt = runtime::claim_reception_action_clipboard(
        storage,
        &reception.channel_id,
        &reception.publication_id,
        reception.generation,
        action_id,
        &reception.text,
        text,
        reception.lease_expires_at_unix_ms,
        reception.lease_started,
        reception.lease_duration_ms,
    )?;
    let remaining = reception.lease_duration_ms.saturating_sub(
        reception
            .lease_started
            .elapsed()
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX),
    );
    let clock_deadline = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|now| (now.as_millis() as u64).saturating_add(remaining))
        .unwrap_or(0);
    let outcome = if let Some(expected) = reception
        .expected_sequence
        .filter(|expected| shared_native::sequence() == Some(*expected))
    {
        shared_native::write_before(
            text,
            expected,
            Some(clock_deadline.min(reception.lease_expires_at_unix_ms)),
            Some(remaining),
        )
    } else {
        "clipboardStale".into()
    };
    let stored = match outcome.as_str() {
        "applied" => "applied",
        "uncertain" => "uncertain",
        "clipboardStale" | "sessionLocked" => "skipped",
        _ => "failed",
    };
    if runtime::finish_clipboard(storage, &reception.subscription_id, &attempt, stored).is_err() {
        runtime::record_error(
            storage,
            "Reception clipboard outcome could not be persisted; automatic replay is disabled",
        );
        return Err("Reception clipboard outcome is uncertain".into());
    }
    if stored == "applied" {
        Ok(())
    } else {
        Err("Reception clipboard output was skipped, failed or uncertain; reception remains available".into())
    }
}

pub(crate) fn start<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    #[cfg(feature = "shared-clipboard")]
    {
        let (publication_wake, publication_hints) = std::sync::mpsc::sync_channel(1);
        crate::shared_clipboard::control_sync::start(app.clone(), publication_wake);
        let (action_tx, action_rx) = std::sync::mpsc::sync_channel::<(
            crate::shared_clipboard::runtime::IncomingEffect,
            String,
            Option<u32>,
        )>(16);
        let action_app = app.clone();
        std::thread::spawn(move || {
            use crate::shared_clipboard::runtime;
            let storage = action_app.state::<storage::AppStorage>().inner().clone();
            while let Ok((effect, attempt, expected_sequence)) = action_rx.recv() {
                let Some(action_id) = effect.action_id.as_deref() else {
                    continue;
                };
                let expired = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(true, |now| {
                        now.as_millis() >= u128::from(effect.lease_expires_at_unix_ms)
                    });
                if expired
                    || effect.lease_started.elapsed().as_millis()
                        >= u128::from(effect.lease_duration_ms)
                {
                    let _ = runtime::finish_action(
                        &storage,
                        &effect.subscription_id,
                        &attempt,
                        "skipped",
                    );
                    continue;
                }
                let result = crate::actions::run_shared_reception_action(
                    &action_app,
                    &storage,
                    action_app
                        .state::<clipboard::SelfWriteSuppression>()
                        .inner(),
                    action_app.state::<window_focus::PreviousWindow>().inner(),
                    action_id,
                    crate::actions::SharedReceptionContext {
                        channel_id: effect.channel_id,
                        publication_id: effect.publication_id,
                        origin_device_id: effect.origin_device_id,
                        generation: effect.generation,
                        text: effect.content.text().unwrap_or("").into(),
                        subscription_id: effect.subscription_id.clone(),
                        expected_sequence,
                        lease_expires_at_unix_ms: effect.lease_expires_at_unix_ms,
                        lease_started: effect.lease_started,
                        lease_duration_ms: effect.lease_duration_ms,
                    },
                );
                let outcome = if result.status == crate::actions::ActionRunStatus::Completed {
                    "applied"
                } else {
                    "failed"
                };
                let _ =
                    runtime::finish_action(&storage, &effect.subscription_id, &attempt, outcome);
            }
        });
        std::thread::spawn(move || {
            use crate::{shared_clipboard::runtime, shared_native};
            let storage = app.state::<storage::AppStorage>().inner().clone();
            loop {
                let Ok(status) = runtime::snapshot(&storage) else {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                };
                if !status.configured {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                }
                if status.paused {
                    if runtime::poll_once(&storage).is_err() {
                        runtime::record_error(&storage, "Sharing retention could not complete");
                    }
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                }
                // Sequence only, no clipboard content read. Automatic output
                // cannot overwrite a local copy made while the network polled.
                let expected = status
                    .channels
                    .iter()
                    .any(|channel| {
                        channel.receive_enabled
                            && (channel.update_clipboard || channel.receive_action_writes_clipboard)
                    })
                    .then(shared_native::sequence)
                    .flatten();
                match runtime::poll_once(&storage) {
                    Ok(result) => {
                        if result.history_changed {
                            let _ = app.emit(
                                "copicu://history/changed",
                                serde_json::json!({"reason":"sharedReception"}),
                            );
                        }
                        for effect in result.effects {
                            if effect.update_clipboard {
                                if let Ok(_barrier) = shared_native::EFFECT_BARRIER.lock() {
                                    if let Ok(attempt) = runtime::claim_clipboard(&storage, &effect)
                                    {
                                        let outcome = if let Some(expected) =
                                            expected.filter(|value| {
                                                Some(*value) == shared_native::sequence()
                                            }) {
                                            let remaining =
                                                effect.lease_duration_ms.saturating_sub(
                                                    effect
                                                        .lease_started
                                                        .elapsed()
                                                        .as_millis()
                                                        .try_into()
                                                        .unwrap_or(u64::MAX),
                                                );
                                            let clock_deadline = std::time::SystemTime::now()
                                                .duration_since(std::time::UNIX_EPOCH)
                                                .map(|now| {
                                                    (now.as_millis() as u64)
                                                        .saturating_add(remaining)
                                                })
                                                .unwrap_or(0);
                                            shared_native::write_content_before(
                                                &effect.content,
                                                expected,
                                                Some(
                                                    clock_deadline
                                                        .min(effect.lease_expires_at_unix_ms),
                                                ),
                                                Some(remaining),
                                            )
                                        } else {
                                            "clipboardStale".into()
                                        };
                                        let stored = match outcome.as_str() {
                                            "applied" => "applied",
                                            "uncertain" => "uncertain",
                                            "clipboardStale" | "sessionLocked" => "skipped",
                                            _ => "failed",
                                        };
                                        let _ = runtime::finish_clipboard(
                                            &storage,
                                            &effect.subscription_id,
                                            &attempt,
                                            stored,
                                        );
                                    } else {
                                        let _ = runtime::skip_effect(
                                            &storage,
                                            &effect,
                                            "clipboard",
                                            "deliveryIneligible",
                                        );
                                    }
                                }
                            }
                            if effect.action_id.is_some() {
                                if let Ok(attempt) = runtime::claim_action(&storage, &effect) {
                                    if let Err(error) =
                                        action_tx.try_send((effect, attempt, expected))
                                    {
                                        let (effect, attempt, _) = match error {
                                            std::sync::mpsc::TrySendError::Full(value)
                                            | std::sync::mpsc::TrySendError::Disconnected(value) => {
                                                value
                                            }
                                        };
                                        let _ = runtime::finish_action(
                                            &storage,
                                            &effect.subscription_id,
                                            &attempt,
                                            "skipped",
                                        );
                                        runtime::record_error(&storage, "Reception action queue is full; reception remains available");
                                    }
                                } else {
                                    let _ = runtime::skip_effect(
                                        &storage,
                                        &effect,
                                        "action",
                                        "deliveryIneligible",
                                    );
                                }
                            }
                        }
                    }
                    Err(_) => runtime::record_error(
                        &storage,
                        "Sharing worker could not process this tick",
                    ),
                }
                // Coalesce publication hints into the existing guarded V1 tick.
                // The timeout still handles outbox, retention and legacy relays.
                let _ = publication_hints.recv_timeout(std::time::Duration::from_millis(500));
            }
        });
    }
    #[cfg(not(feature = "shared-clipboard"))]
    {
        let _ = app;
    }
}
