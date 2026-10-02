import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createEvents } from '../scripts/shared-clipboard/events.mjs';

// Tiny synthetic SQL fixture exercises the same transaction implementation and
// audience queries; HTTP replay/live is covered in control.test with real relay.
function fixture(maxEvents=2) {
 const db=new Database(':memory:');
 db.run(`CREATE TABLE control_resources(id TEXT,owner TEXT,revision INTEGER,deleted INTEGER); CREATE TABLE control_members(resource TEXT,person TEXT,revoked INTEGER); CREATE TABLE control_invites(resource TEXT,person TEXT,state TEXT,expires BLOB); CREATE TABLE relay_devices(id TEXT,revoked INTEGER); INSERT INTO relay_devices VALUES('a',0),('b',0); INSERT INTO control_resources VALUES('r','alice',1,0); INSERT INTO control_members VALUES('r','alice',0),('r','bob',0);`);
 const query=sql=>Object.fromEntries(['get','all','run'].map(m=>[m,(...args)=>{const q=db.prepare(sql);try{return q[m](...args);}finally{q.finalize();}}]));
 const transaction=fn=>()=>{db.run('BEGIN IMMEDIATE');try{const result=fn();db.run('COMMIT');return result;}catch(e){db.run('ROLLBACK');throw e;}};
 const be64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(n);return b;};const from64=b=>Buffer.from(b).readBigUInt64BE();
 let now=100000000n;
 const events=createEvents({query,transaction,environment:'synthetic',identity:d=>({id:d==='a'?'alice':'bob'}),deny:(status,code)=>{throw Error(code);},counter:s=>BigInt(s),be64,from64,clock:()=>now,maxEvents});
 const mark=()=>events.watermark('a');
 const page=(cursor,who='a',generation=mark().generation)=>events.changes(who,new URL(`http://localhost/v2/changes?generation=${generation}&personId=${who==='a'?'alice':'bob'}&cursor=${cursor}`));
 return {db,events,transaction,mark,page,setNow:n=>now=n};
}
test('rollback, bounded retention, generation/reset and full unsigned cursors',()=>{
 const f=fixture();try{
  expect(()=>f.transaction(()=>{f.events.mutation('r',f.events.audience('r'),'op','a');throw Error('rollback');})()).toThrow();
  expect(f.mark().cursor).toBe('0');expect(f.page('0').events).toHaveLength(0);
  for(let i=0;i<4;i++)f.transaction(()=>f.events.mutation('r',f.events.audience('r'),`op${i}`,'a'))();
  expect(f.page('0').gap).toBe(true);expect(f.page('2').events.map(e=>e.cursor)).toEqual(['3','4']);
  expect(f.page('4','a','another-generation').reset).toBe(true);expect(f.page('5').reset).toBe(true);
  f.setNow(200000000n);expect(f.page('2').gap).toBe(true);
  const b=Buffer.alloc(8);b.writeBigUInt64BE(9007199254740993n);f.db.query('UPDATE control_feed_heads SET head=? WHERE person=?').run(b,'alice');
  f.transaction(()=>f.events.mutation('r',f.events.audience('r'),'big','a'))();expect(f.mark().cursor).toBe('9007199254740994');
 }finally{f.db.close();}
});
test('revocation includes removed person but replay exposes only known ID',()=>{
 const f=fixture(20);try{
  f.transaction(()=>f.events.mutation('r',f.events.audience('r'),'rename','a'))();
  f.transaction(()=>{const before=f.events.audience('r');f.db.run("UPDATE control_members SET revoked=1 WHERE person='bob'");f.events.mutation('r',before,'revoke','a');})();
  const page=f.page('0','b');expect(page.events).toHaveLength(2);
  for(const event of page.events)expect(Object.keys(event).sort()).toEqual(['cursor','resourceId','type','version']);
  expect(page.events.every(e=>e.type==='resource_removed')).toBe(true);
 }finally{f.db.close();}
});

test('heartbeat has no cursor and abort, capacity and scoped resume are enforced',async()=>{
 const f=fixture(2000),mark=f.mark(),url=()=>new URL(`http://localhost/v2/events?generation=${mark.generation}&personId=alice&cursor=0`),abort=new AbortController();
 const request=new Request(url(),{signal:abort.signal});
 const reader=f.events.stream('a',url(),request).body.getReader();
 const keepAlive=setInterval(()=>{},50); // Unit fixture has no HTTP socket to keep Bun's loop alive.
 try{
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(': connected\n\n');
  expect(()=>f.events.stream('a',url(),new Request(url()))).toThrow('stream_capacity');
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
  expect(f.mark().cursor).toBe('0');
  abort.abort();expect((await reader.read()).done).toBe(true);
  expect(()=>f.events.stream('a',url(),new Request(url(),{headers:{'last-event-id':`${mark.generation}:bob:0`}}))).toThrow('control_cursor_scope');
 }finally{clearInterval(keepAlive);f.events.stop();f.db.close();}
},6000);

test('slow consumer closes with a bounded queue and shutdown closes an idle stream',async()=>{
 const f=fixture(2000),mark=f.mark(),url=cursor=>new URL(`http://localhost/v2/events?generation=${mark.generation}&personId=alice&cursor=${cursor}`);
 const reader=f.events.stream('a',url(0),new Request(url(0))).body.getReader();
 try{
  f.transaction(()=>{for(let i=0;i<1000;i++)f.events.mutation('r',f.events.audience('r'),`operation${i}`,'a');})();f.events.wake();
  let bytes=0,frames=0;for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;frames++;}
  expect(bytes).toBeLessThanOrEqual(65536);expect(frames).toBeLessThan(1000);
  const idle=f.events.stream('a',url(f.mark().cursor),new Request(url(f.mark().cursor))).body.getReader();
  await idle.read();f.events.stop();expect((await idle.read()).done).toBe(true);
 }finally{f.events.stop();f.db.close();}
});
