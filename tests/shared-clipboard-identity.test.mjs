import { test, expect } from 'bun:test';
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRelay, controlSigningBytes } from '../scripts/shared-clipboard/relay.mjs';
import { identitySigningBytes } from '../scripts/shared-clipboard/identity.mjs';
import { canonical } from '../scripts/shared-clipboard/control.mjs';
import { syntheticOidc } from './manual/synthetic-oidc.mjs';
const raw = key => key.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const hash = value => createHash('sha256').update(value).digest();
async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'copicu-identity-synthetic-')), issuer = await syntheticOidc();
  const leaseSigner = generateKeyPairSync('ed25519').privateKey; let oidc, relay, fault; let at = BigInt(Date.now());
  const config = { dbPath: path.join(root, 'relay.sqlite'), environment: 'synthetic', leaseSigner, now: () => at, identity: { oidc: { authorization: p => oidc.authorization(p), authenticate: p => oidc.authenticate(p) }, faults: { beforeCommit: p => fault === `before:${p.kind}` && (fault = null, true), afterCommit: p => fault === `after:${p.kind}` && (fault = null, true) } } };
  const start = async () => { relay = createRelay(config); oidc = await issuer.adapter(relay.url + '/v3/auth/callback'); };
  await start();
  const call = async (route, body, d) => {
    const response = await fetch(relay.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(d ? { authorization: `Bearer ${d.token}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  };
  const signed = (value, signer) => ({ ...value, signature: sign(null, identitySigningBytes(value), signer).toString('base64') });
  const device = name => ({ id: `device_${randomBytes(12).toString('hex')}`, name, signer: generateKeyPairSync('ed25519'), kem: generateKeyPairSync('x25519'), token: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), browser: randomBytes(32).toString('base64url'), session: `session_${randomBytes(12).toString('hex')}` });
  const request = d => signed({ sessionId: d.session, environment: 'synthetic', endpoint: relay.url + '/', deviceId: d.id, name: d.name, signingPublicKey: raw(d.signer.publicKey), kemPublicKey: raw(d.kem.publicKey), tokenHash: hash(d.token).toString('hex'), challenge: hash(d.verifier).toString('base64url'), browserChallenge: hash(d.browser).toString('base64url') }, d.signer.privateKey);
  const poll = d => call('/v3/auth/poll', signed({ sessionId: d.session, verifier: d.verifier }, d.signer.privateKey));
  const login = async d => {
    expect((await call('/v3/auth/start', request(d))).status).toBe(200);
    const browser = await fetch(`${relay.url}/v3/auth/browser?session=${d.session}&ticket=${d.browser}`); expect(browser.status).toBe(200);
    return poll(d);
  };
  const action = (d, value) => call('/v3/identity/actions', signed(value, d.signer.privateKey), d);
  const catalog = d => call('/v2/catalog', undefined, d);
  const create = async (d, resource = 'resource') => {
    const value = { intent_id: `create_${resource}`, kind: 'create', resource_id: resource, metadata: { nonce: randomBytes(24).toString('base64'), ciphertext: randomBytes(48).toString('base64') }, packages: [packet(d, d, resource)] };
    return call('/v2/operations', { ...value, signature: sign(null, controlSigningBytes(value), d.signer.privateKey).toString('base64') }, d);
  };
  const packet = (owner, target, resource = 'resource', epoch = '1') => {
    const value = { environment: 'synthetic', resourceId: resource, epoch, ownerDeviceId: owner.id, ownerSigningPublicKey: raw(owner.signer.publicKey), deviceId: target.id, signingPublicKey: raw(target.signer.publicKey), kemPublicKey: raw(target.kem.publicKey), enc: randomBytes(32).toString('base64'), ciphertext: randomBytes(48).toString('base64') };
    return { ...value, signature: sign(null, Buffer.concat([Buffer.from('Copicu.shared.key-package.v2\0'), Buffer.from(canonical(value))]), owner.signer.privateKey).toString('base64') };
  };
  try { await run({ call, device, request, poll, login, action, catalog, create, packet, signed, issuer, advance(ms) { at += BigInt(ms); }, fault(value) { fault = value; }, get relay() { return relay; }, async restart() { const url = relay.url; await relay.stop(); config.port = Number(new URL(url).port); await start(); } }); }
  finally { await relay.stop(); await issuer.stop(); if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('copicu-identity-synthetic-')) throw Error('cleanup boundary'); await rm(root, { recursive: true, force: true }); }
}

test('first account has a private empty space; sibling login does not grant catalog/content and restart preserves request', () => fixture(async f => {
  const a = f.device('Synthetic work'), b = f.device('Synthetic home');
  const first = await f.login(a); expect(first.value.state).toBe('active');
  const cat = await f.catalog(a); expect(cat.value.mode).toBe('private'); expect(cat.value.resources).toEqual([]);
  expect((await f.create(a)).status).toBe(200);
  const pending = await f.login(b); expect(pending.value.state).toBe('pending'); expect(pending.value.personId).toBe(first.value.personId); expect(pending.value.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect((await f.catalog(b)).status).toBe(401);
  expect((await f.call('/v1/channels/resource/sync?cursor=0', undefined, b)).status).toBe(401);
  expect(JSON.stringify(pending.value)).not.toContain(a.token); expect(pending.value.devices).toHaveLength(1);
  await f.restart(); expect((await f.poll(b)).value.state).toBe('pending');
}));

test('fingerprint + signed HPKE transcript approval grants only same-person current resources and idempotent retry', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Home'); await f.login(a); await f.create(a); await f.login(b);
  const account = (await f.call('/v3/identity', undefined, a)).value, target = account.devices.find(d => d.deviceId === b.id);
  const approval = { operationId: 'approve_home', kind: 'approve', deviceId: b.id, fingerprint: target.fingerprint, expectedRevision: account.revision, resources: [{ resourceId: 'resource', revision: '1', epoch: '1', packages: [f.packet(a, b)] }] };
  expect((await f.action(a, { ...approval, operationId: 'wrong_fingerprint', fingerprint: '0'.repeat(64) })).status).toBe(409);
  expect((await f.action(a, { ...approval, operationId: 'wrong_epoch', resources: [{ ...approval.resources[0], epoch: '2' }] })).status).toBe(409);
  const accepted = await f.action(a, approval); expect(accepted.status).toBe(200); expect((await f.action(a, approval)).value).toEqual(accepted.value);
  expect((await f.poll(b)).value.state).toBe('active');
  expect((await f.catalog(b)).value.resources[0].packages).toHaveLength(1);
  expect((await f.call('/v1/channels/resource/sync?cursor=0', undefined, b)).status).toBe(200);
}));

test('unrelated account cannot enumerate people/devices or approve known device IDs', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Other'); await f.login(a); f.issuer.setSubject('synthetic-other'); await f.login(b);
  const own = (await f.call('/v3/identity', undefined, b)).value, cat = (await f.catalog(b)).value;
  expect(own.devices).toHaveLength(1); expect(cat.people).toHaveLength(1); expect(cat.devices).toHaveLength(1);
  expect((await f.action(b, { operationId: 'cross_account', kind: 'approve', deviceId: a.id, fingerprint: '0'.repeat(64), expectedRevision: own.revision, resources: [] })).status).toBe(403);
}));

test('approval rollback and lost response preserve the exact durable intention', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Home'); await f.login(a); await f.create(a); await f.login(b);
  const account = (await f.call('/v3/identity', undefined, a)).value, target = account.devices.find(d => d.deviceId === b.id);
  const input = { operationId: 'durable_approve', kind: 'approve', deviceId: b.id, fingerprint: target.fingerprint, expectedRevision: account.revision, resources: [{ resourceId: 'resource', revision: '1', epoch: '1', packages: [f.packet(a, b)] }] };
  f.fault('before:approve'); expect((await f.action(a, input)).status).toBe(503);
  expect((await f.poll(b)).value.state).toBe('pending'); expect((await f.catalog(b)).status).toBe(401);
  expect((await f.catalog(a)).value.resources[0].revision).toBe('1');
  f.fault('after:approve'); expect((await f.action(a, input)).status).toBe(503);
  await f.restart(); expect((await f.action(a, input)).status).toBe(200);
  expect((await f.poll(b)).value.state).toBe('active');
  expect((await f.catalog(b)).value.resources[0].revision).toBe('2');
  expect((await f.action(a, { ...input, fingerprint: '0'.repeat(64) })).status).toBe(409);
}));

test('expired login and device requests deny access and require a fresh request', () => fixture(async f => {
  const a = f.device('Work'); await f.call('/v3/auth/start', f.request(a));
  f.advance(600001); expect((await f.poll(a)).status).toBe(410);
  expect((await f.call('/v3/auth/start', f.request(a))).status).toBe(410);
  const owner = f.device('Approved'), b = f.device('Pending'); await f.login(owner); await f.login(b);
  f.advance(86400001); expect((await f.call('/v3/identity', undefined, b)).status).toBe(403);
  const account = (await f.call('/v3/identity', undefined, owner)).value;
  expect(account.devices.find(d => d.deviceId === b.id).state).toBe('expired');
  expect((await f.action(owner, { operationId: 'expired_approve', kind: 'approve', deviceId: b.id, fingerprint: account.devices.find(d => d.deviceId === b.id).fingerprint, expectedRevision: account.revision, resources: [] })).status).toBe(403);
}));

test('completed browser sign-in survives its login deadline and session pruning without extending pending device approval', () => fixture(async f => {
  const a = f.device('Offline first PC'), b = f.device('Offline pending PC');
  const first = await f.login(a); await f.login(b);
  f.advance(600001); await f.restart();
  expect((await f.call('/v3/auth/start', f.request(a))).status).toBe(200);
  expect((await f.poll(a)).value.personId).toBe(first.value.personId);
  expect((await f.poll(b)).value.state).toBe('pending');
  expect((await fetch(`${f.relay.url}/v3/auth/browser?session=${a.session}&ticket=${a.browser}`, { redirect: 'manual' })).status).toBe(410);
  expect((await f.call('/v3/auth/poll', f.signed({ sessionId: a.session, verifier: 'x'.repeat(43) }, a.signer.privateKey))).status).toBe(403);
  f.advance(86400001);
  const fresh = f.device('Triggers bounded session cleanup');
  expect((await f.call('/v3/auth/start', f.request(fresh))).status).toBe(200);
  await f.restart();
  expect((await f.poll(a)).value.state).toBe('active');
  expect((await f.poll(b)).status).toBe(403);
  expect((await f.catalog(b)).status).toBe(401);
  expect((await f.call('/v3/auth/cancel', f.signed({ sessionId: a.session, verifier: a.verifier }, a.signer.privateKey))).status).toBe(200);
  expect((await f.poll(a)).status).toBe(410);
  expect((await f.catalog(a)).status).toBe(401);
}));

test('cancelling after the browser callback revokes the new bearer and does not strand an empty account', () => fixture(async f => {
  const a = f.device('Cancelled'); expect((await f.login(a)).value.state).toBe('active');
  expect((await f.call('/v3/auth/cancel', f.signed({ sessionId: a.session, verifier: a.verifier }, a.signer.privateKey))).status).toBe(200);
  expect((await f.catalog(a)).status).toBe(401); expect((await f.poll(a)).status).toBe(410);
  const b = f.device('Fresh'); expect((await f.login(b)).value.state).toBe('active');
  expect((await f.catalog(b)).value.resources).toEqual([]);
}));

test('managed service drains open SSE bodies before shutdown and restarts with the same identity', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Home'); await f.login(a); await f.login(b);
  const account = (await f.call('/v3/identity', undefined, a)).value, pending = account.devices.find(d => d.deviceId === b.id);
  await f.action(a, { operationId: 'stream_approve', kind: 'approve', deviceId: b.id, fingerprint: pending.fingerprint, expectedRevision: account.revision, resources: [] });
  const aborts = [], readers = [];
  try {
    for (const d of [a, b]) {
      const mark = (await f.catalog(d)).value.control, abort = new AbortController(); aborts.push(abort);
      const response = await fetch(`${f.relay.url}/v2/events?generation=${mark.generation}&personId=${mark.personId}&cursor=${mark.cursor}`, { headers: { authorization: `Bearer ${d.token}` }, signal: abort.signal });
      expect(response.status).toBe(200); const reader = response.body.getReader(); readers.push(reader); await reader.read();
    }
    let timer;
    try { await Promise.race([f.restart(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('shutdown deadline')), 2000); })]); }
    finally { clearTimeout(timer); }
    expect((await f.call('/v3/identity', undefined, a)).value.deviceId).toBe(a.id);
    expect((await f.call('/v3/identity', undefined, b)).value.state).toBe('active');
  } finally { for (const abort of aborts) abort.abort(); for (const reader of readers) await reader.cancel().catch(() => {}); }
}));

test('untrusted enrollment scope, noncanonical weak signing keys and substituted transcripts are rejected', () => fixture(async f => {
  const a = f.device('Work'), request = f.request(a);
  expect((await f.call('/v3/auth/start', f.signed({ ...request, endpoint: 'https://other.invalid/' }, a.signer.privateKey))).status).toBe(400);
  expect((await f.call('/v3/auth/start', { ...request, signingPublicKey: Buffer.alloc(32).toString('base64') })).status).toBe(400);
  expect((await f.call('/v3/auth/start', { ...request, name: 'Substituted' })).status).toBe(403);
  expect((await f.catalog(a)).status).toBe(401);
}));

test('PKCE poll proof, state/nonce, account admission and cancellation fail closed', () => fixture(async f => {
  const a = f.device('Work'); expect((await f.call('/v3/auth/start', f.request(a))).status).toBe(200);
  expect((await f.call('/v3/auth/poll', f.signed({ sessionId: a.session, verifier: randomBytes(32).toString('base64url') }, a.signer.privateKey))).status).toBe(403);
  expect((await f.call('/v3/auth/cancel', f.signed({ sessionId: a.session, verifier: a.verifier }, a.signer.privateKey))).status).toBe(200);
  expect((await f.poll(a)).status).toBe(410);
  f.issuer.setClaims(c => ({ ...c, nonce: 'wrong_nonce' })); const bad = f.device('Bad nonce'); expect((await f.login(bad)).status).toBe(410);
  f.issuer.setClaims(c => c); f.issuer.setSubject('not_admitted'); const denied = f.device('Not admitted'); expect((await f.login(denied)).status).toBe(410);
  expect((await f.catalog(denied)).status).toBe(401);
}));

test('retiring a device invalidates bearer, grants and pending packages, requires rotation and survives restart', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Home'); await f.login(a); await f.create(a); await f.login(b);
  let account = (await f.call('/v3/identity', undefined, a)).value, target = account.devices.find(d => d.deviceId === b.id);
  expect((await f.action(a, { operationId: 'approve', kind: 'approve', deviceId: b.id, fingerprint: target.fingerprint, expectedRevision: account.revision, resources: [{ resourceId: 'resource', revision: '1', epoch: '1', packages: [f.packet(a, b)] }] })).status).toBe(200);
  account = (await f.call('/v3/identity', undefined, a)).value;
  expect((await f.action(a, { operationId: 'retire', kind: 'revoke', deviceId: b.id, fingerprint: target.fingerprint, expectedRevision: account.revision })).status).toBe(200);
  expect((await f.catalog(b)).status).toBe(401); expect((await f.call('/v3/identity', undefined, b)).status).toBe(403);
  expect((await f.catalog(a)).value.resources[0].keyState).toBe('pending');
  await f.restart(); expect((await f.catalog(b)).status).toBe(401);
}));

test('recovery requires account + recovery proof, keeps encrypted blob opaque and retires old devices', () => fixture(async f => {
  const a = f.device('Work'), b = f.device('Recovered'); await f.login(a); await f.create(a);
  const recovery = generateKeyPairSync('ed25519'), account = (await f.call('/v3/identity', undefined, a)).value;
  const blob = { nonce: randomBytes(24).toString('base64'), ciphertext: randomBytes(80).toString('base64') };
  expect((await f.action(a, { operationId: 'recovery_save', kind: 'recovery_save', publicKey: raw(recovery.publicKey), blob, expectedRevision: account.revision, recoveryRevision: '0' })).status).toBe(200);
  const pending = (await f.login(b)).value; expect(pending.recovery.blob).toEqual(blob);
  const value = { operationId: 'recover', kind: 'recover', expectedRevision: pending.revision, recoveryRevision: '1', resources: [{ resourceId: 'resource', revision: '1', epoch: '1', packages: [f.packet(b, b)] }] };
  expect((await f.action(b, value)).status).toBe(400);
  const withProof = { ...f.signed(value, b.signer.privateKey), recoverySignature: sign(null, identitySigningBytes(value), recovery.privateKey).toString('base64') };
  expect((await f.call('/v3/identity/actions', withProof, b)).status).toBe(200);
  expect((await f.call('/v3/identity', undefined, a)).status).toBe(403); expect((await f.catalog(a)).status).toBe(401);
  expect((await f.poll(b)).value.state).toBe('active'); expect((await f.catalog(b)).value.resources[0].keyState).toBe('pending');
}));
