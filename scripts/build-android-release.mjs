import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

// Local Play uploads use a persistent private upload key, never the debug key.
// Keep this directory backed up securely; it is deliberately excluded from Git.
const root = path.resolve(import.meta.dirname, '..');
const mobile = path.join(root, 'apps/mobile');
const privateDir = path.join(root, '.release/android');
const keystore = path.join(privateDir, 'upload.p12');
const credentials = path.join(privateDir, 'signing.json');
const localEnv = path.join(mobile, '.env.local');
const env = {
  ...(fs.existsSync(localEnv) ? parseEnv(fs.readFileSync(localEnv, 'utf8')) : {}),
  ...process.env,
  NODE_ENV: 'production',
  EAS_BUILD_PROFILE: 'production',
  NICO_ANDROID_BUILD_MODE: 'local',
};
if (!env.ANDROID_VERSION_CODE || !/^[1-9]\d*$/.test(env.ANDROID_VERSION_CODE))
  throw new Error('Set ANDROID_VERSION_CODE to an unused positive Play version code.');
const run = (command, args, cwd = root, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(process.execPath, ['scripts/check-release-config.mjs']);
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
fs.chmodSync(privateDir, 0o700);
if (!fs.existsSync(credentials) && !fs.existsSync(keystore)) {
  if (!process.argv.includes('--init-key'))
    throw new Error('No upload key. Run with --init-key only for the first release.');
  fs.writeFileSync(
    credentials,
    JSON.stringify({ alias: 'nico-notes-upload', password: randomBytes(32).toString('hex') }),
    { mode: 0o600, flag: 'wx' },
  );
  const signing = JSON.parse(fs.readFileSync(credentials, 'utf8'));
  run(
    'keytool',
    [
      '-genkeypair',
      '-noprompt',
      '-storetype',
      'PKCS12',
      '-keystore',
      keystore,
      '-alias',
      signing.alias,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=Nishit Nagar, OU=nico notes, O=Nishit Nagar',
      '-storepass:env',
      'NICO_UPLOAD_PASSWORD',
      '-keypass:env',
      'NICO_UPLOAD_PASSWORD',
    ],
    root,
    { NICO_UPLOAD_PASSWORD: signing.password },
  );
}
if (!fs.existsSync(credentials) || !fs.existsSync(keystore))
  throw new Error('Upload key incomplete. Restore the key and credentials from your backup.');
fs.chmodSync(credentials, 0o600);
fs.chmodSync(keystore, 0o600);
const signing = JSON.parse(fs.readFileSync(credentials, 'utf8'));
run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'], mobile);
// The development client's overlay permission is unnecessary in a store build.
const release = path.join(mobile, 'android/app/src/release');
fs.mkdirSync(release, { recursive: true });
fs.writeFileSync(
  path.join(release, 'AndroidManifest.xml'),
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"><uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove" /></manifest>\n',
);
// Native projects are generated and ignored. This block configures the local
// release build only; passwords remain in the Gradle process environment.
const gradleFile = path.join(mobile, 'android/app/build.gradle');
const existing = fs
  .readFileSync(gradleFile, 'utf8')
  .replace(/\n\/\/ BEGIN NICO UPLOAD[\s\S]*?\/\/ END NICO UPLOAD\n?/g, '');
fs.writeFileSync(
  gradleFile,
  existing +
    `
// BEGIN NICO UPLOAD
if (System.getenv('NICO_UPLOAD_STORE')) {
android {
  signingConfigs {
    nicoUpload {
      storeFile file(System.getenv('NICO_UPLOAD_STORE'))
      storePassword System.getenv('NICO_UPLOAD_PASSWORD')
      keyAlias System.getenv('NICO_UPLOAD_ALIAS')
      keyPassword System.getenv('NICO_UPLOAD_PASSWORD')
    }
  }
  buildTypes {
    release { signingConfig signingConfigs.nicoUpload }
  }
}
}
// END NICO UPLOAD
`,
);
run(
  './gradlew',
  [':app:bundleRelease', '--console=plain', '--max-workers=4'],
  path.join(mobile, 'android'),
  {
    NICO_UPLOAD_STORE: keystore,
    NICO_UPLOAD_PASSWORD: signing.password,
    NICO_UPLOAD_ALIAS: signing.alias,
  },
);
const artifact = path.join(mobile, 'android/app/build/outputs/bundle/release/app-release.aab');
const output = path.join(privateDir, `nico-notes-${env.ANDROID_VERSION_CODE}.aab`);
fs.copyFileSync(artifact, output);
console.log(`Signed Play upload bundle: ${output}`);
