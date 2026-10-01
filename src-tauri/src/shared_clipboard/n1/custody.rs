use super::{valid_id, Result, MAX_BUFFER};
use sha2::{Digest, Sha256};

// No Debug/Serialize: even fixture plaintext must not accidentally reach output.
pub(super) struct Sensitive(pub(super) Vec<u8>);
impl Drop for Sensitive {
    fn drop(&mut self) {
        for byte in &mut self.0 {
            unsafe { std::ptr::write_volatile(byte, 0) };
        }
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}

#[derive(Clone)]
pub(super) struct Binding {
    pub(super) environment: String,
    pub(super) profile: String,
    pub(super) identity: String,
}
impl Binding {
    pub(super) fn fixture() -> Self {
        Self {
            environment: "N1-synthetic".into(),
            profile: "profile-A".into(),
            identity: "identity-A".into(),
        }
    }
}

pub(super) fn encode(binding: &Binding, secret: &[u8; 32]) -> Result<Sensitive> {
    // Maximum binding lengths plus secret/digest: no secret-bearing reallocation.
    let mut bytes = Sensitive(Vec::with_capacity(9 + 3 * 65 + 64));
    bytes.0.extend_from_slice(b"COPICUN1");
    bytes.0.push(1);
    for field in [&binding.environment, &binding.profile, &binding.identity] {
        if !valid_id(field) {
            return Err("invalid fixture binding".into());
        }
        bytes.0.push(field.len() as u8);
        bytes.0.extend_from_slice(field.as_bytes());
    }
    bytes.0.extend_from_slice(secret);
    // Fixture integrity check inside the DPAPI-protected payload, not E2EE.
    let mut digest = Sha256::digest(&bytes.0);
    bytes.0.extend_from_slice(&digest);
    for byte in &mut digest {
        unsafe { std::ptr::write_volatile(byte, 0) };
    }
    std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    Ok(bytes)
}

pub(super) fn validate(bytes: &[u8], expected: &Binding) -> Result<()> {
    if bytes.len() > MAX_BUFFER || bytes.get(..9) != Some(b"COPICUN1\x01") {
        return Err("invalid custody fixture version/size".into());
    }
    let mut offset = 9;
    for field in [&expected.environment, &expected.profile, &expected.identity] {
        let len = *bytes.get(offset).ok_or("truncated custody fixture")? as usize;
        offset += 1;
        let value = bytes
            .get(offset..offset + len)
            .ok_or("truncated custody binding")?;
        if !valid_id(field) || value != field.as_bytes() {
            return Err("wrong custody binding".into());
        }
        offset += len;
    }
    if bytes.len() != offset + 64 {
        return Err("invalid custody fixture length".into());
    }
    let authenticated = bytes.len() - 32;
    if Sha256::digest(&bytes[..authenticated]).as_slice() != &bytes[authenticated..] {
        return Err("custody fixture integrity mismatch".into());
    }
    Ok(())
}

#[cfg(all(windows, not(test)))]
pub(super) mod native {
    use super::*;
    use crate::n1::{
        clipboard::native::{reply, Supervisor},
        Request,
    };
    use std::{
        fs,
        io::{self, BufRead},
        os::windows::fs::MetadataExt,
        path::{Path, PathBuf},
        time::Instant,
    };
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{LocalFree, HLOCAL},
            Security::Cryptography::{
                BCryptGenRandom, CryptProtectData, CryptUnprotectData,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        },
    };

