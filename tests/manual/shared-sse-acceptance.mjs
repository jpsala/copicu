// Shipping IPC and actual Tauri events over isolated loopback WebView CDP.
// Native UI observation is an additional Computer Use pass, not this script.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
class Database extends DatabaseSync { constructor(file, options={}) {super(file,{readOnly:options.readonly??false});} query(sql){return this.prepare(sql);} }
const root=path.resolve(process.argv[2]??'');
if(path.dirname(root)!==path.resolve(import.meta.dirname,'../../.codex-run') || !path.basename(root).startsWith('shared-product-'))throw Error('synthetic boundary');
const mode=process.argv[3]??'matrix';
if(mode==='prepare-settings') {
 for(const [kind,key,paste] of [['sender','F5','F11'],['receiver','F6','F12']]) {
  const db=new Database(path.join(root,`${kind}-profile/copicu.sqlite3`));
  try{const record=db.query("SELECT value_json FROM app_settings WHERE key='app'").get();const s=JSON.parse(record.value_json);
   s.general.globalShortcut=`Ctrl+Shift+${key}`;s.general.inboxShortcut=`Ctrl+Alt+${key}`;s.general.pasteNextShortcut=`Ctrl+Alt+${paste}`;
   s.general.captureEnabled=false;s.general.launchOnStartup=false;s.autoUpdate.enabled=false;s.ai.enabled=false;s.ai.apiKey='';
   s.picker.pinToggleShortcut='';s.picker.externalEditorShortcut='';s.picker.hideOnFocusLost=false;
   db.query("UPDATE app_settings SET value_json=? WHERE key='app'").run(JSON.stringify(s));
  }finally{db.close();}
 }console.log('PASS prepared isolated settings; all capture/startup/updater/AI disabled');process.exit(0);
}
const peers=[],browsers=[],results=[];
const wait=async(fn,label)=>{const deadline=Date.now()+5000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,70));}throw Error(`deadline ${label}`);};
const pass=name=>{results.push({name,outcome:'pass'});console.log('PASS '+name);};
try {
 for(const [port,kind] of [[9421,'sender'],[9422,'receiver']]) {
  const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);browsers.push(browser);
  let main,settings;
  for (const page of browser.contexts()[0].pages()) { await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__?.invoke); const label=await page.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label); if(label==='main')main=page;if(label==='settings')settings=page; }
  if(!main)throw Error('Owned main WebView absent');
  await main.waitForFunction(()=>!!window.__TAURI_INTERNALS__?.invoke);
  peers.push(main);
  const call=(c,a={})=>main.evaluate(({c,a})=>window.__TAURI_INTERNALS__.invoke(c,a),{c,a});
  const status=await call('shared_clipboard_status');
  if(!status.configured) {
   if(!settings){const pending=browser.contexts()[0].waitForEvent('page');await call('open_settings_window');settings=await pending;await settings.waitForFunction(()=>!!window.__TAURI_INTERNALS__?.invoke);}
   const settingsCall=(c,a={})=>settings.evaluate(({c,a})=>window.__TAURI_INTERNALS__.invoke(c,a),{c,a});
   const bundlePath=path.join(root,`${kind}-enrollment.json`);const preview=await settingsCall('shared_clipboard_preview_enrollment',{bundlePath});
   await settingsCall('shared_clipboard_configure',{bundlePath,confirmedFingerprint:preview.fingerprint});
  }
  // Subscribe to the real Tauri listener without fetching on invalidation.
  await main.evaluate(async()=>{
   window.__sseEvents=[];
   const i=window.__TAURI_INTERNALS__;const callback=i.transformCallback(e=>window.__sseEvents.push(e.payload));
   window.__sseListener=await i.invoke('plugin:event|listen',{event:'shared-catalog-invalidated',target:{kind:'Any'},handler:callback});
  });
 }
 const call=(i,c,a={})=>peers[i].evaluate(({c,a})=>window.__TAURI_INTERNALS__.invoke(c,a),{c,a});
 const op=input=>call(0,'shared_clipboard_operation',{input:{operationId:crypto.randomUUID().replaceAll('-',''),...input}});
 const readCache=(kind)=>{const db=new Database(path.join(root,`${kind}-profile/copicu.sqlite3`),{readonly:true});try{const record=db.query('SELECT json FROM shared_control_cache').get();return record?JSON.parse(record.json):null;}finally{db.close();}};
 await wait(async()=> (await call(0,'shared_clipboard_status')).controlSyncState==='live'&&(await call(1,'shared_clipboard_status')).controlSyncState==='live','streams live');pass('two shipping streams active without renderer transport');
 const before=await call(1,'shared_clipboard_status');assert.equal(before.receipts.length,0);assert.equal(before.connections.length,0);
 const cat=await call(0,'shared_clipboard_catalog');const resource=cat.resources.find(r=>r.id==='synthetic_channel');
 const started=Date.now();await op({kind:'rename',resourceId:resource.id,expectedRevision:resource.revision,name:'Synthetic SSE renamed remotely'});
 await wait(()=>readCache('receiver')?.resources.some(r=>r.name==='Synthetic SSE renamed remotely'),'rename background cache');pass(`remote rename observed in durable cache in ${Date.now()-started}ms`);
 const status=await call(1,'shared_clipboard_status');assert.equal(status.receipts.length,0);assert.equal(status.connections.length,0);pass('control updates do not connect or import history');
 await call(1,'shared_clipboard_connection',{action:'pause',input:{channelId:null,sendPaused:true,receivePaused:true}});
 const next=await call(0,'shared_clipboard_catalog');await op({kind:'rename',resourceId:resource.id,expectedRevision:next.resources.find(r=>r.id===resource.id).revision,name:'Synthetic SSE while flows paused'});
 await wait(()=>readCache('receiver')?.resources.some(r=>r.name==='Synthetic SSE while flows paused'),'flow pause catalog');pass('direction pauses do not freeze catalog');
 const created=await op({kind:'create',name:'Synthetic private SSE resource'});const id=created.resource.id;
 await new Promise(r=>setTimeout(r,250));assert(!readCache('receiver').resources.some(r=>r.id===id));pass('private create absent from other person');
 const invite=await op({kind:'invite',resourceId:id,expectedRevision:'1',personId:'synthetic_person_receiver',permission:'read',includeHistory:false});
 await wait(()=>readCache('receiver')?.invitations.some(i=>i.id===invite.invitationId),'invitation background');pass('invite appears without explicit catalog fetch');
 await call(1,'shared_clipboard_operation',{input:{operationId:crypto.randomUUID().replaceAll('-',''),kind:'accept',invitationId:invite.invitationId}});
 await wait(()=>readCache('sender')?.resources.find(r=>r.id===id)?.invites?.some(i=>i.id===invite.invitationId&&i.state==='accepted'),'accept owner');pass('acceptance invalidates owner');
 await op({kind:'approve',resourceId:id,expectedRevision:'2',invitationId:invite.invitationId});
 await wait(()=>readCache('receiver')?.resources.find(r=>r.id===id)?.keyState==='ready','keys imported before cursor');pass('approval imports HPKE before durable control cursor');
 const approved=await call(0,'shared_clipboard_catalog');await op({kind:'revoke',resourceId:id,expectedRevision:approved.resources.find(r=>r.id===id).revision,personId:'synthetic_person_receiver'});
 await wait(()=>!readCache('receiver')?.resources.some(r=>r.id===id),'revoke background');pass('revoked person receives removal');
 const events=await peers[1].evaluate(()=>window.__sseEvents);assert(events.length>0);assert(events.every(e=>Object.keys(e).every(k=>k==='state')));pass('Tauri invalidation contains only sanitized state');
 await writeFile(path.join(root,'sse-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:results.length,root}));
}finally{for(const browser of browsers)await browser.close();}
