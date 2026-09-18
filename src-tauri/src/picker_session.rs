use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Condvar, Mutex,
};
use std::time::Duration;

static NEXT_FOCUS_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct PickerSessionState {
    reset_pending: bool,
    generation: u64,
    pending_activation_item_id: Option<i64>,
    focus: Option<PickerFocusRequest>,
}

struct PickerFocusRequest {
    id: String,
    item_id: i64,
    result: Option<Result<(), String>>,
}

#[derive(Clone, Default)]
pub(crate) struct PickerSessionController {
    state: Arc<(Mutex<PickerSessionState>, Condvar)>,
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
        if let Ok(mut state) = self.state.0.lock() {
            state.reset_pending = true;
            state.generation = state.generation.wrapping_add(1);
        }
    }

    pub(crate) fn remember_activation_if_hidden(&self, item_id: i64) -> bool {
        let Ok(mut state) = self.state.0.lock() else {
            return false;
        };
        if !state.reset_pending {
            return false;
        }
        state.pending_activation_item_id = Some(item_id);
        true
    }

    pub(crate) fn consume_snapshot(&self) -> PickerSessionSnapshot {
        let Ok(mut state) = self.state.0.lock() else {
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

    pub(crate) fn begin_focus(&self, item_id: i64) -> String {
        let id = format!(
            "picker-focus-{}",
            NEXT_FOCUS_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
        );
        let mut state = self.state.0.lock().expect("picker session mutex poisoned");
        state.focus = Some(PickerFocusRequest {
            id: id.clone(),
            item_id,
            result: None,
        });
        self.state.1.notify_all();
        id
    }

    pub(crate) fn fail_focus(&self, request_id: &str, error: String) {
        if let Ok(mut state) = self.state.0.lock() {
            if state
                .focus
                .as_ref()
                .is_some_and(|request| request.id == request_id)
            {
                state.focus.as_mut().unwrap().result = Some(Err(error));
                self.state.1.notify_all();
            }
        }
    }

    pub(crate) fn acknowledge_focus(
        &self,
        request_id: &str,
        item_id: i64,
        ok: bool,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .0
            .lock()
            .map_err(|_| "picker session mutex poisoned".to_string())?;
        let Some(request) = state.focus.as_mut() else {
            return Err("picker focus request is stale".to_string());
        };
        if request.id != request_id || request.item_id != item_id {
            return Err("picker focus request is stale".to_string());
        }
        request.result = Some(if ok {
            Ok(())
        } else {
            Err("picker focus was superseded by newer interaction".to_string())
        });
        self.state.1.notify_all();
        Ok(())
    }

    pub(crate) fn wait_for_focus(&self, request_id: &str) -> Result<(), String> {
        let state = self
            .state
            .0
            .lock()
            .map_err(|_| "picker session mutex poisoned".to_string())?;
        let (mut state, _) = self
            .state
            .1
            .wait_timeout_while(state, Duration::from_secs(15), |state| {
                state
                    .focus
                    .as_ref()
                    .is_some_and(|request| request.id == request_id && request.result.is_none())
            })
            .map_err(|_| "picker focus wait failed".to_string())?;
        let Some(request) = state.focus.as_mut() else {
            return Err("picker focus request is stale".to_string());
        };
        if request.id != request_id {
            return Err("picker focus request was superseded".to_string());
        }
        let result = request
            .result
            .take()
            .unwrap_or_else(|| Err("picker focus renderer acknowledgement timed out".to_string()));
        state.focus = None;
        result
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

    #[test]
    fn stale_or_mismatched_focus_ack_cannot_complete_the_current_request() {
        let session = PickerSessionController::default();
        let previous = session.begin_focus(41);
        let current = session.begin_focus(42);
        assert!(session.acknowledge_focus(&previous, 41, true).is_err());
        assert!(session.wait_for_focus(&previous).is_err());
        assert!(session.acknowledge_focus(&current, 41, true).is_err());
        session.acknowledge_focus(&current, 42, true).unwrap();
        session.wait_for_focus(&current).unwrap();
        assert!(session.acknowledge_focus(&current, 42, true).is_err());
    }

    #[test]
    fn renderer_rejection_does_not_report_successful_focus() {
        let session = PickerSessionController::default();
        let request = session.begin_focus(41);
        session.acknowledge_focus(&request, 41, false).unwrap();
        assert!(session.wait_for_focus(&request).is_err());
    }
}
