use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::surface_registry;

pub const UI_HOST_WINDOW_LABEL: &str = surface_registry::UI_HOST;
const UI_HOST_REQUEST_EVENT: &str = "copicu://ui-host/request";
const UI_HOST_ALERT_HEIGHT: u32 = 154;
const UI_HOST_CONFIRM_HEIGHT: u32 = 174;
const UI_HOST_INPUT_HEIGHT: u32 = 212;
const UI_HOST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Default)]
pub struct UiHostState {
    next_id: Arc<AtomicU64>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
    active_request: Arc<Mutex<Option<serde_json::Value>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiConfirmOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub message: Option<String>,
    pub confirm_label: Option<String>,
    pub cancel_label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiAlertOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub message: Option<String>,
    pub confirm_label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiInputOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub message: Option<String>,
    pub placeholder: Option<String>,
    pub default_value: Option<String>,
    pub submit_label: Option<String>,
    pub cancel_label: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiHostRequest {
    id: String,
    kind: UiHostRequestKind,
    title: String,
    body: String,
    confirm_label: Option<String>,
    cancel_label: Option<String>,
    placeholder: Option<String>,
    default_value: Option<String>,
    submit_label: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum UiHostRequestKind {
    Alert,
    Confirm,
    Input,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiHostResolveRequest {
    pub id: String,
    pub value: serde_json::Value,
}

impl UiHostState {
    fn next_request_id(&self) -> String {
        format!("ui-{}", self.next_id.fetch_add(1, Ordering::SeqCst) + 1)
    }

    fn insert_pending(
        &self,
        request_id: String,
        sender: mpsc::Sender<serde_json::Value>,
    ) -> Result<(), String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "ui-host pending requests lock poisoned".to_string())?;
        if !pending.is_empty() {
            return Err("ui-host is already presenting another request".to_string());
        }
        pending.insert(request_id, sender);
        Ok(())
    }

    fn set_active_request(&self, request: &UiHostRequest) -> Result<(), String> {
        let value = serde_json::to_value(request)
            .map_err(|error| format!("failed to encode ui-host request: {error}"))?;
        let mut active_request = self
            .active_request
            .lock()
            .map_err(|_| "ui-host active request lock poisoned".to_string())?;
        *active_request = Some(value);
        Ok(())
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(request_id);
        }
        if let Ok(mut active_request) = self.active_request.lock() {
            if active_request
                .as_ref()
                .and_then(|value| value.get("id"))
                .and_then(serde_json::Value::as_str)
                == Some(request_id)
            {
                *active_request = None;
            }
        }
    }

    pub fn active_request(&self) -> Result<Option<serde_json::Value>, String> {
        self.active_request
            .lock()
            .map_err(|_| "ui-host active request lock poisoned".to_string())
            .map(|value| value.clone())
    }

    pub fn resolve(
        &self,
        request: UiHostResolveRequest,
        hide: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "ui-host pending requests lock poisoned".to_string())?;
        if !pending.contains_key(&request.id) {
            return Err(format!("unknown ui-host request: {}", request.id));
        }
        // Keep the request reserved until its window is hidden. A new dialog
        // must not be hidden by the previous dialog's delayed completion.
        hide()?;
        let sender = pending
            .remove(&request.id)
            .expect("request checked under lock");
        if let Ok(mut active_request) = self.active_request.lock() {
            *active_request = None;
        }
        sender
            .send(request.value)
            .map_err(|_| format!("ui-host request receiver closed: {}", request.id))
    }
}

pub fn request_alert<R: Runtime>(
    app: &AppHandle<R>,
    options: UiAlertOptions,
) -> Result<(), String> {
    let request = UiHostRequest {
        id: String::new(),
        kind: UiHostRequestKind::Alert,
        title: compact_text(options.title, "Alert"),
        body: compact_text(options.body.or(options.message), ""),
        confirm_label: options.confirm_label,
        cancel_label: None,
        placeholder: None,
        default_value: None,
        submit_label: None,
    };
    dispatch_request(app, request, UI_HOST_ALERT_HEIGHT).map(|_| ())
}

