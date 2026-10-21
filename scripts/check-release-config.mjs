import fs from 'node:fs';
import path from 'node:path';

if (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'production') {
  console.log('Store configuration gate is only required for the production profile.');
  process.exit(0);
}

// Validate presence/shape only. Never print environment values or credentials.
const root = path.resolve(import.meta.dirname, '..');
const values = { ...process.env };
const file = path.join(root, 'apps/mobile/.env.local');
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && values[match[1]] === undefined)
      values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const failures = [];
for (const name of [
  'EXPO_PUBLIC_CONVEX_URL',
  'EXPO_PUBLIC_CONVEX_SITE_URL',
  'EXPO_PUBLIC_WEB_URL',
]) {
  try {
    const value = new URL(values[name]);
    if (
      value.protocol !== 'https:' ||
      /your-deployment|localhost|127\.0\.0\.1/.test(value.hostname)
    )
      throw new Error();
  } catch {
    failures.push(`${name} must be a configured HTTPS production URL.`);
  }
}
if (!values.GOOGLE_MAPS_ANDROID_API_KEY)
  failures.push('GOOGLE_MAPS_ANDROID_API_KEY is required for the advertised embedded map.');
if (values.NICO_ANDROID_BUILD_MODE !== 'local' && !values.EXPO_PROJECT_ID)
  failures.push('EXPO_PROJECT_ID must identify your linked EAS project.');
if (values.EXPO_PUBLIC_PHOTO_API_URL && !values.EXPO_PUBLIC_PHOTO_API_URL.startsWith('https://'))
  failures.push('EXPO_PUBLIC_PHOTO_API_URL must use HTTPS for self-hosted photos.');
if (!values.ANDROID_VERSION_CODE || !/^[1-9]\d*$/.test(values.ANDROID_VERSION_CODE))
  failures.push('Set ANDROID_VERSION_CODE to an unused positive store version code.');
const profiles = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/eas.json'), 'utf8'));
if (profiles.build.production.developmentClient)
  failures.push('The production profile must not contain a development client.');
if (profiles.build.production.android?.buildType !== 'app-bundle')
  failures.push('The production profile must produce an Android App Bundle.');
if (failures.length) {
  console.error(
    'Release configuration needs attention:\n' +
      failures.map((failure) => `- ${failure}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    'Android build configuration checks passed. Verify the production backend, signing certificate, final artifact permissions, 16 KB compatibility, reviewer access and store declarations separately.',
  );
}
