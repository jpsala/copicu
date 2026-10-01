//! Standalone harness only; native execution is absent from ordinary test builds.
#![allow(dead_code)]

mod clipboard;
mod custody;
// Reuse only the pure model: enabling C1 must never pull app/storage/custody
// integration tests into this standalone native harness.
#[path = "../model.rs"]
mod model;

use std::path::PathBuf;

pub(super) const TEXT: &str = "N1 público: áé 🧪\r\nsegunda línea";
pub(super) const OTHER_TEXT: &str = "N1 recopia local B";
pub(super) const MARKER: &[u8] = b"Copicu.N1.fixture.v1\0";
pub(super) const MAX_BUFFER: usize = 16 * 1024;

pub(super) type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Mode {
    Clipboard,
    Custody,
}

#[derive(Clone, Debug)]
pub(super) struct Request {
    mode: Mode,
    run_id: String,
    session: String,
    run_dir: PathBuf,
    helper: Option<String>,
}

pub(super) fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn parse(args: &[String]) -> Result<Request> {
    let mut mode = None;
    let mut run_id = None;
    let mut session = None;
    let mut run_dir = None;
    let mut helper = None;
    let mut clipboard_permission = false;
    let mut custody_permission = false;
    let mut index = 0;
    while index < args.len() {
        let flag = args[index].as_str();
        if flag == "--allow-clipboard-mutation" || flag == "--allow-synthetic-secrets" {
            let slot = if flag == "--allow-clipboard-mutation" {
                &mut clipboard_permission
            } else {
                &mut custody_permission
            };
            if *slot {
                return Err("duplicate permission flag".into());
            }
            *slot = true;
            index += 1;
            continue;
        }
        let value = args.get(index + 1).ok_or("missing argument value")?;
        let slot = match flag {
            "--mode" => &mut mode,
            "--run-id" => &mut run_id,
            "--session-label" => &mut session,
            "--run-dir" => &mut run_dir,
            "--helper" => &mut helper,
            _ => return Err("unknown argument".into()),
        };
        if slot.replace(value.clone()).is_some() {
            return Err("duplicate argument".into());
        }
        index += 2;
    }
    let mode = match mode.as_deref() {
        Some("clipboard") if clipboard_permission && !custody_permission => Mode::Clipboard,
        Some("custody") if custody_permission && !clipboard_permission => Mode::Custody,
        _ => return Err("explicit mode and its separate permission are required".into()),
    };
    let run_id = run_id.filter(|v| valid_id(v)).ok_or("invalid run ID")?;
    let session = session
        .filter(|v| valid_id(v))
        .ok_or("invalid session label")?;
    let run_dir = PathBuf::from(run_dir.ok_or("explicit run directory required")?);
    if !run_dir.is_absolute()
        || run_dir
            .components()
            .any(|c| c == std::path::Component::ParentDir)
    {
        return Err("run directory must be absolute without traversal".into());
    }
    if let Some(role) = &helper {
        let allowed = match mode {
            Mode::Clipboard => matches!(role.as_str(), "producer" | "writer" | "reader"),
            Mode::Custody => role == "custody",
        };
        if !allowed {
            return Err("helper does not belong to this mode".into());
        }
    }
    let request = Request {
        mode,
        run_id,
        session,
        run_dir,
        helper,
    };
    if request.run_dir != run_root()?.join(&request.run_id) {
        return Err("run outside harness root".into());
    }
    Ok(request)
}

fn run_root() -> Result<PathBuf> {
    // Pure lexical boundary; rejecting a profile path never probes that path.
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("missing checkout")?
        .join(".tmp")
        .join("shared-clipboard-n1"))
}

pub(super) fn dispatch(args: &[String], backend: impl FnOnce(Request) -> Result<()>) -> Result<()> {
    // No filesystem, sequence, HWND, randomness or Win32 calls before this gate.
    backend(parse(args)?)
}

pub(super) fn run_native(request: Request) -> Result<()> {
    #[cfg(all(windows, not(test)))]
    {
        validate_run_dir(&request)?;
        if let Some(role) = &request.helper {
            // Parent assigns the Job Object before sending this handshake.
            let mut line = String::new();
            std::io::stdin()
                .read_line(&mut line)
                .map_err(|_| "helper handshake failed")?;
            if line.trim() != "start" {
                return Err("helper not admitted".into());
            }
            return match request.mode {
                Mode::Clipboard => clipboard::native::helper(role, &request.run_id),
                Mode::Custody => custody::native::helper(&request.run_dir),
            };
        }
        match request.mode {
            Mode::Clipboard => clipboard::native::matrix(&request),
            Mode::Custody => custody::native::matrix(&request),
        }
    }
    #[cfg(any(not(windows), test))]
    {
        let _ = request;
        Err("native execution is unavailable in test/non-Windows builds".into())
    }
}

