#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(test))]
fn main() {
    #[cfg(feature = "shared-clipboard")]
    if copicu_lib::shared_native::helper_if_requested() { return; }
    copicu_lib::run();
}

#[cfg(test)]
fn main() {}
