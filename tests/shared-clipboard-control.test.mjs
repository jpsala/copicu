import {test,expect} from 'bun:test';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRelay,controlSigningBytes,publicationSigningBytes} from '../scripts/shared-clipboard/relay.mjs';
import {canonical} from '../scripts/shared-clipboard/control.mjs';

async function fixture(run,options={}){
 const root=await mkdtemp(path.join(tmpdir(),'copicu-control-synthetic-'));
 const raw=k=>k.export({type:'spki',format:'der'}).subarray(-32).toString('base64');
 const identities=['owner','owner-laptop','reader'].map(id=>({id,token:randomBytes(32).toString('hex'),signer:generateKeyPairSync('ed25519'),kem:generateKeyPairSync('x25519')}));
 const config={dbPath:path.join(root,'relay.sqlite'),environment:'synthetic',persons:[{id:'alice',name:'Synthetic Alice'},{id:'bob',name:'Synthetic Bob'}],devices:identities.map(d=>({id:d.id,person_id:d.id==='reader'?'bob':'alice',token:d.token,public_key:raw(d.signer.publicKey)})),leaseSigner:generateKeyPairSync('ed25519').privateKey,...options};
 let relay=createRelay(config);
 const call=async(route,value,who='owner')=>{const d=identities.find(d=>d.id===who);const response=await fetch(relay.url+route,{method:value===undefined?'GET':'POST',headers:{authorization:`Bearer ${d.token}`,'content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});return{status:response.status,value:await response.json()};};
 const intent=(value,who='owner')=>({...value,signature:sign(null,controlSigningBytes(value),identities.find(d=>d.id===who).signer.privateKey).toString('base64')});
 const op=(value,who)=>call('/v2/operations',intent(value,who),who);
 const metadata=()=>({nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(32).toString('base64')});
 const packet=(deviceId,epoch='1')=>{const d=identities.find(d=>d.id===deviceId);const p={environment:'synthetic',resourceId:'resource',epoch,ownerDeviceId:'owner',ownerSigningPublicKey:raw(identities[0].signer.publicKey),deviceId,signingPublicKey:raw(d.signer.publicKey),kemPublicKey:raw(d.kem.publicKey),enc:randomBytes(32).toString('base64'),ciphertext:randomBytes(48).toString('base64')};return{...p,signature:sign(null,Buffer.concat([Buffer.from('Copicu.shared.key-package.v2\0'),Buffer.from(canonical(p))]),identities[0].signer.privateKey).toString('base64')};};
 const publication=(id,ordinal,epoch='1',who='owner')=>{const p={version:1,environment:'synthetic',channel_id:'resource',publication_id:id,device_id:who,origin_ordinal:ordinal,key_epoch:epoch,expires_at_unix_ms:String(Date.now()+60000),freshness:{kind:'deferred'},nonce:randomBytes(24).toString('base64'),ciphertext:randomBytes(32).toString('base64')};return{...p,signature:sign(null,publicationSigningBytes(p),identities.find(d=>d.id===who).signer.privateKey).toString('base64')};};
 try {
  for(const d of identities) expect((await op({intent_id:'register',kind:'register_device_key',kem_public_key:raw(d.kem.publicKey)},d.id)).status).toBe(200);
  const openStream=(mark,who='owner',extra={})=>fetch(`${relay.url}/v2/events?generation=${mark.generation}&personId=${mark.personId}&cursor=${mark.cursor}`,{headers:{authorization:`Bearer ${identities.find(d=>d.id===who).token}`},...extra});
  await run({call,op,intent,metadata,packet,publication,config,openStream,get relay(){return relay;},async restart(){await relay.stop();relay=createRelay(config);}});
 }finally{await relay.stop();if(path.dirname(root)!==path.resolve(tmpdir())||!path.basename(root).startsWith('copicu-control-synthetic-'))throw Error('cleanup boundary');await rm(root,{recursive:true,force:true});}
}
const create=f=>f.op({intent_id:'create',kind:'create',resource_id:'resource',metadata:f.metadata()});
function frames(response) {
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 return {reader,async next(){
  const expires=Date.now()+5000;
  while(Date.now()<expires){
   const boundary=buffer.indexOf('\n\n');
   if(boundary>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=frame.split('\n').find(line=>line.startsWith('data: '));if(data)return JSON.parse(data.slice(6));continue;}
   let timer;try{const chunk=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SSE timeout')),5000);})]);if(chunk.done)return null;buffer+=decoder.decode(chunk.value,{stream:true});}finally{clearTimeout(timer);}
  }throw Error('SSE deadline');
 }};
}
async function invite(f,history=true){expect((await create(f)).status).toBe(200);const i=await f.op({intent_id:'invite',kind:'invite',resource_id:'resource',expected_revision:'1',person_id:'bob',permission:'read',include_history:history});expect(i.status).toBe(200);expect((await f.op({intent_id:'accept',kind:'accept',invitation_id:i.value.invitationId},'reader')).status).toBe(200);return i.value.invitationId;}

test('publication hints are transactional and a lost HTTP response/retry emits only one durable hint',()=>{
 let rollback=true,loseResponse=false;
 return fixture(async f=>{
  expect((await create(f)).status).toBe(200);
  const mark=(await f.call('/v2/catalog')).value.control;
  const page=async()=>(await f.call(`/v2/changes?generation=${mark.generation}&personId=${mark.personId}&cursor=${mark.cursor}`)).value;
  const packet=f.publication('synthetic-atomic-publication','1');
  expect((await f.call('/v1/channels/resource/publish',packet)).status).toBe(503);
  expect((await page()).events).toEqual([]);
  expect((await f.call('/v1/channels/resource/sync?cursor=0')).value.head).toBe('0');
  rollback=false;loseResponse=true;
  expect((await f.call('/v1/channels/resource/publish',packet)).status).toBe(503);
  const committed=await page();expect(committed.events).toHaveLength(1);
  expect(committed.events[0]).toEqual({version:1,type:'publication_head_changed',resourceId:'resource',head:'1',cursor:committed.head});
  loseResponse=false;await f.restart();
  const retry=await f.call('/v1/channels/resource/publish',packet);expect(retry.status).toBe(200);expect(retry.value.server_sequence).toBe('1');
  expect(await page()).toEqual(committed);
  expect((await f.call('/v1/channels/resource/sync?cursor=0')).value.entries).toHaveLength(1);
 },{faults:{beforePublishCommit:()=>rollback,afterPublishCommit:()=>loseResponse}});
});

test('publication SSE reaches current readers only, burst replay stays minimal and revoke removes old heads',()=>fixture(async f=>{
 const invitation=await invite(f);
 const pending=(await f.call('/v2/catalog',undefined,'reader')).value.control;
 expect((await f.call('/v1/channels/resource/publish',f.publication('pending-reader','1'))).status).toBe(200);
 expect((await f.call('/v2/catalog',undefined,'reader')).value.control.cursor).toBe(pending.cursor);
 expect((await f.op({intent_id:'approve',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invitation,packages:['owner','owner-laptop','reader'].map(d=>f.packet(d))})).status).toBe(200);
 const mark=(await f.call('/v2/catalog',undefined,'reader')).value.control;
 const feed=frames(await f.openStream(mark,'reader'));
 try {
  const packet=f.publication('synthetic-live-publication','2');
  expect((await f.call('/v1/channels/resource/publish',packet)).status).toBe(200);
  const live=await feed.next();expect(live.type).toBe('publication_head_changed');expect(live.head).toBe('2');
  expect(Object.keys(live).sort()).toEqual(['version','type','resourceId','head','cursor'].sort());
  expect((await f.call('/v1/channels/resource/publish',packet)).status).toBe(200);
  expect((await f.call('/v2/catalog',undefined,'reader')).value.control.cursor).toBe(live.cursor);
  for(let ordinal=3;ordinal<=22;ordinal++)expect((await f.call('/v1/channels/resource/publish',f.publication(`synthetic-burst-${ordinal}`,String(ordinal)))).status).toBe(200);
  const page=(await f.call(`/v2/changes?generation=${mark.generation}&personId=${mark.personId}&cursor=${mark.cursor}`,undefined,'reader')).value;
  expect(page.events).toHaveLength(21);expect(page.events.at(-1).head).toBe('22');
  expect(page.events.every(e=>e.type==='publication_head_changed'&&Object.keys(e).length===5)).toBe(true);
  const denied=f.publication('synthetic-denied-reader','1','1','reader');
  expect((await f.call('/v1/channels/resource/publish',denied,'reader')).status).toBe(403);
  expect((await f.call('/v2/catalog',undefined,'reader')).value.control.cursor).toBe(page.head);
  expect((await f.op({intent_id:'revoke',kind:'revoke',resource_id:'resource',expected_revision:'3',person_id:'bob'})).status).toBe(200);
  const replay=(await f.call(`/v2/changes?generation=${mark.generation}&personId=${mark.personId}&cursor=${mark.cursor}`,undefined,'reader')).value.events;
  expect(replay).toHaveLength(22);expect(replay.every(e=>e.type==='resource_removed'&&Object.keys(e).length===4)).toBe(true);
 } finally { await feed.reader.cancel(); }
}));

test('real HTTP snapshot -> subscribe replay -> live, isolation, idempotency and restart',()=>fixture(async f=>{
 const owner=(await f.call('/v2/catalog')).value.control;
 const stranger=(await f.call('/v2/catalog',undefined,'reader')).value.control;
 const input={intent_id:'sse_create',kind:'create',resource_id:'resource',metadata:f.metadata()};
 expect((await f.op(input)).status).toBe(200);
 const response=await f.openStream(owner);expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('text/event-stream');
 const feed=frames(response);
 try{
  const replay=await feed.next();expect(replay.type).toBe('catalog_changed');expect(replay.operationId).toBe('sse_create');expect(replay.resourceId).toBe('resource');
  const bob=await f.call(`/v2/changes?generation=${stranger.generation}&personId=${stranger.personId}&cursor=${stranger.cursor}`,undefined,'reader');expect(bob.value.events).toEqual([]);
  expect((await f.call(`/v2/changes?generation=${owner.generation}&personId=${owner.personId}&cursor=${owner.cursor}`,undefined,'reader')).status).toBe(400);
  const sibling=(await f.call('/v2/catalog',undefined,'owner-laptop')).value.control;expect(sibling.cursor).toBe(replay.cursor);
  const rename={intent_id:'sse_rename',kind:'rename',resource_id:'resource',expected_revision:'1',metadata:f.metadata()};
  expect((await f.op(rename)).status).toBe(200);const live=await feed.next();expect(live.revision).toBe('2');
  expect((await f.op(rename)).status).toBe(200);expect((await f.call('/v2/catalog')).value.control.cursor).toBe(live.cursor);
  expect((await f.op({...rename,intent_id:'conflict'})).status).toBe(409);expect((await f.call('/v2/catalog')).value.control.cursor).toBe(live.cursor);
  const text=JSON.stringify(live);expect(text).not.toContain('ciphertext');expect(text).not.toContain('Synthetic');
 }finally{await feed.reader.cancel();}
 await f.restart();const restarted=(await f.call('/v2/catalog')).value.control;expect(restarted.generation).toBe(owner.generation);
 const page=(await f.call(`/v2/changes?generation=${owner.generation}&personId=${owner.personId}&cursor=${owner.cursor}&limit=1`)).value;
 expect(page.events).toHaveLength(1);expect(BigInt(page.next)).toBeLessThan(BigInt(page.head));
}));

test('invitation/acceptance audiences and revoke closes an already open stream',()=>fixture(async f=>{
 const bob=(await f.call('/v2/catalog',undefined,'reader')).value.control;
 const invitation=await invite(f);
 const hints=(await f.call(`/v2/changes?generation=${bob.generation}&personId=${bob.personId}&cursor=${bob.cursor}`,undefined,'reader')).value.events;
 expect(hints).toHaveLength(2);expect(hints.every(e=>e.resourceId==='resource')).toBe(true);
 const owner=(await f.call('/v2/catalog')).value.control;
 const feed=frames(await f.openStream(owner));
 f.relay.revokeDevice('owner');expect(await feed.next()).toBeNull();
 expect((await f.openStream(owner)).status).toBe(401);
 expect(invitation).toBeTruthy();
}));

test('identity isolated catalog, transactional CRUD, lost response/restart and immutable intent digest',()=>{let drop=true;return fixture(async f=>{
 const first={intent_id:'create',kind:'create',resource_id:'resource',metadata:f.metadata()};
 const a=await f.op(first);expect(a.status).toBe(503);
 drop=false;await f.restart();const retry=await f.op(first);expect(retry.value.resource.revision).toBe('1');expect(retry.status).toBe(200);
 expect((await f.op({...first,metadata:f.metadata()})).status).toBe(409);
 expect((await f.call('/v2/catalog',undefined,'reader')).value.resources).toHaveLength(0);
 const owner=await f.call('/v2/catalog');expect(owner.value.person.id).toBe('alice');expect(owner.value.resources).toHaveLength(1);expect(owner.value.operations.some(o=>o.operationId==='create'&&o.kind==='create')).toBe(true);
 const rename=await f.op({intent_id:'rename',kind:'rename',resource_id:'resource',expected_revision:'1',metadata:f.metadata()});expect(rename.status).toBe(200);expect(rename.value.resource.revision).toBe('2');
 expect((await f.op({intent_id:'stale',kind:'delete',resource_id:'resource',expected_revision:'1'})).status).toBe(409);
 expect((await f.op({intent_id:'delete',kind:'delete',resource_id:'resource',expected_revision:'2'})).status).toBe(200);
 expect((await f.call('/v1/channels/resource/lease',{})).status).toBe(403);
 expect((await f.call('/v2/resources/resource/history')).status).toBe(403);
 expect((await f.call('/v2/catalog')).value.resources).toHaveLength(0);
},{faults:{afterControlCommit:r=>r.kind==='create'&&drop}});});

test('invitation acceptance grants nothing until complete signed packages, reader cannot publish, history is separate',()=>fixture(async f=>{
 const invitation=await invite(f,true);
 expect((await f.call('/v2/resources/resource/history',undefined,'reader')).status).toBe(403);
 expect((await f.call('/v1/channels/resource/publish',f.publication('before','1'))).status).toBe(200);
 const approve={intent_id:'approve',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invitation};
 expect((await f.op(approve)).status).toBe(400);
 expect((await f.op({...approve,packages:[f.packet('owner'),f.packet('reader')]})).status).toBe(409);
 const complete={...approve,packages:['owner','owner-laptop','reader'].map(d=>f.packet(d))};
 expect((await f.op(complete)).status).toBe(200);expect((await f.op(complete)).status).toBe(200);
 expect((await f.call('/v1/channels/resource/publish',f.publication('denied','1','1','reader'),'reader')).status).toBe(403);
 const history=await f.call('/v2/resources/resource/history?cursor=0',undefined,'reader');expect(history.value.entries).toHaveLength(1);expect(history.value.entries[0].envelope.publication_id).toBe('before');
 expect((await f.call('/v2/resources/resource/history/before',undefined,'reader')).value.entry.envelope.publication_id).toBe('before');
 expect((await f.call('/v2/catalog',undefined,'reader')).value.resources[0].permission).toBe('read');
 expect((await f.op({intent_id:'no-admin',kind:'delete',resource_id:'resource',expected_revision:'3'},'reader')).status).toBe(403);
 await f.restart();expect((await f.call('/v2/resources/resource/history?cursor=0',undefined,'reader')).value.entries).toHaveLength(1);
}));

test('no-history approval rotates, both V1 sync and V2 history enforce floor; revocation closes all data paths',()=>fixture(async f=>{
 const invitation=await invite(f,false);expect((await f.call('/v1/channels/resource/publish',f.publication('old','1'))).status).toBe(200);
 const approve={intent_id:'approve',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invitation,metadata:f.metadata(),packages:['owner','owner-laptop','reader'].map(d=>f.packet(d,'2'))};
 expect((await f.op(approve)).status).toBe(200);
 expect((await f.call('/v2/resources/resource/history/old',undefined,'reader')).value.entry).toBeNull();
 expect((await f.call('/v1/channels/resource/sync?cursor=0',undefined,'reader')).value.entries).toHaveLength(0);
 expect((await f.call('/v1/channels/resource/publish',f.publication('new','2','2'))).status).toBe(200);
 expect((await f.call('/v2/resources/resource/history?cursor=0',undefined,'reader')).value.entries[0].envelope.publication_id).toBe('new');
 expect((await f.op({intent_id:'revoke',kind:'revoke',resource_id:'resource',expected_revision:'3',person_id:'bob'})).value.resource.keyState).toBe('pending');
 expect((await f.call('/v1/channels/resource/publish',f.publication('blocked','3','2'))).status).toBe(403);
 expect((await f.call('/v1/channels/resource/lease',{})).status).toBe(403);
 expect((await f.call('/v2/resources/resource/history/new',undefined,'reader')).status).toBe(403);
 expect((await f.call('/v2/catalog',undefined,'reader')).value.resources).toHaveLength(0);
 const current=(await f.call('/v2/catalog')).value.resources[0];expect(current.publisherKeys.some(k=>k.deviceId==='owner')).toBe(true);
 const rotate={intent_id:'rotate',kind:'rotate',resource_id:'resource',expected_revision:'4',metadata:f.metadata(),packages:['owner','owner-laptop'].map(d=>f.packet(d,'3'))};expect((await f.op(rotate)).status).toBe(200);
 expect((await f.call('/v1/channels/resource/publish',f.publication('after-rotation','3','3'))).status).toBe(200);
}));

test('exit differs from deletion and owner cannot leave; forged packet identity rolls back grants',()=>fixture(async f=>{
 const invitation=await invite(f,true);const packets=['owner','owner-laptop','reader'].map(d=>f.packet(d));packets[2].kemPublicKey=randomBytes(32).toString('base64');
 expect((await f.op({intent_id:'forged',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invitation,packages:packets})).status).toBe(403);
 expect((await f.call('/v2/resources/resource/history',undefined,'reader')).status).toBe(403);
 expect((await f.op({intent_id:'approved',kind:'approve',resource_id:'resource',expected_revision:'2',invitation_id:invitation,packages:['owner','owner-laptop','reader'].map(d=>f.packet(d))})).status).toBe(200);
 expect((await f.op({intent_id:'leave',kind:'leave',resource_id:'resource',expected_revision:'3'},'reader')).value.left).toBe(true);
 expect((await f.call('/v2/catalog')).value.resources).toHaveLength(1);
 expect((await f.op({intent_id:'owner-leave',kind:'leave',resource_id:'resource',expected_revision:'4'})).status).toBe(409);
}));
