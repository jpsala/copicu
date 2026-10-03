import { test, expect } from 'bun:test';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { validateIdToken, createOidc } from '../scripts/shared-clipboard/oidc.mjs';
import { validateServiceConfig } from '../scripts/shared-clipboard/service.mjs';
import { syntheticOidc } from './manual/synthetic-oidc.mjs';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
const claims = { iss: 'https://synthetic.invalid', sub: 'synthetic-person', aud: 'synthetic-client', iat: 1800000000, exp: 1800000300, nonce: 'synthetic-nonce' };
const context = { issuer: claims.iss, clientId: claims.aud, nonce: claims.nonce, jwks: { keys: [jwk] }, now: 1800000010000 };
function token(payload = claims, header = { alg: 'RS256', kid: jwk.kid }, signer = rsa.privateKey) {
  const data = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), signer).toString('base64url')}`;
}
test('OIDC admits only an authenticated issuer, audience, time, nonce and subject', () => {
  expect(validateIdToken(token(), context).sub).toBe(claims.sub);
  expect(validateIdToken(token({ ...claims, aud: [claims.aud, 'other'], azp: claims.aud }), context).sub).toBe(claims.sub);
  for (const edit of [
    { iss: 'https://other.invalid' }, { aud: 'other' }, { aud: [claims.aud, 'other'] }, { azp: 'other' },
    { exp: 1800000010 }, { exp: '1800000300' }, { iat: 1800000041 }, { iat: 1799999000 },
    { nbf: 1800000041 }, { nonce: 'other' }, { sub: '' }, { sub: 'x'.repeat(256) },
  ]) expect(() => validateIdToken(token({ ...claims, ...edit }), context)).toThrow();
});
test('OIDC rejects algorithm/key confusion, forged signatures and noncanonical encodings', () => {
  for (const edit of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { jku: 'https://other.invalid/keys' }, { x5u: 'https://other.invalid/cert' }, { crit: ['other'] }]) {
    expect(() => validateIdToken(token(claims, { alg: 'RS256', kid: jwk.kid, ...edit }), context)).toThrow();
  }
  expect(() => validateIdToken(token(claims, undefined, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), context)).toThrow();
  expect(() => validateIdToken(token(), { ...context, jwks: { keys: [jwk, jwk] } })).toThrow();
  expect(() => validateIdToken(token(), { ...context, jwks: { keys: [{ ...jwk, use: 'enc' }] } })).toThrow();
  expect(() => validateIdToken(token() + '=', context)).toThrow();
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
  expect(() => validateIdToken(token(claims, undefined, weak.privateKey), { ...context, jwks: { keys: [{ ...weak.publicKey.export({ format: 'jwk' }), kid: jwk.kid }] } })).toThrow();
});
test('remote plaintext and an unspecified empty admission policy fail before provider discovery', async () => {
  await expect(createOidc({ issuer: 'http://synthetic.invalid', clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'https://synthetic.invalid/callback', allowedSubjects: ['synthetic'] })).rejects.toThrow('invalid_oidc_url');
  await expect(createOidc({ issuer: 'https://synthetic.invalid', clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'https://synthetic.invalid/callback' })).rejects.toThrow('identity_admission_required');
});

test('explicit authenticated admission accepts separate accounts while still enforcing OIDC and PKCE', async () => {
  const provider = await syntheticOidc();
  try {
    const callback = provider.issuer + '/synthetic-callback';
    const publicAdapter = await provider.adapter(callback, 'authenticated');
    const restrictedAdapter = await provider.adapter(callback);
    const login = async (adapter, verifier = 'synthetic-verifier', usedVerifier = verifier) => {
      const authorization = new URL(adapter.authorization({state:'synthetic-state',nonce:'synthetic-nonce',challenge:createHash('sha256').update(verifier).digest('base64url')}));
      expect(authorization.searchParams.get('scope')).toBe('openid email');
      const response = await fetch(authorization, {redirect:'manual'});
      const result = new URL(response.headers.get('location'));
      return adapter.authenticate({code:result.searchParams.get('code'),verifier:usedVerifier,nonce:'synthetic-nonce'});
    };
    provider.setClaims(value => ({...value,email:'same@synthetic.invalid',email_verified:true}));
    provider.setSubject('synthetic-public-first');
    const first = await login(publicAdapter);
    expect(first).toEqual({issuer:provider.issuer,subject:'synthetic-public-first'});
    await expect(login(restrictedAdapter)).rejects.toThrow('account_not_allowed');
    provider.setSubject('synthetic-public-second');
    const second = await login(publicAdapter);
    expect(second.subject).not.toBe(first.subject);
    await expect(login(publicAdapter, 'synthetic-verifier', 'wrong-verifier')).rejects.toThrow('identity_provider_unavailable');
    for (const edit of [{nonce:'wrong-nonce'},{aud:'wrong-client'},{iss:'https://other.synthetic.invalid'}]) {
      provider.setClaims(value => ({...value,...edit}));
      await expect(login(publicAdapter)).rejects.toThrow('invalid_identity_claims');
    }
  } finally { await provider.stop(); }
});

test('service admission is explicit and remains compatible with restricted deployments', () => {
  const config = {version:1,publicUrl:'https://sharing.jpsala.dev/',environment:'synthetic',port:5454,databasePath:'/data/synthetic.sqlite',issuerKeyPath:'/secrets/issuer.pem',oidc:{issuer:'https://accounts.google.com',clientId:'synthetic-client',clientSecretPath:'/secrets/client-secret',allowedSubjects:[],allowedEmails:['synthetic@example.invalid']}};
  expect(validateServiceConfig(config)).toBe(config);
  const publicConfig = {...config,oidc:{...config.oidc,admission:'authenticated',allowedEmails:[]}};
  expect(validateServiceConfig(publicConfig)).toBe(publicConfig);
  for (const oidc of [
    {...config.oidc,allowedEmails:[]},
    {...publicConfig.oidc,admission:'unknown'},
    {...publicConfig.oidc,allowedSubjects:['ignored-restriction']},
    {...publicConfig.oidc,unexpected:true},
    {...publicConfig.oidc,allowedEmails:'not-a-list'},
  ]) expect(() => validateServiceConfig({...config,oidc})).toThrow();
});
