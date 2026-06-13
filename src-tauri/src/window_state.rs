use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, Window};

use crate::surface_registry;

const STATE_FILE_NAME: &str = "window-state.json";
const STATE_SCHEMA_VERSION: u32 = 1;
const WRITE_DEBOUNCE: Duration = Duration::from_millis(250);
const MIN_VISIBLE_PX: i32 = 80;

#[derive(Clone, Copy, Debug)]
pub enum RestoreTarget {
    CursorMonitor,
    LastMonitor,
}

#[derive(Clone, Copy)]
pub struct WindowBehavior {
    pub label: &'static str,
    pub resizable: bool,
    pub persist_bounds: bool,
    pub persist_by_monitor: bool,
    pub default_width: u32,
    pub default_height: u32,
    pub min_width: u32,
    pub min_height: u32,
}

#[derive(Clone)]
pub struct WindowStateRegistry {
    path: PathBuf,
    state: Arc<Mutex<PersistedWindowState>>,
    write_scheduled: Arc<AtomicBool>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWindowState {
    schema_version: u32,
    windows: HashMap<String, PersistedWindow>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWindow {
    last_monitor_key: Option<String>,
    last_bounds: Option<WindowBounds>,
    bounds_by_monitor: HashMap<String, WindowBounds>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Debug)]
struct MonitorSnapshot {
    key: String,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
}

impl WindowStateRegistry {
    pub fn open(app_data_dir: PathBuf) -> Self {
        let path = app_data_dir.join(STATE_FILE_NAME);
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str::<PersistedWindowState>(&content).ok())
            .filter(|state| state.schema_version == STATE_SCHEMA_VERSION)
            .unwrap_or_else(|| PersistedWindowState {
                schema_version: STATE_SCHEMA_VERSION,
                windows: HashMap::new(),
            });

