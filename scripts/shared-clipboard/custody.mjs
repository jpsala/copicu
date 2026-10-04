// Service-managed content keys. HPKE is the existing RFC 9180 V2 suite,
// single-message Base mode (0x0020/0x0001/0x0001); no device private key leaves
// its PC. Persistent keys are AES-256-GCM ciphertext under a separate secret.
import { createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, sign, timingSafeEqual, verify } from 'node:crypto';
import { canonical } from './control.mjs';

export const CUSTODY_DEVICE = 'service_key_custody_v3';
export const CUSTODY_SUITE = 'X25519_HKDF_SHA256_AES128GCM';
const EMPTY = Buffer.alloc(0), KEM = Buffer.from('4b454d0020', 'hex'), SUITE = Buffer.from('48504b45002000010001', 'hex');
const privatePrefix = Buffer.from('302e020100300506032b656e04220420', 'hex'), publicPrefix = Buffer.from('302a300506032b656e032100', 'hex');
const priv = raw => createPrivateKey({ key: Buffer.concat([privatePrefix, raw]), format: 'der', type: 'pkcs8' });
const pub = raw => createPublicKey({ key: Buffer.concat([publicPrefix, raw]), format: 'der', type: 'spki' });
const rawPublic = key => createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
function extract(salt, value) { return createHmac('sha256', salt.length ? salt : Buffer.alloc(32)).update(value).digest(); }
function labeledExtract(suite, salt, label, value) { return extract(salt, Buffer.concat([Buffer.from('HPKE-v1'), suite, Buffer.from(label), value])); }
function labeledExpand(suite, prk, label, info, length) {
  // This suite uses only <=32-byte outputs: the first RFC 5869 expand block.
  if (length < 1 || length > 32) throw Error('hpke_length');
  const size = Buffer.alloc(2); size.writeUInt16BE(length);
  return createHmac('sha256', prk).update(Buffer.concat([size, Buffer.from('HPKE-v1'), suite, Buffer.from(label), info, Buffer.from([1])])).digest().subarray(0, length);
}
function context(privateKey, peer, enc, recipient, info) {
  const dh = diffieHellman({ privateKey, publicKey: pub(peer) });
  let prk, shared, secret;
  try {
    if (dh.equals(Buffer.alloc(32))) throw Error('hpke_public_key');
    prk = labeledExtract(KEM, EMPTY, 'eae_prk', dh);
    shared = labeledExpand(KEM, prk, 'shared_secret', Buffer.concat([enc, recipient]), 32);
    const schedule = Buffer.concat([Buffer.from([0]), labeledExtract(SUITE, EMPTY, 'psk_id_hash', EMPTY), labeledExtract(SUITE, EMPTY, 'info_hash', info)]);
    secret = labeledExtract(SUITE, shared, 'secret', EMPTY);
    return { key: labeledExpand(SUITE, secret, 'key', schedule, 16), nonce: labeledExpand(SUITE, secret, 'base_nonce', schedule, 12) };
  } finally { dh.fill(0); prk?.fill(0); shared?.fill(0); secret?.fill(0); }
}
export function hpkeSeal(recipient, info, clear, ephemeral = null, aad = info) {
  const privateKey = ephemeral ? priv(ephemeral) : generateKeyPairSync('x25519').privateKey;
  const enc = rawPublic(privateKey), ctx = context(privateKey, recipient, enc, recipient, info);
  try {
    const cipher = createCipheriv('aes-128-gcm', ctx.key, ctx.nonce); cipher.setAAD(aad);
    return { enc, ciphertext: Buffer.concat([cipher.update(clear), cipher.final(), cipher.getAuthTag()]) };
  } finally { ctx.key.fill(0); ctx.nonce.fill(0); }
}
export function hpkeOpen(privateKey, enc, info, ciphertext, aad = info) {
  const sk = Buffer.isBuffer(privateKey) ? priv(privateKey) : privateKey;
  const ctx = context(sk, enc, enc, rawPublic(sk), info);
  try {
    if (ciphertext.length < 16) throw Error('hpke_ciphertext');
    const cipher = createDecipheriv('aes-128-gcm', ctx.key, ctx.nonce); cipher.setAAD(aad); cipher.setAuthTag(ciphertext.subarray(-16));
    return Buffer.concat([cipher.update(ciphertext.subarray(0, -16)), cipher.final()]);
  } finally { ctx.key.fill(0); ctx.nonce.fill(0); }
}
const packetBytes = (domain, value) => Buffer.concat([Buffer.from(domain), Buffer.from(canonical(value))]);
export function wrapServiceKey(environment, resourceId, epoch, key, owner, recipient, signer) {
  const packet = { environment, resourceId, epoch: String(epoch), ownerDeviceId: owner.deviceId, ownerSigningPublicKey: owner.signingPublicKey, deviceId: recipient.deviceId, signingPublicKey: recipient.signingPublicKey, kemPublicKey: recipient.kemPublicKey, suite:CUSTODY_SUITE };
  const info = packetBytes('Copicu.shared.key-transcript.v2\0', packet);
  const wrapped = hpkeSeal(Buffer.from(recipient.kemPublicKey, 'base64'), info, key);
  packet.enc = wrapped.enc.toString('base64'); packet.ciphertext = wrapped.ciphertext.toString('base64');
  packet.signature = sign(null, packetBytes('Copicu.shared.key-package.v2\0', packet), signer).toString('base64');
  return packet;
}

