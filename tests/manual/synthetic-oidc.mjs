// Local synthetic issuer for protocol tests and isolated host acceptance only.
// Never imported by the service entrypoint or packaged with the desktop app.
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { createOidc } from '../../scripts/shared-clipboard/oidc.mjs';
const hash = value => createHash('sha256').update(value).digest('base64url');
export async function syntheticOidc() {
  const signer = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...signer.publicKey.export({ format: 'jwk' }), kid: 'synthetic-rsa', alg: 'RS256', use: 'sig' };
  const codes = new Map(); let subject = 'synthetic-account', editClaims = c => c;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const url = new URL(request.url), issuer = server.url.toString().replace(/\/$/, '');
    if (url.pathname === '/.well-known/openid-configuration') return Response.json({ issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/keys', code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256'] });
    if (url.pathname === '/keys') return Response.json({ keys: [key] });
    if (url.pathname === '/authorize') {
      const code = randomBytes(32).toString('base64url'); codes.set(code, { challenge: url.searchParams.get('code_challenge'), nonce: url.searchParams.get('nonce'), subject, redirect: url.searchParams.get('redirect_uri') });
      const callback = new URL(url.searchParams.get('redirect_uri')); callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('code', code);
      return Response.redirect(callback, 302);
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const form = new URLSearchParams(await request.text()), data = codes.get(form.get('code')); codes.delete(form.get('code'));
      if (!data || data.challenge !== hash(form.get('code_verifier') ?? '') || form.get('client_id') !== 'synthetic-client' || form.get('client_secret') !== 'synthetic-only-secret' || form.get('redirect_uri') !== data.redirect) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const seconds = Math.floor(Date.now() / 1000), header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid })).toString('base64url');
      const claims = Buffer.from(JSON.stringify(editClaims({ iss: issuer, sub: data.subject, aud: 'synthetic-client', nonce: data.nonce, iat: seconds, exp: seconds + 300 }))).toString('base64url');
      const signed = `${header}.${claims}`;
      return Response.json({ id_token: `${signed}.${sign('RSA-SHA256', Buffer.from(signed), signer.privateKey).toString('base64url')}` });
    }
    return new Response('not found', { status: 404 });
  } });
  return {
    issuer: server.url.toString().replace(/\/$/, ''),
    setSubject(value) { subject = value; }, setClaims(editor) { editClaims = editor; },
    async adapter(callback, admission = 'allowlist') { return createOidc({ issuer: server.url.toString().replace(/\/$/, ''), clientId: 'synthetic-client', clientSecret: 'synthetic-only-secret', redirectUri: callback, admission, allowedSubjects: admission === 'allowlist' ? ['synthetic-account', 'synthetic-other'] : [], allowLoopback: true }); },
    async stop() { await server.stop(true); },
  };
}
