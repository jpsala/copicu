use crate::storage::{ActiveScenarioSession, Scenario};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

static SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Default)]
pub struct ActiveScenarioState {
    active: Arc<Mutex<Option<ActiveScenarioSession>>>,
}

impl ActiveScenarioState {
    pub fn snapshot(&self) -> Result<Option<ActiveScenarioSession>, String> {
        self.active
            .lock()
            .map(|active| active.clone())
            .map_err(|_| "active scenario mutex poisoned".to_string())
    }

    pub fn activate(&self, scenario: Scenario) -> Result<ActiveScenarioSession, String> {
        let started_at_unix_ms = now_unix_ms();
        let session = ActiveScenarioSession {
            session_id: format!(
                "scenario-{}-{}-{}",
                scenario.id,
                started_at_unix_ms,
                SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ),
            scenario_id: scenario.id,
            scenario_name: scenario.name,
            scenario_revision: scenario.revision,
            saved_view_id: scenario.saved_view_id,
            saved_view_title: scenario.saved_view_title,
            query: scenario.query,
            properties: scenario.properties,
            tags: scenario.tags,
            started_at_unix_ms,
        };
        *self
            .active
            .lock()
            .map_err(|_| "active scenario mutex poisoned".to_string())? = Some(session.clone());
        Ok(session)
    }

    pub fn clear(&self) -> Result<Option<ActiveScenarioSession>, String> {
        self.active
            .lock()
            .map(|mut active| active.take())
            .map_err(|_| "active scenario mutex poisoned".to_string())
    }
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::ScenarioProperties;

    fn scenario(id: i64, name: &str) -> Scenario {
        Scenario {
            id,
            name: name.to_string(),
            saved_view_id: id,
            saved_view_title: format!("{name} view"),
            query: format!("tag:{id}"),
            revision: 1,
            properties: ScenarioProperties::default(),
            tags: Vec::new(),
            created_at_unix_ms: 1,
            updated_at_unix_ms: 1,
        }
    }

    #[test]
    fn activation_switches_atomically_and_new_state_does_not_restore() {
        let state = ActiveScenarioState::default();
        let first = state.activate(scenario(1, "ACME")).expect("activate first");
        let second = state.activate(scenario(2, "Internal")).expect("switch");

        assert_eq!(first.scenario_id, 1);
        assert_eq!(second.scenario_id, 2);
        assert_eq!(state.snapshot().expect("snapshot"), Some(second));
        assert!(ActiveScenarioState::default()
            .snapshot()
            .expect("fresh snapshot")
            .is_none());
    }

    #[test]
    fn stop_clears_only_the_active_session() {
        let state = ActiveScenarioState::default();
        state.activate(scenario(1, "ACME")).expect("activate");
        let stopped = state.clear().expect("stop").expect("active session");
        assert_eq!(stopped.scenario_name, "ACME");
        assert!(state.snapshot().expect("snapshot").is_none());
    }
}
