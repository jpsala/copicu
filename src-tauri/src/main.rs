#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

#[cfg(not(test))]
fn main() {
    copicu_lib::run();
}

#[cfg(test)]
fn main() {}
