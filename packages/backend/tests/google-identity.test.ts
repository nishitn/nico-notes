import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyNativeGoogleIdentity } from '../googleIdentity';

const clientId = 'web-client.apps.googleusercontent.com';
const nonce = 'n'.repeat(43);
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
const claims = {
  sub: 'google-stable-subject',
  email: 'person@example.com',
  email_verified: true,
  nonce,
  name: 'A Person',
  picture: 'https://example.com/avatar.jpg',
};

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'google-test-key', alg: 'RS256' }],
  });
});
async function token(
  overrides: Record<string, unknown> = {},
  issuer = 'https://accounts.google.com',
  audience = clientId,
) {
  return new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('native Google token verification', () => {
  it('uses the signed Google subject and profile', async () => {
    const identity = await verifyNativeGoogleIdentity(await token(), nonce, clientId, keys);
    expect(identity).toEqual({
      subject: claims.sub,
      email: claims.email,
      name: claims.name,
      image: claims.picture,
    });
  });
  it('accepts Google’s alternate documented issuer', async () => {
    expect(
      (
        await verifyNativeGoogleIdentity(
          await token({}, 'accounts.google.com'),
          nonce,
          clientId,
          keys,
        )
      ).subject,
    ).toBe(claims.sub);
  });
  it('rejects tokens issued to a different app', async () => {
    await expect(
      verifyNativeGoogleIdentity(
        await token({}, undefined, 'attacker-client'),
        nonce,
        clientId,
        keys,
      ),
    ).rejects.toThrow();
  });
  it('rejects a non-Google issuer even with an otherwise valid signature', async () => {
    await expect(
      verifyNativeGoogleIdentity(
        await token({}, 'https://attacker.example'),
        nonce,
        clientId,
        keys,
      ),
    ).rejects.toThrow();
  });
  it.each([
    { email_verified: false },
    { email_verified: 'true' },
    { email: null },
    { sub: '' },
    { nonce: 'different' },
  ])('rejects invalid identity claims %j', async (overrides) => {
    await expect(
      verifyNativeGoogleIdentity(await token(overrides), nonce, clientId, keys),
    ).rejects.toThrow();
  });
  it('rejects expired tokens', async () => {
    const expired = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expect(verifyNativeGoogleIdentity(expired, nonce, clientId, keys)).rejects.toThrow();
  });
  it('rejects forged signatures', async () => {
    const forgedKey = await generateKeyPair('RS256');
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(forgedKey.privateKey);
    await expect(verifyNativeGoogleIdentity(forged, nonce, clientId, keys)).rejects.toThrow();
  });
  it('requires a nonce and configured audience', async () => {
    const signed = await token();
    await expect(verifyNativeGoogleIdentity(signed, '', clientId, keys)).rejects.toThrow();
    await expect(verifyNativeGoogleIdentity(signed, nonce, undefined, keys)).rejects.toThrow();
    await expect(
      verifyNativeGoogleIdentity('x'.repeat(20_000), nonce, clientId, keys),
    ).rejects.toThrow();
  });
  it('does not pass unsafe image URLs into the profile', async () => {
    expect(
      (
        await verifyNativeGoogleIdentity(
          await token({ picture: 'file:///private/key' }),
          nonce,
          clientId,
          keys,
        )
      ).image,
    ).toBeUndefined();
  });
});
