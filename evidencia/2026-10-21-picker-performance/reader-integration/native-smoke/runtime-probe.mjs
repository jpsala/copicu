// Authorized restart only: fresh marked synthetic profile, current isolated build.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { chromium } from '@playwright/test';
const run = '.codex-run/picker-reader-integration';
const source = readFileSync(`${run}/interactive-profile-current.txt`,'utf8');
const root = source.match(/^Synthetic fixture: (.+)$/m)?.[1].trim();
assert(root);
assert.equal(readFileSync(path.join(root,'synthetic.marker'),'utf8'),'Copicu synthetic window interaction fixture v1\n');
const profile = path.join(root,'profile');
const exe = path.resolve('src-tauri/target-reader-integration/release/copicu.exe');
const sha256 = createHash('sha256').update(readFileSync(exe)).digest('hex');
assert.equal(sha256,'dd0ffc6897b43cbe04eed634f34890112fab8463eb1ed1dc4bce2522c0bed96d');
const db = new DatabaseSync(path.join(profile,'copicu.sqlite3'));
try {
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clipboard_items').get().n,0,'refuse nonempty profile');
  const settings = JSON.parse(db.prepare("SELECT value_json FROM app_settings WHERE key='app'").get().value_json);
  assert.equal(settings.general.captureEnabled,false);
  assert.equal(settings.ai.enabled,false); assert.equal(settings.autoUpdate.enabled,false);
  assert.equal(settings.scripts.folderPath,path.join(profile,'scripts'));
  db.exec('BEGIN');
  const item = db.prepare("INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms,tags) VALUES (?,'text',?,?,?,?,?,?)");
  const tag = db.prepare('INSERT INTO tags(id,slug,label,created_at_unix_ms,updated_at_unix_ms) VALUES (?,?,?,0,0)');
  const link = db.prepare('INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms) VALUES (?,?,0)');
  for(let id=1;id<=100;id++) tag.run(id,`synthetic-${id}`,`synthetic-${id}`);
  for(let id=1;id<=10000;id++) {
    const tagId=1+id%100, timestamp=1_800_000_000_000+id;
    const text=`COPICU_SYNTH_${id} `+(id%3===0?'Synthetic multiline preview\n'.repeat(120):'ordinary '.repeat(id%2?6:60));
    item.run(id,text,createHash('sha256').update(text).digest('hex'),timestamp,timestamp,timestamp,`synthetic-${tagId}`);
    link.run(id,tagId);
  }
  db.exec('COMMIT');
} finally { db.close(); }
const env={...process.env};
for(const key of Object.keys(env)) if(/^COPICU_|^WEBVIEW2_/i.test(key)) delete env[key];
const runtimePath=(env.PATH??env.Path??'').split(path.delimiter).filter(p=>!/miniconda3/i.test(p));
for(const key of Object.keys(env)) if(key.toLowerCase()==='path') delete env[key];
env.PATH=[path.dirname(exe),...runtimePath.filter(p=>/mingw64[\\/]bin$/i.test(p)),...runtimePath].join(path.delimiter);
const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const log=openSync(`${run}/interactive-host.log`,'a');
const child=spawn(exe,[],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...env,COPICU_APP_DATA_DIR:profile,COPICU_SCRIPTS_DIR:path.join(profile,'scripts'),WEBVIEW2_USER_DATA_FOLDER:path.join(profile,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
closeSync(log);
let startupError, browser, main;
const traces=[], pendingResponses=new Set();
child.once('error',e=>{startupError=e;});
const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(startupError)throw startupError;assert.equal(child.exitCode,null,'owned host exited');try{const value=await fn();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Deadline: '+label);};
const cases=[];
const pass=name=>cases.push({name,outcome:'pass'});
try {
  await wait(async()=> (await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).some(t=>t.type==='page'),'owned CDP');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const findPage=label=>wait(async()=>{for(const p of browser.contexts()[0].pages())if(await p.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null)===label)return p;},'surface '+label);
  main=await findPage('main');
  const invoke=(p,cmd,args={})=>p.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  await main.waitForSelector('[aria-label="Search clipboard history"]',{state:'attached'});
  await invoke(main,'show_picker');
  await wait(()=>main.evaluate(()=>document.documentElement.dataset.pickerHistoryStale!=='true' && document.querySelectorAll('.history-feed .feed-item').length>0),'fresh first page');
  const flags=await main.evaluate(async()=>{const s=await window.__TAURI_INTERNALS__.invoke('get_settings');return {capture:s.general.captureEnabled,startup:s.general.launchOnStartup,ai:s.ai.enabled,updater:s.autoUpdate.enabled};});
  assert.deepEqual(flags,{capture:false,startup:false,ai:false,updater:false});
  assert.equal((await main.locator('[title="Result count"]').textContent()).replace(/\D/g,''),'10000');
  pass('fresh 10k feed through real runtime; capture/startup/AI/updater disabled');
  // Native Tauri invoke is non-writable. Observe real IPC without replacing it.
  // Never retain request headers (they contain Tauri's per-frame invoke key) or payload text.
  const network=await browser.contexts()[0].newCDPSession(main);
  const requests=new Map();
  await network.send('Network.enable');
  network.on('Network.requestWillBeSent',event=>{
    const url=new URL(event.request.url);
    if(url.hostname!=='ipc.localhost'||url.pathname!=='/history_search'||!event.request.postData)return;
    const args=JSON.parse(event.request.postData);
    const trace={token:args.pickerRead??null,cursor:Boolean(args.request?.cursor)};
    traces.push(trace); requests.set(event.requestId,trace);
  });
  network.on('Network.loadingFinished',event=>{
    const trace=requests.get(event.requestId);if(!trace)return;
    requests.delete(event.requestId);
    const task=(async()=>{
      const response=await network.send('Network.getResponseBody',{requestId:event.requestId});
      const result=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString('utf8'):response.body);
      if(Array.isArray(result?.items))Object.assign(trace,{rows:result.items.length,total:result.totalCount,filtered:result.filteredCount,firstId:result.items[0]?.id??null,descriptor:Boolean(result.appliedDescriptor?.fingerprint)});
      else trace.resultCode=result==='HISTORY_SEARCH_SUPERSEDED'?'superseded':'non-page';
    })().catch(()=>{trace.observationFailed=true;});
    pendingResponses.add(task);void task.finally(()=>pendingResponses.delete(task));
  });
  const search=main.locator('[aria-label="Search clipboard history"]');
  await search.fill('COPICU_SYNTH_9999');
  await wait(()=>traces.some(t=>t.firstId===9999 && t.filtered===1),'reader-filtered page');
  assert(await main.locator('#history-item-9999').isVisible());
  const first=traces.find(t=>t.firstId===9999 && t.filtered===1);
  assert.equal(first.total,10000); assert.equal(first.filtered,1); assert(first.descriptor);
  assert(Number.isSafeInteger(first.token.session)&&first.token.session>0&&first.token.generation>0);
  pass('actual frontend opts into reader and returns correct filtered DTO/descriptor over native IPC');
  const stale=await main.evaluate(async(token)=>{
    const args={request:{query:'',cursor:null,limit:1,includeContent:false,includeCounts:false},pickerRead:{...token,generation:0}};
    try{await window.__TAURI_INTERNALS__.invoke('history_search',args);return 'unexpected success';}catch(e){return String(e);}
  },first.token);
  assert.equal(stale,'HISTORY_SEARCH_SUPERSEDED');
  pass('obsolete generation rejected through native command without advancing client ownership');
  await invoke(main,'open_settings_window');
  const settings=await findPage('settings');
  const denied=await settings.evaluate(async(token)=>{
    const results=[];
    for(const [cmd,args] of [['begin_picker_history_read_session',{}],['history_search',{request:{query:'',cursor:null,limit:1,includeContent:false,includeCounts:false},pickerRead:token}]]){
      try{await window.__TAURI_INTERNALS__.invoke(cmd,args);results.push('unexpected success');}catch(e){results.push(String(e));}
    }
    return results;
  },first.token);
  assert(denied.every(e=>e.includes("cannot be called from window 'settings'")));
  await invoke(settings,'close_settings_window');
  await invoke(main,'show_picker');
  pass('Settings denied both session acquisition and opted-in reader request by native sender gate');
  await search.fill('COPICU_SYNTH_8888');
  await wait(()=>traces.some(t=>t.firstId===8888&&t.filtered===1),'reader after denied calls');
  const next=traces.find(t=>t.firstId===8888&&t.filtered===1);
  assert.equal(next.token.session,first.token.session); assert(next.token.generation>first.token.generation);
  await search.fill('');
  await wait(async()=> (await main.locator('[title="Result count"]').textContent()).replace(/\D/g,'')==='10000','restored empty query');
  pass('client remains usable with the same session after stale/foreign requests; full feed restored');
  await Promise.all([...pendingResponses]);
  await network.send('Network.disable');
  await network.detach();
  await invoke(main,'show_picker');
  await main.screenshot({path:`${run}/interactive-synthetic.png`});
  const processIdentity=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}'; if(-not $p){throw 'Owned process exited'}; @{pid=$p.ProcessId;exe=$p.ExecutablePath;creationUnixMs=([DateTimeOffset]$p.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds()} | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
  assert.equal(path.resolve(processIdentity.exe).toLowerCase(),exe.toLowerCase());
  await browser.close(); browser=null;
  const session={pid:child.pid,exe,sha256,profile,port,shortcut:'Ctrl+Shift+F10',captureEnabled:false,aiEnabled:false,updaterEnabled:false,syntheticItems:10000,syntheticTags:100,verifiedAt:new Date().toISOString(),creationUnixMs:processIdentity.creationUnixMs,status:'running'};
  writeFileSync(`${run}/interactive-session.json`,JSON.stringify(session,null,2)+'\n');
  writeFileSync(`${run}/native-reader-ipc.json`,JSON.stringify({checkedAt:new Date().toISOString(),executableSHA256:sha256,cases,traces,flags,limits:['CDP actions on exclusively synthetic owned WebViews; native keyboard C0 was verified by the separate Win32 smoke.','No native opening latency percentiles, clipboard read/write, paste, installed profile or external send.']},null,2)+'\n');
  child.unref();
  console.log(JSON.stringify({session,cases},null,2));
}catch(e){
  const state=main?await main.evaluate(()=>({queryLength:document.querySelector('[aria-label="Search clipboard history"]')?.textContent?.length??0,resultCount:document.querySelector('[title="Result count"]')?.textContent,alerts:document.querySelectorAll('[role="alert"]').length,stale:document.documentElement.dataset.pickerHistoryStale})).catch(()=>null):null;
  writeFileSync(`${run}/ipc-probe-failure.json`,JSON.stringify({error:String(e),cases,traces,state},null,2));
  if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();throw e;
}
