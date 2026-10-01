//! Candidate enrollment primitives, no account/provider/custody/runtime wiring.
//! Invitation state here is memory-only: durable uniqueness/transactional
//! consumption and user-driven out-of-band UI approval remain integration gates.
use super::crypto::{self, ChannelKey, DeviceSigner, Entropy, Error, Result, Sensitive};
use hpke::{
    aead::ChaCha20Poly1305, kdf::HkdfSha256, kem::X25519HkdfSha256, Deserializable, Kem, OpModeR,
    OpModeS, Serializable,
};
use sha2::{Digest, Sha256};
use std::convert::Infallible;

type SuiteKem = X25519HkdfSha256;
const SUITE: &[u8] = b"XChaCha20Poly1305/Ed25519/HPKE-0020-0001-0003";
const DOMAIN: &[u8] = b"Copicu.shared.enrollment.v1\0";
pub(crate) struct EnrollmentKey(<SuiteKem as Kem>::PrivateKey);
impl EnrollmentKey {
    pub(super) fn export_secret(&self) -> Sensitive {
        let mut bytes = Sensitive(vec![0; 32]);
        self.0.write_exact(&mut bytes.0);
        bytes
    }
    pub(super) fn restore_secret(bytes: Sensitive) -> Result<Self> {
        if bytes.0.len() != 32 {
            return Err(Error::Shape);
        }
        let key = <SuiteKem as Kem>::PrivateKey::from_bytes(&bytes.0).map_err(|_| Error::Shape)?;
        Ok(Self(key))
    }
    pub(crate) fn generate(entropy: &mut impl Entropy) -> Result<Self> {
        let mut ikm = Sensitive(vec![0; 32]);
        entropy.fill(&mut ikm.0)?;
        Ok(Self(SuiteKem::derive_keypair(&ikm.0).0))
    }
    pub(crate) fn public(&self) -> [u8; 32] {
        SuiteKem::sk_to_pk(&self.0).to_bytes().into()
    }
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct Identity {
    pub(crate) device: String,
    pub(crate) signing: [u8; 32],
    pub(crate) kem: [u8; 32],
}
#[derive(Clone)]
pub(crate) struct Transcript {
    pub(crate) environment: String,
    pub(crate) channel: String,
    pub(crate) invitation: String,
    pub(crate) epoch: u64,
    pub(crate) expires_at_unix_ms: u64,
    pub(crate) owner: Identity,
    pub(crate) recipient: Identity,
}
fn frame(bytes: &mut Vec<u8>, field: &[u8]) {
    bytes.extend_from_slice(&(field.len() as u32).to_be_bytes());
    bytes.extend_from_slice(field);
}
impl Transcript {
    fn bytes(&self) -> Result<Vec<u8>> {
        for id in [
            &self.environment,
            &self.channel,
            &self.invitation,
            &self.owner.device,
            &self.recipient.device,
        ] {
            if !crypto::valid_id(id) {
                return Err(Error::Shape);
            }
        }
        if self.epoch == 0
            || self.expires_at_unix_ms == 0
            || self.owner.device == self.recipient.device
            || self.owner.signing == self.recipient.signing
            || self.owner.kem == self.recipient.kem
        {
            return Err(Error::Shape);
        }
        for identity in [&self.owner, &self.recipient] {
            let signing = ed25519_dalek::VerifyingKey::from_bytes(&identity.signing)
                .map_err(|_| Error::Signature)?;
            if signing.is_weak() {
                return Err(Error::Signature);
            }
            // Full low-order rejection is provided by HPKE DH when the key is
            // used; parsing a 32-byte public key alone is not proof of validity.
            if identity.kem == [0; 32] {
                return Err(Error::Authentication);
            }
        }
        let mut b = DOMAIN.to_vec();
        frame(&mut b, SUITE);
        for id in [&self.environment, &self.channel, &self.invitation] {
            frame(&mut b, id.as_bytes());
        }
        b.extend_from_slice(&self.epoch.to_be_bytes());
        b.extend_from_slice(&self.expires_at_unix_ms.to_be_bytes());
        // Fixed roles/order bind both signing and KEM identities. No truncated
        // fingerprints or ambiguous string concatenation.
        for identity in [&self.owner, &self.recipient] {
            frame(&mut b, identity.device.as_bytes());
            b.extend(identity.signing);
            b.extend(identity.kem);
        }
        Ok(b)
    }
    pub(crate) fn fingerprint(&self) -> Result<[u8; 32]> {
        Ok(Sha256::digest(self.bytes()?).into())
    }
    fn valid_at(&self, now: u64) -> Result<()> {
        self.bytes()?;
        if now >= self.expires_at_unix_ms {
            Err(Error::Expired)
        } else {
            Ok(())
        }
    }
}

pub(crate) enum UserDecision {
    Approve,
    Reject,
}
/// Created only after the trusted UI obtains explicit user approval of the full
/// SHA-256 fingerprint compared through an independent out-of-band channel.
pub(crate) struct OutOfBandApproval {
    fingerprint: [u8; 32],
}
impl OutOfBandApproval {
    pub(crate) fn confirm(
        transcript: &Transcript,
        compared: [u8; 32],
        decision: UserDecision,
    ) -> Result<Self> {
        let actual = transcript.fingerprint()?;
        if !matches!(decision, UserDecision::Approve) || actual != compared {
            return Err(Error::Approval);
        }
        Ok(Self {
            fingerprint: actual,
        })
    }
    fn check(&self, t: &Transcript) -> Result<()> {
        if self.fingerprint == t.fingerprint()? {
            Ok(())
        } else {
            Err(Error::Approval)
        }
    }
}

/// Exactly one private pool per pinned HPKE X25519 sender call. HPKE 0.14.1
/// Kem::gen_keypair_with_rng performs ONE 32-byte fill, then derive_keypair.
/// Normal entropy failure returns before HPKE. A changed infallible RNG contract
/// aborts without logs/panic/returned keys; never substitutes/reuses entropy.
struct SenderPool {
    bytes: Sensitive,
    consumed: usize,
}
impl SenderPool {
    fn new(entropy: &mut impl Entropy) -> Result<Self> {
        let mut bytes = Sensitive(vec![0; 32]);
        entropy.fill(&mut bytes.0)?;
        Ok(Self { bytes, consumed: 0 })
    }
}
impl hpke::rand_core::TryRng for SenderPool {
    type Error = Infallible;
    fn try_next_u32(&mut self) -> std::result::Result<u32, Infallible> {
        std::process::abort()
    }
    fn try_next_u64(&mut self) -> std::result::Result<u64, Infallible> {
        std::process::abort()
    }
    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> std::result::Result<(), Infallible> {
        if self.consumed != 0 || dst.len() != 32 {
            std::process::abort();
        }
        dst.copy_from_slice(&self.bytes.0);
        self.consumed = 32;
        Ok(())
    }
}
impl hpke::rand_core::TryCryptoRng for SenderPool {}

pub(crate) struct Transfer {
    enc: [u8; 32],
    ciphertext: Vec<u8>,
    signature: [u8; 64],
}
impl Transfer {
    fn signed_bytes(&self, t: &Transcript) -> Result<Vec<u8>> {
        if self.ciphertext.len() != 48 {
            return Err(Error::Shape);
        }
        let mut b = t.bytes()?;
        frame(&mut b, b"key-transfer");
        b.extend(self.enc);
        frame(&mut b, &self.ciphertext);
        Ok(b)
    }
    fn confirmation_bytes(&self, t: &Transcript) -> Result<Vec<u8>> {
        let mut b = t.bytes()?;
        frame(&mut b, b"recipient-confirmation");
        b.extend(Sha256::digest(self.signed_bytes(t)?));
        b.extend(self.signature);
        Ok(b)
    }
}
enum InvitationState {
    Open,
    Offered([u8; 32]),
    Confirmed,
}
pub(crate) struct Invitation {
    transcript: Transcript,
    state: InvitationState,
}
pub(crate) struct RecipientInvitation {
    transcript: Transcript,
    consumed: bool,
}
pub(crate) struct Confirmation([u8; 64]);
impl Invitation {
    pub(crate) fn new(transcript: Transcript, now: u64) -> Result<Self> {
        transcript.valid_at(now)?;
        Ok(Self {
            transcript,
            state: InvitationState::Open,
        })
    }
    pub(crate) fn offer(
        &mut self,
        approval: &OutOfBandApproval,
        key: &ChannelKey,
        signer: &DeviceSigner,
        entropy: &mut impl Entropy,
        now: u64,
    ) -> Result<Transfer> {
        if !matches!(self.state, InvitationState::Open) {
            return Err(Error::Consumed);
        }
        let t = &self.transcript;
        t.valid_at(now)?;
        approval.check(t)?;
        if signer.public() != t.owner.signing || !key.matches(&t.environment, &t.channel, t.epoch) {
            return Err(Error::Scope);
        }
        let info = t.bytes()?;
        let pk = <SuiteKem as Kem>::PublicKey::from_bytes(&t.recipient.kem)
            .map_err(|_| Error::Authentication)?;
        let mut rng = SenderPool::new(entropy)?;
        let (enc, mut ctx) = hpke::setup_sender_with_rng::<ChaCha20Poly1305, HkdfSha256, SuiteKem>(
            &OpModeS::Base,
            &pk,
            &info,
            &mut rng,
        )
        .map_err(|_| Error::Authentication)?;
        if rng.consumed != 32 {
            std::process::abort();
        }
        let ciphertext = ctx
            .seal(key.secret(), &info)
            .map_err(|_| Error::Authentication)?;
        let mut transfer = Transfer {
            enc: enc.to_bytes().into(),
            ciphertext,
            signature: [0; 64],
        };
        transfer.signature = signer.sign(&transfer.signed_bytes(t)?);
        self.state =
            InvitationState::Offered(Sha256::digest(transfer.confirmation_bytes(t)?).into());
        Ok(transfer)
    }
    pub(crate) fn confirm(
        &mut self,
        transfer: &Transfer,
        confirmation: &Confirmation,
        now: u64,
    ) -> Result<()> {
        self.transcript.valid_at(now)?;
        let digest = Sha256::digest(transfer.confirmation_bytes(&self.transcript)?);
        match &self.state {
            InvitationState::Offered(expected) if expected.as_slice() == digest.as_slice() => {}
            _ => return Err(Error::Consumed),
        }
        crypto::verify(
            &self.transcript.recipient.signing,
            &transfer.confirmation_bytes(&self.transcript)?,
            &confirmation.0,
        )?;
        self.state = InvitationState::Confirmed;
        Ok(())
    }
}
impl RecipientInvitation {
    pub(crate) fn new(transcript: Transcript, now: u64) -> Result<Self> {
        transcript.valid_at(now)?;
        Ok(Self {
            transcript,
            consumed: false,
        })
    }
    pub(crate) fn accept(
        &mut self,
        approval: &OutOfBandApproval,
        transfer: &Transfer,
        key: &EnrollmentKey,
        signer: &DeviceSigner,
        now: u64,
    ) -> Result<(ChannelKey, Confirmation)> {
        if self.consumed {
            return Err(Error::Consumed);
        }
        let t = &self.transcript;
        t.valid_at(now)?;
        approval.check(t)?;
        if key.public() != t.recipient.kem || signer.public() != t.recipient.signing {
            return Err(Error::Scope);
        }
        crypto::verify(
            &t.owner.signing,
            &transfer.signed_bytes(t)?,
            &transfer.signature,
        )?;
        let info = t.bytes()?;
        let enc = <SuiteKem as Kem>::EncappedKey::from_bytes(&transfer.enc)
            .map_err(|_| Error::Authentication)?;
        let mut ctx = hpke::setup_receiver::<ChaCha20Poly1305, HkdfSha256, SuiteKem>(
            &OpModeR::Base,
            &key.0,
            &enc,
            &info,
        )
        .map_err(|_| Error::Authentication)?;
        let secret = Sensitive(
            ctx.open(&transfer.ciphertext, &info)
                .map_err(|_| Error::Authentication)?,
        );
        let channel =
            ChannelKey::from_secret(t.environment.clone(), t.channel.clone(), t.epoch, secret)?;
        let confirmation = Confirmation(signer.sign(&transfer.confirmation_bytes(t)?));
        self.consumed = true;
        Ok((channel, confirmation))
    }
}

#[cfg(test)]
mod tests {
    use super::super::crypto::tests::{hex, Fixed};
    use super::*;
    #[test]
    fn rfc9180_x25519_hkdf_sha256_chacha_known_answers() {
        // RFC 9180 Appendix A; official CFRG test-vectors.json suite mode0,
        // kem_id=32 kdf_id=1 aead_id=3 (first matching vector).
        // https://github.com/cfrg/draft-irtf-cfrg-hpke/blob/master/test-vectors.json
        let ikm = hex("1ac01f181fdf9f352797655161c58b75c656a6cc2716dcb66372da835542e1df");
        let (sk, pk) = SuiteKem::derive_keypair(&ikm);
        assert_eq!(
            sk.to_bytes().as_slice(),
            hex("8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb")
        );
        assert_eq!(
            pk.to_bytes().as_slice(),
            hex("4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a")
        );
        let info = hex("4f6465206f6e2061204772656369616e2055726e");
        let enc_bytes = hex("1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a");
        let enc = <SuiteKem as Kem>::EncappedKey::from_bytes(&enc_bytes).unwrap();
        let mut receiver = hpke::setup_receiver::<ChaCha20Poly1305, HkdfSha256, SuiteKem>(
            &OpModeR::Base,
            &sk,
            &enc,
            &info,
        )
        .unwrap();
        let pt = hex("4265617574792069732074727574682c20747275746820626561757479");
        let ct=hex("1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28");
        assert_eq!(receiver.open(&ct, &hex("436f756e742d30")).unwrap(), pt);
        let ct1=hex("6b53c051e4199c518de79594e1c4ab18b96f081549d45ce015be002090bb119e85285337cc95ba5f59992dc98c");
        assert_eq!(receiver.open(&ct1, &hex("436f756e742d31")).unwrap(), pt);
        // Exact prepaid library consumption and sender ciphertext, not roundtrip.
        let mut rng = SenderPool {
            bytes: Sensitive(hex(
                "909a9b35d3dc4713a5e72a4da274b55d3d3821a37e5d099e74a647db583a904b",
            )),
            consumed: 0,
        };
        let (enc_s, mut sender) = hpke::setup_sender_with_rng::<
            ChaCha20Poly1305,
            HkdfSha256,
            SuiteKem,
        >(&OpModeS::Base, &pk, &info, &mut rng)
        .unwrap();
        assert_eq!(rng.consumed, 32);
        assert_eq!(enc_s.to_bytes().as_slice(), enc_bytes);
        assert_eq!(sender.seal(&pt, &hex("436f756e742d30")).unwrap(), ct);
        assert_eq!(sender.seal(&pt, &hex("436f756e742d31")).unwrap(), ct1);
        let mut bad = ct;
        bad[0] ^= 1;
        let mut r = hpke::setup_receiver::<ChaCha20Poly1305, HkdfSha256, SuiteKem>(
            &OpModeR::Base,
            &sk,
            &enc,
            &info,
        )
        .unwrap();
        assert!(r.open(&bad, &hex("436f756e742d30")).is_err());
    }
    fn fixture() -> (
        Transcript,
        DeviceSigner,
        DeviceSigner,
        EnrollmentKey,
        ChannelKey,
    ) {
        let mut rng = Fixed(1);
        let owner = DeviceSigner::generate(&mut rng).unwrap();
        let recipient = DeviceSigner::generate(&mut rng).unwrap();
        let ok = EnrollmentKey::generate(&mut rng).unwrap();
        let rk = EnrollmentKey::generate(&mut rng).unwrap();
        let key = ChannelKey::generate("test".into(), "channel".into(), 1, &mut rng).unwrap();
        let t = Transcript {
            environment: "test".into(),
            channel: "channel".into(),
            invitation: "invite".into(),
            epoch: 1,
            expires_at_unix_ms: 100,
            owner: Identity {
                device: "owner".into(),
                signing: owner.public(),
                kem: ok.public(),
            },
            recipient: Identity {
                device: "recipient".into(),
                signing: recipient.public(),
                kem: rk.public(),
            },
        };
        (t, owner, recipient, rk, key)
    }
    fn approved(t: &Transcript) -> OutOfBandApproval {
        OutOfBandApproval::confirm(t, t.fingerprint().unwrap(), UserDecision::Approve).unwrap()
    }
    #[test]
    fn full_fingerprint_binds_both_identity_kinds_and_context() {
        let (t, _, _, _, _) = fixture();
        let base = t.fingerprint().unwrap();
        for i in 0..9 {
            let mut changed = t.clone();
            match i {
                0 => changed.environment = "other".into(),
                1 => changed.channel = "other".into(),
                2 => changed.invitation = "other".into(),
                3 => changed.epoch = 2,
                4 => changed.expires_at_unix_ms = 101,
                5 => changed.owner.signing = t.recipient.signing,
                6 => changed.recipient.signing = t.owner.signing,
                7 => changed.owner.kem[0] ^= 1,
                _ => changed.recipient.kem[0] ^= 1,
            };
            assert!(changed.fingerprint().map(|x| x != base).unwrap_or(true));
            assert!(approved(&t).check(&changed).is_err());
        }
        assert!(OutOfBandApproval::confirm(&t, base, UserDecision::Reject).is_err());
        let mut wrong = base;
        wrong[31] ^= 1;
        assert!(OutOfBandApproval::confirm(&t, wrong, UserDecision::Approve).is_err());
    }
    #[test]
    fn explicit_approval_expiry_single_use_and_confirmation() {
        let (t, owner, recipient, rk, key) = fixture();
        let a = approved(&t);
        let mut inv = Invitation::new(t.clone(), 1).unwrap();
        let mut recv = RecipientInvitation::new(t.clone(), 1).unwrap();
        let transfer = inv.offer(&a, &key, &owner, &mut Fixed(19), 1).unwrap();
        assert!(matches!(
            inv.offer(&a, &key, &owner, &mut Fixed(20), 1),
            Err(Error::Consumed)
        ));
        let (received, confirm) = recv.accept(&a, &transfer, &rk, &recipient, 1).unwrap();
        assert!(received.matches("test", "channel", 1));
        assert_eq!(received.secret(), key.secret());
        assert!(matches!(
            recv.accept(&a, &transfer, &rk, &recipient, 1),
            Err(Error::Consumed)
        ));
        inv.confirm(&transfer, &confirm, 1).unwrap();
        assert_eq!(inv.confirm(&transfer, &confirm, 1), Err(Error::Consumed));
        let mut expired = RecipientInvitation::new(t, 1).unwrap();
        assert!(matches!(
            expired.accept(&a, &transfer, &rk, &recipient, 100),
            Err(Error::Expired)
        ));
    }
    #[test]
    fn transfer_tamper_wrong_identity_and_entropy_failure() {
        struct Fail;
        impl Entropy for Fail {
            fn fill(&mut self, _: &mut [u8]) -> Result<()> {
                Err(Error::Entropy)
            }
        }
        let (t, owner, recipient, rk, key) = fixture();
        let a = approved(&t);
        let mut inv = Invitation::new(t.clone(), 1).unwrap();
        assert!(matches!(
            inv.offer(&a, &key, &owner, &mut Fail, 1),
            Err(Error::Entropy)
        )); // failure leaves invitation open
        let mut transfer = inv.offer(&a, &key, &owner, &mut Fixed(17), 1).unwrap();
        let mut recv = RecipientInvitation::new(t.clone(), 1).unwrap();
        transfer.enc[0] ^= 1;
        assert!(matches!(
            recv.accept(&a, &transfer, &rk, &recipient, 1),
            Err(Error::Signature)
        ));
        transfer.enc[0] ^= 1;
        transfer.ciphertext[0] ^= 1;
        assert!(matches!(
            recv.accept(&a, &transfer, &rk, &recipient, 1),
            Err(Error::Signature)
        ));
        transfer.ciphertext[0] ^= 1;
        assert!(matches!(
            recv.accept(&a, &transfer, &rk, &owner, 1),
            Err(Error::Scope)
        ));
        let (_, confirmation) = recv.accept(&a, &transfer, &rk, &recipient, 1).unwrap();
        let mut bad = confirmation;
        bad.0[0] ^= 1;
        assert_eq!(inv.confirm(&transfer, &bad, 1), Err(Error::Signature));
        assert!(EnrollmentKey::generate(&mut Fail).is_err());
        let mut changed = t;
        changed.recipient.kem = [0; 32];
        assert!(changed.fingerprint().is_err());
    }
}
