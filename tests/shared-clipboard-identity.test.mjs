import { test, expect } from 'bun:test';
import { generateKeyPairSync, randomBytes, createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRelay, controlSigningBytes, publicationSigningBytes } from '../scripts/shared-clipboard/relay.mjs';
import { identitySigningBytes } from '../scripts/shared-clipboard/identity.mjs';
import { canonical } from '../scripts/shared-clipboard/control.mjs';
import { syntheticOidc } from './manual/synthetic-oidc.mjs';
import { hpkeSeal, hpkeOpen, wrapServiceKey } from '../scripts/shared-clipboard/custody.mjs';
import { Database } from 'bun:sqlite';
import { backupService } from '../scripts/shared-clipboard/deploy/backup.mjs';
const raw = key => key.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const hash = value => createHash('sha256').update(value).digest();
async function fixture(run, managed = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'copicu-identity-synthetic-')), issuer = await syntheticOidc();
  const leaseSigner = generateKeyPairSync('ed25519').privateKey; let oidc, relay, fault; let at = BigInt(Date.now());
  const config = { dbPath: path.join(root, 'relay.sqlite'), environment: 'synthetic', leaseSigner, now: () => at, identity: { oidc: { authorization: p => oidc.authorization(p), authenticate: p => oidc.authenticate(p) }, faults: { beforeCommit: p => fault === `before:${p.kind}` && (fault = null, true), afterCommit: p => fault === `after:${p.kind}` && (fault = null, true) } } };
  if(managed) config.custodyKey = randomBytes(32);
  config.faults={beforeControl:p=>fault===`before-control:${p.kind}`&&(fault=null,true),afterControlCommit:p=>fault===`after-control:${p.kind}`&&(fault=null,true)};
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
  const operation = (d,value) => call('/v2/operations',{...value,signature:sign(null,controlSigningBytes(value),d.signer.privateKey).toString('base64')},d);
  const backup=async({version=config.custodyKey?2:1,custodyKey=config.custodyKey,signer=config.leaseSigner,environment=config.environment}={})=>{
    const privateDir=await mkdtemp(path.join(root,'private-')),backupDir=await mkdtemp(path.join(root,'backup-'));
    await writeFile(path.join(privateDir,'service.json'),JSON.stringify({version,environment}),{mode:0o600});
    if(custodyKey) await writeFile(path.join(privateDir,'copicu-custody.key'),custodyKey,{mode:0o600});
    await writeFile(path.join(privateDir,'copicu-issuer.pem'),signer.export({type:'pkcs8',format:'pem'}),{mode:0o600});
    await writeFile(path.join(privateDir,'oidc-client-secret'),'synthetic-only-secret',{mode:0o600});
    const receipt=await backupService(root,privateDir,backupDir);
    return {receipt,backupDir};
  };
  const restoreBackup=async()=>{
    const {receipt,backupDir}=await backup();
    expect(receipt.integrity).toBe('ok');expect(receipt.custodySecretPreserved).toBe(true);expect(receipt.storedIdentitiesVerified).toBe(true);
    await relay.stop();config.port=Number(new URL(relay.url).port);config.dbPath=path.join(backupDir,'relay.sqlite');
    config.custodyKey=await readFile(path.join(backupDir,'copicu-custody.key'));
    config.leaseSigner=createPrivateKey(await readFile(path.join(backupDir,'copicu-issuer.pem')));
    await start();
  };
  try { await run({ call, device, request, poll, login, action, catalog, create, packet, signed, issuer, operation, backup, restoreBackup, async useIssuer(provider) { oidc=await provider.adapter(relay.url+'/v3/auth/callback'); }, get database() {return config.dbPath;}, advance(ms) { at += BigInt(ms); }, fault(value) { fault = value; }, get relay() { return relay; }, async restart(key = config.custodyKey) { const url = relay.url; await relay.stop(); config.port = Number(new URL(url).port); config.custodyKey=key; await start(); } }); }
  finally { await relay.stop(); await issuer.stop(); if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('copicu-identity-synthetic-')) throw Error('cleanup boundary'); await rm(root, { recursive: true, force: true }); }
}

