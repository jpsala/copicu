use clipboard_rs::{common::RustImage, Clipboard, ClipboardContext, RustImageData};
use sha2::{Digest, Sha256};
use std::{thread, time::Duration};

pub(crate) const MAX_IMAGE_DIMENSION: u32 = 4096;
pub(crate) const MAX_IMAGE_PNG_BYTES: usize = 25 * 1024 * 1024;
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

pub(crate) fn normalize_clipboard_image(image: RustImageData) -> Result<CapturedImage, String> {
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

pub(crate) fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Check IHDR before the decoder can allocate pixels from an untrusted payload.
pub(crate) fn validate_png(png: &[u8]) -> Result<RustImageData, String> {
    if png.len() < 33
        || png.len() > MAX_IMAGE_PNG_BYTES
        || &png[..8] != b"\x89PNG\r\n\x1a\n"
        || png[8..12] != 13u32.to_be_bytes()
        || &png[12..16] != b"IHDR"
    {
        return Err("Invalid PNG or image exceeds 25 MiB".into());
    }
    let width = u32::from_be_bytes(png[16..20].try_into().map_err(|_| "Invalid PNG")?);
    let height = u32::from_be_bytes(png[20..24].try_into().map_err(|_| "Invalid PNG")?);
    validate_dimensions(width, height)?;
    let decoded = RustImageData::from_bytes(png).map_err(|_| "Cannot decode shared PNG")?;
    if decoded.get_size() != (width, height) {
        return Err("PNG dimensions do not match".into());
    }
    Ok(decoded)
}

pub(crate) fn retry_clipboard_operation<T, E, F>(
    mut operation: F,
    delays: &[Duration],
) -> Result<T, E>
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

#[cfg(any(test, feature = "shared-clipboard-n1"))]
pub(crate) fn synthetic_image(width: u32, height: u32) -> CapturedImage {
    // Deterministic colors and alpha; no real clipboard, blobs or external asset.
    let mut bmp = vec![0u8; 14 + 124];
    let size = bmp.len() as u32 + width * height * 4;
    bmp[..2].copy_from_slice(b"BM");
    bmp[2..6].copy_from_slice(&size.to_le_bytes());
    bmp[10..14].copy_from_slice(&138u32.to_le_bytes());
    for (offset, value) in [
        (0, 124),
        (4, width),
        (8, (-(height as i32)) as u32),
        (16, 3),
        (20, width * height * 4),
        (40, 0x00ff0000),
        (44, 0x0000ff00),
        (48, 0x000000ff),
        (52, 0xff000000),
        (56, 0x73524742),
    ] {
        bmp[14 + offset..18 + offset].copy_from_slice(&value.to_le_bytes());
    }
    bmp[26..28].copy_from_slice(&1u16.to_le_bytes());
    bmp[28..30].copy_from_slice(&32u16.to_le_bytes());
    let mut noise = 0x1234abcd_u32;
    for _ in 0..width * height {
        noise ^= noise << 13;
        noise ^= noise >> 17;
        noise ^= noise << 5;
        bmp.extend_from_slice(&noise.to_le_bytes());
    }
    normalize_clipboard_image(RustImageData::from_bytes(&bmp).unwrap()).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_png_dimensions_and_bytes_are_bounded_before_decode() {
        let image = synthetic_image(3, 2);
        assert_eq!(validate_png(&image.png_bytes).unwrap().get_size(), (3, 2));
        let mut bomb = image.png_bytes.clone();
        bomb[16..20].copy_from_slice(&5000u32.to_be_bytes());
        assert!(validate_png(&bomb).is_err());
        assert!(validate_png(&vec![0; MAX_IMAGE_PNG_BYTES + 1]).is_err());
        assert!(validate_png(&image.png_bytes[..32]).is_err());
    }

    #[test]
    fn retries_transient_clipboard_failures() {
        let mut attempts = 0;
        let result = retry_clipboard_operation(
            || {
                attempts += 1;
                if attempts < 3 {
                    Err("busy")
                } else {
                    Ok("written")
                }
            },
            &[Duration::ZERO, Duration::ZERO],
        );

        assert_eq!(result, Ok("written"));
        assert_eq!(attempts, 3);
    }

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