    struct LocalBlob {
        blob: CRYPT_INTEGER_BLOB,
        plaintext: bool,
    }
    impl Drop for LocalBlob {
        fn drop(&mut self) {
            if !self.blob.pbData.is_null() {
                if self.plaintext {
                    // DPAPI owns this allocation and supplies its length.
                    for offset in 0..self.blob.cbData as usize {
                        unsafe { std::ptr::write_volatile(self.blob.pbData.add(offset), 0) };
                    }
                    std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
                }
                unsafe {
                    let _ = LocalFree(Some(HLOCAL(self.blob.pbData.cast())));
                }
            }
        }
    }
    fn crypt(input: &[u8], protect: bool) -> Result<Sensitive> {
        if input.is_empty() || input.len() > MAX_BUFFER {
            return Err("invalid DPAPI input size".into());
        }
        let data = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr().cast_mut(),
        };
        let mut output = LocalBlob {
            blob: CRYPT_INTEGER_BLOB::default(),
            plaintext: !protect,
        };
        let result = unsafe {
            if protect {
                CryptProtectData(
                    &data,
                    PCWSTR::null(),
                    None,
                    None,
                    None,
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output.blob,
                )
            } else {
                CryptUnprotectData(
                    &data,
                    None,
                    None,
                    None,
                    None,
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output.blob,
                )
            }
        };
        result.map_err(|_| "DPAPI rejected synthetic fixture")?;
        if output.blob.pbData.is_null() || output.blob.cbData as usize > MAX_BUFFER {
            return Err("invalid DPAPI output".into());
        }
        Ok(Sensitive(
            unsafe { std::slice::from_raw_parts(output.blob.pbData, output.blob.cbData as usize) }
                .to_vec(),
        ))
    }
    fn file(root: &Path, name: &str) -> Result<PathBuf> {
        if !valid_id(name) {
            return Err("invalid fixture filename".into());
        }
        Ok(root.join(format!("{name}.blob")))
    }
    fn read(root: &Path, name: &str) -> Result<Sensitive> {
        let path = file(root, name)?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "missing fixture")?;
        if !meta.is_file() || meta.file_attributes() & 0x400 != 0 || meta.len() > MAX_BUFFER as u64
        {
            return Err("invalid fixture file".into());
        }
        fs::read(path)
            .map(Sensitive)
            .map_err(|_| "fixture read failed".into())
    }
    fn protect(root: &Path, name: &str, variant: &str) -> Result<()> {
        use std::io::Write;
        let mut secret = Sensitive(vec![0; 32]);
        unsafe { BCryptGenRandom(None, &mut secret.0, BCRYPT_USE_SYSTEM_PREFERRED_RNG) }
            .ok()
            .map_err(|_| "synthetic CSPRNG failed")?;
        let secret_ref: &[u8; 32] = secret
            .0
            .as_slice()
            .try_into()
            .map_err(|_| "fixture length")?;
        let mut payload = encode(&Binding::fixture(), secret_ref)?;
        if variant == "version" {
            payload.0[8] = 2;
        } else if variant != "normal" {
            return Err("unknown fixture variant".into());
        }
        let protected = crypt(&payload.0, true)?;
        // Roundtrip equality remains in this helper's memory, never stdout/disk.
        let reopened = crypt(&protected.0, false)?;
        if reopened.0 != payload.0 {
            return Err("synthetic roundtrip mismatch".into());
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(file(root, name)?)
            .map_err(|_| "fixture already exists or cannot be created")?;
        output
            .write_all(&protected.0)
            .map_err(|_| "fixture write failed")?;
        output.sync_all().map_err(|_| "fixture sync failed")?;
        Ok(())
    }
    fn unprotect(root: &Path, name: &str, variant: &str) -> Result<()> {
        let protected = read(root, name)?;
        let plaintext = crypt(&protected.0, false)?;
        let mut binding = Binding::fixture();
        match variant {
            "normal" => {}
            "environment" => binding.environment = "other-environment".into(),
            "profile" => binding.profile = "profile-B".into(),
            "identity" => binding.identity = "identity-B".into(),
            _ => return Err("unknown expected binding".into()),
        }
        validate(&plaintext.0, &binding)
    }
    pub(in crate::n1) fn helper(root: &Path) -> Result<()> {
        reply("ready");
        for line in io::stdin().lock().lines() {
            let line = line.map_err(|_| "custody IPC failed")?;
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts == ["quit"] {
                return Ok(());
            }
            let result = match parts.as_slice() {
                ["protect", name, variant] => protect(root, name, variant),
                ["unprotect", name, variant] => unprotect(root, name, variant),
                _ => Err("invalid custody command".into()),
            };
            // Never return API data, plaintext, digest, blob, or exception context.
            reply(if result.is_ok() {
                "accepted"
            } else {
                "rejected"
            });
        }
        Ok(())
    }
    pub(in crate::n1) fn matrix(request: &Request) -> Result<()> {
        let start = Instant::now();
        let mut run = Supervisor::new(request, start)?;
        let first = run.spawn("custody")?;
        run.expect(first, "ready")?;
        run.send(first, "protect original normal")?;
        run.expect(first, "accepted")?;
        run.stop(first)?;
        println!("PASS custody-roundtrip");
        let second = run.spawn("custody")?;
        run.expect(second, "ready")?;
        run.send(second, "unprotect original normal")?;
        run.expect(second, "accepted")?;
        println!("PASS custody-helper-restart");
        for variant in ["environment", "profile", "identity"] {
            run.send(second, &format!("unprotect original {variant}"))?;
            run.expect(second, "rejected")?;
        }
        println!("PASS custody-wrong-binding");
        run.send(second, "unprotect missing normal")?;
        run.expect(second, "rejected")?;
        run.send(second, "protect version version")?;
        run.expect(second, "accepted")?;
        run.send(second, "unprotect version normal")?;
        run.expect(second, "rejected")?;
        println!("PASS custody-missing-version");
        let original = read(&request.run_dir, "original")?;
        for name in ["tamper", "truncate"] {
            let mut altered = Sensitive(original.0.clone());
            if name == "tamper" {
                let last = altered.0.len() - 1;
                altered.0[last] ^= 1;
            } else {
                altered.0.truncate(4);
            }
            use std::io::Write;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(file(&request.run_dir, name)?)
                .map_err(|_| "cannot create corruption fixture")?;
            output
                .write_all(&altered.0)
                .map_err(|_| "corruption fixture write failed")?;
            run.send(second, &format!("unprotect {name} normal"))?;
            run.expect(second, "rejected")?;
        }
        println!("PASS custody-tamper-truncation");
        // Another new synthetic directory, same Windows user: explicitly no anti-clone claim.
        let clone_dir = request.run_dir.join("copy");
        fs::create_dir(&clone_dir).map_err(|_| "copy directory exists")?;
        fs::copy(
            file(&request.run_dir, "original")?,
            file(&clone_dir, "original")?,
        )
        .map_err(|_| "synthetic blob copy failed")?;
        // Copy back to a fresh filename consumed by the separately restarted helper.
        fs::copy(
            file(&clone_dir, "original")?,
            file(&request.run_dir, "copied")?,
        )
        .map_err(|_| "synthetic copy failed")?;
        run.send(second, "unprotect copied normal")?;
        run.expect(second, "accepted")?;
        println!("PASS custody-same-user-copy-limitation");
        run.finish()?;
        if start.elapsed().as_secs() >= 30 {
            return Err("custody matrix exceeded budget".into());
        }
        println!("N1 Custody: 6 cases passed; helpers exited; DPAPI fixtures only, no E2EE/anti-clone proof");
        Ok(())
    }
}
