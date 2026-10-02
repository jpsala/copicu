// Test subprocess only: explicit synthetic constructor input on stdin, no keys
// or tokens in output. Fault controls never exist on HTTP routes.
import {createInterface} from 'node:readline';
import {generateKeyPairSync} from 'node:crypto';
import {createRelay} from '../../scripts/shared-clipboard/relay.mjs';
const lines=createInterface({input:process.stdin});let relay;let failure=null;
try{for await(const line of lines){const value=JSON.parse(line);if(!relay){relay=createRelay({...value,leaseSigner:generateKeyPairSync('ed25519').privateKey,faults:{beforeControl:i=>{if(failure?.mode==='before'&&failure.kind===i.kind){failure=null;return true;}return false;},afterControlCommit:r=>{if(failure?.mode==='after'&&failure.kind===r.kind){failure=null;return true;}return false;}}});process.stdout.write(JSON.stringify({url:relay.url,issuer:relay.issuerPublicKey})+'\n');}else if(value.command==='fault'){failure={mode:value.mode,kind:value.kind};process.stdout.write('{"ack":true}\n');}else if(value.command==='stop')break;else throw Error('invalid synthetic control command');}}finally{if(relay)await relay.stop();lines.close();}
