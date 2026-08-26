use std::{collections::VecDeque, sync::Mutex};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PasteAttempt {
    generation: u64,
    pub(crate) item_id: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BeginPaste {
    Empty,
    Busy,
    Ready(PasteAttempt),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FinishPaste {
    Retained,
    Advanced,
    Completed,
    Stale,
}

#[derive(Debug, Default)]
struct Queue {
    pending: VecDeque<i64>,
    in_flight: Option<PasteAttempt>,
    generation: u64,
}

impl Queue {
    fn replace_bottom_to_top(&mut self, visual_order: &[i64]) -> usize {
        self.generation = self.generation.wrapping_add(1);
        self.pending = visual_order.iter().rev().copied().collect();
        self.in_flight = None;
        self.pending.len()
    }

    fn clear(&mut self) -> bool {
        self.generation = self.generation.wrapping_add(1);
        self.in_flight = None;
        !std::mem::take(&mut self.pending).is_empty()
    }

    fn begin(&mut self) -> BeginPaste {
        if self.in_flight.is_some() {
            return BeginPaste::Busy;
        }
        let Some(item_id) = self.pending.front().copied() else {
            return BeginPaste::Empty;
        };
        let attempt = PasteAttempt {
            generation: self.generation,
            item_id,
        };
        self.in_flight = Some(attempt);
        BeginPaste::Ready(attempt)
    }

    fn finish(&mut self, attempt: PasteAttempt, succeeded: bool) -> FinishPaste {
        if self.in_flight != Some(attempt) || self.generation != attempt.generation {
            return FinishPaste::Stale;
        }
        self.in_flight = None;
        if !succeeded {
            return FinishPaste::Retained;
        }
        if self.pending.front() != Some(&attempt.item_id) {
            return FinishPaste::Stale;
        }
        self.pending.pop_front();
        if self.pending.is_empty() {
            FinishPaste::Completed
        } else {
            FinishPaste::Advanced
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct PasteQueue(Mutex<Queue>);

impl PasteQueue {
    pub(crate) fn replace_bottom_to_top(&self, visual_order: &[i64]) -> Result<usize, String> {
        self.0
            .lock()
            .map_err(|_| "paste queue mutex poisoned".to_string())
            .map(|mut queue| queue.replace_bottom_to_top(visual_order))
    }

    pub(crate) fn clear(&self) -> Result<bool, String> {
        self.0
            .lock()
            .map_err(|_| "paste queue mutex poisoned".to_string())
            .map(|mut queue| queue.clear())
    }

    pub(crate) fn begin(&self) -> Result<BeginPaste, String> {
        self.0
            .lock()
            .map_err(|_| "paste queue mutex poisoned".to_string())
            .map(|mut queue| queue.begin())
    }

    pub(crate) fn finish(
        &self,
        attempt: PasteAttempt,
        succeeded: bool,
    ) -> Result<FinishPaste, String> {
        self.0
            .lock()
            .map_err(|_| "paste queue mutex poisoned".to_string())
            .map(|mut queue| queue.finish(attempt, succeeded))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready(queue: &mut Queue) -> PasteAttempt {
        match queue.begin() {
            BeginPaste::Ready(attempt) => attempt,
            other => panic!("expected ready queue, got {other:?}"),
        }
    }

    #[test]
    fn replace_reverses_visual_order_and_replaces_existing_queue() {
        let mut queue = Queue::default();
        queue.replace_bottom_to_top(&[1, 2, 3]);
        assert_eq!(queue.pending, VecDeque::from([3, 2, 1]));

        queue.replace_bottom_to_top(&[8, 9]);
        assert_eq!(queue.pending, VecDeque::from([9, 8]));
    }

    #[test]
    fn one_step_advances_only_after_success() {
        let mut queue = Queue::default();
        queue.replace_bottom_to_top(&[1, 2]);

        let failed = ready(&mut queue);
        assert_eq!(queue.finish(failed, false), FinishPaste::Retained);
        assert_eq!(queue.pending, VecDeque::from([2, 1]));

        let succeeded = ready(&mut queue);
        assert_eq!(succeeded.item_id, 2);
        assert_eq!(queue.finish(succeeded, true), FinishPaste::Advanced);
        assert_eq!(queue.pending, VecDeque::from([1]));
    }

    #[test]
    fn completion_and_clear_leave_queue_empty() {
        let mut queue = Queue::default();
        queue.replace_bottom_to_top(&[7]);
        let attempt = ready(&mut queue);
        assert_eq!(queue.finish(attempt, true), FinishPaste::Completed);
        assert_eq!(queue.begin(), BeginPaste::Empty);

        queue.replace_bottom_to_top(&[4, 5]);
        assert!(queue.clear());
        assert_eq!(queue.begin(), BeginPaste::Empty);
        assert!(!queue.clear());
    }

    #[test]
    fn replacement_invalidates_an_in_flight_attempt() {
        let mut queue = Queue::default();
        queue.replace_bottom_to_top(&[1]);
        let old = ready(&mut queue);
        queue.replace_bottom_to_top(&[1, 2]);

        assert_eq!(queue.finish(old, true), FinishPaste::Stale);
        assert_eq!(queue.pending, VecDeque::from([2, 1]));
    }
}
