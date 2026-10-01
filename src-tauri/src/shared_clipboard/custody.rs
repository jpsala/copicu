//! Opt-in Windows custody candidate; never opens application profiles by itself.
//! The owner supplies a dedicated directory. DPAPI current-user protection is
//! not anti-clone protection: another process as this user may decrypt a copy.
//! No vault activation, enrollment persistence or React/Node secret interface.
use super::crypto::{self, ChannelKey, DeviceSigner, Sensitive};
use super::enrollment::EnrollmentKey;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
const MAX_BYTES: usize = 1024;
const DOMAIN: &[u8] = b"CPCVLT1\0";
const MARKER: &[u8] = b"Copicu.shared.custody.candidate.v1\0";
fn file_id(id: &str) -> bool {
    if !crypto::valid_id(id) {
        return false;
    }
    let upper = id.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return false;
    }
    !(upper.len() == 4
        && (upper.starts_with("COM") || upper.starts_with("LPT"))
        && matches!(upper.as_bytes()[3], b'1'..=b'9'))
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Unsupported,
    Binding,
    Size,
    Protect,
    Missing,
    Conflict,
    Path,
    Io,
    Crypto,
}
type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, PartialEq, Eq)]
pub(crate) enum KeyKind {
    Signing,
    Enrollment,
    Channel { channel: String },
}
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct Binding {
    pub(crate) environment: String,
    pub(crate) profile: String,
    pub(crate) device: String,
    pub(crate) kind: KeyKind,
    pub(crate) epoch: u64,
    pub(crate) reference: String,
}
impl Binding {
    fn prefix(&self) -> Result<Vec<u8>> {
        if !file_id(&self.reference) {
            return Err(Error::Binding);
        }
        let mut b = DOMAIN.to_vec();
        for id in [
            &self.environment,
            &self.profile,
            &self.device,
            &self.reference,
        ] {
            if !crypto::valid_id(id) {
                return Err(Error::Binding);
            }
            b.push(id.len() as u8);
            b.extend_from_slice(id.as_bytes());
        }
        match &self.kind {
            KeyKind::Signing => b.push(1),
            KeyKind::Enrollment => b.push(2),
            KeyKind::Channel { channel } => {
                if !crypto::valid_id(channel) {
                    return Err(Error::Binding);
                }
                b.push(3);
                b.push(channel.len() as u8);
                b.extend_from_slice(channel.as_bytes());
            }
        }
        if self.epoch == 0 {
            return Err(Error::Binding);
        }
        b.extend_from_slice(&self.epoch.to_be_bytes());
        Ok(b)
    }
}
fn encode(binding: &Binding, secret: &[u8]) -> Result<Sensitive> {
    if secret.len() != 32 {
        return Err(Error::Size);
    }
    let prefix = binding.prefix()?;
    if prefix.len() + 32 > MAX_BYTES {
        return Err(Error::Size);
    }
    let mut out = Sensitive(Vec::with_capacity(prefix.len() + 32));
    out.0.extend_from_slice(&prefix);
    out.0.extend_from_slice(secret);
    Ok(out)
}
fn decode(binding: &Binding, bytes: &[u8]) -> Result<Sensitive> {
    let prefix = binding.prefix()?;
    if bytes.len() != prefix.len() + 32 || !bytes.starts_with(&prefix) {
        return Err(Error::Binding);
    }
    Ok(Sensitive(bytes[prefix.len()..].to_vec()))
}
fn equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{LocalFree, HLOCAL},
            Security::Cryptography::{
                CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        },
    };
    const REPARSE: u32 = 0x400;
    const OPEN_REPARSE: u32 = 0x00200000;
    const BACKUP_SEMANTICS: u32 = 0x02000000;
    // Keep every ancestor handle open without FILE_SHARE_DELETE: no directory
    // component can be exchanged/renamed while this vault uses its path. Shared
    // write access remains compatible with host filesystem use; this is not a
    // defense against in-place reparse mutation by an adversarial same user.
    // That user can already decrypt DPAPI copies. No anti-clone claim.
    pub(super) fn lock_directories(root: &Path) -> Result<Vec<File>> {
        if !root.is_absolute() {
            return Err(Error::Path);
        }
        // Candidate vaults are local drive directories, never UNC shares or
        // Win32 device namespace paths. Do not introduce network file effects.
        match root.components().next() {
            Some(std::path::Component::Prefix(prefix))
                if matches!(
                    prefix.kind(),
                    std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)
                ) => {}
            _ => return Err(Error::Path),
        }
        if root.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        }) {
            return Err(Error::Path);
        }
        let mut chain: Vec<_> = root.ancestors().collect();
        chain.reverse();
        let mut locks = Vec::new();
        for path in chain {
            if path.as_os_str().is_empty() {
                continue;
            }
            let file = OpenOptions::new()
                .read(true)
                .share_mode(3)
                .custom_flags(OPEN_REPARSE | BACKUP_SEMANTICS)
                .open(path)
                .map_err(|_| Error::Path)?;
            let meta = file.metadata().map_err(|_| Error::Path)?;
            if !meta.is_dir() || meta.file_attributes() & REPARSE != 0 {
                return Err(Error::Path);
            }
            locks.push(file);
        }
        Ok(locks)
    }
    pub(super) fn create(path: &Path) -> Result<File> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(0)
            .custom_flags(OPEN_REPARSE)
            .open(path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    Error::Conflict
                } else {
                    Error::Io
                }
            })
    }
    pub(super) fn read(path: &Path) -> Result<Vec<u8>> {
        let file = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .custom_flags(OPEN_REPARSE)
            .open(path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Error::Missing
                } else {
                    Error::Io
                }
            })?;
        let meta = file.metadata().map_err(|_| Error::Io)?;
        if !meta.is_file() || meta.file_attributes() & REPARSE != 0 {
            return Err(Error::Path);
        }
        if meta.len() > MAX_BYTES as u64 {
            return Err(Error::Size);
        }
        let mut bytes = Vec::new();
        file.take((MAX_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::Io)?;
        if bytes.len() > MAX_BYTES {
            return Err(Error::Size);
        }
        Ok(bytes)
    }
    struct LocalBlob(CRYPT_INTEGER_BLOB);
    impl Drop for LocalBlob {
        fn drop(&mut self) {
            if !self.0.pbData.is_null() {
                // Both protected and plaintext DPAPI allocations are wiped/freed,
                // including error and over-cap paths; output is never logged.
                for i in 0..self.0.cbData as usize {
                    unsafe { std::ptr::write_volatile(self.0.pbData.add(i), 0) };
                }
                std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
                unsafe {
                    let _ = LocalFree(Some(HLOCAL(self.0.pbData.cast())));
                }
            }
        }
    }
    pub(super) fn crypt(input: &[u8], protect: bool) -> Result<Sensitive> {
        if input.is_empty() || input.len() > MAX_BYTES {
            return Err(Error::Size);
        }
        let data = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr().cast_mut(),
        };
        let mut out = LocalBlob(CRYPT_INTEGER_BLOB::default());
        let status = unsafe {
            if protect {
                CryptProtectData(
                    &data,
                    PCWSTR::null(),
                    None,
                    None,
                    None,
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out.0,
                )
            } else {
                CryptUnprotectData(
                    &data,
                    None,
                    None,
                    None,
                    None,
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out.0,
                )
            }
        };
        status.map_err(|_| Error::Protect)?;
        if out.0.pbData.is_null() || out.0.cbData == 0 || out.0.cbData as usize > MAX_BYTES {
            return Err(Error::Size);
        }
        Ok(Sensitive(
            unsafe { std::slice::from_raw_parts(out.0.pbData, out.0.cbData as usize) }.to_vec(),
        ))
    }
}

