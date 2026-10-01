//! Opt-in C1 candidate. Cryptography does not establish provider grants, clocks,
//! freshness leases or durable replay admission. No application runtime wiring.
use super::wire::{counter, Envelope, Freshness, MAX_TEXT_BYTES};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Entropy,
    Shape,
    Scope,
    Epoch,
    Expired,
    Replay,
    Grant,
    Signature,
    Authentication,
    Payload,
    Invitation,
    Approval,
    Consumed,
}
pub(crate) type Result<T> = std::result::Result<T, Error>;

// No Debug, Serialize or Clone on any secret-bearing type. Library key types
// wipe their internal keys on drop (the approved zeroize features are enabled).
pub(crate) struct Sensitive(pub(super) Vec<u8>);
impl Drop for Sensitive {
    fn drop(&mut self) {
        for byte in &mut self.0 {
            unsafe { std::ptr::write_volatile(byte, 0) };
        }
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}

/// Injectable *fallible* source. Production callers use SystemEntropy; test
/// providers are restricted to synthetic vectors. Errors never produce a key.
pub(crate) trait Entropy {
    fn fill(&mut self, bytes: &mut [u8]) -> Result<()>;
}
pub(crate) struct SystemEntropy;
impl Entropy for SystemEntropy {
    fn fill(&mut self, bytes: &mut [u8]) -> Result<()> {
        #[cfg(windows)]
        {
            use windows::Win32::Security::Cryptography::{
                BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            };
            unsafe { BCryptGenRandom(None, bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) }
                .ok()
                .map_err(|_| Error::Entropy)
        }
        #[cfg(not(windows))]
        {
            let _ = bytes;
            Err(Error::Entropy)
        }
    }
}

pub(crate) struct DeviceSigner(SigningKey);
impl DeviceSigner {
    pub(super) fn export_secret(&self) -> Sensitive {
        let mut bytes = Sensitive(Vec::with_capacity(32));
        bytes.0.extend_from_slice(self.0.as_bytes());
        bytes
    }
    pub(super) fn restore_secret(bytes: Sensitive) -> Result<Self> {
        let seed: &[u8; 32] = bytes.0.as_slice().try_into().map_err(|_| Error::Shape)?;
        let key = SigningKey::from_bytes(seed);
        if key.verifying_key().is_weak() {
            return Err(Error::Signature);
        }
        Ok(Self(key))
    }
    pub(crate) fn generate(entropy: &mut impl Entropy) -> Result<Self> {
        let mut seed = Sensitive(vec![0; 32]);
        entropy.fill(&mut seed.0)?;
        let seed_ref: &[u8; 32] = seed.0.as_slice().try_into().map_err(|_| Error::Shape)?;
        Ok(Self(SigningKey::from_bytes(seed_ref)))
    }
    pub(crate) fn public(&self) -> [u8; 32] {
        self.0.verifying_key().to_bytes()
    }
    pub(super) fn sign(&self, bytes: &[u8]) -> [u8; 64] {
        self.0.sign(bytes).to_bytes()
    }
}
pub(super) fn verify(public: &[u8; 32], message: &[u8], signature: &[u8]) -> Result<()> {
    let key = VerifyingKey::from_bytes(public).map_err(|_| Error::Signature)?;
    if key.is_weak() {
        return Err(Error::Signature);
    }
    let sig = Signature::from_slice(signature).map_err(|_| Error::Signature)?;
    key.verify_strict(message, &sig)
        .map_err(|_| Error::Signature)
}

pub(crate) struct ChannelKey {
    environment: String,
    channel: String,
    epoch: u64,
    // HPKE's fixed-size secret container implements Zeroize + Drop. Retained
    // channel bytes are never an unprotected Vec or an exported key copy.
    bytes: hpke::kem::SharedSecret<hpke::kem::X25519HkdfSha256>,
}
impl ChannelKey {
    pub(crate) fn generate(
        environment: String,
        channel: String,
        epoch: u64,
        entropy: &mut impl Entropy,
    ) -> Result<Self> {
        let mut bytes = Sensitive(vec![0; 32]);
        entropy.fill(&mut bytes.0)?;
        Self::from_secret(environment, channel, epoch, bytes)
    }
    pub(super) fn from_secret(
        environment: String,
        channel: String,
        epoch: u64,
        bytes: Sensitive,
    ) -> Result<Self> {
        if !valid_id(&environment) || !valid_id(&channel) || epoch == 0 || bytes.0.len() != 32 {
            return Err(Error::Shape);
        }
        let mut retained = hpke::kem::SharedSecret::default();
        retained.0.copy_from_slice(&bytes.0);
        Ok(Self {
            environment,
            channel,
            epoch,
            bytes: retained,
        })
    }
    pub(super) fn secret(&self) -> &[u8] {
        &self.bytes.0
    }
    pub(super) fn matches(&self, environment: &str, channel: &str, epoch: u64) -> bool {
        self.environment == environment && self.channel == channel && self.epoch == epoch
    }
    fn cipher(&self) -> Result<XChaCha20Poly1305> {
        // Length fixed by construction; no secret-bearing temporary key copy.
        let key: &Key = self.secret().try_into().map_err(|_| Error::Shape)?;
        Ok(XChaCha20Poly1305::new(key))
    }
}
pub(super) fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Host-owned authorization snapshot, not deserialized from the envelope.
/// The adapter must obtain the device key/epoch from a current authenticated
/// grant, check a signed lease bound to this publication at acceptance, and
/// reserve replay admission atomically later. Lease validity *now* is not a
/// prerequisite for recovery/manual decryption; auto-effect eligibility uses
/// separate monotonic/bootstrap/generation fences in the native adapter.
pub(crate) struct ReceivePolicy<'a> {
    pub(crate) environment: &'a str,
    pub(crate) channel: &'a str,
    pub(crate) device: &'a str,
    pub(crate) signing_key: [u8; 32],
    pub(crate) epoch: u64,
    pub(crate) now_unix_ms: u64,
    pub(crate) last_origin_ordinal: u64,
    pub(crate) live_lease: Option<&'a str>,
}

