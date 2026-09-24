import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const configPath = resolve('.env.photos.local');
let previous = {};
try {
  previous = parseEnv(await readFile(configPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const directory = resolve(
  (previous.PHOTO_STORAGE_DIR || '~/pics/notes').replace(/^~(?=\/|$)/, homedir()),
);
const secret = previous.LOCAL_PHOTO_SECRET || randomBytes(32).toString('hex');
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(configPath, `PHOTO_STORAGE_DIR=${directory}\nLOCAL_PHOTO_SECRET=${secret}\n`, {
  mode: 0o600,
});
if (process.argv.includes('--configure-backend')) {
  // Keep service credentials out of shell interpolation and logs.
  const result = spawnSync('pnpm', ['exec', 'convex', 'env', 'set', 'LOCAL_PHOTO_SECRET', secret], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0)
    throw new Error(
      'Could not configure the backend photo secret. Local configuration has been preserved.',
    );
}
console.log(`Photo folder configured: ${directory}`);
