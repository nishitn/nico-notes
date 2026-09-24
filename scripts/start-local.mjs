import { spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'packages/backend');
const tunnelConfig = process.env.CLOUDFLARED_CONFIG || join(homedir(), '.cloudflared/config.yml');
const children = new Set();
let stopping = false;
let stopped;
const finished = new Promise((resolve) => {
  stopped = resolve;
});

function signal(child, name) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  try {
    process.kill(-child.pid, name);
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(error.message);
  }
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  console.log('\nStopping services started by this command…');
  const exits = [...children].map(
    (child) =>
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null || !child.pid) resolve();
        else child.once('close', resolve);
      }),
  );
  for (const child of children) signal(child, 'SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) signal(child, 'SIGKILL');
  }, 5000);
  await Promise.all(exits);
  clearTimeout(timer);
  stopped();
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

function start(name, executable, args, cwd = root, service = true) {
  if (stopping) throw new Error('Startup stopped.');
  console.log(`\nStarting ${name}…`);
  const child = spawn(executable, args, { cwd, stdio: 'inherit', detached: true });
  children.add(child);
  child.once('error', (error) => {
    console.error(`${name}: ${error.message}`);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    if (service && !stopping) {
      console.error(`${name} stopped (${signal || code}).`);
      void stop(1);
    }
  });
  return child;
}
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
async function photoReady() {
  try {
    const response = await fetch('http://127.0.0.1:8788/health', {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok && (await response.json()).ready === true;
  } catch {
    return false;
  }
}
async function waitFor(name, ready) {
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    if (await ready()) return;
    await delay(300);
  }
  throw new Error(`${name} did not become ready.`);
}

try {
  for (const binary of ['caddy', 'cloudflared', 'pnpm']) {
    const check = spawnSync(binary, ['--version'], { stdio: 'ignore' });
    if (check.error || check.status !== 0)
      throw new Error(`Install ${binary} and make sure it is on your PATH.`);
  }
  for (const file of [
    tunnelConfig,
    join(backend, '.env.local'),
    join(backend, '.env.photos.local'),
  ]) {
    await access(file).catch(() => {
      throw new Error(`Missing configuration: ${file}`);
    });
  }
  if (await portBusy(8080))
    throw new Error(
      'Port 8080 is already in use. Stop the separately started Caddy, then run pnpm start again.',
    );
  const reusePhotos = await photoReady();
  if (!reusePhotos && (await portBusy(8788)))
    throw new Error('Port 8788 is already in use by another service.');
  const build = start('web build', 'pnpm', ['build'], root, false);
  const built = await new Promise((resolve) => {
    build.once('error', () => resolve(false));
    build.once('exit', (code) => resolve(code === 0));
  });
  if (!built) throw new Error('Web build failed.');
  if (reusePhotos) console.log('\nUsing the photo service already running on port 8788.');
  else {
    start(
      'photo service',
      process.execPath,
      ['--env-file=.env.local', '--env-file=.env.photos.local', 'scripts/local-photos.mjs'],
      backend,
    );
    await waitFor('Photo service', photoReady);
  }
  start('Caddy', 'caddy', ['run', '--config', join(root, 'Caddyfile'), '--adapter', 'caddyfile']);
  await waitFor('Caddy', () => portBusy(8080));
  start('Cloudflare tunnel', 'cloudflared', ['tunnel', '--config', tunnelConfig, 'run']);
  console.log('\nAll services started. Press Ctrl+C to stop the services started here.');
  await finished;
} catch (error) {
  if (!stopping) console.error(`\n${error.message}`);
  await stop(1);
}
