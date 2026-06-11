#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(test))]
fn main() {
    copicu_lib::run();
}

#[cfg(test)]
fn main() {}
