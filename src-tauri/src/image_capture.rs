use clipboard_rs::{common::RustImage, Clipboard, ClipboardContext, RustImageData};
use sha2::{Digest, Sha256};
use std::{thread, time::Duration};

const MAX_IMAGE_DIMENSION: u32 = 4096;
const MAX_IMAGE_PNG_BYTES: usize = 25 * 1024 * 1024;
const THUMBNAIL_MAX_WIDTH: u32 = 320;
const THUMBNAIL_MAX_HEIGHT: u32 = 240;
const CLIPBOARD_RETRY_DELAYS: [Duration; 4] = [
    Duration::from_millis(8),
    Duration::from_millis(16),
    Duration::from_millis(32),
    Duration::from_millis(64),
];

pub struct CapturedImage {
    pub width: u32,
    pub height: u32,
    pub png_bytes: Vec<u8>,
    pub thumbnail_png_bytes: Vec<u8>,
    pub normalized_hash: String,
}

pub fn read_clipboard_image() -> Result<CapturedImage, String> {
    let image = retry_clipboard_operation(
        || {
            let clipboard = ClipboardContext::new()
                .map_err(|error| format!("image clipboard open failed: {error}"))?;
            clipboard
                .get_image()
                .map_err(|error| format!("image clipboard read failed: {error}"))
        },
        &CLIPBOARD_RETRY_DELAYS,
    )?;

    normalize_clipboard_image(image)
}

pub fn write_png_to_clipboard(png_bytes: &[u8]) -> Result<(), String> {
    let image = RustImageData::from_bytes(png_bytes)
        .map_err(|error| format!("failed to decode stored PNG: {error}"))?;
    let clipboard =
        ClipboardContext::new().map_err(|error| format!("image clipboard open failed: {error}"))?;

    clipboard
        .set_image(image)
        .map_err(|error| format!("image clipboard write failed: {error}"))
}

fn normalize_clipboard_image(image: RustImageData) -> Result<CapturedImage, String> {
    let (width, height) = image.get_size();

    validate_dimensions(width, height)?;

    let png = image
        .to_png()
        .map_err(|error| format!("failed to encode PNG: {error}"))?;
    let png_bytes = png.get_bytes().to_vec();
    if png_bytes.len() > MAX_IMAGE_PNG_BYTES {
        return Err(format!(
            "image PNG too large: {} bytes exceeds {} bytes",
            png_bytes.len(),
            MAX_IMAGE_PNG_BYTES
        ));
    }

    let thumbnail = image
        .thumbnail(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT)
        .map_err(|error| format!("failed to create image thumbnail: {error}"))?;
    let thumbnail_png = thumbnail
        .to_png()
        .map_err(|error| format!("failed to encode thumbnail PNG: {error}"))?;
    let thumbnail_png_bytes = thumbnail_png.get_bytes().to_vec();
    let normalized_hash = hash_bytes(&png_bytes);

    Ok(CapturedImage {
        width,
        height,
        png_bytes,
        thumbnail_png_bytes,
        normalized_hash,
    })
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("image has empty dimensions".to_string());
    }

    if width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
        return Err(format!(
            "image dimensions too large: {width}x{height} exceeds {MAX_IMAGE_DIMENSION}px limit"
        ));
    }

    Ok(())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn retry_clipboard_operation<T, E, F>(mut operation: F, delays: &[Duration]) -> Result<T, E>
where
    F: FnMut() -> Result<T, E>,
{
    for delay in delays {
        match operation() {
            Ok(value) => return Ok(value),
            Err(_) => thread::sleep(*delay),
        }
    }

    operation()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_dimensions() {
        assert!(validate_dimensions(0, 10).is_err());
        assert!(validate_dimensions(10, 0).is_err());
    }

    #[test]
    fn rejects_oversized_dimensions() {
        assert!(validate_dimensions(MAX_IMAGE_DIMENSION + 1, 10).is_err());
        assert!(validate_dimensions(10, MAX_IMAGE_DIMENSION + 1).is_err());
    }
}
