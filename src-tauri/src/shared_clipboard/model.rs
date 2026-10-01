//! Pure effect/fence model shared by the app candidate and standalone N1 harness.
//! Host-owned metadata is a precondition; this model does no clipboard I/O.
//! begin_write models a linearization point. The native adapter must still guard
//! the final checks/mutation coherently; pause waits for an already-started write.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Denial {
    UnavailableInput,
    StaleInput,
    InvalidSequence,
    NotNewer,
    Paused,
    SelfOrigin,
    Recovery,
    Deferred,
    Expired,
    WrongScope,
    StaleGeneration,
    Superseded,
    LocalChange,
    AlreadyClaimed,
    Busy,
    UnknownAttempt,
    AlreadyWriting,
    NotWriting,
    NotPaused,
    HeadRollback,
    GenerationExhausted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SnapshotFence(u32);

impl SnapshotFence {
    pub(crate) fn new(invocation_sequence: u32) -> Result<Self, Denial> {
        if invocation_sequence == 0 {
            return Err(Denial::UnavailableInput);
        }
        Ok(Self(invocation_sequence))
    }

    pub(crate) fn validate_read(self, before: u32, after: u32) -> Result<(), Denial> {
        if before == 0 || after == 0 {
            return Err(Denial::UnavailableInput);
        }
        // Windows sequence is only an equality fence within a bounded attempt.
        if before != self.0 || after != self.0 {
            return Err(Denial::StaleInput);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Delivery {
    Live,
    Recovery,
    Deferred,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Publication {
    pub(crate) sequence: u64,
    pub(crate) delivery: Delivery,
    pub(crate) self_origin: bool,
    pub(crate) expired: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PreparedEffect {
    scope: u128,
    generation: u64,
    sequence: u64,
    fence: SnapshotFence,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Attempt(PreparedEffect);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Outcome {
    Applied,
    Failed,
    Uncertain,
    Skipped(Denial),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct OutcomeRecord {
    pub(crate) sequence: u64,
    pub(crate) outcome: Outcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PauseBarrier {
    Acknowledged,
    WaitingForWrite,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PauseTransition {
    pub(crate) barrier: PauseBarrier,
    pub(crate) cancelled: Option<OutcomeRecord>,
}

struct InFlight {
    attempt: Attempt,
    writing: bool,
}

pub(crate) struct EffectGate {
    scope: u128,
    generation: u64,
    enabled: bool,
    last_seen: u64,
    last_claimed: u64,
    in_flight: Option<InFlight>,
}

impl EffectGate {
    /// Scope must distinguish host incarnations/subscriptions while tokens exist;
    /// it is a trusted host binding, not a script-supplied ID or credential.
    /// Bootstrap head is an effect barrier, not a persisted reception cursor.
    pub(crate) fn new(scope: u128, bootstrap_head: u64, enabled: bool) -> Self {
        Self {
            scope,
            generation: 1,
            enabled,
            last_seen: bootstrap_head,
            last_claimed: 0,
            in_flight: None,
        }
    }

    pub(crate) fn prepare(
        &mut self,
        publication: Publication,
        fence: SnapshotFence,
    ) -> Result<PreparedEffect, Denial> {
        if publication.sequence == 0 {
            return Err(Denial::InvalidSequence);
        }
        if publication.sequence <= self.last_seen {
            return Err(Denial::NotNewer);
        }
        // Even a skipped newer publication prevents an older slow effect.
        // Receipt persistence/visibility is separate and is not implemented here.
        self.last_seen = publication.sequence;
        if !self.enabled {
            return Err(Denial::Paused);
        }
        if publication.self_origin {
            return Err(Denial::SelfOrigin);
        }
        match publication.delivery {
            Delivery::Recovery => return Err(Denial::Recovery),
            Delivery::Deferred => return Err(Denial::Deferred),
            Delivery::Live => {}
        }
        if publication.expired {
            return Err(Denial::Expired);
        }
        Ok(PreparedEffect {
            scope: self.scope,
            generation: self.generation,
            sequence: publication.sequence,
            fence,
        })
    }

    fn validate_effect(&self, effect: PreparedEffect) -> Result<(), Denial> {
        if effect.scope != self.scope {
            return Err(Denial::WrongScope);
        }
        if !self.enabled {
            return Err(Denial::Paused);
        }
        if effect.generation != self.generation {
            return Err(Denial::StaleGeneration);
        }
        if effect.sequence != self.last_seen {
            return Err(Denial::Superseded);
        }
        Ok(())
    }

    /// In-memory claim only. A domain adapter must persist the claim before I/O.
    /// Automatic retries cannot reclaim a consumed sequence, including failures.
    pub(crate) fn claim(&mut self, effect: PreparedEffect) -> Result<Attempt, Denial> {
        self.validate_effect(effect)?;
        if effect.sequence <= self.last_claimed {
            return Err(Denial::AlreadyClaimed);
        }
        if self.in_flight.is_some() {
            return Err(Denial::Busy);
        }
        self.last_claimed = effect.sequence;
        let attempt = Attempt(effect);
        self.in_flight = Some(InFlight {
            attempt,
            writing: false,
        });
        Ok(attempt)
    }

    pub(crate) fn begin_write(
        &mut self,
        attempt: Attempt,
        native_sequence: u32,
        expired_now: bool,
    ) -> Result<(), Denial> {
        let flight = self.in_flight.as_ref().ok_or(Denial::UnknownAttempt)?;
        if flight.attempt != attempt {
            return Err(Denial::UnknownAttempt);
        }
        if flight.writing {
            return Err(Denial::AlreadyWriting);
        }
        let validation = self.validate_effect(attempt.0).and_then(|()| {
            if expired_now {
                Err(Denial::Expired)
            } else if native_sequence == 0 {
                Err(Denial::UnavailableInput)
            } else if native_sequence != attempt.0.fence.0 {
                Err(Denial::LocalChange)
            } else {
                Ok(())
            }
        });
        if let Err(reason) = validation {
            self.in_flight = None;
            return Err(reason);
        }
        self.in_flight.as_mut().unwrap().writing = true;
        Ok(())
    }

    pub(crate) fn finish(
        &mut self,
        attempt: Attempt,
        outcome: Outcome,
    ) -> Result<OutcomeRecord, Denial> {
        let flight = self.in_flight.as_ref().ok_or(Denial::UnknownAttempt)?;
        if flight.attempt != attempt {
            return Err(Denial::UnknownAttempt);
        }
        if !flight.writing {
            return Err(Denial::NotWriting);
        }
        self.in_flight = None;
        Ok(OutcomeRecord {
            sequence: attempt.0.sequence,
            outcome,
        })
    }

    pub(crate) fn pause_barrier(&self) -> PauseBarrier {
        if self.in_flight.as_ref().is_some_and(|flight| flight.writing) {
            PauseBarrier::WaitingForWrite
        } else {
            PauseBarrier::Acknowledged
        }
    }

    pub(crate) fn pause(&mut self) -> PauseTransition {
        if self.enabled {
            self.enabled = false;
            // Zero is an exhausted generation: never wrap into an old live one.
            self.generation = self.generation.checked_add(1).unwrap_or(0);
        }
        let cancelled = if self
            .in_flight
            .as_ref()
            .is_some_and(|flight| !flight.writing)
        {
            let flight = self.in_flight.take().unwrap();
            Some(OutcomeRecord {
                sequence: flight.attempt.0.sequence,
                outcome: Outcome::Skipped(Denial::Paused),
            })
        } else {
            None
        };
        PauseTransition {
            barrier: self.pause_barrier(),
            cancelled,
        }
    }

    pub(crate) fn resume(&mut self, head: u64) -> Result<(), Denial> {
        if self.enabled {
            return Err(Denial::NotPaused);
        }
        if self.pause_barrier() == PauseBarrier::WaitingForWrite {
            return Err(Denial::Busy);
        }
        if head < self.last_seen {
            return Err(Denial::HeadRollback);
        }
        if self.generation == 0 {
            return Err(Denial::GenerationExhausted);
        }
        let generation = self
            .generation
            .checked_add(1)
            .ok_or(Denial::GenerationExhausted)?;
        self.generation = generation;
        self.last_seen = head;
        self.enabled = true;
        Ok(())
    }

    /// Models recovery after the previous executor is positively known to have
    /// stopped, never after a mere timeout. Does not implement durable recovery.
    /// Unknown native outcomes never become Applied or automatic replays.
    pub(crate) fn recover_after_executor_exit(&mut self) -> Option<OutcomeRecord> {
        self.in_flight.take().map(|flight| OutcomeRecord {
            sequence: flight.attempt.0.sequence,
            outcome: Outcome::Uncertain,
        })
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
