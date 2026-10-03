// Durable account/device onboarding composed with the existing transactional
// relay. Browser login proves a person; approval/recovery separately grants keys.
import { createHash, randomBytes, verify } from 'node:crypto';
import { canonical } from './control.mjs';
export const IDENTITY_DOMAIN = Buffer.from('Copicu.shared.identity.v3\0');
export function identitySigningBytes(value) {
  const { signature, recoverySignature, ...payload } = value;
  return Buffer.concat([IDENTITY_DOMAIN, Buffer.from(canonical(payload))]);
}
const hash = v => createHash('sha256').update(v).digest();
const secret = () => randomBytes(32).toString('base64url');
const html = text => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Copicu Sharing</title><h1>Copicu Sharing</h1><p>${text}</p><p>Return to Copicu. You can close this window.</p>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", 'x-content-type-options': 'nosniff' } });
export function createIdentity({ query, transaction, control, environment, issuerPublicKey, publicUrl, oidc, deny, opaque, base64, publicKey, body, response, clock, be64, from64, limits, notify, faults = {} }) {
  const origin = new URL(publicUrl).origin + '/';
  query(`CREATE TABLE IF NOT EXISTS identity_accounts(person TEXT PRIMARY KEY REFERENCES control_people(id),subject_hash BLOB UNIQUE NOT NULL,revision INTEGER NOT NULL DEFAULT 1,recovery_key BLOB,recovery_blob TEXT,recovery_revision INTEGER NOT NULL DEFAULT 0) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS identity_devices(device TEXT PRIMARY KEY REFERENCES relay_devices(id),name TEXT NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS identity_sessions(id TEXT PRIMARY KEY,digest BLOB NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,person TEXT) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS identity_intents(device TEXT NOT NULL,id TEXT NOT NULL,digest BLOB NOT NULL,result TEXT NOT NULL,PRIMARY KEY(device,id)) STRICT`).run();
  const now = () => Number(clock());
  const account = person => query('SELECT * FROM identity_accounts WHERE person=?').get(person);
  function fingerprint(device, person) {
    const row = query('SELECT d.public_key,cd.kem FROM relay_devices d JOIN control_devices cd ON cd.device=d.id WHERE d.id=?').get(device);
    return hash(Buffer.concat([Buffer.from('Copicu.shared.linked-device-review.v3\0'), Buffer.from(canonical({ environment, endpoint: origin, personId: person, deviceId: device, signingPublicKey: Buffer.from(row.public_key).toString('base64'), kemPublicKey: Buffer.from(row.kem).toString('base64') }))])).toString('hex');
  }
  function own(request) {
    const bearer = request.headers.get('authorization'); if (!bearer?.startsWith('Bearer ') || bearer.length > 136) deny(401, 'unauthorized');
    const digest = hash(bearer.slice(7));
    const row = query('SELECT d.id,d.public_key,d.revoked,cd.person,i.name,i.state,i.expires FROM relay_devices d JOIN control_devices cd ON cd.device=d.id JOIN identity_devices i ON i.device=d.id WHERE d.token_hash=?').get(digest);
    if (!row || row.state === 'revoked' || (row.state==='active' && row.revoked) || (row.state === 'pending' && row.expires <= now())) deny(403, 'device_unavailable');
    return row;
  }
  function signed(input, key) { if (!verify(null, identitySigningBytes(input), publicKey(key), base64(input.signature, 64))) deny(403, 'invalid_signature'); }
  function view(device) {
    const a = account(device.person);
    const devices = query('SELECT d.id AS deviceId,d.public_key,cd.kem,i.name,i.state,i.expires FROM relay_devices d JOIN control_devices cd ON cd.device=d.id JOIN identity_devices i ON i.device=d.id WHERE cd.person=? ORDER BY i.name,d.id').all(device.person).map(d => ({ deviceId: d.deviceId, personId: device.person, name: d.name, state: d.state === 'pending' && d.expires <= now() ? 'expired' : d.state, fingerprint: fingerprint(d.deviceId, device.person), signingPublicKey: Buffer.from(d.public_key).toString('base64'), kemPublicKey: Buffer.from(d.kem).toString('base64') }));
    return { state: device.state, personId: device.person, deviceId: device.id, name: device.name, revision: String(a.revision), fingerprint: fingerprint(device.id, device.person), devices: device.state === 'active' ? devices : devices.filter(d => d.deviceId === device.id), recovery: a.recovery_key ? { publicKey: Buffer.from(a.recovery_key).toString('base64'), blob: JSON.parse(a.recovery_blob), revision: String(a.recovery_revision) } : null };
  }
  function revoke(device) {
    control.events.deviceChanged(device);
    const resources = query('SELECT DISTINCT r.id FROM control_resources r JOIN relay_grants g ON g.channel=r.id WHERE g.device=? AND r.deleted=0').all(device);
    query("UPDATE identity_devices SET state='revoked' WHERE device=?").run(device);
    query('UPDATE relay_devices SET revoked=1 WHERE id=?').run(device);
    query('DELETE FROM relay_grants WHERE device=?').run(device);
    query('DELETE FROM control_packages WHERE device=?').run(device);
    query('DELETE FROM relay_leases WHERE device=?').run(device);
    for (const r of resources) { const before = control.events.audience(r.id); query('UPDATE control_resources SET rotation_pending=1,revision=revision+1 WHERE id=?').run(r.id); control.events.mutation(r.id, before, null, device); }
  }
  function attachKeys(device, target, resources) {
    if (!Array.isArray(resources) || resources.length > 128) deny(400, 'invalid_resources');
    const seen = new Set();
    for (const r of resources) {
      opaque(r.resourceId); if (seen.has(r.resourceId)) deny(400, 'duplicate_resource'); seen.add(r.resourceId);
      const m = control.member(target.id, r.resourceId);
      if (r.revision !== String(m.revision) || r.epoch !== from64(m.key_epoch).toString()) deny(409, 'resource_changed');
      if (device.id !== target.id && !query('SELECT 1 FROM relay_grants WHERE device=? AND channel=? AND can_read=1').get(device.id, r.resourceId)) deny(403, 'key_source_unavailable');
      const targetKem = query('SELECT kem FROM control_devices WHERE device=?').get(target.id).kem;
      const required = [{ device: target.id, kem: targetKem }];
      if (!Array.isArray(r.packages) || r.packages.length < 1 || r.packages.length > 129) deny(400, 'invalid_packages');
      let current = false; const epochs = new Set();
      for (const p of r.packages) {
        if (epochs.has(p.epoch)) deny(400, 'duplicate_epoch'); epochs.add(p.epoch);
        const epoch = BigInt(p.epoch); if (epoch <= 0n || epoch > from64(m.key_epoch)) deny(403, 'historical_package_scope');
        if (p.epoch === r.epoch) current = true;
        else if (!query("SELECT 1 FROM relay_publications WHERE channel=? AND sequence>=? AND expires>? AND envelope IS NOT NULL AND json_extract(envelope,'$.key_epoch')=?").get(r.resourceId, m.history_floor, be64(clock()), p.epoch)) deny(403, 'historical_package_scope');
        control.packages(device.id, r.resourceId, epoch, [p], [], required);
      }
      if (!current) deny(409, 'current_key_required');
      if (!query('SELECT 1 FROM relay_grants WHERE device=? AND channel=?').get(target.id, r.resourceId) && query('SELECT count(*) AS n FROM relay_grants').get().n >= limits.grants) deny(429, 'grant_capacity');
      query('INSERT INTO relay_grants VALUES (?,?,?,?,?,1) ON CONFLICT(device,channel) DO UPDATE SET key_epoch=excluded.key_epoch,can_publish=excluded.can_publish,can_read=1,can_report=1').run(target.id, r.resourceId, m.key_epoch, m.permission === 'read' ? 0 : 1, 1);
      const before = control.events.audience(r.resourceId); query('UPDATE control_resources SET revision=revision+1 WHERE id=?').run(r.resourceId); control.events.mutation(r.resourceId, before, null, device.id);
    }
  }
  function action(device, input) {
    const fields = ['operationId', 'kind', 'deviceId', 'fingerprint', 'expectedRevision', 'resources', 'publicKey', 'blob', 'recoveryRevision', 'signature', 'recoverySignature'];
    if (!input || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k))) deny(400, 'invalid_fields');
    opaque(input.operationId); signed(input, device.public_key);
    const digest = hash(identitySigningBytes(input));
    const out = transaction(() => {
      const previous = query('SELECT digest,result FROM identity_intents WHERE device=? AND id=?').get(device.id, input.operationId);
      if (previous) { if (!Buffer.from(previous.digest).equals(digest)) deny(409, 'intent_conflict'); return JSON.parse(previous.result); }
      if (query('SELECT count(*) AS n FROM identity_intents WHERE device=?').get(device.id).n >= 4096) deny(429, 'intent_capacity');
      const a = account(device.person); if (input.expectedRevision !== String(a.revision)) deny(409, 'account_changed');
      let result;
      if (input.kind === 'recover' || input.kind === 'recovery_prepare') {
        if (device.state !== 'pending' || !a.recovery_key || input.recoveryRevision !== String(a.recovery_revision)) deny(409, 'recovery_unavailable');
        if (!verify(null, identitySigningBytes(input), publicKey(a.recovery_key), base64(input.recoverySignature, 64))) deny(403, 'recovery_proof_required');
        if (input.kind === 'recovery_prepare') return { resources: control.catalogSnapshot(device.id).resources, revision: String(a.revision) };
        attachKeys(device, device, input.resources);
        for (const old of query("SELECT i.device FROM identity_devices i JOIN control_devices cd ON cd.device=i.device WHERE cd.person=? AND i.state='active' AND i.device<>?").all(device.person, device.id)) revoke(old.device);
        query("UPDATE identity_devices SET state='active' WHERE device=?").run(device.id); query('UPDATE relay_devices SET revoked=0 WHERE id=?').run(device.id);
        result = { recovered: true };
      } else {
        if (device.state !== 'active') deny(403, 'approval_required');
        if (input.kind === 'approve' || input.kind === 'revoke') {
          const target = query('SELECT d.id,cd.person,i.state,i.expires FROM relay_devices d JOIN control_devices cd ON cd.device=d.id JOIN identity_devices i ON i.device=d.id WHERE d.id=?').get(opaque(input.deviceId));
          if (!target || target.person !== device.person || target.state === 'revoked' || (target.state === 'pending' && target.expires <= now())) deny(403, 'device_unavailable');
          if (input.fingerprint !== fingerprint(target.id, target.person)) deny(409, 'fingerprint_changed');
          if (input.kind === 'approve') {
            if (target.id === device.id) deny(400, 'invalid_target');
            attachKeys(device, target, input.resources);
            query("UPDATE identity_devices SET state='active' WHERE device=?").run(target.id); query('UPDATE relay_devices SET revoked=0 WHERE id=?').run(target.id);
          } else revoke(target.id);
          result = { deviceId: target.id, state: input.kind === 'approve' ? 'active' : 'revoked' };
        } else if (input.kind === 'recovery_save') {
          const recoveryKey = base64(input.publicKey, 32); publicKey(recoveryKey);
          if (a.recovery_key && !Buffer.from(a.recovery_key).equals(recoveryKey)) deny(409, 'recovery_key_changed');
          if (input.recoveryRevision !== String(a.recovery_revision) || !input.blob || Object.keys(input.blob).sort().join(',') !== 'ciphertext,nonce') deny(409, 'recovery_changed');
          base64(input.blob.nonce, 24); base64(input.blob.ciphertext, 16, 1048576);
          query('UPDATE identity_accounts SET recovery_key=?,recovery_blob=?,recovery_revision=recovery_revision+1 WHERE person=?').run(recoveryKey, JSON.stringify(input.blob), device.person);
          result = { saved: true, recoveryRevision: String(a.recovery_revision + 1) };
        } else deny(400, 'unsupported_operation');
      }
      query('UPDATE identity_accounts SET revision=revision+1 WHERE person=?').run(device.person);
      control.events.deviceChanged(device.id);
      query('INSERT INTO identity_intents VALUES (?,?,?,?)').run(device.id, input.operationId, digest, JSON.stringify(result));
      if (faults.beforeCommit?.(input)) deny(503, 'identity_commit_unavailable');
      return result;
    })();
    notify(); control.events.wake(); return out;
  }
  return { async route(request, url) {
    if (!url.pathname.startsWith('/v3/')) return null;
    if (url.pathname === '/v3/info' && request.method === 'GET') return response({ version: 3, environment, endpoint: origin, issuerPublicKey, identity: 'oidc', deviceApproval: true, recovery: true });
    if (url.pathname === '/v3/auth/start' && request.method === 'POST') {
      const p = await body(request);
      const expected = ['sessionId', 'environment', 'endpoint', 'deviceId', 'name', 'signingPublicKey', 'kemPublicKey', 'tokenHash', 'challenge', 'browserChallenge', 'signature'];
      if (!p || Object.keys(p).sort().join(',') !== expected.sort().join(',')) deny(400, 'invalid_fields');
      opaque(p.sessionId); opaque(p.deviceId);
      if (p.environment !== environment || p.endpoint !== origin || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || /[\u0000-\u001f]/.test(p.name) || !/^[a-f0-9]{64}$/.test(p.tokenHash) || !/^[A-Za-z0-9_-]{43}$/.test(p.challenge) || !/^[A-Za-z0-9_-]{43}$/.test(p.browserChallenge)) deny(400, 'invalid_identity_scope');
      const key = base64(p.signingPublicKey, 32), kem = base64(p.kemPublicKey, 32); if (kem.equals(Buffer.alloc(32))) deny(400, 'invalid_device_key'); signed(p, key);
      const digest = hash(identitySigningBytes(p));
      transaction(() => {
        const old = query('SELECT digest,state,expires FROM identity_sessions WHERE id=?').get(p.sessionId);
        if (old) { if (!Buffer.from(old.digest).equals(digest)) deny(409, 'session_conflict'); if (['cancelled', 'failed'].includes(old.state) || (old.state !== 'complete' && old.expires <= now())) deny(410, 'session_expired'); return; }
        if (query('SELECT 1 FROM relay_devices WHERE id=?').get(p.deviceId)) deny(409, 'device_exists');
        // Keep a completed result with its bounded device record. A desktop may
        // resume after the browser finished while it was offline; the original
        // deadline still closes unfinished browser authentication.
        query("DELETE FROM identity_sessions WHERE state!='complete' AND expires<?").run(now() - 86400000);
        if (query("SELECT count(*) AS n FROM identity_sessions WHERE state!='complete' AND expires>?").get(now()).n >= 128) deny(429, 'session_capacity');
        query('INSERT INTO identity_sessions VALUES (?,?,?,?,?,?,?,NULL)').run(p.sessionId, digest, JSON.stringify(p), 'waiting', secret(), secret(), now() + 600000);
      })();
      return response({ sessionId: p.sessionId, state: 'waiting' });
    }
    if (url.pathname === '/v3/auth/browser' && request.method === 'GET') {
      const s = query('SELECT * FROM identity_sessions WHERE id=?').get(url.searchParams.get('session'));
      const ticket = url.searchParams.get('ticket'); if (!s || !['waiting','browser'].includes(s.state) || s.expires <= now() || !ticket || hash(ticket).toString('base64url') !== JSON.parse(s.payload).browserChallenge) deny(410, 'session_unavailable');
      query("UPDATE identity_sessions SET state='browser' WHERE id=? AND state='waiting'").run(s.id);
      return new Response(null, { status: 302, headers: { location: oidc.authorization({ state: s.id, nonce: s.nonce, challenge: hash(s.verifier).toString('base64url') }), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    }
    if (url.pathname === '/v3/auth/callback' && request.method === 'GET') {
      const s = query('SELECT * FROM identity_sessions WHERE id=?').get(url.searchParams.get('state'));
      if (!s || s.state !== 'browser' || s.expires <= now()) return html('This sign-in expired or was cancelled. Start again in Copicu.');
      query("UPDATE identity_sessions SET state='exchanging' WHERE id=?").run(s.id);
      if (url.searchParams.has('error')) { query("UPDATE identity_sessions SET state='failed',verifier='' WHERE id=?").run(s.id); return html('Sign-in was not completed.'); }
      try {
        const identity = await oidc.authenticate({ code: url.searchParams.get('code'), verifier: s.verifier, nonce: s.nonce });
        transaction(() => {
          const latest = query('SELECT state,expires FROM identity_sessions WHERE id=?').get(s.id); if (latest.state !== 'exchanging' || latest.expires <= now()) deny(410, 'session_expired');
          const p = JSON.parse(s.payload), subjectHash = hash(canonical([identity.issuer, identity.subject]));
          let person = query('SELECT person FROM identity_accounts WHERE subject_hash=?').get(subjectHash)?.person;
          const newPerson = !person;
          if (newPerson) { if (query('SELECT count(*) AS n FROM identity_accounts').get().n >= 128) deny(429, 'account_capacity'); person = `person_${randomBytes(16).toString('hex')}`; query('INSERT INTO control_people VALUES (?,?)').run(person, 'Private account'); query('INSERT INTO identity_accounts(person,subject_hash) VALUES (?,?)').run(person, subjectHash); }
          // A cancelled first sign-in cannot strand an empty account. Existing
          // resources/recovery material permanently disable this bootstrap.
          const first = newPerson || (!account(person).recovery_key && !query('SELECT 1 FROM control_resources WHERE owner=?').get(person) && !query("SELECT 1 FROM identity_devices i JOIN control_devices cd ON cd.device=i.device WHERE cd.person=? AND i.state='active'").get(person));
          if (query('SELECT count(*) AS n FROM relay_devices').get().n >= limits.devices) deny(429, 'device_capacity');
          query('INSERT INTO relay_devices VALUES (?,?,?,?)').run(p.deviceId, Buffer.from(p.tokenHash, 'hex'), base64(p.signingPublicKey, 32), first ? 0 : 1);
          query('INSERT INTO control_devices VALUES (?,?,?)').run(p.deviceId, person, base64(p.kemPublicKey, 32));
          query('INSERT INTO identity_devices VALUES (?,?,?,?)').run(p.deviceId, p.name.trim(), first ? 'active' : 'pending', now() + 86400000);
          query("UPDATE identity_sessions SET state='complete',person=?,verifier='' WHERE id=?").run(person, s.id);
          query('UPDATE identity_accounts SET revision=revision+1 WHERE person=?').run(person);
          control.events.deviceChanged(p.deviceId);
        })(); notify(); control.events.wake();
        return html('Sign-in completed. Copicu will show whether this device needs approval.');
      } catch { query("UPDATE identity_sessions SET state='failed',verifier='' WHERE id=? AND state='exchanging'").run(s.id); return html('Sign-in could not be verified or this account is not admitted by the service.'); }
    }
    if (['/v3/auth/poll', '/v3/auth/cancel'].includes(url.pathname) && request.method === 'POST') {
      const p = await body(request);
      if (!p || Object.keys(p).sort().join(',') !== 'sessionId,signature,verifier') deny(400, 'invalid_fields');
      const s = query('SELECT * FROM identity_sessions WHERE id=?').get(opaque(p.sessionId));
      if (!s || typeof p.verifier !== 'string' || p.verifier.length !== 43 || hash(p.verifier).toString('base64url') !== JSON.parse(s.payload).challenge) deny(403, 'session_unavailable');
      signed(p, base64(JSON.parse(s.payload).signingPublicKey, 32));
      if (url.pathname.endsWith('/cancel')) { transaction(() => { query("UPDATE identity_sessions SET state='cancelled',verifier='' WHERE id=?").run(s.id); const id = JSON.parse(s.payload).deviceId; if (query("SELECT 1 FROM identity_devices WHERE device=? AND state IN ('pending','active')").get(id)) { revoke(id); query('UPDATE identity_accounts SET revision=revision+1 WHERE person=?').run(s.person); } })(); control.events.wake(); return response({ cancelled: true }); }
      if (['failed', 'cancelled'].includes(s.state) || (s.state !== 'complete' && s.expires <= now())) deny(410, 'session_expired');
      if (s.state !== 'complete') return response({ state: 'waiting' });
      const d = query('SELECT d.id,d.public_key,cd.person,i.name,i.state,i.expires FROM relay_devices d JOIN control_devices cd ON cd.device=d.id JOIN identity_devices i ON i.device=d.id WHERE d.id=?').get(JSON.parse(s.payload).deviceId);
      if (d.state === 'revoked' || (d.state === 'pending' && d.expires <= now())) deny(403, 'device_unavailable');
      return response(view(d));
    }
    if (url.pathname === '/v3/identity' && request.method === 'GET') return response(view(own(request)));
    if (url.pathname === '/v3/identity/actions' && request.method === 'POST') { const input = await body(request), d = own(request), result = action(d, input); if (faults.afterCommit?.(input)) deny(503,'identity_response_lost'); return response(result); }
    deny(404, 'not_found');
  } };
}
