//! Account-managed service custody, composed with the existing signed HPKE
//! packages and DPAPI vault. Migration intents contain ciphertext only.
use super::*;
const SERVICE_DEVICE: &str = "service_key_custody_v3";
const RECIPIENT_DOMAIN: &[u8] = b"Copicu.shared.custody-recipient.v3\0";

pub(super) fn target<'a>(
    c: &StoredConfig,
    catalog: &'a Value,
) -> Result<Option<&'a Value>, String> {
    if catalog["keyCustody"] != "service" {
        return Ok(None);
    }
    let target = &catalog["custody"];
    verify_recipient(&c.environment, &c.issuer_public_key, target)?;
    Ok(Some(target))
}
fn verify_recipient(
    environment: &str,
    issuer_public_key: &str,
    target: &Value,
) -> Result<(), String> {
    let mut signed = target
        .as_object()
        .ok_or("Invalid service key recipient")?
        .clone();
    if signed.len() != 6
        || ![
            "environment",
            "deviceId",
            "signingPublicKey",
            "kemPublicKey",
            "suite",
            "signature",
        ]
        .iter()
        .all(|field| signed.contains_key(*field))
    {
        return Err("Invalid service key recipient".into());
    }
    if target["deviceId"] != SERVICE_DEVICE
        || target["environment"] != environment
        || target["signingPublicKey"] != issuer_public_key
        || target["suite"] != "X25519_HKDF_SHA256_AES128GCM"
    {
        return Err("Sharing service key identity changed".into());
    }
    config::bytes32(
        target["kemPublicKey"]
            .as_str()
            .ok_or("Invalid service encryption key")?,
    )?;
    let signature = STANDARD
        .decode(
            signed
                .remove("signature")
                .and_then(|value| value.as_str().map(str::to_owned))
                .ok_or("Invalid service key signature")?,
        )
        .map_err(|_| "Invalid service key signature")?;
    let mut transcript = RECIPIENT_DOMAIN.to_vec();
    transcript.extend(serde_json::to_vec(&signed).map_err(fail)?);
    crypto::verify(
        &config::bytes32(issuer_public_key)?,
        &transcript,
        &signature,
    )
    .map_err(|_| "Service key recipient signature rejected".into())
}
pub(super) fn verify_package_owner(
    c: &StoredConfig,
    catalog: &Value,
    packet: &Value,
    owner: &Value,
) -> Result<(), String> {
    if packet["ownerDeviceId"] == SERVICE_DEVICE {
        target(c, catalog)?.ok_or("Unexpected service key package")?;
        if owner["signingPublicKey"] != c.issuer_public_key
            || packet["ownerSigningPublicKey"] != c.issuer_public_key
            || owner["serviceCustody"] != true
        {
            return Err("Service key signature identity mismatch".into());
        }
    }
    Ok(())
}
fn available(
    vault: &Vault,
    c: &StoredConfig,
    catalog: &Value,
    resource: &Value,
    epoch: u64,
) -> Result<Option<ChannelKey>, String> {
    let rid = id(resource, "id")?;
    let binding = runtime::binding(
        c,
        KeyKind::Channel {
            channel: rid.clone(),
        },
        &epoch_reference(&rid, epoch),
        epoch,
    );
    match vault.load_channel(&binding) {
        Ok(key) => return Ok(Some(key)),
        Err(super::super::custody::Error::Missing) => {}
        Err(error) => return Err(fail(error)),
    }
    if let Some(ch) = c
        .channels
        .iter()
        .find(|ch| ch.policy.id == rid && ch.epoch == epoch)
    {
        return runtime::key(vault, c, ch).map(Some);
    }
    if let Some(package) = resource["packages"]
        .as_array()
        .and_then(|a| a.iter().find(|p| p["epoch"] == epoch.to_string()))
    {
        let packet = &package["package"];
        if packet["resourceId"] != rid || packet["epoch"] != epoch.to_string() {
            return Err("Migration key scope mismatch".into());
        }
        let owner = catalog["devices"]
            .as_array()
            .and_then(|a| a.iter().find(|d| d["deviceId"] == packet["ownerDeviceId"]))
            .ok_or("Migration key signer unavailable")?;
        verify_package_owner(c, catalog, packet, owner)?;
        return product_crypto::unwrap(
            &c.environment,
            &c.device_id,
            &enrollment(vault, c)?,
            &runtime::signer(vault, c)?,
            packet,
            owner,
        )
        .map(Some);
    }
    if let Some(op) = catalog["operations"]
        .as_array()
        .and_then(|a| {
            a.iter()
                .find(|op| op["kind"] == "create" && op["resourceId"] == rid)
        })
        .and_then(|op| op["operationId"].as_str())
    {
        if let Ok(key) = vault.load_channel(&runtime::binding(
            c,
            KeyKind::Channel { channel: rid },
            &format!("product_key_{}", token(c, op)),
            epoch,
        )) {
            return Ok(Some(key));
        }
    }
    Ok(None)
}
pub(super) fn migrate(vault: &Vault, c: &StoredConfig, catalog: &Value) -> Result<bool, String> {
    let Some(recipient) = target(c, catalog)? else {
        return Ok(false);
    };
    let signer = runtime::signer(vault, c)?;
    let mut changed = false;
    for resource in catalog["resources"]
        .as_array()
        .ok_or("Invalid resource catalog")?
    {
        if resource["permission"] != "owner" {
            continue;
        }
        let rid = id(resource, "id")?;
        let epochs = resource["custodyMissingEpochs"]
            .as_array()
            .ok_or("Invalid service key migration state")?;
        if epochs.is_empty() {
            continue;
        }
        if epochs.len() > 129 {
            return Err("Service key migration limit exceeded".into());
        }
        let input = json!({"resourceId":rid,"revision":resource["revision"],"epochs":epochs});
        let digest = config::hex(&Sha256::digest(serde_json::to_vec(&input).map_err(fail)?));
        let operation = format!("custody_{}", &digest[..32]);
        let path = vault
            .directory()
            .join(format!("custody_intent_{}.json", token(c, &operation)));
        let wire = if let Some(record) = read_intent(&path)? {
            if record.input_digest != digest {
                return Err("Service key migration intention changed".into());
            }
            record.wire
        } else {
            let mut packets = Vec::new();
            for value in epochs {
                let epoch = value
                    .as_str()
                    .and_then(|v| v.parse::<u64>().ok())
                    .filter(|v| *v > 0)
                    .ok_or("Invalid migration epoch")?;
                let Some(key) = available(vault, c, catalog, resource, epoch)? else {
                    continue;
                };
                // Do not deposit a mismatched current key from a stale local profile.
                if value == &resource["keyEpoch"] && !resource["metadata"].is_null() {
                    decrypt_name(c, &rid, epoch, &key, &resource["metadata"])?;
                }
                packets.push(product_crypto::wrap_service(
                    &c.environment,
                    &rid,
                    epoch,
                    &key,
                    &signer,
                    &c.device_id,
                    recipient,
                    &mut SystemEntropy,
                )?);
            }
            if packets.is_empty() {
                continue;
            }
            let wire = sign_wire(
                vault,
                c,
                json!({"intent_id":operation,"kind":"deposit_keys","resource_id":rid,"expected_revision":resource["revision"],"custody_packages":packets}),
            )?;
            let temporary =
                path.with_file_name(format!("{}.json", runtime::random_id("custody_tmp")?));
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(fail)?;
            serde_json::to_writer(
                &mut file,
                &IntentRecord {
                    input_digest: digest,
                    wire: wire.clone(),
                },
            )
            .map_err(fail)?;
            file.sync_all().map_err(fail)?;
            drop(file);
            std::fs::rename(temporary, &path).map_err(fail)?;
            wire
        };
        match runtime::client(vault, c)?.request_control("POST", "/v2/operations", Some(&wire)) {
            Ok(_) => changed = true,
            Err(super::super::transport::Error::Conflict) => {} // Refresh obtains a new revision on the next attempt.
            Err(error) => return Err(remote(error)),
        }
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared_clipboard::{
        crypto::{tests::Fixed, DeviceSigner},
        enrollment::EnrollmentKey,
    };

    fn recipient(
        signer: &DeviceSigner,
        environment: &str,
        kem: &EnrollmentKey,
        domain: &[u8],
    ) -> Value {
        let mut value = json!({"environment":environment,"deviceId":SERVICE_DEVICE,"signingPublicKey":STANDARD.encode(signer.public()),"kemPublicKey":STANDARD.encode(kem.public()),"suite":"X25519_HKDF_SHA256_AES128GCM"});
        let mut transcript = domain.to_vec();
        transcript.extend(serde_json::to_vec(&value).unwrap());
        value["signature"] = json!(STANDARD.encode(signer.sign(&transcript)));
        value
    }

    #[test]
    fn service_recipient_signature_binds_environment_issuer_kem_and_suite() {
        let signer = DeviceSigner::generate(&mut Fixed(19)).unwrap();
        let other = DeviceSigner::generate(&mut Fixed(23)).unwrap();
        let kem = EnrollmentKey::generate(&mut Fixed(29)).unwrap();
        let issuer = STANDARD.encode(signer.public());
        let value = recipient(&signer, "synthetic", &kem, RECIPIENT_DOMAIN);
        assert!(verify_recipient("synthetic", &issuer, &value).is_ok());

        for (field, replacement) in [
            ("environment", json!("other_environment")),
            ("deviceId", json!("other_device")),
            ("signingPublicKey", json!(STANDARD.encode(other.public()))),
            ("kemPublicKey", json!(STANDARD.encode([31; 32]))),
            ("suite", json!("another_suite")),
            ("signature", json!(STANDARD.encode([0; 64]))),
        ] {
            let mut changed = value.clone();
            changed[field] = replacement;
            assert!(
                verify_recipient("synthetic", &issuer, &changed).is_err(),
                "{field}"
            );
        }
        let replay = recipient(&signer, "other_environment", &kem, RECIPIENT_DOMAIN);
        assert!(verify_recipient("synthetic", &issuer, &replay).is_err());
        let mut forged = recipient(&other, "synthetic", &kem, RECIPIENT_DOMAIN);
        forged["signingPublicKey"] = json!(issuer);
        assert!(verify_recipient("synthetic", &issuer, &forged).is_err());
        let cross_protocol = recipient(
            &signer,
            "synthetic",
            &kem,
            b"Copicu.shared.key-package.v2\0",
        );
        assert!(verify_recipient("synthetic", &issuer, &cross_protocol).is_err());
        let mut unsigned = value.clone();
        unsigned.as_object_mut().unwrap().remove("signature");
        assert!(verify_recipient("synthetic", &issuer, &unsigned).is_err());
        let mut unknown = value;
        unknown["extra"] = json!("unexpected");
        assert!(verify_recipient("synthetic", &issuer, &unknown).is_err());
    }
}