        Self {
            path,
            state: Arc::new(Mutex::new(state)),
            write_scheduled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn behavior(label: &str) -> Option<WindowBehavior> {
        surface_registry::get(label).map(|surface| WindowBehavior {
            label: surface.label,
            resizable: surface.resizable,
            persist_bounds: surface.persist_bounds,
            persist_by_monitor: surface.persist_by_monitor,
            default_width: surface.width,
            default_height: surface.height,
            min_width: surface.min_width,
            min_height: surface.min_height,
        })
    }

    pub fn behavior_for_window<R: Runtime>(window: &WebviewWindow<R>) -> Option<WindowBehavior> {
        Self::behavior(window.label())
    }

    pub fn apply_runtime_config<R: Runtime>(
        &self,
        window: &WebviewWindow<R>,
    ) -> Result<(), String> {
        let Some(behavior) = Self::behavior_for_window(window) else {
            return Ok(());
        };
        window
            .set_resizable(behavior.resizable)
            .map_err(|error| format!("window {} set resizable failed: {error}", behavior.label))
    }

    pub fn restore<R: Runtime>(
        &self,
        window: &WebviewWindow<R>,
        target: RestoreTarget,
    ) -> Result<(), String> {
        let Some(behavior) = Self::behavior_for_window(window) else {
            return Ok(());
        };
        self.apply_runtime_config(window)?;
        if !behavior.persist_bounds {
            return Ok(());
        }

        let app = window.app_handle();
        let monitors = app
            .available_monitors()
            .map_err(|error| format!("window {} monitors failed: {error}", behavior.label))?
            .into_iter()
            .map(|monitor| monitor_snapshot(&monitor))
            .collect::<Vec<_>>();
        let cursor_position = app.cursor_position().ok();
        let primary_monitor = app
            .primary_monitor()
            .map_err(|error| format!("window {} primary monitor failed: {error}", behavior.label))?
            .map(|monitor| monitor_snapshot(&monitor));
        let Some(target_monitor) =
            choose_target_monitor(target, &monitors, cursor_position, primary_monitor.clone())
        else {
            return Ok(());
        };

        let saved = {
            let state = self
                .state
                .lock()
                .map_err(|_| "window state lock poisoned".to_string())?;
            state.windows.get(behavior.label).cloned()
        };

        let (bounds, restore_monitor) = match saved {
            Some(saved) if behavior.persist_by_monitor => {
                if let Some(bounds) = saved.bounds_by_monitor.get(&target_monitor.key).copied() {
                    (bounds, target_monitor.clone())
                } else if let Some((monitor, bounds)) =
                    saved.last_monitor_key.as_ref().and_then(|key| {
                        monitors
                            .iter()
                            .find(|monitor| &monitor.key == key)
                            .and_then(|monitor| {
                                saved
                                    .bounds_by_monitor
                                    .get(&monitor.key)
                                    .copied()
                                    .map(|bounds| (monitor.clone(), bounds))
                            })
                    })
                {
                    (bounds, monitor)
                } else {
                    (
                        saved
                            .last_bounds
                            .unwrap_or_else(|| default_bounds(&behavior, &target_monitor)),
                        target_monitor.clone(),
                    )
                }
            }
            Some(saved) => (
                saved
                    .last_bounds
                    .unwrap_or_else(|| default_bounds(&behavior, &target_monitor)),
                target_monitor.clone(),
            ),
            None => (
                default_bounds(&behavior, &target_monitor),
                target_monitor.clone(),
            ),
        };
        let normalized = normalize_bounds(bounds, &behavior, &restore_monitor);
        window
            .set_size(PhysicalSize::new(normalized.width, normalized.height))
            .map_err(|error| format!("window {} restore size failed: {error}", behavior.label))?;
        window
            .set_position(PhysicalPosition::new(normalized.x, normalized.y))
            .map_err(|error| {
                format!("window {} restore position failed: {error}", behavior.label)
            })?;
        Ok(())
    }

    pub fn save_from_window_event<R: Runtime>(&self, window: &Window<R>) -> Result<(), String> {
        let Some(behavior) = Self::behavior(window.label()) else {
            return Ok(());
        };
        if !behavior.persist_bounds {
            return Ok(());
        }

        let position = window
            .outer_position()
            .map_err(|error| format!("window {} position read failed: {error}", behavior.label))?;
        let size = window
            .outer_size()
            .map_err(|error| format!("window {} size read failed: {error}", behavior.label))?;
        let bounds = WindowBounds {
            x: position.x,
            y: position.y,
            width: size.width.max(behavior.min_width),
            height: size.height.max(behavior.min_height),
        };
        let monitor_key = window
            .current_monitor()
            .ok()
            .flatten()
            .map(|monitor| monitor_key(&monitor));

        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "window state lock poisoned".to_string())?;
            state.schema_version = STATE_SCHEMA_VERSION;
            let entry = state
                .windows
                .entry(behavior.label.to_string())
                .or_insert_with(PersistedWindow::default);
            entry.last_bounds = Some(bounds);
            if let Some(monitor_key) = monitor_key {
                entry.last_monitor_key = Some(monitor_key.clone());
                if behavior.persist_by_monitor {
                    entry.bounds_by_monitor.insert(monitor_key, bounds);
                }
            }
        }

        self.schedule_write();
        Ok(())
    }

    fn schedule_write(&self) {
        if self.write_scheduled.swap(true, Ordering::AcqRel) {
            return;
        }
        let path = self.path.clone();
        let state = self.state.clone();
        let write_scheduled = self.write_scheduled.clone();
        thread::spawn(move || {
            thread::sleep(WRITE_DEBOUNCE);
            let snapshot = state.lock().ok().map(|state| state.clone());
            if let Some(snapshot) = snapshot {
                if let Err(error) = write_state_file(&path, &snapshot) {
                    eprintln!("window state write failed: {error}");
                }
            }
            write_scheduled.store(false, Ordering::Release);
        });
    }
}

fn write_state_file(path: &PathBuf, state: &PersistedWindowState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("window state dir create failed: {error}"))?;
    }
    let content = serde_json::to_string_pretty(state)
        .map_err(|error| format!("window state serialize failed: {error}"))?;
    std::fs::write(path, content).map_err(|error| format!("window state write failed: {error}"))
}

