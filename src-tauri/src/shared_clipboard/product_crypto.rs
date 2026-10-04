//! V2 synthetic linked-device key packages. HPKE suite matches existing C1;
//! signed full transcripts bind environment, roles, devices, recipient keys and
//! epoch. No clear key or private enrollment material is serialized.
use super::super::{
    config,
    crypto::{self, ChannelKey, DeviceSigner, Entropy, Sensitive},
    enrollment::EnrollmentKey,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use hpke::{
    aead::{AesGcm128, ChaCha20Poly1305},
    kdf::HkdfSha256,
    kem::X25519HkdfSha256,
    Deserializable, Kem, OpModeR, OpModeS, Serializable,
};
use serde_json::{json, Value};
use std::convert::Infallible;
type Suite = X25519HkdfSha256;
struct Pool {
    bytes: Sensitive,
    used: bool,
}
impl hpke::rand_core::TryRng for Pool {
    type Error = Infallible;
    fn try_next_u32(&mut self) -> Result<u32, Infallible> {
        std::process::abort()
    }
    fn try_next_u64(&mut self) -> Result<u64, Infallible> {
        std::process::abort()
    }
    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Infallible> {
        if self.used || dst.len() != 32 {
            std::process::abort();
        }
        dst.copy_from_slice(&self.bytes.0);
        self.used = true;
        Ok(())
    }
}
impl hpke::rand_core::TryCryptoRng for Pool {}
fn bytes(domain: &[u8], value: &Value) -> Result<Vec<u8>, String> {
    let mut bytes = domain.to_vec();
    bytes.extend(serde_json::to_vec(value).map_err(|_| "Invalid key transcript")?);
    Ok(bytes)
}
fn header(packet: &Value) -> Result<Value, String> {
    let mut h = packet.clone();
    let object = h.as_object_mut().ok_or("Invalid key package")?;
    object.remove("enc");
    object.remove("ciphertext");
    object.remove("signature");
    Ok(h)
}
pub(in crate::shared_clipboard) fn wrap(
    environment: &str,
    resource: &str,
    epoch: u64,
    key: &ChannelKey,
    signer: &DeviceSigner,
    owner_device: &str,
    target: &Value,
    entropy: &mut impl Entropy,
) -> Result<Value, String> {
    wrap_with::<ChaCha20Poly1305>(
        environment,
        resource,
        epoch,
        key,
        signer,
        owner_device,
        target,
        entropy,
        false,
    )
}
pub(in crate::shared_clipboard) fn wrap_service(
    environment: &str,
    resource: &str,
    epoch: u64,
    key: &ChannelKey,
    signer: &DeviceSigner,
    owner_device: &str,
    target: &Value,
    entropy: &mut impl Entropy,
) -> Result<Value, String> {
    wrap_with::<AesGcm128>(
        environment,
        resource,
        epoch,
        key,
        signer,
        owner_device,
        target,
        entropy,
        true,
    )
}
fn wrap_with<A: hpke::aead::Aead>(
    environment: &str,
    resource: &str,
    epoch: u64,
    key: &ChannelKey,
    signer: &DeviceSigner,
    owner_device: &str,
    target: &Value,
    entropy: &mut impl Entropy,
    service: bool,
) -> Result<Value, String> {
    let target_device = target["deviceId"].as_str().ok_or("Invalid linked device")?;
    let target_signing = target["signingPublicKey"]
        .as_str()
        .ok_or("Invalid linked identity")?;
    let target_kem = target["kemPublicKey"]
        .as_str()
        .ok_or("Linked device key approval pending")?;
    config::bytes32(target_signing)?;
    let kem = config::bytes32(target_kem)?;
    let pk =
        <Suite as Kem>::PublicKey::from_bytes(&kem).map_err(|_| "Invalid linked encryption key")?;
    let mut packet = json!({"environment":environment,"resourceId":resource,"epoch":epoch.to_string(),"ownerDeviceId":owner_device,"ownerSigningPublicKey":STANDARD.encode(signer.public()),"deviceId":target_device,"signingPublicKey":target_signing,"kemPublicKey":target_kem});
    if service {
        packet["suite"] = json!("X25519_HKDF_SHA256_AES128GCM");
    }
    let info = bytes(b"Copicu.shared.key-transcript.v2\0", &packet)?;
    let mut pool = Pool {
        bytes: Sensitive(vec![0; 32]),
        used: false,
    };
    entropy
        .fill(&mut pool.bytes.0)
        .map_err(|_| "Key package entropy unavailable")?;
    let (enc, mut ctx) =
        hpke::setup_sender_with_rng::<A, HkdfSha256, Suite>(&OpModeS::Base, &pk, &info, &mut pool)
            .map_err(|_| "Key wrapping failed")?;
    if !pool.used {
        std::process::abort();
    }
    let ciphertext = ctx
        .seal(key.secret(), &info)
        .map_err(|_| "Key wrapping failed")?;
    packet["enc"] = json!(STANDARD.encode(enc.to_bytes()));
    packet["ciphertext"] = json!(STANDARD.encode(ciphertext));
    packet["signature"] =
        json!(STANDARD.encode(signer.sign(&bytes(b"Copicu.shared.key-package.v2\0", &packet)?)));
    Ok(packet)
}
pub(super) fn unwrap(
    environment: &str,
    device: &str,
    key: &EnrollmentKey,
    signer: &DeviceSigner,
    packet: &Value,
    owner: &Value,
) -> Result<ChannelKey, String> {
    if packet["environment"] != environment
        || packet["deviceId"] != device
        || packet["kemPublicKey"] != STANDARD.encode(key.public())
        || packet["signingPublicKey"] != STANDARD.encode(signer.public())
        || packet["ownerDeviceId"] != owner["deviceId"]
        || packet["ownerSigningPublicKey"] != owner["signingPublicKey"]
    {
        return Err("Key package identity mismatch".into());
    }
    let mut signed = packet.clone();
    signed
        .as_object_mut()
        .ok_or("Invalid key package")?
        .remove("signature");
    let signature = STANDARD
        .decode(
            packet["signature"]
                .as_str()
                .ok_or("Invalid key signature")?,
        )
        .map_err(|_| "Invalid key signature")?;
    let owner_key = config::bytes32(
        owner["signingPublicKey"]
            .as_str()
            .ok_or("Untrusted package owner")?,
    )?;
    crypto::verify(
        &owner_key,
        &bytes(b"Copicu.shared.key-package.v2\0", &signed)?,
        &signature,
    )
    .map_err(|_| "Key package signature rejected")?;
    let info = bytes(b"Copicu.shared.key-transcript.v2\0", &header(packet)?)?;
    let private = key.export_secret();
    let sk = <Suite as Kem>::PrivateKey::from_bytes(&private.0)
        .map_err(|_| "Protected device key rejected")?;
    let encoded = STANDARD
        .decode(packet["enc"].as_str().ok_or("Invalid key encapsulation")?)
        .map_err(|_| "Invalid key encapsulation")?;
    let enc = <Suite as Kem>::EncappedKey::from_bytes(&encoded)
        .map_err(|_| "Invalid key encapsulation")?;
    let cipher = STANDARD
        .decode(packet["ciphertext"].as_str().ok_or("Invalid wrapped key")?)
        .map_err(|_| "Invalid wrapped key")?;
    let service = packet["ownerDeviceId"] == "service_key_custody_v3";
    let secret = if service {
        if packet["suite"] != "X25519_HKDF_SHA256_AES128GCM" {
            return Err("Unsupported service key suite".into());
        }
        open::<AesGcm128>(&sk, &enc, &info, &cipher)?
    } else {
        if packet.get("suite").is_some() {
            return Err("Unexpected key suite".into());
        }
        open::<ChaCha20Poly1305>(&sk, &enc, &info, &cipher)?
    };
    let resource = packet["resourceId"]
        .as_str()
        .ok_or("Invalid package resource")?;
    let epoch = packet["epoch"]
        .as_str()
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or("Invalid package epoch")?;
    ChannelKey::from_secret(environment.into(), resource.into(), epoch, secret)
        .map_err(|_| "Key package scope rejected".into())
}
fn open<A: hpke::aead::Aead>(
    sk: &<Suite as Kem>::PrivateKey,
    enc: &<Suite as Kem>::EncappedKey,
    info: &[u8],
    cipher: &[u8],
) -> Result<Sensitive, String> {
    let mut ctx = hpke::setup_receiver::<A, HkdfSha256, Suite>(&OpModeR::Base, sk, enc, info)
        .map_err(|_| "Key package rejected")?;
    Ok(Sensitive(
        ctx.open(&cipher, &info)
            .map_err(|_| "Key package could not be authenticated")?,
    ))
}

#[cfg(test)]
mod tests {
    use super::super::super::crypto::tests::Fixed;
    use super::*;
    #[test]
    fn full_transcript_hpke_and_signatures_bind_both_devices_and_epoch() {
        let mut entropy = Fixed(7);
        let owner = DeviceSigner::generate(&mut entropy).unwrap();
        entropy.0 = 9;
        let receiver = DeviceSigner::generate(&mut entropy).unwrap();
        entropy.0 = 13;
        let kem = EnrollmentKey::generate(&mut entropy).unwrap();
        entropy.0 = 17;
        let key = ChannelKey::generate("env".into(), "resource".into(), 1, &mut entropy).unwrap();
        let target = json!({"deviceId":"recipient","signingPublicKey":STANDARD.encode(receiver.public()),"kemPublicKey":STANDARD.encode(kem.public())});
        let identity =
            json!({"deviceId":"owner","signingPublicKey":STANDARD.encode(owner.public())});
        entropy.0 = 23;
        let packet = wrap(
            "env",
            "resource",
            1,
            &key,
            &owner,
            "owner",
            &target,
            &mut entropy,
        )
        .unwrap();
        let opened = unwrap("env", "recipient", &kem, &receiver, &packet, &identity).unwrap();
        assert_eq!(opened.secret(), key.secret());
        for field in [
            "resourceId",
            "epoch",
            "ownerDeviceId",
            "deviceId",
            "environment",
        ] {
            let mut changed = packet.clone();
            changed[field] = json!("tampered");
            assert!(unwrap("env", "recipient", &kem, &receiver, &changed, &identity).is_err());
        }
        let mut changed = packet.clone();
        changed["ciphertext"] = json!(STANDARD.encode([0; 48]));
        assert!(unwrap("env", "recipient", &kem, &receiver, &changed, &identity).is_err());
    }
}
