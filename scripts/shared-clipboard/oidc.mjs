// Standards-only OIDC broker. Configuration is operator-owned, never discovery
// selected by a desktop request. No access/refresh/ID token is retained or logged.
import { createPublicKey, verify } from 'node:crypto';

function secureUrl(value, allowLoopback) {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.hash) throw Error('invalid_oidc_url');
  return url;
}
async function jsonResponse(response) {
  if (!response.ok) throw Error('identity_provider_unavailable');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw Error('identity_provider_response'); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('identity_provider_response'); }
}
const request = (url, init = {}) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
function decode(part) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part)) throw Error('invalid_identity_token');
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw Error('invalid_identity_token');
  return JSON.parse(bytes.toString('utf8'));
}
export function validateIdToken(token, { issuer, clientId, nonce, jwks, now = Date.now() }) {
  if (typeof token !== 'string' || token.length > 32768) throw Error('invalid_identity_token');
  const parts = token.split('.'); if (parts.length !== 3) throw Error('invalid_identity_token');
  if (!/^[A-Za-z0-9_-]+$/.test(parts[2]) || Buffer.from(parts[2],'base64url').toString('base64url') !== parts[2]) throw Error('invalid_identity_token');
  const header = decode(parts[0]), claims = decode(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit || header.jku || header.x5u) throw Error('invalid_identity_token');
  const candidates = jwks.keys?.filter(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig') && (!k.key_ops || k.key_ops.includes('verify')));
  if (candidates?.length !== 1) throw Error('invalid_identity_key');
  const key = createPublicKey({ key: candidates[0], format: 'jwk' });
  if (key.asymmetricKeyDetails?.modulusLength < 2048 || !verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), key, Buffer.from(parts[2], 'base64url'))) throw Error('invalid_identity_signature');
  const seconds = Math.floor(now / 1000), audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId) || (claims.azp && claims.azp !== clientId)
      || !Number.isSafeInteger(claims.exp) || claims.exp <= seconds || !Number.isSafeInteger(claims.iat) || claims.iat > seconds + 30 || claims.iat < seconds - 600
      || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > seconds + 30)) || claims.nonce !== nonce
      || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw Error('invalid_identity_claims');
  return claims;
}
export function validateAdmission({ admission = 'allowlist', allowedSubjects = [], allowedEmails = [] }) {
  if (!['allowlist', 'authenticated'].includes(admission) || !Array.isArray(allowedSubjects) || !Array.isArray(allowedEmails)
      || [...allowedSubjects, ...allowedEmails].some(value => typeof value !== 'string' || !value || value.length > 255)) throw Error('invalid_identity_admission');
  if (admission === 'allowlist' && !allowedSubjects.length && !allowedEmails.length) throw Error('identity_admission_required');
  if (admission === 'authenticated' && (allowedSubjects.length || allowedEmails.length)) throw Error('invalid_identity_admission');
  return admission;
}
export async function createOidc({ issuer, clientId, clientSecret, redirectUri, admission = 'allowlist', allowedSubjects = [], allowedEmails = [], allowLoopback = false }) {
  const issuerUrl = secureUrl(issuer, allowLoopback); secureUrl(redirectUri, allowLoopback);
  validateAdmission({ admission, allowedSubjects, allowedEmails });
  if (!clientId || !clientSecret) throw Error('identity_credentials_required');
  const discovery = await jsonResponse(await request(`${issuerUrl.toString().replace(/\/$/, '')}/.well-known/openid-configuration`));
  if (discovery.issuer !== issuer || !discovery.code_challenge_methods_supported?.includes('S256') || !discovery.id_token_signing_alg_values_supported?.includes('RS256')) throw Error('unsupported_identity_provider');
  const authorization = secureUrl(discovery.authorization_endpoint, allowLoopback), tokenEndpoint = secureUrl(discovery.token_endpoint, allowLoopback), keys = secureUrl(discovery.jwks_uri, allowLoopback);
  let jwks = null, loadedAt = 0;
  return {
    authorization({ state, nonce, challenge }) {
      const url = new URL(authorization);
      for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) url.searchParams.set(key, value);
      return url.toString();
    },
    async authenticate({ code, verifier, nonce }) {
      if (typeof code !== 'string' || !code || code.length > 4096) throw Error('invalid_authorization_code');
      const tokens = await jsonResponse(await request(tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }) }));
      if (!jwks || Date.now() - loadedAt > 300000) { jwks = await jsonResponse(await request(keys)); loadedAt = Date.now(); }
      let claims;
      try { claims = validateIdToken(tokens.id_token, { issuer, clientId, nonce, jwks }); }
      catch (error) { if (error.message !== 'invalid_identity_key') throw error; jwks = await jsonResponse(await request(keys)); loadedAt = Date.now(); claims = validateIdToken(tokens.id_token, { issuer, clientId, nonce, jwks }); }
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
      if (admission === 'allowlist' && !allowedSubjects.includes(claims.sub) && !(claims.email_verified === true && allowedEmails.map(e => e.toLowerCase()).includes(email))) throw Error('account_not_allowed');
      return { issuer, subject: claims.sub }; // Email is not account identity or a display directory.
    },
  };
}
