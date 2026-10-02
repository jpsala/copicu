// Operates only the two isolated shipping profiles from shared-sse-acceptance.
// Process restart is performed separately after verifying PID and executable path.
import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'');
if(path.dirname(root)!==path.resolve(import.meta.dirname,'../../.codex-run')||!path.basename(root).startsWith('shared-product-'))throw Error('synthetic boundary');
const mode=process.argv[3],name=process.argv[4];
if(!['rename','verify'].includes(mode)||!name?.startsWith('Synthetic SSE '))throw Error('synthetic mode/name required');
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${mode==='rename'?9421:9422}`);
try{
 let main;
 for(const page of browser.contexts()[0].pages())if(await page.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label)==='main')main=page;
 if(!main)throw Error('isolated main WebView absent');
 const call=(c,a={})=>main.evaluate(({c,a})=>window.__TAURI_INTERNALS__.invoke(c,a),{c,a});
 if(mode==='rename'){
  const catalog=await call('shared_clipboard_catalog'),resource=catalog.resources.find(r=>r.id==='synthetic_channel');
  await call('shared_clipboard_operation',{input:{kind:'rename',operationId:crypto.randomUUID().replaceAll('-',''),resourceId:resource.id,expectedRevision:resource.revision,name}});
  console.log('PASS owner committed synthetic remote rename');
 }else{
  let found=false;const deadline=Date.now()+7000;
  while(Date.now()<deadline){
   const db=new DatabaseSync(path.join(root,'receiver-profile/copicu.sqlite3'),{readOnly:true});
   try{const row=db.prepare('SELECT json FROM shared_control_cache').get();found=!!row&&JSON.parse(row.json).resources.some(r=>r.id==='synthetic_channel'&&r.name===name);}finally{db.close();}
   if(found)break;await new Promise(r=>setTimeout(r,80));
  }
  assert(found,'host must reconcile restart without renderer catalog fetch');
  const status=await call('shared_clipboard_status');assert.equal(status.connections.length,0);assert.equal(status.receipts.length,0);
  assert.equal(status.sendPaused,true);assert.equal(status.receivePaused,true);
  console.log('PASS restarted host reconciles missed catalog update without explicit fetch');
  console.log('PASS restart preserves direction pauses, zero connections and zero receipts');
 }
}finally{await browser.close();}
