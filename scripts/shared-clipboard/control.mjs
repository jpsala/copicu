// V2 control plane for explicitly provisioned synthetic people. The HTTP client
// cannot create/select its identity. Resource labels and key packages are opaque.
import { createHash, randomBytes, verify } from 'node:crypto';
import { createEvents } from './events.mjs';
import { createCustody } from './custody.mjs';

export const CONTROL_DOMAIN = Buffer.from('Copicu.shared.control.v2\0');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function controlSigningBytes(value) {
  const { signature, ...intent } = value;
  return Buffer.concat([CONTROL_DOMAIN, Buffer.from(canonical(intent))]);
}
export function createControl({ query, transaction, environment, persons, devices, channels, deny, opaque, counter, be64, from64, base64, publicKey, clock, notify, limits, maxBody, managedIdentity = false, custodyKey = null, leaseSigner }) {
  query(`CREATE TABLE IF NOT EXISTS control_people(id TEXT PRIMARY KEY,name TEXT NOT NULL) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_devices(device TEXT PRIMARY KEY REFERENCES relay_devices(id),person TEXT NOT NULL REFERENCES control_people(id),kem BLOB) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_resources(id TEXT PRIMARY KEY REFERENCES relay_channels(id),owner TEXT NOT NULL REFERENCES control_people(id),metadata TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,rotation_pending INTEGER NOT NULL DEFAULT 0) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_members(resource TEXT NOT NULL REFERENCES control_resources(id),person TEXT NOT NULL REFERENCES control_people(id),permission TEXT NOT NULL,history_floor BLOB NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(resource,person)) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_invites(id TEXT PRIMARY KEY,resource TEXT NOT NULL,person TEXT NOT NULL,permission TEXT NOT NULL,include_history INTEGER NOT NULL,state TEXT NOT NULL,expires BLOB NOT NULL) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_intents(device TEXT NOT NULL,id TEXT NOT NULL,digest BLOB NOT NULL,result TEXT NOT NULL,PRIMARY KEY(device,id)) STRICT`).run();
  query(`CREATE TABLE IF NOT EXISTS control_packages(resource TEXT NOT NULL,device TEXT NOT NULL,epoch BLOB NOT NULL,package TEXT NOT NULL,PRIMARY KEY(resource,device,epoch)) STRICT`).run();
  if(!custodyKey && query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='custody_identity'").get()) throw Error('custody_secret_required');
  const custody = custodyKey ? createCustody({query,environment,rootKey:custodyKey,signer:leaseSigner,deny,base64,publicKey,be64,from64}) : null;
  transaction(() => {
    for (const p of persons) {
      opaque(p.id);
      if (typeof p.name !== 'string' || p.name.length < 1 || p.name.length > 120) throw new Error('invalid synthetic person');
      const old = query('SELECT name FROM control_people WHERE id=?').get(p.id);
      if (old && old.name !== p.name) throw new Error('provisioned person mismatch');
      query('INSERT OR IGNORE INTO control_people VALUES (?,?)').run(p.id, p.name);
    }
    for (const d of devices) if (d.person_id !== undefined) {
      opaque(d.person_id);
      const old = query('SELECT person FROM control_devices WHERE device=?').get(d.id);
      if (old && old.person !== d.person_id) throw new Error('provisioned device person mismatch');
      query('INSERT OR IGNORE INTO control_devices(device,person) VALUES (?,?)').run(d.id,d.person_id);
    }
    for (const c of channels) if (c.owner_person_id !== undefined) {
      opaque(c.owner_person_id);
      query('INSERT OR IGNORE INTO control_resources(id,owner,metadata,revision) VALUES (?,?,?,1)').run(c.id,c.owner_person_id,JSON.stringify(c.metadata ?? null));
      query('INSERT OR IGNORE INTO control_members VALUES (?,?,?, ?,0)').run(c.id,c.owner_person_id,'owner',be64(1n));
      for (const d of devices) for (const g of d.grants ?? []) if (g.channel_id === c.id && d.person_id && d.person_id !== c.owner_person_id) {
        query('INSERT OR IGNORE INTO control_members VALUES (?,?,?,?,0)').run(c.id,d.person_id,g.publish ? 'write' : 'read',be64(1n));
      }
    }
  })();
  function identity(device) {
    const p = query('SELECT p.id,p.name FROM control_devices d JOIN control_people p ON p.id=d.person WHERE d.device=?').get(device);
    if (!p) deny(403,'identity_not_provisioned');
    return p;
  }
  function member(device,resource) {
    const p=identity(device);
    const row=query('SELECT r.*,m.permission,m.history_floor,m.revoked,c.key_epoch,c.head FROM control_resources r JOIN control_members m ON m.resource=r.id JOIN relay_channels c ON c.id=r.id WHERE r.id=? AND m.person=?').get(resource,p.id);
    if (!row || row.deleted || row.revoked) deny(403,'forbidden');
    return {...row,person:p.id};
  }
  const events = createEvents({ query, transaction, environment, identity, deny, counter, be64, from64, clock, maxEvents: limits.controlEventsPerPerson });
  function authorize(device,resource,permission) {
    if (!query('SELECT 1 FROM control_resources WHERE id=?').get(resource)) return null; // Existing V1 fixture, not an account bypass.
    const m=member(device,resource);
    if (permission==='publish' && (m.permission==='read' || m.rotation_pending)) deny(403,m.rotation_pending?'rotation_required':'forbidden');
    return m;
  }
  function resourceView(device,id) {
    const row=member(device,id);
    const allowedEpochs = [from64(row.key_epoch), ...query('SELECT DISTINCT json_extract(envelope,\'$.key_epoch\') AS epoch FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>? AND sequence>=?').all(id,be64(clock()),row.history_floor).map(r=>counter(r.epoch))];
    custody?.materialize(device,id,new Set(allowedEpochs));
    const owner=query('SELECT name FROM control_people WHERE id=?').get(row.owner);
    const participants=query('SELECT m.person AS id,p.name,m.permission,m.revoked FROM control_members m JOIN control_people p ON p.id=m.person WHERE m.resource=? ORDER BY m.person').all(id);
    const invites=row.permission==='owner' ? query('SELECT id,person AS personId,permission,include_history AS includeHistory,state FROM control_invites WHERE resource=? ORDER BY id').all(id) : [];
    const publisherKeys=query('SELECT DISTINCT d.id AS deviceId,d.public_key AS key,(m.revoked=0 AND m.permission IN (\'owner\',\'write\') AND d.revoked=0) AS authorized FROM relay_devices d JOIN control_devices cd ON cd.device=d.id JOIN control_members m ON m.person=cd.person WHERE m.resource=? AND (m.permission IN (\'owner\',\'write\') OR d.id IN (SELECT device FROM relay_publications WHERE channel=?))').all(id,id).map(d=>({deviceId:d.deviceId,publicKey:Buffer.from(d.key).toString('base64'),authorized:!!d.authorized}));
    const packages=query('SELECT epoch,package FROM control_packages WHERE resource=? AND device=? ORDER BY epoch').all(id,device).filter(p=>!custody||allowedEpochs.includes(from64(p.epoch))).map(p=>({epoch:from64(p.epoch).toString(),package:JSON.parse(p.package)}));
    const retainedEpochs=query('SELECT DISTINCT json_extract(envelope,\'$.key_epoch\') AS epoch FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>?').all(id,be64(clock())).map(r=>r.epoch);
    const custodyMissingEpochs = custody ? [...new Set(allowedEpochs)].filter(e=>!custody.has(id,e)).map(String) : [];
    return {id,ownerId:row.owner,ownerName:owner.name,permission:row.permission,revision:String(row.revision),audienceRevision:String(row.revision),keyEpoch:from64(row.key_epoch).toString(),head:from64(row.head).toString(),historyFloor:from64(row.history_floor).toString(),metadata:JSON.parse(row.metadata),keyState:row.rotation_pending?'pending':'ready',retentionHours:24,participants,invites,publisherKeys,packages,retainedEpochs,...(custody?{custodyMissingEpochs}:{})};
  }
  function catalog(device) { return transaction(() => catalogSnapshot(device))(); }
  function catalogSnapshot(device) {
    const p=identity(device);
    const rows=query('SELECT r.id FROM control_resources r JOIN control_members m ON m.resource=r.id WHERE m.person=? AND m.revoked=0 AND r.deleted=0 ORDER BY r.id').all(p.id);
    const invitations=query('SELECT i.id,i.resource AS resourceId,i.permission,i.include_history AS includeHistory,i.state,r.owner AS ownerId,p.name AS ownerName FROM control_invites i JOIN control_resources r ON r.id=i.resource JOIN control_people p ON p.id=r.owner WHERE i.person=? AND i.state IN (\'open\',\'accepted\') AND i.expires>? AND r.deleted=0').all(p.id,be64(clock()));
    const related = managedIdentity ? new Set([p.id, ...query('SELECT DISTINCT m.person FROM control_members m JOIN control_members own ON own.resource=m.resource WHERE own.person=? AND own.revoked=0 AND m.revoked=0 UNION SELECT person FROM control_invites WHERE resource IN (SELECT resource FROM control_members WHERE person=? AND permission=\'owner\' AND revoked=0) AND state IN (\'open\',\'accepted\') AND expires>?').all(p.id,p.id,be64(clock())).map(row=>row.person)]) : null;
    const devices=query('SELECT cd.device AS deviceId,cd.person AS personId,d.public_key,cd.kem,d.revoked FROM control_devices cd JOIN relay_devices d ON d.id=cd.device ORDER BY cd.device').all().filter(d=>!related||related.has(d.personId)).map(d=>({deviceId:d.deviceId,personId:d.personId,signingPublicKey:Buffer.from(d.public_key).toString('base64'),kemPublicKey:d.kem?Buffer.from(d.kem).toString('base64'):null,revoked:!!d.revoked}));
    if(custody) devices.push({...custody.recipient,personId:null,revoked:false,serviceCustody:true});
    const operations=query('SELECT id,result FROM control_intents WHERE device=? ORDER BY id').all(device).map(r=>{const result=JSON.parse(r.result);return {operationId:r.id,resourceId:result.resource?.id??result.resourceId??null,kind:result.kind??(result.registered?'register_device_key':'unknown'),status:'committed'};});
    return {person:p,mode:managedIdentity?'private':'synthetic',resources:rows.map(r=>resourceView(device,r.id)),invitations,people:query('SELECT id,name FROM control_people ORDER BY id').all().filter(row=>!related||related.has(row.id)),devices,operations,control:events.watermark(device),...(custody?{keyCustody:'service',custody: custody.recipient}:{})};
  }
  function metadata(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length!==2) deny(400,'invalid_metadata');
    base64(value.nonce,24); base64(value.ciphertext,17,2048);
    return JSON.stringify(value);
  }
  function installGrants(resource,person,permission,epoch) {
    for (const d of query('SELECT device FROM control_devices JOIN relay_devices ON id=device WHERE person=? AND revoked=0').all(person)) {
      if(!query('SELECT 1 FROM relay_grants WHERE device=? AND channel=?').get(d.device,resource) && query('SELECT count(*) AS n FROM relay_grants').get().n>=limits.grants) deny(429,'grant_capacity');
      query('INSERT INTO relay_grants VALUES (?,?,?,?,?,1) ON CONFLICT(device,channel) DO UPDATE SET key_epoch=excluded.key_epoch,can_publish=excluded.can_publish,can_read=excluded.can_read,can_report=excluded.can_report').run(d.device,resource,epoch,permission==='read'?0:1,1);
    }
  }
  // A package is authenticated ciphertext bound to a provisioned recipient KEM.
  // Payload never contains a clear channel key. Cryptographic opening/approval is
  // a host operation; the relay checks signatures, completeness and scope only.
  function packages(ownerDevice,resource,epoch,values,people,targets=null) {
    if (!Array.isArray(values) || values.length>256) deny(400,'invalid_packages');
    const required=targets??query('SELECT cd.device,cd.kem FROM control_devices cd JOIN relay_devices d ON d.id=cd.device WHERE d.revoked=0').all().filter(d=>people.includes(identity(d.device).id));
    if (values.length !== required.length) deny(409,'key_packages_required');
    const seen=new Set();
    for (const p of values) {
      const target=required.find(d=>d.device===p.deviceId);
      if (!target || seen.has(p.deviceId) || !target.kem) deny(409,'device_key_required');
      seen.add(p.deviceId);
      const signerRow=query('SELECT public_key FROM relay_devices WHERE id=?').get(ownerDevice);
      const targetRow=query('SELECT public_key FROM relay_devices WHERE id=?').get(p.deviceId);
      if (Object.keys(p).sort().join(',')!==['environment','resourceId','epoch','ownerDeviceId','ownerSigningPublicKey','deviceId','signingPublicKey','kemPublicKey','enc','ciphertext','signature'].sort().join(',') || p.environment!==environment || p.resourceId!==resource || p.epoch!==epoch.toString() || p.ownerDeviceId!==ownerDevice || p.kemPublicKey!==Buffer.from(target.kem).toString('base64') || p.ownerSigningPublicKey!==Buffer.from(signerRow.public_key).toString('base64') || p.signingPublicKey!==Buffer.from(targetRow.public_key).toString('base64')) deny(403,'package_scope');
      base64(p.enc,32); base64(p.ciphertext,48,4096); base64(p.signature,64);
      const {signature,...payload}=p;
      const raw=query('SELECT public_key FROM relay_devices WHERE id=?').get(ownerDevice).public_key;
      if(!verify(null,Buffer.concat([Buffer.from('Copicu.shared.key-package.v2\0'),Buffer.from(canonical(payload))]),publicKey(raw),base64(signature,64))) deny(403,'invalid_package_signature');
      query('INSERT OR REPLACE INTO control_packages VALUES (?,?,?,?)').run(resource,p.deviceId,be64(epoch),JSON.stringify(p));
    }
  }
  function operation(device,input) {
    const person=identity(device);
    if (!input || typeof input!=='object' || Array.isArray(input)) deny(400,'invalid_intent');
    const allowed=['intent_id','kind','resource_id','expected_revision','metadata','person_id','permission','include_history','invitation_id','packages','history_packages','kem_public_key','custody_packages','signature'];
    if(Object.keys(input).some(k=>!allowed.includes(k))) deny(400,'invalid_fields');
    opaque(input.intent_id); opaque(input.kind);
    const bytes=controlSigningBytes(input), digest=createHash('sha256').update(bytes).digest();
    const raw=query('SELECT public_key FROM relay_devices WHERE id=?').get(device).public_key;
    if (!verify(null,bytes,publicKey(raw),base64(input.signature,64))) deny(403,'invalid_signature');
    const result=transaction(()=>{
      const old=query('SELECT digest,result FROM control_intents WHERE device=? AND id=?').get(device,input.intent_id);
      if(old) {if(!Buffer.from(old.digest).equals(digest)) deny(409,'intent_conflict'); return JSON.parse(old.result);}
      if(query('SELECT count(*) AS n FROM control_intents WHERE device=?').get(device).n>=limits.reportsPerChannel) deny(429,'intent_capacity');
      const resource = input.kind === 'accept' ? query('SELECT resource FROM control_invites WHERE id=?').get(input.invitation_id)?.resource : input.resource_id;
      const before = resource ? events.audience(resource) : new Set();
      let out;
      if(input.kind==='register_device_key') {
        const kem=base64(input.kem_public_key,32); if(kem.equals(Buffer.alloc(32))) deny(400,'invalid_device_key');
        const previous=query('SELECT kem FROM control_devices WHERE device=?').get(device).kem;
        if(previous && !Buffer.from(previous).equals(kem)) deny(409,'device_key_conflict');
        query('UPDATE control_devices SET kem=? WHERE device=?').run(kem,device); out={registered:true};
      } else if(input.kind==='create') {
        const id=opaque(input.resource_id), encoded=metadata(input.metadata);
        if(query('SELECT 1 FROM relay_channels WHERE id=?').get(id)) deny(409,'resource_conflict');
        if(query('SELECT count(*) AS n FROM control_resources WHERE owner=? AND deleted=0').get(person.id).n>=128) deny(429,'resource_capacity');
        query('INSERT INTO relay_channels VALUES (?,?,?)').run(id,be64(1n),be64(0n));
        query('INSERT INTO control_resources(id,owner,metadata,revision) VALUES (?,?,?,1)').run(id,person.id,encoded);
        query('INSERT INTO control_members VALUES (?,?,?,?,0)').run(id,person.id,'owner',be64(1n));
        // Only the creating device possesses the fresh key. Sibling devices stay
        // unauthorized until an authenticated encrypted key package is approved.
        if(query('SELECT count(*) AS n FROM relay_grants').get().n>=limits.grants) deny(429,'grant_capacity');
        query('INSERT INTO relay_grants VALUES (?,?,?,?,?,1)').run(device,id,be64(1n),1,1);
        if (custody && input.custody_packages) {
          depositKeys(device,id,1n,input.custody_packages,[1n]);
          installGrants(id,person.id,'owner',be64(1n));
        } else if (managedIdentity || input.packages) {
          packages(device,id,1n,input.packages,[person.id]);
          installGrants(id,person.id,'owner',be64(1n));
        }
        out={resource:resourceView(device,id)};
      } else if(input.kind==='accept') {
        const i=query('SELECT * FROM control_invites WHERE id=?').get(opaque(input.invitation_id));
        if(!i || i.person!==person.id || i.state!=='open' || from64(i.expires)<=clock()) deny(403,'invitation_unavailable');
        const r=query('SELECT deleted FROM control_resources WHERE id=?').get(i.resource);
        if(!r || r.deleted) deny(403,'invitation_unavailable');
        query('UPDATE control_invites SET state=\'accepted\' WHERE id=?').run(i.id); out={invitationId:i.id,state:'accepted'};
      } else {
        const id=opaque(input.resource_id), m=member(device,id);
        const revision=counter(input.expected_revision);
        if(revision!==BigInt(m.revision)) deny(409,'revision_conflict');
        if(input.kind==='deposit_keys') {
          if(!custody || m.permission!=='owner') deny(403,'owner_required');
          const epochs=[from64(m.key_epoch),...query('SELECT DISTINCT json_extract(envelope,\'$.key_epoch\') AS epoch FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>?').all(id,be64(clock())).map(r=>counter(r.epoch))];
          depositKeys(device,id,from64(m.key_epoch),input.custody_packages,epochs,false);
          for(const row of query('SELECT person,permission FROM control_members WHERE resource=? AND revoked=0').all(id)) installGrants(id,row.person,row.permission,m.key_epoch);
          out={resource:resourceView(device,id)};
        } else if(input.kind==='leave') {
          if(m.permission==='owner') deny(409,'owner_cannot_leave');
          query('UPDATE control_members SET revoked=1 WHERE resource=? AND person=?').run(id,person.id);
          query('DELETE FROM relay_grants WHERE channel=? AND device IN (SELECT device FROM control_devices WHERE person=?)').run(id,person.id);
          query('UPDATE control_resources SET revision=revision+1,rotation_pending=1 WHERE id=?').run(id); out={resourceId:id,left:true};
        } else {
          if(m.permission!=='owner') deny(403,'owner_required');
          if(input.kind==='rename') {query('UPDATE control_resources SET metadata=?,revision=revision+1 WHERE id=?').run(metadata(input.metadata),id); out={resource:resourceView(device,id)};}
          else if(input.kind==='delete') {
            query('UPDATE control_resources SET deleted=1,revision=revision+1 WHERE id=?').run(id);
            query('DELETE FROM relay_grants WHERE channel=?').run(id);
            query('DELETE FROM relay_leases WHERE channel=?').run(id);
            query('UPDATE relay_publications SET envelope=NULL,lease_proof=NULL WHERE channel=?').run(id);
            query('UPDATE control_invites SET state=\'cancelled\' WHERE resource=?').run(id);
            query('DELETE FROM control_packages WHERE resource=?').run(id); out={resourceId:id,deleted:true};
            if(custody) query('DELETE FROM custody_keys WHERE resource=?').run(id);
          } else if(input.kind==='invite') {
            const target=opaque(input.person_id); if(target===person.id || !query('SELECT 1 FROM control_people WHERE id=?').get(target)) deny(400,'invalid_person');
            if(!['read','write'].includes(input.permission) || typeof input.include_history!=='boolean') deny(400,'invalid_permission');
            const present=query('SELECT revoked FROM control_members WHERE resource=? AND person=?').get(id,target); if(present && !present.revoked) deny(409,'already_member');
            if(query('SELECT 1 FROM control_invites WHERE resource=? AND person=? AND state IN (\'open\',\'accepted\') AND expires>?').get(id,target,be64(clock()))) deny(409,'already_invited');
            const invitation=`invite_${randomBytes(16).toString('hex')}`;
            query('INSERT INTO control_invites VALUES (?,?,?,?,?,?,?)').run(invitation,id,target,input.permission,input.include_history?1:0,'open',be64(clock()+86400000n));
            query('UPDATE control_resources SET revision=revision+1 WHERE id=?').run(id); out={invitationId:invitation,state:'open',resource:resourceView(device,id)};
          } else if(input.kind==='revoke') {
            const target=opaque(input.person_id); if(target===person.id) deny(400,'owner_cannot_revoke');
            if(!query('SELECT 1 FROM control_members WHERE resource=? AND person=? AND revoked=0').get(id,target)) deny(404,'member_not_found');
            query('UPDATE control_members SET revoked=1 WHERE resource=? AND person=?').run(id,target);
            query('DELETE FROM relay_grants WHERE channel=? AND device IN (SELECT device FROM control_devices WHERE person=?)').run(id,target);
            query('DELETE FROM control_packages WHERE resource=? AND device IN (SELECT device FROM control_devices WHERE person=?)').run(id,target);
            query('UPDATE control_resources SET revision=revision+1,rotation_pending=1 WHERE id=?').run(id); out={resource:resourceView(device,id)};
          } else if(input.kind==='approve' || input.kind==='rotate') {
            let invited=null;
            if(input.kind==='approve') {invited=query('SELECT * FROM control_invites WHERE id=? AND resource=?').get(opaque(input.invitation_id),id); if(!invited || invited.state!=='accepted' || from64(invited.expires)<=clock()) deny(409,'invitation_not_accepted');}
            const oldEpoch=from64(m.key_epoch);
            const rotate=input.kind==='rotate'||m.rotation_pending||!invited.include_history;
            if(oldEpoch===((1n<<64n)-1n)&&rotate) deny(409,'epoch_exhausted');
            const nextEpoch=rotate?oldEpoch+1n:oldEpoch;
            const participants=query('SELECT person FROM control_members WHERE resource=? AND revoked=0').all(id).map(r=>r.person);
            if(invited && !participants.includes(invited.person)) participants.push(invited.person);
            // No state transition or grant escapes this transaction if packages
            // or fresh encrypted metadata are absent. Pending rotation is visible.
            if(custody && input.custody_packages) depositKeys(device,id,nextEpoch,input.custody_packages,[nextEpoch,...(invited?.include_history?query('SELECT DISTINCT json_extract(envelope,\'$.key_epoch\') AS epoch FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>?').all(id,be64(clock())).map(r=>counter(r.epoch)):[])],true);
            else packages(device,id,nextEpoch,input.packages,participants);
            if(invited?.include_history) {
              const epochs=query('SELECT DISTINCT json_extract(envelope,\'$.key_epoch\') AS epoch FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>?').all(id,be64(clock())).map(r=>r.epoch).filter(e=>e!==nextEpoch.toString());
              if(custody && input.custody_packages) {
                if(epochs.some(e=>!custody.has(id,counter(e)))) deny(409,'historical_key_packages_required');
              } else {
              if(!Array.isArray(input.history_packages??[]) || (input.history_packages??[]).length!==epochs.length) deny(409,'historical_key_packages_required');
              const seenEpochs=new Set();
              for(const old of input.history_packages??[]) {
                if(!epochs.includes(old.epoch)||seenEpochs.has(old.epoch)) deny(403,'historical_package_scope');
                seenEpochs.add(old.epoch);packages(device,id,counter(old.epoch),old.packages,[invited.person]);
              }
              }
            }
            if(rotate) query('UPDATE control_resources SET metadata=? WHERE id=?').run(metadata(input.metadata),id);
            if(invited) {
              query('INSERT INTO control_members VALUES (?,?,?,?,0) ON CONFLICT(resource,person) DO UPDATE SET permission=excluded.permission,history_floor=excluded.history_floor,revoked=0').run(id,invited.person,invited.permission,be64(invited.include_history?1n:from64(m.head)+1n));
              query('UPDATE control_invites SET state=\'approved\' WHERE id=?').run(invited.id);
            }
            query('UPDATE relay_channels SET key_epoch=? WHERE id=?').run(be64(nextEpoch),id);
            query('UPDATE control_resources SET revision=revision+1,rotation_pending=0 WHERE id=?').run(id);
            for(const row of query('SELECT person,permission FROM control_members WHERE resource=? AND revoked=0').all(id)) installGrants(id,row.person,row.permission,be64(nextEpoch));
            out={resource:resourceView(device,id)};
          } else deny(400,'unsupported_operation');
        }
      }
      const result={operationId:input.intent_id,kind:input.kind,...out};
      query('INSERT INTO control_intents VALUES (?,?,?,?)').run(device,input.intent_id,digest,JSON.stringify(result));
      if (resource) events.mutation(resource, before, input.intent_id, device);
      else if (input.kind === 'register_device_key') events.deviceChanged(device);
      return result;
    })();
    notify(input.resource_id??null); events.wake(); return result;
  }
  function depositKeys(device,resource,current,packets,allowed,requireCurrent=true) {
    if(!custody || !Array.isArray(packets) || !packets.length || packets.length>129) deny(400,'invalid_custody_packages');
    const seen=new Set();
    for(const packet of packets) {
      const epoch=counter(packet?.epoch);
      if(!allowed.includes(epoch)||seen.has(epoch)) deny(403,'custody_epoch_scope');
      seen.add(epoch);custody.deposit(device,resource,epoch,packet);
    }
    if(requireCurrent&&!custody.has(resource,current)) deny(409,'custody_current_key_required');
  }
  function activateDevice(device) {
    const person=identity(device);
    for(const row of query('SELECT r.id,m.permission,c.key_epoch FROM control_resources r JOIN control_members m ON m.resource=r.id JOIN relay_channels c ON c.id=r.id WHERE m.person=? AND m.revoked=0 AND r.deleted=0').all(person.id)) installGrants(row.id,person.id,row.permission,row.key_epoch);
  }
  function history(device,resource,url) {
    const m=member(device,resource);
    // An authorized person still needs a device grant/key approval; account
    // membership alone cannot fetch ciphertext on an unlinked sibling device.
    const dg=query('SELECT can_read FROM relay_grants WHERE channel=? AND device=?').get(resource,device); if(!dg?.can_read) deny(403,'device_key_required');
    const cursor=counter(url.searchParams.get('cursor')??'0',true),limit=counter(url.searchParams.get('limit')??'50'); if(limit>50n) deny(400,'invalid_limit');
    const head=from64(m.head),floor=from64(m.history_floor); if(cursor>head) deny(409,'future_cursor');
    const start=cursor<floor?floor-1n:cursor;
    const rows=query('SELECT sequence,envelope FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>? AND sequence>? ORDER BY sequence LIMIT ?').all(resource,be64(clock()),be64(start),Number(limit));
    const result={environment,channel_id:resource,head:head.toString(),history_floor:floor.toString(),next_cursor:start.toString(),has_more:false,entries:[]};
    for(const row of rows){const entry={server_sequence:from64(row.sequence).toString(),envelope:JSON.parse(row.envelope)};result.entries.push(entry);const previous=result.next_cursor;result.next_cursor=entry.server_sequence;if(Buffer.byteLength(JSON.stringify(result))>maxBody){result.entries.pop();result.next_cursor=previous;break;}}
    result.has_more=!!query('SELECT 1 FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND expires>? AND sequence>? LIMIT 1').get(resource,be64(clock()),be64(BigInt(result.next_cursor)));
    return result;
  }
  function historicalEntry(device,resource,publication) {
    const m=member(device,resource);const dg=query('SELECT can_read FROM relay_grants WHERE channel=? AND device=?').get(resource,device);if(!dg?.can_read) deny(403,'device_key_required');
    const row=query('SELECT sequence,envelope FROM relay_publications WHERE channel=? AND id=? AND envelope IS NOT NULL AND expires>? AND sequence>=?').get(resource,opaque(publication),be64(clock()),m.history_floor);
    return {entry:row?{server_sequence:from64(row.sequence).toString(),envelope:JSON.parse(row.envelope)}:null};
  }
  return {identity,catalog,catalogSnapshot,member,packages,operation,authorize,history,historicalEntry,resourceView,events,custody,activateDevice};
}
