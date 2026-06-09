#![cfg(not(test))]

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

pub const UI_HOST_WINDOW_LABEL: &str = "ui-host";
const UI_HOST_REQUEST_EVENT: &str = "copicu://ui-host/request";
const UI_HOST_WIDTH: u32 = 380;
const UI_HOST_ALERT_HEIGHT: u32 = 170;
const UI_HOST_CONFIRM_HEIGHT: u32 = 190;
const UI_HOST_INPUT_HEIGHT: u32 = 230;
const UI_HOST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Default)]
pub struct UiHostState {
    next_id: Arc<AtomicU64>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
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
        pending.insert(request_id, sender);
        Ok(())
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(request_id);
        }
    }

    pub fn resolve(&self, request: UiHostResolveRequest) -> Result<(), String> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| "ui-host pending requests lock poisoned".to_string())?
            .remove(&request.id)
            .ok_or_else(|| format!("unknown ui-host request: {}", request.id))?;
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

    let (dispatch_sender, dispatch_receiver) = mpsc::channel();
    let app_for_main_thread = app.clone();
    let request_for_main_thread = request.clone();
    app.run_on_main_thread(move || {
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
            state.remove_pending(&request_id);
            return Err(error);
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            state.remove_pending(&request_id);
            return Err("ui-host dispatch timed out".to_string());
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            state.remove_pending(&request_id);
            return Err("ui-host dispatch was canceled".to_string());
        }
    }

    match receiver.recv_timeout(UI_HOST_TIMEOUT) {
        Ok(value) => Ok(value),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            state.remove_pending(&request_id);
            Err("ui-host request timed out".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            state.remove_pending(&request_id);
            Err("ui-host request was canceled".to_string())
        }
    }
}

fn show_ui_host_window<R: Runtime>(app: &AppHandle<R>, height: u32) -> Result<(), String> {
    let window = match app.get_webview_window(UI_HOST_WINDOW_LABEL) {
        Some(window) => window,
        None => WebviewWindowBuilder::new(
            app,
            UI_HOST_WINDOW_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title("Copicu")
        .inner_size(UI_HOST_WIDTH as f64, height as f64)
        .min_inner_size(320.0, 170.0)
        .max_inner_size(460.0, 280.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(true)
        .visible(false)
        .build()
        .map_err(|error| format!("ui-host window build failed: {error}"))?,
    };
    window
        .set_size(PhysicalSize::new(UI_HOST_WIDTH, height))
        .map_err(|error| format!("ui-host size failed: {error}"))?;
    if let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
    {
        let position = monitor.position();
        let size = monitor.size();
        let x = position.x + ((size.width.saturating_sub(UI_HOST_WIDTH)) / 2) as i32;
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