pub(crate) struct Vault {
    root: PathBuf,
    #[cfg(windows)]
    _locks: Vec<File>,
}
impl Vault {
    /// Creates only a new dedicated directory beneath a checked absolute parent.
    pub(crate) fn create(parent: &Path, name: &str) -> Result<Self> {
        if !file_id(name) {
            return Err(Error::Path);
        }
        #[cfg(windows)]
        {
            let _parents = native::lock_directories(parent)?;
            let root = parent.join(name);
            fs::create_dir(&root).map_err(|_| Error::Conflict)?;
            let _locks = native::lock_directories(&root)?;
            let mut marker = native::create(&root.join("vault.marker"))?;
            marker.write_all(MARKER).map_err(|_| Error::Io)?;
            marker.sync_all().map_err(|_| Error::Io)?;
            drop(marker);
            Ok(Self { root, _locks })
        }
        #[cfg(not(windows))]
        {
            let _ = parent;
            Err(Error::Unsupported)
        }
    }
    pub(crate) fn reopen(root: &Path) -> Result<Self> {
        #[cfg(windows)]
        {
            let _locks = native::lock_directories(root)?;
            if native::read(&root.join("vault.marker"))? != MARKER {
                return Err(Error::Path);
            }
            Ok(Self {
                root: root.to_owned(),
                _locks,
            })
        }
        #[cfg(not(windows))]
        {
            let _ = root;
            Err(Error::Unsupported)
        }
    }
    fn path(&self, binding: &Binding) -> Result<PathBuf> {
        binding.prefix()?;
        Ok(self.root.join(format!("{}.key", binding.reference)))
    }
    fn put(&self, binding: &Binding, secret: &[u8]) -> Result<()> {
        let record = encode(binding, secret)?;
        let path = self.path(binding)?;
        #[cfg(windows)]
        {
            let retry = || -> Result<()> {
                let stored = native::read(&path)?;
                let opened = native::crypt(&stored, false)?;
                if equal(&record.0, &opened.0) {
                    Ok(())
                } else {
                    Err(Error::Conflict)
                }
            };
            match native::read(&path) {
                Ok(_) => return retry(),
                Err(Error::Missing) => {}
                Err(e) => return Err(e),
            }
            let protected = native::crypt(&record.0, true)?;
            let mut file = match native::create(&path) {
                Ok(f) => f,
                Err(Error::Conflict) => return retry(),
                Err(e) => return Err(e),
            };
            file.write_all(&protected.0).map_err(|_| Error::Io)?;
            file.sync_all().map_err(|_| Error::Io)?;
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = (record, path);
            Err(Error::Unsupported)
        }
    }
    fn get(&self, binding: &Binding) -> Result<Sensitive> {
        let path = self.path(binding)?;
        #[cfg(windows)]
        {
            let stored = native::read(&path)?;
            let opened = native::crypt(&stored, false)?;
            decode(binding, &opened.0)
        }
        #[cfg(not(windows))]
        {
            let _ = path;
            Err(Error::Unsupported)
        }
    }
    pub(crate) fn store_signer(&self, b: &Binding, key: &DeviceSigner) -> Result<()> {
        if b.kind != KeyKind::Signing {
            return Err(Error::Binding);
        }
        let bytes = key.export_secret();
        self.put(b, &bytes.0)
    }
    pub(crate) fn load_signer(&self, b: &Binding) -> Result<DeviceSigner> {
        if b.kind != KeyKind::Signing {
            return Err(Error::Binding);
        }
        DeviceSigner::restore_secret(self.get(b)?).map_err(|_| Error::Crypto)
    }
    pub(crate) fn store_enrollment(&self, b: &Binding, key: &EnrollmentKey) -> Result<()> {
        if b.kind != KeyKind::Enrollment {
            return Err(Error::Binding);
        }
        let bytes = key.export_secret();
        self.put(b, &bytes.0)
    }
    pub(crate) fn load_enrollment(&self, b: &Binding) -> Result<EnrollmentKey> {
        if b.kind != KeyKind::Enrollment {
            return Err(Error::Binding);
        }
        EnrollmentKey::restore_secret(self.get(b)?).map_err(|_| Error::Crypto)
    }
    pub(crate) fn store_channel(&self, b: &Binding, key: &ChannelKey) -> Result<()> {
        let KeyKind::Channel { channel } = &b.kind else {
            return Err(Error::Binding);
        };
        if !key.matches(&b.environment, channel, b.epoch) {
            return Err(Error::Binding);
        }
        self.put(b, key.secret())
    }
    pub(crate) fn load_channel(&self, b: &Binding) -> Result<ChannelKey> {
        let KeyKind::Channel { channel } = &b.kind else {
            return Err(Error::Binding);
        };
        ChannelKey::from_secret(
            b.environment.clone(),
            channel.clone(),
            b.epoch,
            self.get(b)?,
        )
        .map_err(|_| Error::Crypto)
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::super::crypto::{Entropy, SystemEntropy};
    use super::*;
    fn fixture() -> (PathBuf, Vault) {
        let mut random = [0; 16];
        SystemEntropy.fill(&mut random).unwrap();
        let name = format!(
            "copicu-custody-{}",
            random
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        let root = std::env::temp_dir().join(&name);
        let vault = Vault::create(&std::env::temp_dir(), &name).unwrap();
        (root, vault)
    }
    fn cleanup(root: PathBuf) {
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("copicu-custody-"));
        assert_eq!(root.parent().unwrap(), std::env::temp_dir());
        use std::os::windows::fs::MetadataExt;
        assert_eq!(
            fs::symlink_metadata(&root).unwrap().file_attributes() & 0x400,
            0
        );
        let expected = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(root.file_name().unwrap());
        assert_eq!(root.canonicalize().unwrap(), expected);
        fs::remove_dir_all(root).unwrap();
    }
    fn binding(kind: KeyKind) -> Binding {
        Binding {
            environment: "synthetic".into(),
            profile: "fresh-fixture".into(),
            device: "fake-device".into(),
            kind,
            epoch: 1,
            reference: "ref-one".into(),
        }
    }
    #[test]
    fn actual_dpapi_persist_reopen_all_key_types_and_immutable_retry() {
        let (root, vault) = fixture();
        let mut entropy = SystemEntropy;
        let signer = DeviceSigner::generate(&mut entropy).unwrap();
        let sb = binding(KeyKind::Signing);
        vault.store_signer(&sb, &signer).unwrap();
        let before = fs::read(root.join("ref-one.key")).unwrap();
        vault.store_signer(&sb, &signer).unwrap();
        assert_eq!(fs::read(root.join("ref-one.key")).unwrap(), before);
        let kem = EnrollmentKey::generate(&mut entropy).unwrap();
        let mut kb = binding(KeyKind::Enrollment);
        kb.reference = "ref-kem".into();
        vault.store_enrollment(&kb, &kem).unwrap();
        let channel =
            ChannelKey::generate("synthetic".into(), "channel".into(), 1, &mut entropy).unwrap();
        let mut cb = binding(KeyKind::Channel {
            channel: "channel".into(),
        });
        cb.reference = "ref-channel".into();
        vault.store_channel(&cb, &channel).unwrap();
        drop(vault);
        let reopened = Vault::reopen(&root).unwrap();
        assert_eq!(reopened.load_signer(&sb).unwrap().public(), signer.public());
        assert_eq!(
            reopened.load_enrollment(&kb).unwrap().public(),
            kem.public()
        );
        assert!(equal(
            reopened.load_channel(&cb).unwrap().secret(),
            channel.secret()
        ));
        let other = DeviceSigner::generate(&mut entropy).unwrap();
        assert_eq!(reopened.store_signer(&sb, &other), Err(Error::Conflict));
        assert_eq!(fs::read(root.join("ref-one.key")).unwrap(), before);
        let mut rotated = sb;
        rotated.reference = "ref-two".into();
        rotated.epoch = 2;
        reopened.store_signer(&rotated, &other).unwrap();
        assert_eq!(
            reopened.load_signer(&rotated).unwrap().public(),
            other.public()
        );
        drop(reopened);
        cleanup(root);
    }
    #[test]
    fn actual_dpapi_wrong_binding_and_tamper_fail_closed() {
        let (root, vault) = fixture();
        let signer = DeviceSigner::generate(&mut SystemEntropy).unwrap();
        let b = binding(KeyKind::Signing);
        vault.store_signer(&b, &signer).unwrap();
        for i in 0..6 {
            let mut changed = b.clone();
            match i {
                0 => changed.environment = "other".into(),
                1 => changed.profile = "other".into(),
                2 => changed.device = "other".into(),
                3 => changed.epoch = 2,
                4 => changed.kind = KeyKind::Enrollment,
                _ => changed.reference = "other".into(),
            };
            if i == 5 {
                fs::copy(root.join("ref-one.key"), root.join("other.key")).unwrap();
            }
            assert!(vault.get(&changed).is_err());
        }
        let mut blob = fs::read(root.join("ref-one.key")).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 1;
        fs::write(root.join("ref-one.key"), blob).unwrap();
        assert!(vault.load_signer(&b).is_err());
        fs::write(root.join("ref-one.key"), vec![1; MAX_BYTES + 1]).unwrap();
        assert!(matches!(vault.load_signer(&b), Err(Error::Size)));
        fs::write(root.join("ref-one.key"), [1, 2, 3]).unwrap();
        assert!(vault.load_signer(&b).is_err());
        assert!(matches!(
            native::crypt(&vec![0; MAX_BYTES + 1], true),
            Err(Error::Size)
        ));
        drop(vault);
        cleanup(root);
    }
    #[test]
    fn dedicated_directory_ids_marker_and_channel_binding_reject_escape() {
        let (root, vault) = fixture();
        assert!(Vault::create(
            root.parent().unwrap(),
            root.file_name().unwrap().to_str().unwrap()
        )
        .is_err());
        let mut b = binding(KeyKind::Signing);
        b.reference = "../escape".into();
        assert!(matches!(vault.get(&b), Err(Error::Binding)));
        assert!(Vault::create(root.parent().unwrap(), "../escape").is_err());
        for reserved in ["CON", "nul", "COM1", "LPT9"] {
            b.reference = reserved.into();
            assert!(matches!(vault.get(&b), Err(Error::Binding)));
        }
        b.reference = "unrelated".into();
        fs::write(root.join("unrelated.key"), b"unrelated fixture bytes").unwrap();
        let signer = DeviceSigner::generate(&mut SystemEntropy).unwrap();
        assert!(vault.store_signer(&b, &signer).is_err());
        assert_eq!(
            fs::read(root.join("unrelated.key")).unwrap(),
            b"unrelated fixture bytes"
        );
        let channel =
            ChannelKey::generate("synthetic".into(), "channel".into(), 1, &mut SystemEntropy)
                .unwrap();
        let cb = binding(KeyKind::Channel {
            channel: "other".into(),
        });
        assert_eq!(vault.store_channel(&cb, &channel), Err(Error::Binding));
        drop(vault);
        fs::write(root.join("vault.marker"), b"unrelated").unwrap();
        assert!(Vault::reopen(&root).is_err());
        cleanup(root);
    }
    #[test]
    fn protected_binding_is_exact_and_buffer_versions_are_bounded() {
        let b = binding(KeyKind::Signing);
        let bytes = encode(&b, &[9; 32]).unwrap();
        assert!(equal(&decode(&b, &bytes.0).unwrap().0, &[9; 32]));
        let mut changed = bytes.0.clone();
        changed[0] ^= 1;
        assert!(matches!(decode(&b, &changed), Err(Error::Binding)));
        assert!(matches!(encode(&b, &[1; 31]), Err(Error::Size)));
        assert!(matches!(decode(&b, &[1; MAX_BYTES]), Err(Error::Binding)));
    }
}
