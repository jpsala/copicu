use super::*;

fn live(sequence: u64) -> Publication {
    Publication {
        sequence,
        delivery: Delivery::Live,
        self_origin: false,
        expired: false,
    }
}

fn fence(sequence: u32) -> SnapshotFence {
    SnapshotFence::new(sequence).unwrap()
}

fn prepared(gate: &mut EffectGate, sequence: u64) -> PreparedEffect {
    gate.prepare(live(sequence), fence(7)).unwrap()
}

#[test]
fn snapshot_accepts_only_the_invocation_sequence_before_and_after_read() {
    let expected = fence(7);
    assert_eq!(expected.validate_read(7, 7), Ok(()));
    assert_eq!(expected.validate_read(8, 8), Err(Denial::StaleInput));
    assert_eq!(expected.validate_read(7, 8), Err(Denial::StaleInput));
    assert_eq!(expected.validate_read(8, 7), Err(Denial::StaleInput));
}

#[test]
fn snapshot_rejects_unavailable_sequence_at_every_stage() {
    assert_eq!(SnapshotFence::new(0), Err(Denial::UnavailableInput));
    assert_eq!(fence(7).validate_read(0, 7), Err(Denial::UnavailableInput));
    assert_eq!(fence(7).validate_read(7, 0), Err(Denial::UnavailableInput));
}

#[test]
fn native_sequence_uses_equality_not_order_or_increment() {
    assert_eq!(fence(u32::MAX).validate_read(u32::MAX, u32::MAX), Ok(()));
    assert_eq!(fence(u32::MAX).validate_read(1, 1), Err(Denial::StaleInput));
    assert_eq!(
        fence(1).validate_read(u32::MAX, u32::MAX),
        Err(Denial::StaleInput)
    );
}

#[test]
fn live_only_admission_rejects_each_noneligible_delivery() {
    let cases = [
        (
            Publication {
                self_origin: true,
                ..live(1)
            },
            Denial::SelfOrigin,
        ),
        (
            Publication {
                delivery: Delivery::Recovery,
                ..live(1)
            },
            Denial::Recovery,
        ),
        (
            Publication {
                delivery: Delivery::Deferred,
                ..live(1)
            },
            Denial::Deferred,
        ),
        (
            Publication {
                expired: true,
                ..live(1)
            },
            Denial::Expired,
        ),
    ];
    for (publication, reason) in cases {
        let mut gate = EffectGate::new(1, 0, true);
        assert_eq!(gate.prepare(publication, fence(7)), Err(reason));
        assert_eq!(gate.last_seen, 1);
        assert!(gate.in_flight.is_none());
    }
}

#[test]
fn auto_write_off_never_admits_an_effect() {
    let mut gate = EffectGate::new(1, 0, false);
    assert_eq!(gate.prepare(live(1), fence(7)), Err(Denial::Paused));
    assert!(gate.in_flight.is_none());
}

#[test]
fn bootstrap_and_positive_server_sequences_are_separate_from_native_sequence() {
    let mut gate = EffectGate::new(1, 40, true);
    assert_eq!(
        gate.prepare(live(0), fence(7)),
        Err(Denial::InvalidSequence)
    );
    assert_eq!(gate.prepare(live(40), fence(7)), Err(Denial::NotNewer));
    assert!(gate.prepare(live(41), fence(7)).is_ok());
}

#[test]
fn server_sequence_keeps_precision_above_javascript_safe_integer() {
    let start = 9_007_199_254_740_992;
    let mut gate = EffectGate::new(1, start, true);
    let first = prepared(&mut gate, start + 1);
    let second = prepared(&mut gate, start + 2);
    assert_eq!(gate.claim(first), Err(Denial::Superseded));
    let attempt = gate.claim(second).unwrap();
    gate.begin_write(attempt, 7, false).unwrap();
    assert_eq!(
        gate.finish(attempt, Outcome::Applied).unwrap().sequence,
        start + 2
    );
}

#[test]
fn duplicate_and_out_of_order_publications_never_produce_another_effect() {
    let mut gate = EffectGate::new(1, 0, true);
    prepared(&mut gate, 2);
    assert_eq!(gate.prepare(live(2), fence(7)), Err(Denial::NotNewer));
    assert_eq!(gate.prepare(live(1), fence(7)), Err(Denial::NotNewer));
    assert_eq!(gate.last_seen, 2);
}

#[test]
fn a_burst_only_allows_the_latest_prepared_effect() {
    let mut gate = EffectGate::new(1, 0, true);
    let first = prepared(&mut gate, 1);
    let latest = prepared(&mut gate, 2);
    assert_eq!(gate.claim(first), Err(Denial::Superseded));
    let attempt = gate.claim(latest).unwrap();
    assert_eq!(gate.begin_write(attempt, 7, false), Ok(()));
    assert_eq!(gate.finish(attempt, Outcome::Applied).unwrap().sequence, 2);
}

