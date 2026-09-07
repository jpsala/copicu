use std::sync::{Arc, Mutex};

#[derive(Default)]
struct PickerSessionState {
    reset_pending: bool,
    generation: u64,
    pending_activation_item_id: Option<i64>,
    opening_sequence: u64,
    opening: Option<PickerOpening>,
}

#[derive(Clone, Default)]
pub(crate) struct PickerSessionController {
    state: Arc<Mutex<PickerSessionState>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickerSessionSnapshot {
    pub(crate) reset: bool,
    pub(crate) generation: u64,
    pub(crate) pending_activation_item_id: Option<i64>,
}

#[derive(Clone, Copy)]
pub(crate) struct PickerOpening {
    pub(crate) id: u64,
    pub(crate) focus: bool,
}

impl PickerSessionController {
    pub(crate) fn request_opening(&self, focus: bool) -> Result<(PickerOpening, bool), String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        if let Some(mut opening) = state.opening {
            opening.focus |= focus;
            state.opening = Some(opening);
            return Ok((opening, false));
        }
        state.opening_sequence = state.opening_sequence.wrapping_add(1);
        let opening = PickerOpening { id: state.opening_sequence, focus };
        state.opening = Some(opening);
        Ok((opening, true))
    }

    pub(crate) fn renderer_ready(&self) -> Result<Option<u64>, String> {
        let state = self.state.lock().map_err(|error| error.to_string())?;
        Ok(state.opening.map(|opening| opening.id))
    }

    pub(crate) fn take_opening(&self, id: u64) -> Result<Option<PickerOpening>, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        if state.opening.is_some_and(|opening| opening.id == id) {
            Ok(state.opening.take())
        } else {
            Ok(None)
        }
    }

    pub(crate) fn mark_transient_hidden(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.reset_pending = true;
            state.generation = state.generation.wrapping_add(1);
            state.opening = None;
        }
    }

    pub(crate) fn remember_activation_if_hidden(&self, item_id: i64) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        if !state.reset_pending && state.opening.is_none() {
            return false;
        }
        state.pending_activation_item_id = Some(item_id);
        true
    }

    pub(crate) fn consume_snapshot(&self) -> PickerSessionSnapshot {
        let Ok(mut state) = self.state.lock() else {
            return PickerSessionSnapshot {
                reset: false,
                generation: 0,
                pending_activation_item_id: None,
            };
        };
        let snapshot = PickerSessionSnapshot {
            reset: state.reset_pending,
            generation: state.generation,
            pending_activation_item_id: state.pending_activation_item_id.take(),
        };
        state.reset_pending = false;
        snapshot
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_waits_for_renderer_and_coalesces_focus_requests() {
        let session = PickerSessionController::default();
        let (first, notify) = session.request_opening(false).unwrap();
        assert!(notify);
        assert_eq!(session.renderer_ready().unwrap(), Some(first.id));
        let (second, notify) = session.request_opening(true).unwrap();
        assert_eq!(second.id, first.id);
        assert!(!notify);
        assert!(session.take_opening(first.id + 1).unwrap().is_none());
        assert!(session.take_opening(first.id).unwrap().unwrap().focus);
        assert!(session.take_opening(first.id).unwrap().is_none());
    }

    #[test]
    fn hiding_cancels_an_unacknowledged_opening() {
        let session = PickerSessionController::default();
        session.renderer_ready().unwrap();
        let (cancelled, notify) = session.request_opening(true).unwrap();
        assert!(notify);
        session.mark_transient_hidden();
        let (current, notify) = session.request_opening(true).unwrap();
        assert!(notify);
        assert!(session.take_opening(cancelled.id).unwrap().is_none());
        assert_eq!(session.take_opening(current.id).unwrap().unwrap().id, current.id);
    }

    #[test]
    fn hidden_session_remembers_latest_captured_item_until_reopen() {
        let session = PickerSessionController::default();
        session.mark_transient_hidden();

        assert!(session.remember_activation_if_hidden(41));
        assert!(session.remember_activation_if_hidden(42));

        let snapshot = session.consume_snapshot();
        assert!(snapshot.reset);
        assert_eq!(snapshot.pending_activation_item_id, Some(42));

        let consumed = session.consume_snapshot();
        assert!(!consumed.reset);
        assert_eq!(consumed.pending_activation_item_id, None);
    }

    #[test]
    fn visible_session_does_not_replay_capture_activation() {
        let session = PickerSessionController::default();

        assert!(!session.remember_activation_if_hidden(41));
        assert_eq!(session.consume_snapshot().pending_activation_item_id, None);
    }
}