pub fn request_confirm<R: Runtime>(
    app: &AppHandle<R>,
    options: UiConfirmOptions,
) -> Result<bool, String> {
    let request = UiHostRequest {
        id: String::new(),
        kind: UiHostRequestKind::Confirm,
        title: compact_text(options.title, "Confirm"),
        body: compact_text(options.body.or(options.message), ""),
        confirm_label: options.confirm_label,
        cancel_label: options.cancel_label,
        placeholder: None,
        default_value: None,
        submit_label: None,
    };
    let value = dispatch_request(app, request, UI_HOST_CONFIRM_HEIGHT)?;
    Ok(value.as_bool().unwrap_or(false))
}

pub fn request_input<R: Runtime>(
    app: &AppHandle<R>,
    options: UiInputOptions,
) -> Result<Option<String>, String> {
    let request = UiHostRequest {
        id: String::new(),
        kind: UiHostRequestKind::Input,
        title: compact_text(options.title, "Input"),
        body: compact_text(options.body.or(options.message), ""),
        confirm_label: None,
        cancel_label: options.cancel_label,
        placeholder: options.placeholder,
        default_value: options.default_value,
        submit_label: options.submit_label,
    };
    let value = dispatch_request(app, request, UI_HOST_INPUT_HEIGHT)?;
    if value.is_null() {
        return Ok(None);
    }
    Ok(Some(value.as_str().unwrap_or_default().to_string()))
}

fn dispatch_request<R: Runtime>(
    app: &AppHandle<R>,
    mut request: UiHostRequest,
    height: u32,
) -> Result<serde_json::Value, String> {
    let state = app.state::<UiHostState>().inner().clone();
    request.id = state.next_request_id();
    let request_id = request.id.clone();
    let (sender, receiver) = mpsc::channel();
    state.insert_pending(request_id.clone(), sender)?;
    if let Err(error) = state.set_active_request(&request) {
        state.remove_pending(&request_id);
        return Err(error);
    }

    let (dispatch_sender, dispatch_receiver) = mpsc::channel();
    let app_for_main_thread = app.clone();
    let request_for_main_thread = request.clone();
    app.run_on_main_thread(move || {
        let state = app_for_main_thread.state::<UiHostState>();
        let pending = match state.pending.lock() {
            Ok(pending) => pending,
            Err(_) => {
                let _ =
                    dispatch_sender.send(Err("ui-host pending requests lock poisoned".to_string()));
                return;
            }
        };
        if !pending.contains_key(&request_for_main_thread.id) {
            let _ = dispatch_sender.send(Err(
                "ui-host request was canceled before display".to_string()
            ));
            return;
        }
        let result = show_ui_host_window(&app_for_main_thread, height).and_then(|()| {
            app_for_main_thread
                .emit_to(
                    UI_HOST_WINDOW_LABEL,
                    UI_HOST_REQUEST_EVENT,
                    &request_for_main_thread,
                )
                .map_err(|error| format!("failed to emit ui-host request: {error}"))
        });
        let _ = dispatch_sender.send(result);
    })
    .map_err(|error| {
        state.remove_pending(&request_id);
        format!("failed to dispatch ui-host request: {error}")
    })?;

    match dispatch_receiver.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            cancel_request(app, &state, &request_id);
            return Err(error);
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            cancel_request(app, &state, &request_id);
            return Err("ui-host dispatch timed out".to_string());
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            cancel_request(app, &state, &request_id);
            return Err("ui-host dispatch was canceled".to_string());
        }
    }

    match receiver.recv_timeout(UI_HOST_TIMEOUT) {
        Ok(value) => Ok(value),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            cancel_request(app, &state, &request_id);
            Err("ui-host request timed out".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            cancel_request(app, &state, &request_id);
            Err("ui-host request was canceled".to_string())
        }
    }
}