#[cfg(all(windows, not(test)))]
fn validate_run_dir(request: &Request) -> Result<()> {
    use std::{fs, os::windows::fs::MetadataExt};
    // The wrapper creates the root and ownership marker exclusively, before launch.
    let root = run_root()?;
    let mut path = request.run_dir.as_path();
    loop {
        let meta = fs::symlink_metadata(path).map_err(|_| "run ancestor missing")?;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("reparse point in run path".into());
        }
        if path
            == root
                .parent()
                .and_then(|v| v.parent())
                .ok_or("invalid root")?
        {
            break;
        }
        path = path.parent().ok_or("invalid ancestry")?;
    }
    let marker_path = request.run_dir.join(".n1-owned");
    let marker_meta = fs::symlink_metadata(&marker_path).map_err(|_| "missing ownership marker")?;
    if !marker_meta.is_file()
        || marker_meta.file_attributes() & 0x400 != 0
        || marker_meta.len() > 256
    {
        return Err("invalid ownership marker".into());
    }
    let marker = fs::read_to_string(marker_path).map_err(|_| "missing run ownership marker")?;
    let mode = match request.mode {
        Mode::Clipboard => "Clipboard",
        Mode::Custody => "Custody",
    };
    if marker != format!("{}\n{}\n{}", request.run_id, mode, request.session) {
        return Err("run ownership mismatch".into());
    }
    Ok(())
}

#[cfg(test)]
mod n1_pure {
    use super::*;
    use model::{Delivery, Denial, EffectGate, Outcome, PauseBarrier, Publication, SnapshotFence};

    fn args(mode: &str, permit: &str) -> Vec<String> {
        let root = run_root().unwrap().join("n1-public-fixture");
        [
            "--mode",
            mode,
            "--run-id",
            "n1-public-fixture",
            "--session-label",
            "fixture",
            "--run-dir",
            root.to_str().unwrap(),
            permit,
        ]
        .into_iter()
        .map(str::to_owned)
        .collect()
    }
    fn live(sequence: u64) -> Publication {
        Publication {
            sequence,
            delivery: Delivery::Live,
            self_origin: false,
            expired: false,
        }
    }

    #[test]
    fn rejects_missing_modes_permissions_and_unknown_arguments_before_backend() {
        let mut invalid = vec![vec![], vec!["--mode".into(), "clipboard".into()]];
        invalid.push(args("clipboard", "--allow-synthetic-secrets"));
        let mut unknown = args("clipboard", "--allow-clipboard-mutation");
        unknown.push("--unknown".into());
        invalid.push(unknown);
        for argv in invalid {
            assert!(dispatch(&argv, |_| panic!("native backend must not be reached")).is_err());
        }
    }
    #[test]
    fn rejects_duplicate_combined_and_cross_mode_helper_permissions() {
        let mut argv = args("clipboard", "--allow-clipboard-mutation");
        argv.push("--allow-synthetic-secrets".into());
        assert!(parse(&argv).is_err());
        let mut argv = args("custody", "--allow-synthetic-secrets");
        argv.extend(["--helper".into(), "writer".into()]);
        assert!(parse(&argv).is_err());
        let mut argv = args("clipboard", "--allow-clipboard-mutation");
        argv.push("--allow-clipboard-mutation".into());
        assert!(parse(&argv).is_err());
    }
    #[test]
    fn validates_identifiers_and_absolute_paths_without_filesystem_access() {
        for value in ["", "../x", "a/b", "secret.txt", "a b"] {
            assert!(!valid_id(value));
        }
        assert!(valid_id("n1-clipboard-001"));
        let mut argv = args("clipboard", "--allow-clipboard-mutation");
        argv[7] = "relative".into();
        assert!(parse(&argv).is_err());
    }
    #[test]
    fn accepts_each_separate_permission_with_public_fixture_only() {
        for (mode, permit) in [
            ("clipboard", "--allow-clipboard-mutation"),
            ("custody", "--allow-synthetic-secrets"),
        ] {
            assert!(dispatch(&args(mode, permit), |_| Ok(())).is_ok());
        }
    }