#[test]
fn even_a_skipped_newer_publication_invalidates_an_older_claim() {
    for newer in [
        Publication {
            self_origin: true,
            ..live(2)
        },
        Publication {
            delivery: Delivery::Recovery,
            ..live(2)
        },
        Publication {
            delivery: Delivery::Deferred,
            ..live(2)
        },
        Publication {
            expired: true,
            ..live(2)
        },
    ] {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = prepared(&mut gate, 1);
        let attempt = gate.claim(effect).unwrap();
        assert!(gate.prepare(newer, fence(7)).is_err());
        assert_eq!(gate.begin_write(attempt, 7, false), Err(Denial::Superseded));
        assert!(gate.in_flight.is_none());
    }
}

#[test]
fn the_same_automatic_effect_can_only_be_claimed_once() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
    gate.begin_write(attempt, 7, false).unwrap();
    gate.finish(attempt, Outcome::Applied).unwrap();
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
}

#[test]
fn only_one_attempt_can_be_in_flight() {
    let mut gate = EffectGate::new(1, 0, true);
    let first = prepared(&mut gate, 1);
    let attempt = gate.claim(first).unwrap();
    gate.begin_write(attempt, 7, false).unwrap();
    let latest = prepared(&mut gate, 2);
    assert_eq!(gate.claim(latest), Err(Denial::Busy));
    gate.finish(attempt, Outcome::Applied).unwrap();
    assert!(gate.claim(latest).is_ok());
}

#[test]
fn local_change_at_final_check_consumes_attempt_without_rebasing() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(
        gate.begin_write(attempt, 8, false),
        Err(Denial::LocalChange)
    );
    assert_eq!(
        gate.begin_write(attempt, 7, false),
        Err(Denial::UnknownAttempt)
    );
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
}

#[test]
fn unavailable_native_sequence_at_final_check_does_not_begin_write() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(
        gate.begin_write(attempt, 0, false),
        Err(Denial::UnavailableInput)
    );
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
}

#[test]
fn expiration_is_rechecked_after_claim_without_rejuvenating_the_effect() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(gate.begin_write(attempt, 7, true), Err(Denial::Expired));
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
}

#[test]
fn pause_invalidates_a_prepared_effect_and_resume_does_not_revive_it() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    assert_eq!(gate.pause().barrier, PauseBarrier::Acknowledged);
    assert_eq!(gate.claim(effect), Err(Denial::Paused));
    gate.resume(1).unwrap();
    assert_eq!(gate.claim(effect), Err(Denial::StaleGeneration));
    assert_eq!(gate.prepare(live(1), fence(7)), Err(Denial::NotNewer));
    let fresh = prepared(&mut gate, 2);
    assert!(gate.claim(fresh).is_ok());
}

#[test]
fn pause_cancels_a_claim_that_has_not_started_writing() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(
        gate.pause(),
        PauseTransition {
            barrier: PauseBarrier::Acknowledged,
            cancelled: Some(OutcomeRecord {
                sequence: 1,
                outcome: Outcome::Skipped(Denial::Paused)
            }),
        }
    );
    assert_eq!(
        gate.begin_write(attempt, 7, false),
        Err(Denial::UnknownAttempt)
    );
    gate.resume(1).unwrap();
    assert_eq!(gate.claim(effect), Err(Denial::StaleGeneration));
}

#[test]
fn pause_ack_waits_for_started_write_without_reverting_its_outcome() {
    for outcome in [Outcome::Applied, Outcome::Failed, Outcome::Uncertain] {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = prepared(&mut gate, 1);
        let attempt = gate.claim(effect).unwrap();
        gate.begin_write(attempt, 7, false).unwrap();
        assert_eq!(
            gate.pause(),
            PauseTransition {
                barrier: PauseBarrier::WaitingForWrite,
                cancelled: None
            }
        );
        assert_eq!(gate.resume(1), Err(Denial::Busy));
        assert_eq!(
            gate.finish(attempt, outcome),
            Ok(OutcomeRecord {
                sequence: 1,
                outcome
            })
        );
        assert_eq!(gate.pause_barrier(), PauseBarrier::Acknowledged);
        gate.resume(1).unwrap();
        assert_eq!(gate.claim(effect), Err(Denial::StaleGeneration));
    }
}

#[test]
fn repeated_pause_is_idempotent_and_never_acknowledges_an_active_write() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    gate.begin_write(attempt, 7, false).unwrap();
    gate.pause();
    let generation = gate.generation;
    assert_eq!(gate.pause().barrier, PauseBarrier::WaitingForWrite);
    assert_eq!(gate.generation, generation);
}