fn cancel_request<R: Runtime>(app: &AppHandle<R>, state: &UiHostState, request_id: &str) {
    state.remove_pending(request_id);
    let app_for_main_thread = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        let state = app_for_main_thread.state::<UiHostState>();
        let Ok(pending) = state.pending.lock() else {
            return;
        };
        // A later request owns the window now; cancellation must not hide it.
        if pending.is_empty() {
            if let Some(window) = app_for_main_thread.get_webview_window(UI_HOST_WINDOW_LABEL) {
                if let Err(error) = window.hide() {
                    eprintln!("ui-host cancellation hide failed: {error}");
                }
            }
        }
    }) {
        eprintln!("ui-host cancellation dispatch failed: {error}");
    }
}

fn show_ui_host_window<R: Runtime>(app: &AppHandle<R>, height: u32) -> Result<(), String> {
    let surface = surface_registry::require(UI_HOST_WINDOW_LABEL)?;
    let window = match app.get_webview_window(UI_HOST_WINDOW_LABEL) {
        Some(window) => window,
        None => {
            WebviewWindowBuilder::new(app, surface.label, WebviewUrl::App(surface.route.into()))
                .title(surface.title)
                .inner_size(surface.width as f64, height as f64)
                .min_inner_size(surface.min_width as f64, surface.min_height as f64)
                .max_inner_size(
                    surface.max_width.unwrap_or(surface.width) as f64,
                    surface.max_height.unwrap_or(height) as f64,
                )
                .decorations(surface.decorations)
                .transparent(surface.transparent)
                .resizable(surface.resizable)
                .shadow(surface.shadow)
                .skip_taskbar(surface.skip_taskbar)
                .always_on_top(surface.always_on_top)
                .focused(true)
                .visible(false)
                .build()
                .map_err(|error| format!("ui-host window build failed: {error}"))?
        }
    };
    window
        .set_size(PhysicalSize::new(surface.width, height))
        .map_err(|error| format!("ui-host size failed: {error}"))?;
    if let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
    {
        let position = monitor.position();
        let size = monitor.size();
        let x = position.x + ((size.width.saturating_sub(surface.width)) / 2) as i32;
        let y = position.y + ((size.height.saturating_sub(height)) / 2) as i32;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| format!("ui-host position failed: {error}"))?;
    }
    window
        .set_always_on_top(true)
        .map_err(|error| format!("ui-host always-on-top failed: {error}"))?;
    window
        .show()
        .map_err(|error| format!("ui-host show failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("ui-host focus failed: {error}"))?;
    Ok(())
}

fn compact_text(value: Option<String>, fallback: &str) -> String {
    value
        .unwrap_or_else(|| fallback.to_string())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_dialog_cannot_replace_or_resolve_the_active_request() {
        let state = UiHostState::default();
        let (first_sender, first_receiver) = mpsc::channel();
        let (second_sender, _) = mpsc::channel();
        state.insert_pending("first".into(), first_sender).unwrap();
        assert!(state
            .insert_pending("second".into(), second_sender)
            .is_err());
        assert!(state
            .resolve(
                UiHostResolveRequest {
                    id: "second".into(),
                    value: true.into()
                },
                || panic!("an unknown request must not hide the active dialog"),
            )
            .is_err());
        state
            .resolve(
                UiHostResolveRequest {
                    id: "first".into(),
                    value: false.into(),
                },
                || {
                    assert!(first_receiver.try_recv().is_err());
                    Ok(())
                },
            )
            .unwrap();
        assert_eq!(first_receiver.recv().unwrap(), serde_json::json!(false));
        let (sender, _) = mpsc::channel();
        state.insert_pending("next".into(), sender).unwrap();
    }

    #[test]
    fn failed_hide_preserves_pending_response_for_retry() {
        let state = UiHostState::default();
        let (sender, receiver) = mpsc::channel();
        state.insert_pending("request".into(), sender).unwrap();
        assert!(state
            .resolve(
                UiHostResolveRequest {
                    id: "request".into(),
                    value: true.into()
                },
                || Err("synthetic hide failure".into()),
            )
            .is_err());
        assert!(receiver.try_recv().is_err());
        state
            .resolve(
                UiHostResolveRequest {
                    id: "request".into(),
                    value: false.into(),
                },
                || Ok(()),
            )
            .unwrap();
        assert_eq!(receiver.recv().unwrap(), serde_json::json!(false));
    }
}
