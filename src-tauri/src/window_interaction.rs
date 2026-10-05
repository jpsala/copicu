use std::{collections::HashMap, sync::Mutex};

/// Return to the visible surface that opened a task, without reopening hidden windows.
#[derive(Default)]
pub(crate) struct WindowInteraction {
    return_to: Mutex<HashMap<String, String>>,
}

impl WindowInteraction {
    fn record_open(&self, label: &str, opener: Option<&str>) {
        if opener == Some(label) {
            return;
        }
        if let Ok(mut origins) = self.return_to.lock() {
            origins.remove(label);
            if let Some(opener) = opener {
                origins.insert(label.into(), opener.into());
            }
        }
    }

    fn take_return_target(&self, label: &str, was_foreground: bool) -> Option<String> {
        let origin = self.return_to.lock().ok()?.remove(label);
        was_foreground.then_some(origin).flatten()
    }
}

#[cfg(not(test))]
mod runtime {
    use super::WindowInteraction;
    use crate::{surface_registry, window_focus, PickerFocusPolicy};
    use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

    pub(crate) fn focused_surface<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
        surface_registry::SURFACES.iter().find_map(|surface| {
            if !surface_registry::is_interactive(surface.label) {
                return None;
            }
            let window = app.get_webview_window(surface.label)?;
            (window.is_visible().unwrap_or(false)
                && !window.is_minimized().unwrap_or(false)
                && window_focus::is_tauri_window_foreground(&window))
            .then(|| surface.label.to_string())
        })
    }

    pub(crate) fn has_interactive_focus<R: Runtime>(app: &AppHandle<R>) -> bool {
        // Native dialogs can belong to Copicu without being a registered WebView.
        // A notification is deliberately excluded even if it acquires focus.
        if app
            .get_webview_window(surface_registry::NOTIFICATIONS)
            .is_some_and(|window| window_focus::is_tauri_window_foreground(&window))
        {
            return false;
        }
        #[cfg(target_os = "windows")]
        {
            window_focus::is_process_foreground()
        }
        #[cfg(not(target_os = "windows"))]
        {
            focused_surface(app).is_some()
        }
    }

    pub(crate) fn prepare_open<R: Runtime>(app: &AppHandle<R>, label: &str) {
        if let Some(policy) = app.try_state::<PickerFocusPolicy>() {
            policy.cancel_pending_hide();
        }
        if let Some(interaction) = app.try_state::<WindowInteraction>() {
            interaction.record_open(label, focused_surface(app).as_deref());
        }
    }

    fn picker_is_pinned_and_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
        app.get_webview_window(surface_registry::MAIN)
            .is_some_and(|window| {
                window.is_visible().unwrap_or(false)
                    && !window.is_minimized().unwrap_or(false)
                    && window.is_always_on_top().unwrap_or(false)
            })
    }

    pub(crate) fn prepare_layer<R: Runtime>(
        app: &AppHandle<R>,
        window: &WebviewWindow<R>,
    ) -> Result<(), String> {
        let surface = surface_registry::require(window.label())?;
        let topmost = surface.always_on_top || picker_is_pinned_and_visible(app);
        window_focus::set_tauri_window_topmost_no_activate(window, topmost)
    }

    pub(crate) fn sync_layers<R: Runtime>(app: &AppHandle<R>, picker_hiding: bool) {
        let pinned = !picker_hiding && picker_is_pinned_and_visible(app);
        let foreground = focused_surface(app);
        for surface in surface_registry::SURFACES {
            if surface.label == surface_registry::MAIN
                || !surface_registry::is_interactive(surface.label)
                || surface.always_on_top
            {
                continue;
            }
            if let Some(window) = app.get_webview_window(surface.label) {
                let topmost = pinned
                    && window.is_visible().unwrap_or(false)
                    && !window.is_minimized().unwrap_or(false);
                if let Err(error) =
                    window_focus::set_tauri_window_topmost_no_activate(&window, topmost)
                {
                    eprintln!("{} window layer update failed: {error}", surface.label);
                }
            }
        }
        // Changing the pin must not put the picker over the active task window.
        if let Some(window) = foreground.and_then(|label| app.get_webview_window(&label)) {
            if let Err(error) = window_focus::raise_tauri_window_no_activate(&window) {
                eprintln!("active Copicu window raise failed: {error}");
            }
        }
    }

    pub(crate) fn return_after_close<R: Runtime>(
        app: &AppHandle<R>,
        label: &str,
        was_foreground: bool,
    ) {
        let Some(target) = app
            .try_state::<WindowInteraction>()
            .and_then(|state| state.take_return_target(label, was_foreground))
            .and_then(|label| app.get_webview_window(&label))
        else {
            return;
        };
        if target.is_visible().unwrap_or(false) && !target.is_minimized().unwrap_or(false) {
            if let Err(error) = target
                .set_focus()
                .map_err(|error| error.to_string())
                .and_then(|_| window_focus::focus_tauri_window(&target))
            {
                eprintln!("window return focus failed: {error}");
            }
        }
    }
}

#[cfg(not(test))]
pub(crate) use runtime::*;

#[cfg(test)]
mod tests {
    use super::WindowInteraction;

    #[test]
    fn nested_tasks_return_to_their_own_opener() {
        let state = WindowInteraction::default();
        state.record_open("settings", Some("main"));
        state.record_open("metadata", Some("settings"));
        assert_eq!(
            state.take_return_target("metadata", true).as_deref(),
            Some("settings")
        );
        assert_eq!(
            state.take_return_target("settings", true).as_deref(),
            Some("main")
        );
        assert_eq!(state.take_return_target("settings", true), None);
    }

    #[test]
    fn reopening_from_tray_does_not_keep_a_previous_picker_origin() {
        let state = WindowInteraction::default();
        state.record_open("settings", Some("main"));
        state.record_open("settings", None);
        assert_eq!(state.take_return_target("settings", true), None);
    }

    #[test]
    fn refocusing_an_active_task_preserves_its_origin() {
        let state = WindowInteraction::default();
        state.record_open("settings", Some("main"));
        state.record_open("settings", Some("settings"));
        assert_eq!(
            state.take_return_target("settings", true).as_deref(),
            Some("main")
        );
    }

    #[test]
    fn closing_a_background_task_does_not_steal_focus() {
        let state = WindowInteraction::default();
        state.record_open("settings", Some("main"));
        assert_eq!(state.take_return_target("settings", false), None);
        assert_eq!(state.take_return_target("settings", true), None);
    }
}