#[test]
fn resume_requires_a_nonrollback_barrier_and_never_applies_backlog() {
    let mut gate = EffectGate::new(1, 0, true);
    assert_eq!(gate.resume(0), Err(Denial::NotPaused));
    prepared(&mut gate, 4);
    gate.pause();
    assert_eq!(gate.resume(3), Err(Denial::HeadRollback));
    assert!(!gate.enabled);
    gate.resume(10).unwrap();
    assert_eq!(gate.prepare(live(9), fence(7)), Err(Denial::NotNewer));
    assert_eq!(gate.prepare(live(10), fence(7)), Err(Denial::NotNewer));
    assert!(gate.prepare(live(11), fence(7)).is_ok());
}

#[test]
fn interrupted_claim_or_write_is_uncertain_and_never_automatically_replayed() {
    for started in [false, true] {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = prepared(&mut gate, 1);
        let attempt = gate.claim(effect).unwrap();
        if started {
            gate.begin_write(attempt, 7, false).unwrap();
        }
        assert_eq!(
            gate.recover_after_executor_exit(),
            Some(OutcomeRecord {
                sequence: 1,
                outcome: Outcome::Uncertain
            })
        );
        assert_eq!(gate.recover_after_executor_exit(), None);
        assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
        assert_eq!(
            gate.begin_write(attempt, 7, false),
            Err(Denial::UnknownAttempt)
        );
        assert_eq!(
            gate.finish(attempt, Outcome::Applied),
            Err(Denial::UnknownAttempt)
        );
    }
}

#[test]
fn foreign_scope_effect_and_attempt_cannot_use_or_clear_another_gate() {
    let mut a = EffectGate::new(1, 0, true);
    let mut b = EffectGate::new(2, 0, true);
    let effect_a = prepared(&mut a, 1);
    let effect_b = prepared(&mut b, 1);
    assert_eq!(b.claim(effect_a), Err(Denial::WrongScope));
    let attempt_a = a.claim(effect_a).unwrap();
    let attempt_b = b.claim(effect_b).unwrap();
    b.begin_write(attempt_b, 7, false).unwrap();
    assert_eq!(
        b.begin_write(attempt_a, 7, false),
        Err(Denial::UnknownAttempt)
    );
    assert_eq!(
        b.finish(attempt_a, Outcome::Applied),
        Err(Denial::UnknownAttempt)
    );
    assert!(b.finish(attempt_b, Outcome::Applied).is_ok());
}

#[test]
fn native_write_cannot_start_or_finish_twice_or_finish_before_start() {
    let mut gate = EffectGate::new(1, 0, true);
    let effect = prepared(&mut gate, 1);
    let attempt = gate.claim(effect).unwrap();
    assert_eq!(
        gate.finish(attempt, Outcome::Applied),
        Err(Denial::NotWriting)
    );
    gate.begin_write(attempt, 7, false).unwrap();
    assert_eq!(
        gate.begin_write(attempt, 7, false),
        Err(Denial::AlreadyWriting)
    );
    gate.finish(attempt, Outcome::Uncertain).unwrap();
    assert_eq!(
        gate.finish(attempt, Outcome::Applied),
        Err(Denial::UnknownAttempt)
    );
    assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
}

#[test]
fn every_order_of_pause_local_copy_and_final_check_obeys_the_barrier() {
    #[derive(Clone, Copy)]
    enum Event {
        Start,
        Copy,
        Pause,
    }
    use Event::*;
    let orders = [
        [Start, Copy, Pause],
        [Start, Pause, Copy],
        [Copy, Start, Pause],
        [Copy, Pause, Start],
        [Pause, Start, Copy],
        [Pause, Copy, Start],
    ];
    for events in orders {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = prepared(&mut gate, 1);
        let attempt = gate.claim(effect).unwrap();
        let mut sequence = 7;
        let mut started = false;
        for event in events {
            match event {
                Start => started = gate.begin_write(attempt, sequence, false).is_ok(),
                Copy => sequence = 8,
                Pause => {
                    let expected = if started {
                        PauseBarrier::WaitingForWrite
                    } else {
                        PauseBarrier::Acknowledged
                    };
                    assert_eq!(gate.pause().barrier, expected);
                }
            }
        }
        // A copy or pause preceding the final check never permits a write.
        assert_eq!(started, matches!(events[0], Start));
        if started {
            gate.finish(attempt, Outcome::Uncertain).unwrap();
        }
        assert_eq!(gate.pause_barrier(), PauseBarrier::Acknowledged);
    }
}

#[test]
fn generation_exhaustion_leaves_the_gate_paused_instead_of_reusing_tokens() {
    for generation in [u64::MAX - 1, u64::MAX] {
        let mut gate = EffectGate::new(1, 0, true);
        gate.generation = generation;
        let effect = prepared(&mut gate, 1);
        gate.pause();
        assert_eq!(gate.resume(1), Err(Denial::GenerationExhausted));
        assert_eq!(gate.claim(effect), Err(Denial::Paused));
        assert_eq!(gate.pause().barrier, PauseBarrier::Acknowledged);
        assert!(!gate.enabled);
        assert_eq!(gate.generation, generation.checked_add(1).unwrap_or(0));
    }
}
