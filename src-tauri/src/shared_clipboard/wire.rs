//! Bounded protocol framing shared by local tests and the opt-in C1 candidate.
//! Validation/framing is not signature verification or decryption.

use serde::{Deserialize, Serialize};

pub(crate) const MAX_TEXT_BYTES: usize = 1024 * 1024;
pub(crate) const MAX_CIPHERTEXT_BYTES: usize = MAX_TEXT_BYTES + 16 * 1024;
pub(crate) const MAX_ENVELOPE_JSON_BYTES: usize = 2_000_000;
const DOMAIN: &[u8] = b"Copicu.shared.publication.v1\0";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Envelope {
    pub(crate) version: u8,
    pub(crate) environment: String,
    pub(crate) channel_id: String,
    pub(crate) publication_id: String,
    pub(crate) device_id: String,
    // Decimal strings on the wire preserve every positive u64 through JS/JSON.
    pub(crate) origin_ordinal: String,
    pub(crate) key_epoch: String,
    pub(crate) expires_at_unix_ms: String,
    pub(crate) freshness: Freshness,
    #[serde(with = "base64_bytes")]
    pub(crate) nonce: Vec<u8>,
    #[serde(with = "base64_bytes")]
    pub(crate) ciphertext: Vec<u8>,
    #[serde(with = "base64_bytes")]
    pub(crate) signature: Vec<u8>,
}

mod base64_bytes {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde::{de::Error, Deserialize, Deserializer, Serializer};

    pub(super) fn serialize<S: Serializer>(value: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&STANDARD.encode(value))
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<u8>, D::Error> {
        let encoded = String::deserialize(deserializer)?;
        if encoded.len() > super::MAX_ENVELOPE_JSON_BYTES {
            return Err(D::Error::custom("encoded field exceeds limits"));
        }
        let decoded = STANDARD
            .decode(&encoded)
            .map_err(|_| D::Error::custom("invalid base64 field"))?;
        if STANDARD.encode(&decoded) != encoded {
            return Err(D::Error::custom("noncanonical base64 field"));
        }
        Ok(decoded)
    }
}

pub(crate) fn decode_envelope(bytes: &[u8]) -> Result<Envelope, &'static str> {
    // Apply before serde allocates a body; transport must also cap streaming I/O.
    if bytes.len() > MAX_ENVELOPE_JSON_BYTES {
        return Err("envelope exceeds limits");
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| "invalid envelope")?;
    envelope.validate_shape()?;
    Ok(envelope)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub(crate) enum Freshness {
    #[serde(rename = "deferred")]
    Deferred,
    #[serde(rename = "live")]
    Live { lease_id: String },
}

pub(crate) fn counter(value: &str) -> Result<u64, &'static str> {
    if value.is_empty()
        || value.len() > 20
        || value.starts_with('0')
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("invalid unsigned counter");
    }
    value.parse().map_err(|_| "unsigned counter overflow")
}

fn id(value: &str) -> Result<(), &'static str> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("invalid opaque identifier");
    }
    Ok(())
}

fn framed(target: &mut Vec<u8>, value: &[u8]) {
    // All callers validate bounds well below u32::MAX before this conversion.
    target.extend_from_slice(&(value.len() as u32).to_be_bytes());
    target.extend_from_slice(value);
}

