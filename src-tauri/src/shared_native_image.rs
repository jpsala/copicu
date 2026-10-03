//! Image adapter used only by the bounded clipboard child while clipboard is open.
use super::{ClipboardContent, NativeRequest};
use clipboard_rs::common::{RustImage, RustImageData};
use windows::{
    core::w,
    Win32::{
        Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND},
        System::{DataExchange::*, Memory::*},
    },
};

pub(super) fn read() -> Result<ClipboardContent, String> {
    let png_format = unsafe { RegisterClipboardFormatW(w!("PNG")) };
    let image = if png_format != 0 && unsafe { IsClipboardFormatAvailable(png_format) }.is_ok() {
        crate::image_capture::validate_png(&read_format(
            png_format,
            crate::image_capture::MAX_IMAGE_PNG_BYTES,
        )?)?
    } else {
        let format = [17, 8]
            .into_iter()
            .find(|format| unsafe { IsClipboardFormatAvailable(*format) }.is_ok())
            .ok_or("unsupportedFormat")?;
        let dib = read_format(format, 4096 * 4096 * 4 + 4096)?;
        RustImageData::from_bytes(&dib_to_bmp(&dib)?).map_err(|_| "unsupportedFormat")?
    };
    let normalized = crate::image_capture::normalize_clipboard_image(image)?;
    Ok(ClipboardContent::Image(normalized.png_bytes))
}

fn read_format(format: u32, max: usize) -> Result<Vec<u8>, String> {
    let handle = unsafe { GetClipboardData(format) }.map_err(|_| "clipboardUnavailable")?;
    let memory = HGLOBAL(handle.0);
    let size = unsafe { GlobalSize(memory) };
    if size == 0 || size > max {
        return Err("payloadLimit".into());
    }
    let ptr = unsafe { GlobalLock(memory) };
    if ptr.is_null() {
        return Err("clipboardUnavailable".into());
    }
    let bytes = unsafe { std::slice::from_raw_parts(ptr.cast::<u8>(), size) }.to_vec();
    unsafe {
        let _ = GlobalUnlock(memory);
    }
    Ok(bytes)
}

fn dib_to_bmp(dib: &[u8]) -> Result<Vec<u8>, String> {
    if dib.len() < 40 {
        return Err("unsupportedFormat".into());
    }
    let word = |offset| u32::from_le_bytes(dib[offset..offset + 4].try_into().unwrap());
    let header = word(0) as usize;
    if !matches!(header, 40 | 108 | 124) || dib.len() < header {
        return Err("unsupportedFormat".into());
    }
    let width = word(4) as i32;
    let height = (word(8) as i32).checked_abs().ok_or("payloadLimit")?;
    if width <= 0 || height <= 0 || width > 4096 || height > 4096 {
        return Err("payloadLimit".into());
    }
    let bpp = u16::from_le_bytes(dib[14..16].try_into().unwrap()) as usize;
    if dib[12..14] != 1u16.to_le_bytes()
        || !matches!(bpp, 1 | 4 | 8 | 16 | 24 | 32)
        || !matches!(word(16), 0 | 3)
    {
        return Err("unsupportedFormat".into());
    }
    if header == 124 && (word(112) != 0 || word(116) != 0) {
        return Err("unsupportedFormat".into());
    }
    let colors = if word(32) != 0 {
        word(32) as usize
    } else if bpp < 16 {
        1 << bpp
    } else {
        0
    };
    if colors > 256 {
        return Err("payloadLimit".into());
    }
    let offset = header + colors * 4 + if header == 40 && word(16) == 3 { 12 } else { 0 };
    let pixels = (width as usize * bpp).div_ceil(32) * 4 * height as usize;
    if dib.len() < offset + pixels {
        return Err("unsupportedFormat".into());
    }
    let mut bmp = vec![0u8; 14];
    bmp[..2].copy_from_slice(b"BM");
    bmp[2..6].copy_from_slice(&((dib.len() + 14) as u32).to_le_bytes());
    bmp[10..14].copy_from_slice(&((offset + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(dib);
    Ok(bmp)
}

struct Memory(Option<HGLOBAL>);
impl Memory {
    fn new(bytes: &[u8]) -> Result<Self, String> {
        let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len()) }.map_err(|_| "failed")?;
        let value = Self(Some(memory));
        let ptr = unsafe { GlobalLock(memory) };
        if ptr.is_null() {
            return Err("failed".into());
        }
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.cast::<u8>(), bytes.len());
            let _ = GlobalUnlock(memory);
        }
        Ok(value)
    }
    fn publish(&mut self, format: u32) -> Result<(), String> {
        let memory = self.0.ok_or("failed")?;
        unsafe { SetClipboardData(format, Some(HANDLE(memory.0))) }.map_err(|_| "uncertain")?;
        self.0 = None; // Windows owns successfully published memory.
        Ok(())
    }
}
impl Drop for Memory {
    fn drop(&mut self) {
        if let Some(memory) = self.0 {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
        }
    }
}