/// Immutable metadata and text travel together. No raw String admission API.
/// Durable receipt admission must still fence grant/generation/replay state.
pub(crate) struct VerifiedText {
    envelope: Envelope,
    text: Sensitive,
}
impl VerifiedText {
    pub(crate) fn envelope(&self) -> &Envelope {
        &self.envelope
    }
    pub(crate) fn text(&self) -> &str {
        // Valid UTF-8 is proved before this value can be constructed.
        unsafe { std::str::from_utf8_unchecked(&self.text.0[8..]) }
    }
}

/// Metadata is host-authored; the signer identity must be checked by the caller
/// against its local device grant. The body and signature must initially be empty.
pub(crate) fn seal(
    mut envelope: Envelope,
    text: &str,
    key: &ChannelKey,
    signer: &DeviceSigner,
    entropy: &mut impl Entropy,
) -> Result<Envelope> {
    if !envelope.ciphertext.is_empty()
        || !envelope.signature.is_empty()
        || text.len() > MAX_TEXT_BYTES
    {
        return Err(Error::Shape);
    }
    let epoch = counter(&envelope.key_epoch).map_err(|_| Error::Shape)?;
    if !key.matches(&envelope.environment, &envelope.channel_id, epoch) {
        return Err(Error::Scope);
    }
    envelope.nonce = vec![0; 24];
    entropy.fill(&mut envelope.nonce)?;
    let aad = envelope.associated_data().map_err(|_| Error::Shape)?;
    let mut body = Sensitive(Vec::with_capacity(8 + text.len()));
    body.0.extend_from_slice(b"TXT1");
    body.0.extend_from_slice(&(text.len() as u32).to_be_bytes());
    body.0.extend_from_slice(text.as_bytes());
    let nonce: &XNonce = envelope
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| Error::Shape)?;
    envelope.ciphertext = key
        .cipher()?
        .encrypt(
            nonce,
            Payload {
                msg: &body.0,
                aad: &aad,
            },
        )
        .map_err(|_| Error::Authentication)?;
    envelope.signature = signer
        .sign(&envelope.signing_bytes().map_err(|_| Error::Shape)?)
        .to_vec();
    Ok(envelope)
}

