// Synthetic subprocess fixture. OIDC uses real RSA/PKCE over loopback; controls
// are stdin-only and never exist in the shipped service. Output contains no keys.
import { createInterface } from 'node:readline';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRelay } from '../../scripts/shared-clipboard/relay.mjs';
import { syntheticOidc } from './synthetic-oidc.mjs';
const lines = createInterface({ input: process.stdin });
const issuer = await syntheticOidc(), leaseSigner = generateKeyPairSync('ed25519').privateKey;
const custodyKey = randomBytes(32);
let config, relay, adapter, failure;
const restart = async () => {
  relay = createRelay({ ...config, leaseSigner, custodyKey:config.managedCustody?custodyKey:null, identity: { oidc: { authorization: p => adapter.authorization(p), authenticate: p => adapter.authenticate(p) }, faults: {
    beforeCommit: p => { if (failure?.mode === 'before' && failure.kind === p.kind) { failure = null; return true; } return false; },
    afterCommit: p => { if (failure?.mode === 'after' && failure.kind === p.kind) { failure = null; return true; } return false; },
  } } });
  config.port = Number(new URL(relay.url).port);
  adapter = await issuer.adapter(relay.url + '/v3/auth/callback');
};
try {
  for await (const line of lines) {
    const value = JSON.parse(line);
    if (!config) { config = value; await restart(); process.stdout.write(JSON.stringify({ url: relay.url }) + '\n'); continue; }
    if (value.command === 'stop') break;
    if (value.command === 'browser') {
      const url = new URL(value.url); if (url.origin !== relay.url || url.pathname !== '/v3/auth/browser') throw Error('synthetic browser origin');
      const response = await fetch(url); if (!response.ok) throw Error('synthetic sign-in');
    } else if (value.command === 'offline') { await relay.stop(); relay = null; }
    else if (value.command === 'restart') { if (relay) await relay.stop(); await restart(); }
    else if (value.command === 'custody') { if(relay) await relay.stop(); config.managedCustody=true; await restart(); }
    else if (value.command === 'subject') issuer.setSubject(value.subject);
    else if (value.command === 'fault') failure = { kind: value.kind, mode: value.mode };
    else throw Error('invalid synthetic identity command');
    process.stdout.write('{"ack":true}\n');
  }
} finally { if (relay) await relay.stop(); await issuer.stop(); lines.close(); }