function custodyPrivateKey(rootKey) {
  if (!Buffer.isBuffer(rootKey) || rootKey.length !== 32 || rootKey.equals(Buffer.alloc(32))) throw Error('invalid_custody_secret');
  const kemBytes = Buffer.from(hkdfSync('sha256', rootKey, EMPTY, Buffer.from('Copicu.service.custody.kem.v3\0'), 32));
  try { return priv(kemBytes); } finally { kemBytes.fill(0); }
}
export const custodyPublicKey = rootKey => rawPublic(custodyPrivateKey(rootKey)).toString('base64');

export function createCustody({ query, environment, rootKey, signer, deny, base64, publicKey, be64, from64 }) {
  const privateKey = custodyPrivateKey(rootKey);
  const storageKey = Buffer.from(hkdfSync('sha256', rootKey, EMPTY, Buffer.from('Copicu.service.custody.storage.v3\0'), 32));
  const recipient = { environment, deviceId: CUSTODY_DEVICE, signingPublicKey: rawPublic(signer).toString('base64'), kemPublicKey: rawPublic(privateKey).toString('base64'), suite:CUSTODY_SUITE };
  recipient.signature = sign(null, packetBytes('Copicu.shared.custody-recipient.v3\0', recipient), signer).toString('base64');
  query('CREATE TABLE IF NOT EXISTS custody_identity(environment TEXT PRIMARY KEY,kem TEXT NOT NULL) STRICT').run();
  query('CREATE TABLE IF NOT EXISTS custody_keys(resource TEXT NOT NULL REFERENCES control_resources(id),epoch BLOB NOT NULL,nonce BLOB NOT NULL,ciphertext BLOB NOT NULL,PRIMARY KEY(resource,epoch)) STRICT').run();
  const old = query('SELECT kem FROM custody_identity WHERE environment=?').get(environment);
  if (old && old.kem !== recipient.kemPublicKey) { storageKey.fill(0); throw Error('custody_identity_mismatch'); }
  query('INSERT OR IGNORE INTO custody_identity VALUES (?,?)').run(environment, recipient.kemPublicKey);
  const aad = (resource, epoch) => packetBytes('Copicu.service.custody.storage.v3\0', { environment, resourceId: resource, epoch: String(epoch) });
  function load(resource, epoch) {
    const row = query('SELECT nonce,ciphertext FROM custody_keys WHERE resource=? AND epoch=?').get(resource, be64(epoch));
    if (!row) return null;
    const cipher = createDecipheriv('aes-256-gcm', storageKey, row.nonce); cipher.setAAD(aad(resource, epoch)); cipher.setAuthTag(Buffer.from(row.ciphertext).subarray(-16));
    return Buffer.concat([cipher.update(Buffer.from(row.ciphertext).subarray(0, -16)), cipher.final()]);
  }
  function deposit(device, resource, epoch, packet) {
    const source = query('SELECT public_key FROM relay_devices WHERE id=? AND revoked=0').get(device);
    if (!source || !packet || Object.keys(packet).sort().join(',') !== 'ciphertext,deviceId,enc,environment,epoch,kemPublicKey,ownerDeviceId,ownerSigningPublicKey,resourceId,signature,signingPublicKey,suite' || packet.suite!==CUSTODY_SUITE || packet.environment !== environment || packet.resourceId !== resource || packet.epoch !== String(epoch) || packet.ownerDeviceId !== device || packet.ownerSigningPublicKey !== Buffer.from(source.public_key).toString('base64') || packet.deviceId !== recipient.deviceId || packet.signingPublicKey !== recipient.signingPublicKey || packet.kemPublicKey !== recipient.kemPublicKey) deny(403, 'custody_package_scope');
    const { signature, ...signed } = packet;
    if (!verify(null, packetBytes('Copicu.shared.key-package.v2\0', signed), publicKey(source.public_key), base64(signature, 64))) deny(403, 'invalid_custody_signature');
    const { enc, ciphertext, ...header } = signed;
    let clear, prior;
    try {
      try { clear = hpkeOpen(privateKey, base64(enc, 32), packetBytes('Copicu.shared.key-transcript.v2\0', header), base64(ciphertext, 48)); }
      catch { deny(403, 'invalid_custody_package'); }
      if (clear.length !== 32) deny(400, 'invalid_custody_key');
      prior = load(resource, epoch);
      if (prior) { if (!timingSafeEqual(prior, clear)) deny(409, 'custody_key_conflict'); return; }
      if (query('SELECT count(*) AS n FROM custody_keys WHERE resource=?').get(resource).n >= 129) deny(429, 'custody_epoch_capacity');
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', storageKey, nonce); cipher.setAAD(aad(resource, epoch));
      const sealed = Buffer.concat([cipher.update(clear), cipher.final(), cipher.getAuthTag()]);
      query('INSERT INTO custody_keys VALUES (?,?,?,?)').run(resource, be64(epoch), nonce, sealed);
    } finally { clear?.fill(0); prior?.fill(0); }
  }
  function materialize(device, resource, epochs) {
    const target = query('SELECT d.public_key,cd.kem FROM relay_devices d JOIN control_devices cd ON cd.device=d.id WHERE d.id=? AND d.revoked=0').get(device);
    if (!target?.kem) return;
    for (const epoch of epochs) {
      const saved = query('SELECT package FROM control_packages WHERE resource=? AND device=? AND epoch=?').get(resource, device, be64(epoch));
      // Existing packages were authenticated when installed; their epoch key is
      // immutable. Keep legacy HPKE bytes usable while active PCs update.
      if (saved) continue;
      const key = load(resource, epoch); if (!key) continue;
      try {
        const packet = wrapServiceKey(environment, resource, epoch, key, recipient, { deviceId: device, signingPublicKey: Buffer.from(target.public_key).toString('base64'), kemPublicKey: Buffer.from(target.kem).toString('base64') }, signer);
        query('INSERT OR REPLACE INTO control_packages VALUES (?,?,?,?)').run(resource, device, be64(epoch), JSON.stringify(packet));
      } finally { key.fill(0); }
    }
  }
  function prune(clock) {
    // Bind each epoch separately: unsigned counters are durable big-endian blobs.
    for (const row of query('SELECT k.resource,k.epoch,r.deleted,c.key_epoch FROM custody_keys k JOIN control_resources r ON r.id=k.resource JOIN relay_channels c ON c.id=k.resource').all()) {
      if (row.deleted || (!Buffer.from(row.epoch).equals(Buffer.from(row.key_epoch)) && !query('SELECT 1 FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>? AND json_extract(envelope,\'$.key_epoch\')=?').get(row.resource, be64(clock), from64(row.epoch).toString()))) query('DELETE FROM custody_keys WHERE resource=? AND epoch=?').run(row.resource, row.epoch);
    }
  }
  return { recipient, deposit, materialize, has: (resource, epoch) => !!query('SELECT 1 FROM custody_keys WHERE resource=? AND epoch=?').get(resource, be64(epoch)), prune, close() { storageKey.fill(0); } };
}