pub(crate) fn open(
    envelope: &Envelope,
    key: &ChannelKey,
    policy: &ReceivePolicy<'_>,
) -> Result<VerifiedText> {
    envelope.validate_shape().map_err(|_| Error::Shape)?;
    verify(
        &policy.signing_key,
        &envelope.signing_bytes().map_err(|_| Error::Shape)?,
        &envelope.signature,
    )?;
    if envelope.environment != policy.environment
        || envelope.channel_id != policy.channel
        || envelope.device_id != policy.device
    {
        return Err(Error::Scope);
    }
    let epoch = counter(&envelope.key_epoch).map_err(|_| Error::Shape)?;
    if epoch != policy.epoch || !key.matches(policy.environment, policy.channel, epoch) {
        return Err(Error::Epoch);
    }
    if counter(&envelope.expires_at_unix_ms).map_err(|_| Error::Shape)? <= policy.now_unix_ms {
        return Err(Error::Expired);
    }
    if counter(&envelope.origin_ordinal).map_err(|_| Error::Shape)? <= policy.last_origin_ordinal {
        return Err(Error::Replay);
    }
    if let Freshness::Live { lease_id } = &envelope.freshness {
        if policy.live_lease != Some(lease_id.as_str()) {
            return Err(Error::Grant);
        }
    }
    let aad = envelope.associated_data().map_err(|_| Error::Shape)?;
    let nonce: &XNonce = envelope
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| Error::Shape)?;
    let text = Sensitive(
        key.cipher()?
            .decrypt(
                nonce,
                Payload {
                    msg: &envelope.ciphertext,
                    aad: &aad,
                },
            )
            .map_err(|_| Error::Authentication)?,
    );
    if text.0.len() < 8 || &text.0[..4] != b"TXT1" {
        return Err(Error::Payload);
    }
    let length = u32::from_be_bytes(text.0[4..8].try_into().map_err(|_| Error::Payload)?) as usize;
    if length > MAX_TEXT_BYTES
        || length != text.0.len() - 8
        || std::str::from_utf8(&text.0[8..]).is_err()
    {
        return Err(Error::Payload);
    }
    Ok(VerifiedText {
        envelope: envelope.clone(),
        text,
    })
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    pub(crate) fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }
    pub(crate) struct Fixed(pub u8);
    impl Entropy for Fixed {
        fn fill(&mut self, b: &mut [u8]) -> Result<()> {
            b.fill(self.0);
            self.0 = self.0.wrapping_add(1);
            Ok(())
        }
    }
    struct Failed;
    impl Entropy for Failed {
        fn fill(&mut self, _: &mut [u8]) -> Result<()> {
            Err(Error::Entropy)
        }
    }
    fn meta() -> Envelope {
        Envelope {
            version: 1,
            environment: "test".into(),
            channel_id: "channel".into(),
            publication_id: "pub".into(),
            device_id: "device".into(),
            origin_ordinal: "1".into(),
            key_epoch: "1".into(),
            expires_at_unix_ms: "100".into(),
            freshness: Freshness::Live {
                lease_id: "lease".into(),
            },
            nonce: vec![],
            ciphertext: vec![],
            signature: vec![],
        }
    }
    #[test]
    fn rfc8032_empty_message() {
        // RFC 8032 §7.1 TEST 1: https://www.rfc-editor.org/rfc/rfc8032#section-7.1
        let seed = hex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
        let signer = DeviceSigner(SigningKey::from_bytes(seed.as_slice().try_into().unwrap()));
        assert_eq!(
            signer.public().as_slice(),
            hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        );
        let sig = hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
        assert_eq!(signer.sign(b"").as_slice(), sig);
        verify(&signer.public(), b"", &sig).unwrap();
        assert_eq!(
            verify(&signer.public(), b"tamper", &sig),
            Err(Error::Signature)
        );
        let mut weak = [0; 32];
        weak[0] = 1;
        assert_eq!(verify(&weak, b"", &[0; 64]), Err(Error::Signature));
    }
    #[test]
    fn upstream_xchacha_known_answer() {
        // https://github.com/RustCrypto/AEADs/blob/master/chacha20poly1305/tests/lib.rs
        // XChaCha20Poly1305 vector,
        // draft-irtf-cfrg-xchacha §A.3.1, key 80..9f / nonce 40..57.
        let k: Vec<u8> = (0x80..=0x9f).collect();
        let n: Vec<u8> = (0x40..=0x57).collect();
        let aad = hex("50515253c0c1c2c3c4c5c6c7");
        let pt=b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let mut ct=hex("bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52e");
        ct.extend(hex("c0875924c1c7987947deafd8780acf49"));
        let cipher = XChaCha20Poly1305::new(k.as_slice().try_into().unwrap());
        assert_eq!(
            cipher
                .encrypt(
                    n.as_slice().try_into().unwrap(),
                    Payload { msg: pt, aad: &aad }
                )
                .unwrap(),
            ct
        );
        assert_eq!(
            cipher
                .decrypt(
                    n.as_slice().try_into().unwrap(),
                    Payload {
                        msg: &ct,
                        aad: &aad
                    }
                )
                .unwrap(),
            pt
        );
    }
    #[test]
    fn authenticated_metadata_and_host_fences() {
        let mut rng = Fixed(10);
        let signer = DeviceSigner::generate(&mut rng).unwrap();
        let key = ChannelKey::generate("test".into(), "channel".into(), 1, &mut rng).unwrap();
        let env = seal(meta(), "á\0\r\n", &key, &signer, &mut rng).unwrap();
        let mut p = ReceivePolicy {
            environment: "test",
            channel: "channel",
            device: "device",
            signing_key: signer.public(),
            epoch: 1,
            now_unix_ms: 1,
            last_origin_ordinal: 0,
            live_lease: Some("lease"),
        };
        let opened = open(&env, &key, &p).unwrap();
        assert_eq!(opened.text(), "á\0\r\n");
        assert_eq!(opened.envelope(), &env);
        for i in 0..11 {
            let mut bad = env.clone();
            match i {
                0 => bad.environment = "other".into(),
                1 => bad.channel_id = "other".into(),
                2 => bad.publication_id = "other".into(),
                3 => bad.origin_ordinal = "2".into(),
                4 => bad.key_epoch = "2".into(),
                5 => bad.expires_at_unix_ms = "200".into(),
                6 => bad.nonce[0] ^= 1,
                7 => bad.ciphertext[0] ^= 1,
                8 => bad.device_id = "other".into(),
                9 => bad.freshness = Freshness::Deferred,
                _ => bad.signature[0] ^= 1,
            };
            assert!(matches!(open(&bad, &key, &p), Err(Error::Signature)));
        }
        p.environment = "other";
        assert!(matches!(open(&env, &key, &p), Err(Error::Scope)));
        p.environment = "test";
        p.device = "other";
        assert!(matches!(open(&env, &key, &p), Err(Error::Scope)));
        p.device = "device";
        p.epoch = 2;
        assert!(matches!(open(&env, &key, &p), Err(Error::Epoch)));
        p.epoch = 1;
        p.last_origin_ordinal = 1;
        assert!(matches!(open(&env, &key, &p), Err(Error::Replay)));
        p.last_origin_ordinal = 0;
        p.now_unix_ms = 100;
        assert!(matches!(open(&env, &key, &p), Err(Error::Expired)));
        p.now_unix_ms = 1;
        p.live_lease = None;
        assert!(matches!(open(&env, &key, &p), Err(Error::Grant)));
        let wrong = ChannelKey::generate("test".into(), "channel".into(), 1, &mut rng).unwrap();
        p.live_lease = Some("lease");
        assert!(matches!(open(&env, &wrong, &p), Err(Error::Authentication)));
    }
    #[test]
    fn entropy_failure_never_returns_keys_or_publication() {
        assert!(matches!(
            DeviceSigner::generate(&mut Failed),
            Err(Error::Entropy)
        ));
        assert!(matches!(
            ChannelKey::generate("test".into(), "channel".into(), 1, &mut Failed),
            Err(Error::Entropy)
        ));
        let mut rng = Fixed(1);
        let signer = DeviceSigner::generate(&mut rng).unwrap();
        let key = ChannelKey::generate("test".into(), "channel".into(), 1, &mut rng).unwrap();
        assert!(matches!(
            seal(meta(), "text", &key, &signer, &mut Failed),
            Err(Error::Entropy)
        ));
    }
    #[test]
    fn authenticated_but_malformed_payload_is_not_verified_text() {
        let mut rng = Fixed(31);
        let signer = DeviceSigner::generate(&mut rng).unwrap();
        let key = ChannelKey::generate("test".into(), "channel".into(), 1, &mut rng).unwrap();
        let mut env = meta();
        env.nonce = vec![7; 24];
        let p = ReceivePolicy {
            environment: "test",
            channel: "channel",
            device: "device",
            signing_key: signer.public(),
            epoch: 1,
            now_unix_ms: 1,
            last_origin_ordinal: 0,
            live_lease: Some("lease"),
        };
        for malformed in [
            &b"bad"[..],
            &b"TXT1\0\0\0\x02a"[..],
            &b"TXT1\0\0\0\x01\xff"[..],
        ] {
            let aad = env.associated_data().unwrap();
            env.ciphertext = key
                .cipher()
                .unwrap()
                .encrypt(
                    env.nonce.as_slice().try_into().unwrap(),
                    Payload {
                        msg: malformed,
                        aad: &aad,
                    },
                )
                .unwrap();
            env.signature = signer.sign(&env.signing_bytes().unwrap()).to_vec();
            assert!(matches!(open(&env, &key, &p), Err(Error::Payload)));
        }
    }
}
