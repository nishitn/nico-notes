import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export const backendDir = path.resolve('packages/backend');
export function convex(...args: string[]) {
  try {
    return execFileSync('pnpm', ['exec', 'convex', ...args], {
      cwd: backendDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(
      'The development browser-test setup failed. Verify Convex account access. Raw output is suppressed to protect signing credentials.',
    );
  }
}
export default async function setup() {
  const env = fs.readFileSync(path.join(backendDir, '.env.local'), 'utf8');
  if (!/^CONVEX_DEPLOYMENT=dev:/m.test(env))
    throw new Error('Browser tests must use a development deployment.');
  const site = env.match(/^CONVEX_SITE_URL=(.+)$/m)?.[1];
  if (!site) throw new Error('Missing development HTTP actions URL.');
  const require = createRequire(path.join(backendDir, 'package.json'));
  const { importPKCS8, SignJWT } = await import(require.resolve('jose'));
  const privateKey = await importPKCS8(convex('env', 'get', 'JWT_PRIVATE_KEY'), 'RS256');
  convex('env', 'set', 'DATE_NOTES_E2E_ENABLED', 'true');
  fs.mkdirSync('test-results', { recursive: true });
  try {
    const users: { userId: string; sessionId: string; refreshTokenId: string; name: string }[] =
      JSON.parse(convex('run', 'testing:createUsers', '{}'));
    fs.writeFileSync('test-results/users.json', JSON.stringify(users.map((u) => u.userId)), {
      mode: 0o600,
    });
    for (const [index, user] of users.entries()) {
      const token = await new SignJWT({ sub: `${user.userId}|${user.sessionId}` })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setIssuer(site)
        .setAudience('convex')
        .setExpirationTime('1h')
        .sign(privateKey);
      fs.writeFileSync(
        `test-results/user-${index}.json`,
        JSON.stringify({
          cookies: [],
          origins: [
            {
              origin: 'http://localhost:5173',
              localStorage: [
                { name: '__convexAuthJWT_datenotes', value: token },
                {
                  name: '__convexAuthRefreshToken_datenotes',
                  value: `${user.refreshTokenId}|${user.sessionId}`,
                },
              ],
            },
          ],
        }),
        { mode: 0o600 },
      );
    }
  } catch (error) {
    convex('env', 'remove', 'DATE_NOTES_E2E_ENABLED');
    throw error;
  }
}