impl Envelope {
    fn validate_context(&self) -> Result<(), &'static str> {
        if self.version != 1 {
            return Err("unsupported protocol version");
        }
        for value in [
            &self.environment,
            &self.channel_id,
            &self.publication_id,
            &self.device_id,
        ] {
            id(value)?;
        }
        counter(&self.origin_ordinal)?;
        counter(&self.key_epoch)?;
        counter(&self.expires_at_unix_ms)?;
        if let Freshness::Live { lease_id } = &self.freshness {
            id(lease_id)?;
        }
        if self.nonce.len() != 24 {
            return Err("invalid suite field length");
        }
        Ok(())
    }

    fn validate_body(&self) -> Result<(), &'static str> {
        self.validate_context()?;
        if !(16..=MAX_CIPHERTEXT_BYTES).contains(&self.ciphertext.len()) {
            return Err("ciphertext size outside limits");
        }
        Ok(())
    }

    pub(crate) fn validate_shape(&self) -> Result<(), &'static str> {
        self.validate_body()?;
        if self.signature.len() != 64 {
            return Err("invalid suite field length");
        }
        Ok(())
    }

    /// Authenticated context for the proposed AEAD; excludes ciphertext/signature.
    /// Calling this does not verify the sender, grants, lease, expiry or epoch.
    pub(crate) fn associated_data(&self) -> Result<Vec<u8>, &'static str> {
        self.validate_context()?;
        let mut bytes = DOMAIN.to_vec();
        bytes.push(self.version);
        for value in [
            &self.environment,
            &self.channel_id,
            &self.publication_id,
            &self.device_id,
        ] {
            framed(&mut bytes, value.as_bytes());
        }
        for value in [
            &self.origin_ordinal,
            &self.key_epoch,
            &self.expires_at_unix_ms,
        ] {
            bytes.extend_from_slice(&counter(value)?.to_be_bytes());
        }
        match &self.freshness {
            Freshness::Deferred => bytes.push(0),
            Freshness::Live { lease_id } => {
                bytes.push(1);
                framed(&mut bytes, lease_id.as_bytes());
            }
        }
        framed(&mut bytes, &self.nonce);
        Ok(bytes)
    }

    /// Exact bytes for the proposed Ed25519 signature, including immutable body.
    pub(crate) fn signing_bytes(&self) -> Result<Vec<u8>, &'static str> {
        // Signing has to work before a signature exists; decoding still requires it.
        self.validate_body()?;
        let mut bytes = self.associated_data()?;
        framed(&mut bytes, &self.ciphertext);
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Envelope {
        Envelope {
            version: 1,
            environment: "synthetic-dev".into(),
            channel_id: "channel-A".into(),
            publication_id: "publication-A".into(),
            device_id: "device-A".into(),
            origin_ordinal: u64::MAX.to_string(),
            key_epoch: "1".into(),
            expires_at_unix_ms: "2000000000000".into(),
            freshness: Freshness::Live {
                lease_id: "lease-A".into(),
            },
            nonce: vec![7; 24],
            ciphertext: vec![9; 32],
            signature: vec![8; 64],
        }
    }

    #[test]
    fn unsigned_wire_roundtrip_preserves_values_above_js_and_sqlite_integer_ranges() {
        let publication = fixture();
        let json = serde_json::to_string(&publication).unwrap();
        let decoded = decode_envelope(json.as_bytes()).unwrap();
        assert_eq!(counter(&decoded.origin_ordinal), Ok(u64::MAX));
        assert_eq!(publication.signing_bytes(), decoded.signing_bytes());
        for value in [
            "",
            "0",
            "01",
            "+1",
            " 1",
            "1.0",
            "1e3",
            "18446744073709551616",
        ] {
            assert!(counter(value).is_err(), "{value}");
        }
    }

    #[test]
    fn canonical_framing_prevents_adjacent_identifier_collisions_and_json_order_dependence() {
        let mut a = fixture();
        let mut b = fixture();
        a.environment = "ab".into();
        a.channel_id = "c".into();
        b.environment = "a".into();
        b.channel_id = "bc".into();
        assert_ne!(a.associated_data(), b.associated_data());
        let mut value = serde_json::to_value(&a).unwrap();
        // JSON field order is never signed; a typed value has a single framing.
        let nonce = value.as_object_mut().unwrap().remove("nonce").unwrap();
        value.as_object_mut().unwrap().insert("nonce".into(), nonce);
        let decoded: Envelope = serde_json::from_value(value).unwrap();
        assert_eq!(a.signing_bytes(), decoded.signing_bytes());
    }

    #[test]
    fn every_routing_freshness_counter_nonce_and_body_field_changes_signed_bytes() {
        let baseline = fixture();
        let expected = baseline.signing_bytes().unwrap();
        let mut variants = Vec::new();
        for field in 0..10 {
            let mut altered = baseline.clone();
            match field {
                0 => altered.environment = "other".into(),
                1 => altered.channel_id = "other".into(),
                2 => altered.publication_id = "other".into(),
                3 => altered.device_id = "other".into(),
                4 => altered.origin_ordinal = "1".into(),
                5 => altered.key_epoch = "2".into(),
                6 => altered.expires_at_unix_ms = "2000000000001".into(),
                7 => altered.freshness = Freshness::Deferred,
                8 => altered.nonce[0] ^= 1,
                9 => altered.ciphertext[0] ^= 1,
                _ => unreachable!(),
            }
            variants.push(altered);
        }
        for altered in variants {
            assert_ne!(expected, altered.signing_bytes().unwrap());
        }
        // This checks binding coverage only, not cryptographic tamper resistance.
    }

    #[test]
    fn encryption_context_and_signing_bytes_do_not_require_their_future_outputs() {
        let baseline = fixture();
        let mut pending = baseline.clone();
        pending.ciphertext.clear();
        pending.signature.clear();
        assert_eq!(baseline.associated_data(), pending.associated_data());
        assert!(pending.signing_bytes().is_err());
        pending.ciphertext = baseline.ciphertext.clone();
        assert_eq!(baseline.signing_bytes(), pending.signing_bytes());
        assert!(pending.validate_shape().is_err());
    }

    #[test]
    fn shape_rejects_unknown_fields_versions_lengths_and_unbounded_inputs() {
        let mut json = serde_json::to_value(fixture()).unwrap();
        json["extra"] = true.into();
        assert!(serde_json::from_value::<Envelope>(json).is_err());
        let mut json = serde_json::to_value(fixture()).unwrap();
        json["origin_ordinal"] = serde_json::json!(9007199254740993_u64);
        assert!(serde_json::from_value::<Envelope>(json).is_err());
        assert!(decode_envelope(&vec![b' '; MAX_ENVELOPE_JSON_BYTES + 1]).is_err());
        for field in 0..6 {
            let mut altered = fixture();
            match field {
                0 => altered.version = 2,
                1 => altered.nonce.pop().map(|_| ()).unwrap(),
                2 => altered.signature.pop().map(|_| ()).unwrap(),
                3 => altered.ciphertext = vec![0; MAX_CIPHERTEXT_BYTES + 1],
                4 => altered.environment = "x".repeat(129),
                5 => {
                    altered.freshness = Freshness::Live {
                        lease_id: "".into(),
                    }
                }
                _ => unreachable!(),
            }
            assert!(altered.validate_shape().is_err());
        }
    }

    #[test]
    fn max_body_stays_bounded_and_base64_is_canonical_without_plaintext_fields() {
        let mut publication = fixture();
        publication.ciphertext = vec![9; MAX_CIPHERTEXT_BYTES];
        let encoded = serde_json::to_vec(&publication).unwrap();
        assert!(encoded.len() < MAX_ENVELOPE_JSON_BYTES);
        assert_eq!(decode_envelope(&encoded).unwrap(), publication);
        let mut json = serde_json::to_value(fixture()).unwrap();
        json["nonce"] = "not base64".into();
        assert!(serde_json::from_value::<Envelope>(json).is_err());
        // Canonical padding is required, even if a permissive decoder could accept it.
        json = serde_json::to_value(fixture()).unwrap();
        let shortened = json["signature"]
            .as_str()
            .unwrap()
            .trim_end_matches('=')
            .to_owned();
        json["signature"] = shortened.into();
        assert!(serde_json::from_value::<Envelope>(json).is_err());
    }
}
