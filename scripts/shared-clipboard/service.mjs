// Real-service entrypoint. No synthetic identities or bootstrap bundles; all
// enrollment passes through operator-configured OIDC and account admission.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { createRelay } from './relay.mjs';
import { createOidc } from './oidc.mjs';

export function validateServiceConfig(c) {
  if (!c || c.version !== 1 || Object.keys(c).sort().join(',') !== 'databasePath,environment,issuerKeyPath,oidc,port,publicUrl,version') throw Error('invalid_service_config');
  const url = new URL(c.publicUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^[A-Za-z0-9_-]{1,128}$/.test(c.environment)) throw Error('invalid_service_origin');
  if (!Number.isInteger(c.port) || c.port < 1024 || c.port > 65535 || !path.isAbsolute(c.databasePath) || !path.isAbsolute(c.issuerKeyPath) || c.databasePath === c.issuerKeyPath) throw Error('invalid_service_storage');
  const o = c.oidc;
  if (!o || Object.keys(o).sort().join(',') !== 'allowedEmails,allowedSubjects,clientId,clientSecretPath,issuer' || !path.isAbsolute(o.clientSecretPath) || !Array.isArray(o.allowedEmails) || !Array.isArray(o.allowedSubjects) || (!o.allowedEmails.length && !o.allowedSubjects.length) || [...o.allowedEmails, ...o.allowedSubjects].some(v => typeof v !== 'string' || !v || v.length > 255)) throw Error('invalid_identity_admission');
  if (c.issuerKeyPath === o.clientSecretPath || c.databasePath === o.clientSecretPath) throw Error('invalid_secret_path');
  return c;
}
async function protectedFile(file) {
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16384 || (process.platform !== 'win32' && (metadata.mode & 0o077))) throw Error('private_file_permissions');
  return readFile(file);
}
export async function startService(config) {
  const c = validateServiceConfig(config);
  const pem = await protectedFile(c.issuerKeyPath), clientSecret = await protectedFile(c.oidc.clientSecretPath);
  let leaseSigner, oidc;
  try {
    leaseSigner = createPrivateKey(pem);
    if (leaseSigner.asymmetricKeyType !== 'ed25519') throw Error('invalid_issuer_key');
    oidc = await createOidc({ issuer: c.oidc.issuer, clientId: c.oidc.clientId, clientSecret: clientSecret.toString('utf8').trim(), redirectUri: new URL('v3/auth/callback', c.publicUrl).toString(), allowedEmails: c.oidc.allowedEmails, allowedSubjects: c.oidc.allowedSubjects });
  } finally { pem.fill(0); clientSecret.fill(0); }
  return createRelay({ dbPath: c.databasePath, environment: c.environment, leaseSigner, port: c.port, identity: { publicUrl: c.publicUrl, oidc } });
}
if (import.meta.main) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command === '--init-issuer' && file && path.isAbsolute(file)) {
      const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
      await writeFile(file, key, { flag: 'wx', mode: 0o600 });
      process.stdout.write('Service signing identity created. Preserve it with the database.\n');
    } else if (command === '--config' && file && path.isAbsolute(file)) {
      const configBytes = await protectedFile(file), config = JSON.parse(configBytes.toString('utf8')); configBytes.fill(0);
      const relay = await startService(config);
      process.stdout.write('Sharing service ready on loopback. Public access requires its configured HTTPS proxy.\n');
      let closing = false;
      const shutdown = async () => { if (closing) return; closing = true; await relay.stop(); process.exit(0); };
      process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    } else { process.stderr.write('Usage: bun service.mjs --config ABSOLUTE_CONFIG or --init-issuer ABSOLUTE_NEW_KEY\n'); process.exitCode = 2; }
  } catch { process.stderr.write('Sharing service cannot start. Check config, private file permissions, OIDC admission and stored issuer identity.\n'); process.exitCode = 1; }
}
