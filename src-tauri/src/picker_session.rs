use std::sync::{Arc, Mutex};

#[derive(Default)]
struct PickerSessionState {
    reset_pending: bool,
    generation: u64,
    pending_activation_item_id: Option<i64>,
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

impl PickerSessionController {
    pub(crate) fn mark_transient_hidden(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.reset_pending = true;
            state.generation = state.generation.wrapping_add(1);
        }
    }

    pub(crate) fn remember_activation_if_hidden(&self, item_id: i64) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        if !state.reset_pending {
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