fn choose_target_monitor(
    target: RestoreTarget,
    monitors: &[MonitorSnapshot],
    cursor_position: Option<PhysicalPosition<f64>>,
    primary_monitor: Option<MonitorSnapshot>,
) -> Option<MonitorSnapshot> {
    match target {
        RestoreTarget::CursorMonitor => cursor_position
            .and_then(|position| monitor_for_point(monitors, position))
            .or(primary_monitor)
            .or_else(|| monitors.first().cloned()),
        RestoreTarget::LastMonitor => primary_monitor.or_else(|| monitors.first().cloned()),
    }
}

fn monitor_for_point(
    monitors: &[MonitorSnapshot],
    position: PhysicalPosition<f64>,
) -> Option<MonitorSnapshot> {
    let x = position.x.floor() as i32;
    let y = position.y.floor() as i32;
    monitors
        .iter()
        .find(|monitor| {
            x >= monitor.work_x
                && y >= monitor.work_y
                && x < monitor.work_x + monitor.work_width as i32
                && y < monitor.work_y + monitor.work_height as i32
        })
        .cloned()
}

fn normalize_bounds(
    bounds: WindowBounds,
    behavior: &WindowBehavior,
    monitor: &MonitorSnapshot,
) -> WindowBounds {
    let max_width = monitor.work_width.max(behavior.min_width);
    let max_height = monitor.work_height.max(behavior.min_height);
    let width = bounds.width.clamp(behavior.min_width, max_width);
    let height = bounds.height.clamp(behavior.min_height, max_height);
    let mut x = bounds.x;
    let mut y = bounds.y;

    let work_right = monitor.work_x + monitor.work_width as i32;
    let work_bottom = monitor.work_y + monitor.work_height as i32;
    let visible_left = x.max(monitor.work_x);
    let visible_top = y.max(monitor.work_y);
    let visible_right = (x + width as i32).min(work_right);
    let visible_bottom = (y + height as i32).min(work_bottom);
    let visible_width = (visible_right - visible_left).max(0);
    let visible_height = (visible_bottom - visible_top).max(0);

    if visible_width < MIN_VISIBLE_PX || visible_height < MIN_VISIBLE_PX {
        x = monitor.work_x + ((monitor.work_width.saturating_sub(width)) / 2) as i32;
        y = monitor.work_y + ((monitor.work_height.saturating_sub(height)) / 2) as i32;
    } else {
        if x + width as i32 > work_right {
            x = work_right - width as i32;
        }
        if y + height as i32 > work_bottom {
            y = work_bottom - height as i32;
        }
        x = x.max(monitor.work_x);
        y = y.max(monitor.work_y);
    }

    WindowBounds {
        x,
        y,
        width,
        height,
    }
}

fn default_bounds(behavior: &WindowBehavior, monitor: &MonitorSnapshot) -> WindowBounds {
    let max_width = monitor.work_width.max(behavior.min_width);
    let max_height = monitor.work_height.max(behavior.min_height);
    let width = behavior.default_width.clamp(behavior.min_width, max_width);
    let height = behavior
        .default_height
        .clamp(behavior.min_height, max_height);
    WindowBounds {
        x: monitor.work_x + ((monitor.work_width.saturating_sub(width)) / 2) as i32,
        y: monitor.work_y + ((monitor.work_height.saturating_sub(height)) / 2) as i32,
        width,
        height,
    }
}

fn monitor_snapshot(monitor: &Monitor) -> MonitorSnapshot {
    let work_area = monitor.work_area();
    MonitorSnapshot {
        key: monitor_key(monitor),
        work_x: work_area.position.x,
        work_y: work_area.position.y,
        work_width: work_area.size.width,
        work_height: work_area.size.height,
    }
}

fn monitor_key(monitor: &Monitor) -> String {
    let position = monitor.position();
    let size = monitor.size();
    let name = monitor
        .name()
        .map(|name| name.as_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("unknown");
    format!(
        "{name}@{},{}:{}x{}",
        position.x, position.y, size.width, size.height
    )
}