    #[test]
    fn rejects_absolute_outside_root_and_wrong_run_id_before_any_backend_read() {
        let mut argv = args("clipboard", "--allow-clipboard-mutation");
        argv[7] = run_root()
            .unwrap()
            .parent()
            .unwrap()
            .join("outside-public-fixture")
            .to_str()
            .unwrap()
            .into();
        assert!(dispatch(&argv, |_| panic!("must not probe outside root")).is_err());
        argv = args("custody", "--allow-synthetic-secrets");
        argv[3] = "different-run".into();
        assert!(dispatch(&argv, |_| panic!("must not probe another run")).is_err());
    }
    #[test]
    fn native_backend_is_unavailable_even_with_valid_permission_in_test_build() {
        assert!(dispatch(&args("clipboard", "--allow-clipboard-mutation"), run_native).is_err());
        assert!(dispatch(&args("custody", "--allow-synthetic-secrets"), run_native).is_err());
    }
    #[test]
    fn zero_and_late_render_fences_do_not_admit_payload() {
        assert_eq!(SnapshotFence::new(0), Err(Denial::UnavailableInput));
        let fence = SnapshotFence::new(7).unwrap();
        assert_eq!(fence.validate_read(7, 8), Err(Denial::StaleInput));
        assert_eq!(fence.validate_read(0, 7), Err(Denial::UnavailableInput));
    }
    #[test]
    fn recovery_and_deferred_remain_ineligible_after_resume() {
        let mut gate = EffectGate::new(1, 0, true);
        gate.pause();
        gate.resume(20).unwrap();
        for (sequence, delivery, denial) in [
            (21, Delivery::Recovery, Denial::Recovery),
            (22, Delivery::Deferred, Denial::Deferred),
        ] {
            assert_eq!(
                gate.prepare(
                    Publication {
                        delivery,
                        ..live(sequence)
                    },
                    SnapshotFence::new(8).unwrap()
                ),
                Err(denial)
            );
        }
    }
    #[test]
    fn final_guard_preserves_recopia_and_consumes_the_attempt() {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = gate
            .prepare(live(1), SnapshotFence::new(8).unwrap())
            .unwrap();
        let attempt = gate.claim(effect).unwrap();
        assert_eq!(
            gate.begin_write(attempt, 9, false),
            Err(Denial::LocalChange)
        );
        assert_eq!(gate.claim(effect), Err(Denial::AlreadyClaimed));
    }
    #[test]
    fn pause_ack_waits_for_started_write_and_uncertain_has_no_auto_replay() {
        let mut gate = EffectGate::new(1, 0, true);
        let effect = gate
            .prepare(live(1), SnapshotFence::new(8).unwrap())
            .unwrap();
        let attempt = gate.claim(effect).unwrap();
        gate.begin_write(attempt, 8, false).unwrap();
        assert_eq!(gate.pause().barrier, PauseBarrier::WaitingForWrite);
        gate.finish(attempt, Outcome::Uncertain).unwrap();
        assert_eq!(gate.pause_barrier(), PauseBarrier::Acknowledged);
        gate.resume(1).unwrap();
        assert!(gate.claim(effect).is_err());
    }
    #[test]
    fn failed_partial_and_unconfirmed_progress_are_distinct() {
        use clipboard::WriteProgress;
        assert_eq!(WriteProgress::default().failure(), Outcome::Failed);
        let mut progress = WriteProgress::default();
        progress.mutation_started = true;
        assert_eq!(progress.failure(), Outcome::Uncertain);
        progress.text_set = true;
        progress.marker_set = true;
        assert_eq!(progress.outcome(), Outcome::Uncertain);
        progress.correlated = true;
        assert_eq!(progress.outcome(), Outcome::Applied);
    }
    #[test]
    fn correlation_requires_sequence_and_marker_not_equal_text_hash() {
        assert!(clipboard::correlates(8, 8, MARKER, MARKER));
        assert!(!clipboard::correlates(8, 9, MARKER, MARKER));
        assert!(!clipboard::correlates(8, 8, MARKER, b"foreign"));
        assert!(!clipboard::correlates(0, 0, MARKER, MARKER));
        assert!(!clipboard::correlates(8, 8, b"session-A", b"session-B"));
    }
    #[test]
    fn public_binding_fixture_roundtrips_and_rejects_wrong_domain() {
        let binding = custody::Binding::fixture();
        let payload = custody::encode(&binding, &[42; 32]).unwrap();
        assert!(custody::validate(&payload.0, &binding).is_ok());
        for field in 0..3 {
            let mut wrong = binding.clone();
            match field {
                0 => wrong.environment = "other".into(),
                1 => wrong.profile = "other".into(),
                _ => wrong.identity = "other".into(),
            }
            assert!(custody::validate(&payload.0, &wrong).is_err());
        }
    }
    #[test]
    fn custody_fixture_rejects_truncation_tamper_version_and_oversize() {
        let binding = custody::Binding::fixture();
        let payload = custody::encode(&binding, &[42; 32]).unwrap();
        for len in 0..payload.0.len() {
            assert!(custody::validate(&payload.0[..len], &binding).is_err());
        }
        let mut altered = payload.0.clone();
        let end = altered.len() - 1;
        altered[end] ^= 1;
        assert!(custody::validate(&altered, &binding).is_err());
        altered = payload.0.clone();
        altered[8] = 2;
        assert!(custody::validate(&altered, &binding).is_err());
        assert!(custody::validate(&vec![0; MAX_BUFFER + 1], &binding).is_err());
    }
    #[test]
    fn identical_public_binding_copy_is_not_an_anti_clone_proof() {
        let binding = custody::Binding::fixture();
        let payload = custody::encode(&binding, &[42; 32]).unwrap();
        let copy = payload.0.clone();
        assert!(custody::validate(&copy, &binding).is_ok());
    }
}
