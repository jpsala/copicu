//! Explicitly opt-in N1 harness. Never starts Tauri or accesses a Copicu profile.
#[path = "../shared_clipboard/n1/mod.rs"]
mod n1;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--help"] {
        println!("N1 harness: use tests/manual/run-shared-clipboard-n1.ps1. Clipboard and custody require separate authorization and a disposable Windows session.");
        return;
    }
    if let Err(error) = n1::dispatch(&args, n1::run_native) {
        eprintln!("N1: {error}");
        // Conservative: the wrapper preserves artifacts on any failure.
        std::process::exit(73);
    }
}
