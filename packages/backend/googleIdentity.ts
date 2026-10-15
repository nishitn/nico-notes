import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ConvexError } from 'convex/values';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Never accept identity/profile values supplied separately by the mobile app.
// This same boundary is exercised with real signed JWTs in the security tests.
export async function verifyNativeGoogleIdentity(
  idToken: unknown,
  nonce: unknown,
  clientId: string | undefined,
  keys: JWTVerifyGetKey = googleKeys,
) {
  if (!clientId) throw new ConvexError('Google sign-in is not configured.');
  if (
    typeof idToken !== 'string' ||
    idToken.length > 16_384 ||
    typeof nonce !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce)
  )
    throw new ConvexError('Invalid Google sign-in response.');
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ['RS256'],
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      requiredClaims: ['sub', 'email', 'email_verified', 'exp', 'iat', 'nonce'],
      maxTokenAge: '1h',
      clockTolerance: 5,
    });
    if (
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      payload.email_verified !== true ||
      payload.nonce !== nonce
    )
      throw new Error('Invalid identity claims.');
    return {
      subject: payload.sub,
      email: payload.email,
      name:
        typeof payload.name === 'string' ? payload.name.slice(0, 80) : payload.email.split('@')[0],
      image:
        typeof payload.picture === 'string' && payload.picture.startsWith('https://')
          ? payload.picture
          : undefined,
    };
  } catch {
    throw new ConvexError('Google sign-in could not be verified. Please try again.');
  }
}
