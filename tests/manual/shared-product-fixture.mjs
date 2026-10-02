// Synthetic local fixture only. Secret bundles stay in the owned new directory;
// stdout contains paths/endpoint/public identity metadata, never keys or tokens.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { createRelay } from '../../scripts/shared-clipboard/relay.mjs';

const base = path.resolve(import.meta.dir, '../../.codex-run');
await mkdir(base, { recursive: true });
const root = path.join(base, `shared-product-${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomBytes(4).toString('hex')}`);
await mkdir(root); // Refuse to reuse an existing profile/fixture.
await writeFile(path.join(root, 'synthetic.marker'), 'Copicu synthetic shared product fixture v1\n', { flag: 'wx' });
await writeFile(path.join(root, 'sender-profile.marker'), 'Copicu synthetic shared product fixture v1\n', { flag: 'wx' });
await writeFile(path.join(root, 'receiver-profile.marker'), 'Copicu synthetic shared product fixture v1\n', { flag: 'wx' });
const environment = 'synthetic_product_fixture';
const channel = 'synthetic_channel';
const owner = generateKeyPairSync('ed25519');
const receiver = generateKeyPairSync('ed25519');
const issuer = generateKeyPairSync('ed25519');
const tokenA = randomBytes(32).toString('hex');
const tokenB = randomBytes(32).toString('hex');
const key = randomBytes(32);
const publicKey = (key) => key.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const seed = (key) => key.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('base64');
const grants = [{ channel_id: channel, key_epoch: '1', publish: true, read: true, report: true }];
const relay = createRelay({
  dbPath: path.join(root, 'relay.sqlite'), environment,
  channels: [{ id: channel, key_epoch: '1',owner_person_id:'synthetic_person_owner' }],
  persons: [{id:'synthetic_person_owner',name:'Synthetic owner'},{id:'synthetic_person_receiver',name:'Synthetic receiver'}],
  devices: [
    { id: 'synthetic_owner', person_id:'synthetic_person_owner', token: tokenA, public_key: publicKey(owner.publicKey), grants },
    { id: 'synthetic_receiver', person_id:'synthetic_person_receiver', token: tokenB, public_key: publicKey(receiver.publicKey), grants },
  ], leaseSigner: issuer.privateKey,
});
const bundle = (deviceId, identity, token) => ({ version: 1, environment, deviceId, endpoint: relay.url,
  allowLoopback: true, bearer: token, signingSeed: seed(identity.privateKey), issuerPublicKey: publicKey(issuer.publicKey),
  channels: [{ id: channel, name: 'Synthetic local clipboard', epoch: 1, canPublish: true, key: key.toString('base64'),
    grants: [{ deviceId: 'synthetic_owner', publicKey: publicKey(owner.publicKey), revision: 1 },
      { deviceId: 'synthetic_receiver', publicKey: publicKey(receiver.publicKey), revision: 1 }] }],
});
const senderBundle = path.join(root, 'sender-enrollment.json');
const receiverBundle = path.join(root, 'receiver-enrollment.json');
await writeFile(senderBundle, JSON.stringify(bundle('synthetic_owner', owner, tokenA)), { flag: 'wx', mode: 0o600 });
await writeFile(receiverBundle, JSON.stringify(bundle('synthetic_receiver', receiver, tokenB)), { flag: 'wx', mode: 0o600 });
key.fill(0);
process.stdout.write(JSON.stringify({ root, endpoint: relay.url, channel,
  senderProfile: path.join(root, 'sender-profile'), receiverProfile: path.join(root, 'receiver-profile'),
  senderBundle, receiverBundle,
  publisher: 'debug/examples/shared-clipboard-product.exe --publish PROFILE BUNDLE synthetic-text',
}) + '\n');
const lines = createInterface({ input: process.stdin });
try {
  for await (const line of lines) {
    if (line.trim() === 'stop') break;
    if (line.trim() === 'prune') { relay.prune(); process.stdout.write('{"pruned":true}\n'); }
  }
} finally {
  await relay.stop(); lines.close();
}
