//! Portable clipboard values. Never log or persist a plaintext sharing payload.
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "data",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum ClipboardContent {
    Text(String),
    Image(#[serde(with = "png_base64")] Vec<u8>),
}

impl ClipboardContent {
    pub(crate) fn validate(&self) -> Result<(), String> {
        match self {
            Self::Text(text) if !text.is_empty() && text.len() <= 1024 * 1024 => Ok(()),
            Self::Text(_) => Err("Text must contain 1 byte to 1 MiB".into()),
            Self::Image(png) => crate::image_capture::validate_png(png).map(|_| ()),
        }
    }
    pub(crate) fn text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(text),
            Self::Image(_) => None,
        }
    }
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Self::Text(_) => "text",
            Self::Image(_) => "image",
        }
    }
    pub(crate) fn hash(&self) -> String {
        match self {
            Self::Text(text) => {
                crate::storage::hash_text(&crate::storage::normalize_text_for_storage(text))
            }
            Self::Image(png) => crate::image_capture::hash_bytes(png),
        }
    }
    pub(crate) fn from_item(storage: &crate::storage::AppStorage, id: i64) -> Result<Self, String> {
        let item = storage.get_item(id)?;
        let content = match item.content_kind() {
            "text" => Self::Text(item.text().into()),
            "image" => Self::Image(storage.read_blob_for_item(&item)?),
            _ => return Err("This clipboard format is not supported for sharing yet".into()),
        };
        content.validate()?;
        Ok(content)
    }
    pub(crate) fn preview(&self) -> Result<serde_json::Value, String> {
        match self {
            Self::Text(text) => Ok(serde_json::json!({"kind":"text","text":text})),
            Self::Image(png) => {
                use base64::{engine::general_purpose::STANDARD, Engine};
                let image = crate::image_capture::normalize_clipboard_image(
                    crate::image_capture::validate_png(png)?,
                )?;
                Ok(
                    serde_json::json!({"kind":"image","image":format!("data:image/png;base64,{}",STANDARD.encode(&image.thumbnail_png_bytes)),"width":image.width,"height":image.height,"byteSize":png.len()}),
                )
            }
        }
    }
}

impl Drop for ClipboardContent {
    fn drop(&mut self) {
        let bytes = match self {
            Self::Text(text) => unsafe { text.as_mut_vec() },
            Self::Image(png) => png,
        };
        for byte in bytes {
            unsafe { std::ptr::write_volatile(byte, 0) };
        }
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}

mod png_base64 {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&STANDARD.encode(bytes))
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        let value = String::deserialize(deserializer)?;
        if value.len() > (crate::image_capture::MAX_IMAGE_PNG_BYTES + 2) / 3 * 4 {
            return Err(serde::de::Error::custom("Image exceeds the sharing limit"));
        }
        STANDARD
            .decode(value)
            .map_err(|_| serde::de::Error::custom("Invalid image encoding"))
    }
}
