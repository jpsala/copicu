// Synthetic owner-controlled fixture. No HTTP administration or real profiles.
import { createInterface } from 'node:readline';
import { generateKeyPairSync } from 'node:crypto';
import { createRelay } from '../../scripts/shared-clipboard/relay.mjs';
const lines = createInterface({ input: process.stdin });
let relay;
try {
  for await (const line of lines) {
    const value = JSON.parse(line);
    if (!relay) {
      const { privateKey } = generateKeyPairSync('ed25519');
      relay = createRelay({ ...value, leaseSigner: privateKey });
      process.stdout.write(JSON.stringify({ url: relay.url, issuer: relay.issuerPublicKey }) + '\n');
    } else if (value.command === 'revoke') {
      relay.revokeDevice(value.device);
      process.stdout.write('{"ack":true}\n');
    } else if (value.command === 'stop') break;
    else throw new Error('invalid fixture command');
  }
} catch {
  process.exitCode = 1;
} finally {
  if (relay) await relay.stop();
  lines.close();
}
