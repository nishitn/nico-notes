import { execFileSync } from 'node:child_process';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const run = (...args) => {
  try {
    return execFileSync('pnpm', ['exec', 'convex', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      'Convex configuration failed. Verify your deployment and account access; command output was suppressed to protect credentials.',
    );
  }
};
const present = run('env', 'list');
const hasPrivate = present.includes('JWT_PRIVATE_KEY=');
const hasPublic = present.includes('JWKS=');
if (hasPrivate !== hasPublic)
  throw new Error(
    'Only one signing key is configured. Resolve the existing deployment keys before continuing.',
  );
if (!hasPrivate) {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  run('env', 'set', 'JWT_PRIVATE_KEY', '--', privateKey.trimEnd().replace(/\n/g, ' '));
  run('env', 'set', 'JWKS', JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] }));
}
if (!present.includes('SITE_URL=')) run('env', 'set', 'SITE_URL', 'http://localhost:5173');
console.log(
  'Convex signing keys and frontend URL are configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in the Convex dashboard to enable Google sign-in.',
);
