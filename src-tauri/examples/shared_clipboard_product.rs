fn main() {
    if copicu_lib::shared_native::helper_if_requested() {
        return;
    }
    if let Err(error) = copicu_lib::shared_product_fixture::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