test('HPKE Base suite matches RFC 9180 A.1.1 and authenticates info/AAD', () => {
  const h=v=>Buffer.from(v,'hex');
  const sk=h('4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8'), pk=h('3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d');
  const ephemeral=h('52c4a758a802cd8b936eceea314432798d5baf2d7e9235dc084ab1b9cfa2f736'), info=h('4f6465206f6e2061204772656369616e2055726e'), aad=h('436f756e742d30'), pt=h('4265617574792069732074727574682c20747275746820626561757479');
  const {enc,ciphertext}=hpkeSeal(pk,info,pt,ephemeral,aad);
  expect(enc.toString('hex')).toBe('37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431');
  expect(ciphertext.toString('hex')).toBe('f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a');
  expect(hpkeOpen(sk,enc,info,ciphertext,aad)).toEqual(pt);
  expect(()=>hpkeOpen(sk,enc,Buffer.from('wrong'),ciphertext,aad)).toThrow();
  expect(()=>hpkeOpen(sk,enc,info,ciphertext,Buffer.from('wrong'))).toThrow();
});
const owner = d => ({deviceId:d.id,signingPublicKey:raw(d.signer.publicKey)});
const openPacket = (d,p) => {const {enc,ciphertext,signature,...header}=p;return hpkeOpen(d.kem.privateKey,Buffer.from(enc,'base64'),Buffer.concat([Buffer.from('Copicu.shared.key-transcript.v2\0'),Buffer.from(canonical(header))]),Buffer.from(ciphertext,'base64'));};
const custodyPacket = (d,target,key,epoch='1',rid='resource') => wrapServiceKey('synthetic',rid,epoch,key,owner(d),target,d.signer.privateKey);
test('custody recipient is issuer-signed over its environment, identity, suite and encryption key', () => fixture(async f => {
  const a=f.device('Recipient verification');await f.login(a);
  const info=(await f.call('/v3/info')).value, target=(await f.catalog(a)).value.custody;
  expect(Object.keys(target).sort()).toEqual(['deviceId','environment','kemPublicKey','signature','signingPublicKey','suite']);
  expect(target.environment).toBe(info.environment);expect(target.signingPublicKey).toBe(info.issuerPublicKey);
  const issuer=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(info.issuerPublicKey,'base64')]),type:'spki',format:'der'});
  const valid=recipient=>{const {signature,...body}=recipient;return verify(null,Buffer.concat([Buffer.from('Copicu.shared.custody-recipient.v3\0'),Buffer.from(canonical(body))]),issuer,Buffer.from(signature,'base64'));};
  expect(valid(target)).toBe(true);
  for(const field of ['environment','deviceId','signingPublicKey','kemPublicKey','suite']) expect(valid({...target,[field]:'tampered'})).toBe(false);
  expect(valid({...target,signature:randomBytes(64).toString('base64')})).toBe(false);
  await f.restart();expect((await f.catalog(a)).value.custody).toEqual(target);
},true));
test('service custody links equal PCs by account, deposits encrypted keys and supplies a later PC without approvals', () => fixture(async f => {
  const a=f.device('Work'), b=f.device('Home'), c=f.device('Later');
  const aa=await f.login(a), bb=await f.login(b); expect(aa.value.state).toBe('active'); expect(bb.value.state).toBe('active'); expect(bb.value.personId).toBe(aa.value.personId);
  const info=(await f.call('/v3/info')).value; expect(info.deviceApproval).toBe(false); expect(info.recovery).toBe(false); expect(info.keyCustody).toBe('service');
  const cat=(await f.catalog(a)).value, key=randomBytes(32), packet=custodyPacket(a,cat.custody,key);
  const input={intent_id:'managed_create',kind:'create',resource_id:'resource',metadata:{nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(48).toString('base64')},custody_packages:[packet]};
  f.fault('before-control:create'); expect((await f.operation(a,input)).status).toBe(503); expect((await f.catalog(b)).value.resources).toEqual([]);
  f.fault('after-control:create'); expect((await f.operation(a,input)).status).toBe(503); expect((await f.operation(a,input)).status).toBe(200);
  const home=(await f.catalog(b)).value; expect(openPacket(b,home.resources[0].packages[0].package)).toEqual(key);
  expect((await f.login(c)).value.state).toBe('active'); expect(openPacket(c,(await f.catalog(c)).value.resources[0].packages[0].package)).toEqual(key);
  expect((await f.action(a,{operationId:'unnecessary_approve',kind:'approve'})).status).toBe(400);
  const db=new Database(f.database,{readonly:true}); const stored=db.query('SELECT nonce,ciphertext FROM custody_keys').get(); db.close();
  expect(Buffer.from(stored.nonce)).toHaveLength(12); expect(Buffer.from(stored.ciphertext)).toHaveLength(48); expect(Buffer.from(stored.ciphertext).includes(key)).toBe(false);
  await f.restart(); expect(openPacket(c,(await f.catalog(c)).value.resources[0].packages[0].package)).toEqual(key);
  await f.restoreBackup(); expect(openPacket(c,(await f.catalog(c)).value.resources[0].packages[0].package)).toEqual(key);
  f.issuer.setSubject('synthetic-other'); const other=f.device('Other account'); await f.login(other); expect((await f.catalog(other)).value.resources).toEqual([]); expect((await f.call('/v1/channels/resource/sync?cursor=0',undefined,other)).status).toBe(403);
  expect((await f.operation(other,{intent_id:'cross_account_deposit',kind:'deposit_keys',resource_id:'resource',expected_revision:'1',custody_packages:[custodyPacket(other,cat.custody,key)]})).status).toBe(403);
},true));
test('custody migration, key conflict, tampering, retirement and vault secret mismatch fail closed', () => fixture(async f => {
  const a=f.device('Legacy owner'), b=f.device('Legacy pending'); await f.login(a); await f.create(a); await f.login(b);
  await f.restart(randomBytes(32)); expect((await f.poll(b)).value.state).toBe('active');
  const cat=(await f.catalog(a)).value, key=randomBytes(32), packet=custodyPacket(a,cat.custody,key);
  const input={intent_id:'legacy_deposit',kind:'deposit_keys',resource_id:'resource',expected_revision:cat.resources[0].revision,custody_packages:[packet]};
  const changed={...packet,ciphertext:randomBytes(48).toString('base64')}; expect((await f.operation(a,{...input,intent_id:'tampered',custody_packages:[changed]})).status).toBe(403);
  expect((await f.operation(a,input)).status).toBe(200); expect(openPacket(b,(await f.catalog(b)).value.resources[0].packages[0].package)).toEqual(key);
  expect((await f.operation(a,{...input,intent_id:'replace_key',custody_packages:[custodyPacket(a,cat.custody,randomBytes(32))]})).status).toBe(409);
  const identity=(await f.call('/v3/identity',undefined,a)).value,target=identity.devices.find(d=>d.deviceId===b.id);
  expect((await f.action(a,{operationId:'retire_home',kind:'revoke',deviceId:b.id,fingerprint:target.fingerprint,expectedRevision:identity.revision})).status).toBe(200);
  expect((await f.catalog(b)).status).toBe(401); await f.restart(); expect((await f.poll(b)).status).toBe(403);
  await expect(f.restart(randomBytes(32))).rejects.toThrow('custody_identity_mismatch');
}));
test('custody migration preserves existing legacy packages while a later PC receives the deposited key', () => fixture(async f => {
  const a=f.device('Legacy owner'),b=f.device('Legacy approved'),c=f.device('Later notebook');
  await f.login(a);await f.create(a);await f.login(b);
  const account=(await f.call('/v3/identity',undefined,a)).value,target=account.devices.find(d=>d.deviceId===b.id);
  expect((await f.action(a,{operationId:'approve_legacy_pc',kind:'approve',deviceId:b.id,fingerprint:target.fingerprint,expectedRevision:account.revision,resources:[{resourceId:'resource',revision:'1',epoch:'1',packages:[f.packet(a,b)]}]})).status).toBe(200);
  const packages=async()=>{const db=new Database(f.database,{readonly:true});try{return db.query('SELECT device,package FROM control_packages WHERE resource=? ORDER BY device').all('resource');}finally{db.close();}};
  const before=await packages();expect(before).toHaveLength(2);
  await f.restart(randomBytes(32));
  const catalog=(await f.catalog(a)).value,key=randomBytes(32);
  const input={intent_id:'deposit_preserve_legacy',kind:'deposit_keys',resource_id:'resource',expected_revision:catalog.resources[0].revision,custody_packages:[custodyPacket(a,catalog.custody,key)]};
  expect((await f.operation(a,input)).status).toBe(200);
  for(const d of [a,b]) {const current=(await f.catalog(d)).value.resources[0].packages[0].package;expect(JSON.stringify(current)).toBe(before.find(p=>p.device===d.id).package);expect(current.suite).toBeUndefined();}
  expect(await packages()).toEqual(before);
  expect((await f.login(c)).value.state).toBe('active');
  const packet=(await f.catalog(c)).value.resources[0].packages[0].package;
  expect(packet.ownerDeviceId).toBe('service_key_custody_v3');expect(openPacket(c,packet)).toEqual(key);
  await f.restart();for(const d of [a,b]) expect(JSON.stringify((await f.catalog(d)).value.resources[0].packages[0].package)).toBe(before.find(p=>p.device===d.id).package);
  expect(openPacket(c,(await f.catalog(c)).value.resources[0].packages[0].package)).toEqual(key);
}));
test('custody backup rejects missing or mismatched identity material before issuing a receipt', () => fixture(async f => {
  await expect(f.backup({version:1})).rejects.toThrow('backup_custody_secret_required');
  await expect(f.backup({custodyKey:randomBytes(32)})).rejects.toThrow('backup_custody_mismatch');
  await expect(f.backup({signer:generateKeyPairSync('ed25519').privateKey})).rejects.toThrow('backup_issuer_mismatch');
  await expect(f.backup({environment:'other_synthetic'})).rejects.toThrow('backup_environment_mismatch');
  await expect(f.backup({custodyKey:Buffer.alloc(32)})).rejects.toThrow('invalid_custody_secret');
  await expect(f.restart(null)).rejects.toThrow('custody_secret_required');
},true));
test('pre-custody backup preserves and verifies the legacy service identity', () => fixture(async f => {
  const {receipt}=await f.backup();
  expect(receipt.integrity).toBe('ok');expect(receipt.storedIdentitiesVerified).toBe(true);expect(receipt.custodySecretPreserved).toBe(false);
}));
test('managed accounts with the same subject and email stay separate across trusted OIDC issuers', () => fixture(async f => {
  const otherIssuer=await syntheticOidc();
  try {
    for(const provider of [f.issuer,otherIssuer]) provider.setClaims(c=>({...c,email:'same@synthetic.invalid',email_verified:true}));
    const a=f.device('First issuer'),aa=await f.login(a);await f.create(a);
    await f.useIssuer(otherIssuer);const b=f.device('Other issuer'),bb=await f.login(b);
    expect(bb.value.state).toBe('active');expect(bb.value.personId).not.toBe(aa.value.personId);
    expect((await f.catalog(b)).value.resources).toEqual([]);expect((await f.call('/v1/channels/resource/sync?cursor=0',undefined,b)).status).toBe(403);
    await f.useIssuer(f.issuer);const c=f.device('Original issuer again'),cc=await f.login(c);
    expect(cc.value.personId).toBe(aa.value.personId);expect((await f.catalog(c)).value.resources).toHaveLength(1);
  } finally { await otherIssuer.stop(); }
},true));
test('signed custody packets reject wrong scope, recipient and altered ciphertext without committing keys', () => fixture(async f => {
  const a=f.device('Owner');await f.login(a);const target=(await f.catalog(a)).value.custody,key=randomBytes(32);
  const valid=custodyPacket(a,target,key);
  const resign=value=>{const {signature,...packet}=value;return {...packet,signature:sign(null,Buffer.concat([Buffer.from('Copicu.shared.key-package.v2\0'),Buffer.from(canonical(packet))]),a.signer.privateKey).toString('base64')};};
  for(const [index,changes] of [
    {environment:'other_synthetic'}, {resourceId:'other_resource'}, {epoch:'2'},
    {deviceId:a.id}, {signingPublicKey:raw(a.signer.publicKey)}, {kemPublicKey:raw(a.kem.publicKey)},
    {ownerDeviceId:target.deviceId}, {ciphertext:randomBytes(48).toString('base64')},
  ].entries()) {
    const input={intent_id:`bad_custody_${index}`,kind:'create',resource_id:'resource',metadata:{nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(48).toString('base64')},custody_packages:[resign({...valid,...changes})]};
    expect((await f.operation(a,input)).status).toBe(403);expect((await f.catalog(a)).value.resources).toEqual([]);
  }
  const db=new Database(f.database,{readonly:true});try {expect(db.query('SELECT count(*) AS n FROM custody_keys').get().n).toBe(0);}finally {db.close();}
},true));
test('custody migration activates valid pending PCs while cancelled, retired and expired PCs stay denied', () => fixture(async f => {
  const a=f.device('Legacy owner'), expired=f.device('Expired pending'), retired=f.device('Retired pending'), cancelled=f.device('Cancelled pending'), pending=f.device('Valid pending');
  await f.login(a);await f.create(a);expect((await f.login(expired)).value.state).toBe('pending');
  f.advance(86400001);expect((await f.login(retired)).value.state).toBe('pending');
  const account=(await f.call('/v3/identity',undefined,a)).value,target=account.devices.find(d=>d.deviceId===retired.id);
  expect((await f.action(a,{operationId:'retire_legacy_pending',kind:'revoke',deviceId:retired.id,fingerprint:target.fingerprint,expectedRevision:account.revision})).status).toBe(200);
  expect((await f.login(cancelled)).value.state).toBe('pending');
  expect((await f.call('/v3/auth/cancel',f.signed({sessionId:cancelled.session,verifier:cancelled.verifier},cancelled.signer.privateKey))).status).toBe(200);
  expect((await f.login(pending)).value.state).toBe('pending');
  const before=(await f.catalog(a)).value.resources[0].packages;
  await f.restart(randomBytes(32));
  expect((await f.poll(pending)).value.state).toBe('active');
  expect((await f.poll(expired)).status).toBe(403);expect((await f.poll(retired)).status).toBe(403);expect((await f.poll(cancelled)).status).toBe(410);
  for(const d of [expired,retired,cancelled]) expect((await f.catalog(d)).status).toBe(401);
  const legacy=(await f.catalog(a)).value.resources[0];expect(legacy.packages).toEqual(before);expect(legacy.custodyMissingEpochs).toEqual(['1']);
  expect((await f.catalog(pending)).value.resources[0].packages).toEqual([]);
  await f.restart();expect((await f.poll(pending)).value.state).toBe('active');
  for(const d of [expired,retired,cancelled]) expect((await f.catalog(d)).status).toBe(401);
}));
test('managed custody rotates transactionally and respects invite history floors and read-only grants', () => fixture(async f => {
  const a=f.device('Owner'), b=f.device('Read-only guest'); const aa=await f.login(a); f.issuer.setSubject('synthetic-other'); const bb=await f.login(b);
  const target=(await f.catalog(a)).value.custody, key1=randomBytes(32), key2=randomBytes(32);
  const metadata=()=>({nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(48).toString('base64')});
  expect((await f.operation(a,{intent_id:'create_for_history',kind:'create',resource_id:'resource',metadata:metadata(),custody_packages:[custodyPacket(a,target,key1)]})).status).toBe(200);
  const publish=async(d,id,ordinal,epoch)=>{const p={version:1,environment:'synthetic',channel_id:'resource',publication_id:id,device_id:d.id,origin_ordinal:ordinal,key_epoch:epoch,expires_at_unix_ms:String(Date.now()+60000),freshness:{kind:'deferred'},nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(32).toString('base64')};return f.call('/v1/channels/resource/publish',{...p,signature:sign(null,publicationSigningBytes(p),d.signer.privateKey).toString('base64')},d);};
  expect((await publish(a,'before_guest','1','1')).status).toBe(200);
  const invite=await f.operation(a,{intent_id:'invite_no_history',kind:'invite',resource_id:'resource',expected_revision:'1',person_id:bb.value.personId,permission:'read',include_history:false});expect(invite.status).toBe(200);
  expect((await f.operation(b,{intent_id:'accept_no_history',kind:'accept',invitation_id:invite.value.invitationId})).status).toBe(200);
  const approve={intent_id:'approve_no_history',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invite.value.invitationId,metadata:metadata(),custody_packages:[custodyPacket(a,target,key2,'2')]};
  expect((await f.operation(a,{...approve,intent_id:'bad_epoch',custody_packages:[custodyPacket(a,target,key2,'3')]})).status).toBe(403); expect((await f.catalog(b)).value.resources).toEqual([]);
  f.fault('after-control:approve'); expect((await f.operation(a,approve)).status).toBe(503); expect((await f.operation(a,approve)).status).toBe(200);
  const guest=(await f.catalog(b)).value.resources[0]; expect(guest.permission).toBe('read'); expect(guest.historyFloor).toBe('2'); expect(guest.packages.map(p=>p.epoch)).toEqual(['2']); expect(openPacket(b,guest.packages[0].package)).toEqual(key2);
  expect((await f.call('/v2/resources/resource/history?cursor=0',undefined,b)).value.entries).toEqual([]); expect((await publish(b,'denied_guest','1','2')).status).toBe(403);
  expect((await publish(a,'after_guest','2','2')).status).toBe(200); expect((await f.call('/v2/resources/resource/history?cursor=0',undefined,b)).value.entries.map(e=>e.envelope.publication_id)).toEqual(['after_guest']);
  const own=(await f.catalog(a)).value.resources[0]; expect(own.packages.map(p=>p.epoch)).toEqual(['1','2']);
  expect(own.publisherKeys.some(p=>p.deviceId==='service_key_custody_v3')).toBe(false);
  expect(aa.value.personId).not.toBe(bb.value.personId);
},true));

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