fn png_to_dib(png: &[u8]) -> Result<Vec<u8>, String> {
    let decoded = crate::image_capture::validate_png(png)?;
    let (width, height) = decoded.get_size();
    let pixels = decoded
        .to_rgba8()
        .map_err(|_| "unsupportedFormat")?
        .into_raw();
    let mut dib = vec![0u8; 124];
    for (offset, value) in [
        (0, 124),
        (4, width),
        (8, (-(height as i32)) as u32),
        (16, 3),
        (20, pixels.len() as u32),
        (40, 0x00ff0000),
        (44, 0x0000ff00),
        (48, 0x000000ff),
        (52, 0xff000000),
        (56, 0x73524742),
        (108, 4),
    ] {
        dib[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }
    dib[12..14].copy_from_slice(&1u16.to_le_bytes());
    dib[14..16].copy_from_slice(&32u16.to_le_bytes());
    for rgba in pixels.chunks_exact(4) {
        dib.extend_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
    }
    Ok(dib)
}

pub(super) fn write(request: &NativeRequest, owner: HWND) -> Result<(), String> {
    let Some(ClipboardContent::Image(png)) = request.content.as_ref() else {
        return Err("unsupportedFormat".into());
    };
    let dib = png_to_dib(png)?;
    let marker = request
        .marker
        .as_ref()
        .filter(|m| m.len() == 32 && m.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("failed")?;
    let marker_format = unsafe { RegisterClipboardFormatW(w!("Copicu.Shared.Provenance.v1")) };
    let png_format = unsafe { RegisterClipboardFormatW(w!("PNG")) };
    if marker_format == 0 || png_format == 0 {
        return Err("failed".into());
    }
    let mut bitmap = Memory::new(&dib)?;
    let mut png = Memory::new(png)?;
    let mut marker = Memory::new(marker.as_bytes())?;
    let expired = request.deadline_unix_ms.is_some_and(|deadline| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(true, |now| now.as_millis() >= u128::from(deadline))
    });
    if expired
        || request
            .deadline_tick_ms
            .is_some_and(|deadline| super::ticks() >= deadline)
        || !super::unlocked()
        || super::sequence() != Some(request.expected_sequence)
    {
        return Err("clipboardStale".into());
    }
    unsafe { EmptyClipboard() }.map_err(|_| "failed")?;
    marker.publish(marker_format)?;
    bitmap.publish(17)?;
    png.publish(png_format)?;
    if unsafe { GetClipboardOwner() }.ok() != Some(owner) {
        return Err("uncertain".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dib_rejects_dimensions_before_pixel_decode() {
        let mut dib = vec![0u8; 124];
        dib[..4].copy_from_slice(&124u32.to_le_bytes());
        dib[4..8].copy_from_slice(&5000i32.to_le_bytes());
        dib[8..12].copy_from_slice(&(-1i32).to_le_bytes());
        assert!(dib_to_bmp(&dib).is_err());
    }
    #[test]
    fn windows_dib_representation_preserves_color_and_alpha() {
        let image = crate::image_capture::synthetic_image(3, 2);
        let dib = png_to_dib(&image.png_bytes).unwrap();
        let decoded = RustImageData::from_bytes(&dib_to_bmp(&dib).unwrap()).unwrap();
        let restored = crate::image_capture::normalize_clipboard_image(decoded).unwrap();
        assert_eq!(restored.png_bytes, image.png_bytes);
    }
}
